import { posix } from "node:path";
import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import * as css from "css-tree";
import type { Submission, AnalysisResult } from "../shared/types.js";
import { isLabThreeCheck, type LabThreeCheck } from "../shared/lab-three-checks.js";

type Result = Pick<AnalysisResult["requirements"][number], "passed" | "detail" | "needsReview">;
type Document = { path: string; $: CheerioAPI };
type Declaration = { property: string; value: string; important: boolean };
type StyleRule = { selector: string; declarations: Declaration[]; conditional: boolean; internal: boolean; order: number };
type Value = { value: string; uncertain: boolean };
const normal = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const pass = (detail: string): Result => ({ passed: true, detail });
const fail = (detail: string): Result => ({ passed: false, detail });
const review = (detail: string): Result => ({ passed: false, needsReview: true, detail: "Needs review: " + detail });
const nodes = ($: CheerioAPI, selector: string) => $(selector).toArray().filter((node): node is Element => node.type === "tag");

function resolve(from: string, reference: string): string | null {
  if (!reference.trim() || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference.trim())) return null;
  try {
    const target = decodeURIComponent(reference.trim().split(/[?#]/)[0]).replace(/\\/g, "/");
    const result = posix.normalize(target.startsWith("/") ? target.slice(1) : posix.join(posix.dirname(from), target));
    return result.startsWith("../") || result === ".." ? null : result;
  } catch { return null; }
}

function declarations(source: string): { values: Declaration[]; invalid: boolean } {
  const values: Declaration[] = [];
  let invalid = false;
  try {
    const ast = css.parse(source, { context: "declarationList", onParseError: () => { invalid = true; } });
    if(ast.type!=="DeclarationList")return {values,invalid:true};
    ast.children.forEach(node => {
      if (node.type !== "Declaration") return;
      const value = css.generate(node.value);
      if (!node.property.startsWith("--") && !value.includes("var(") && css.lexer.matchProperty(node.property, node.value).error) {
        invalid = true;
        return;
      }
      values.push({ property: node.property.toLowerCase(), value, important: Boolean(node.important) });
    });
  } catch { invalid = true; }
  return { values, invalid };
}

function specificity(selector: string): number {
  let score = 0;
  try {
    css.walk(css.parse(selector, { context: "selector" }), node => {
      if (node.type === "IdSelector") score += 1_000_000;
      if (node.type === "ClassSelector" || node.type === "AttributeSelector" || node.type === "PseudoClassSelector") score += 1000;
      if (node.type === "TypeSelector" && node.name !== "*") score++;
    });
  } catch { /* Unsupported selectors are marked uncertain when matching. */ }
  return score;
}

function expanded(declaration: Declaration, wanted: string): string | undefined {
  const { property, value } = declaration;
  if (property === wanted) return value;
  const tokens = value.match(/(?:rgba?|hsla?)\([^)]*\)|[^\s]+/g) ?? [];
  const colorToken=(token:string)=>{try{return !css.lexer.matchType("color",css.parse(token,{context:"value"})).error;}catch{return false;}};
  if (property === "background" && wanted === "background-color") {
    return tokens.find(colorToken) ?? "transparent";
  }
  if ((property === "margin" || property === "padding") && wanted.startsWith(property + "-")) {
    const sides = [tokens[0], tokens[1] ?? tokens[0], tokens[2] ?? tokens[0], tokens[3] ?? tokens[1] ?? tokens[0]];
    return sides[["top", "right", "bottom", "left"].indexOf(wanted.slice(property.length + 1))];
  }
  if (property === "margin-inline" && (wanted === "margin-left" || wanted === "margin-right")) return tokens[wanted === "margin-left" ? 0 : 1] ?? tokens[0];
  if (property === "place-items" && wanted === "justify-items") return tokens[1] ?? tokens[0];
  if (property === "place-content" && wanted === "justify-content") return tokens[1] ?? tokens[0];
  if ((property === "border" || /^border-(?:top|right|bottom|left)$/.test(property)) &&
      /^border-(?:top|right|bottom|left)-(?:width|style|color)$/.test(wanted) &&
      (property === "border" || wanted.startsWith(property + "-"))) {
    if (wanted.endsWith("width")) return tokens.find(token => /^(?:\d+(?:\.\d+)?(?:px|rem|em)|0|thin|medium|thick)$/i.test(token)) ?? "medium";
    if (wanted.endsWith("style")) return tokens.find(token => /^(?:none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/i.test(token)) ?? "none";
    return tokens.find(colorToken) ?? "currentcolor";
  }
  if (["border-width","border-style","border-color"].includes(property) && wanted.startsWith("border-") && wanted.endsWith("-"+property.slice(7))) {
    const side=wanted.split("-")[1], values=[tokens[0],tokens[1]??tokens[0],tokens[2]??tokens[0],tokens[3]??tokens[1]??tokens[0]];
    return values[["top","right","bottom","left"].indexOf(side)];
  }
  if (property === "list-style" && wanted === "list-style-type") return tokens.find(token => /^(?:square|disc|circle|none|upper-roman|lower-roman|lower-alpha|upper-alpha)$/i.test(token));
  return undefined;
}

function context(document: Document, submission: Submission) {
  const { $, path } = document;
  const files = new Map(submission.files.map(file => [file.path.replace(/\\/g, "/"), file.content]));
  const rules: StyleRule[] = [];
  const invalidFiles = new Set<string>();
  const inlineCache = new Map<Element, ReturnType<typeof declarations>>();
  let uncertainVisibility = false;
  let stylesheetCharacters = 0;
  let stylesheetCount = 0;
  let dynamic = $("script").length > 0 || $("*").toArray().some(node => node.type === "tag" && Object.keys(node.attribs).some(key => /^on/i.test(key)));
  function stylesheet(source: string, name: string, internal: boolean, conditional = false, chain: string[] = []) {
    stylesheetCharacters += source.length;
    if(++stylesheetCount>40 || stylesheetCharacters>200_000) { dynamic=true; return; }
    if (chain.length > 8 || chain.includes(name)) { dynamic = true; return; }
    let invalid = false;
    try {
      const ast = css.parse(source, { onParseError: () => { invalid = true; } });
      const parents: string[] = [];
      css.walk(ast, {
        enter(node: css.CssNode) {
          if (node.type === "Atrule") {
            parents.push(node.name.toLowerCase());
            if(/keyframes$/.test(node.name.toLowerCase()))dynamic=true;
            if (node.name.toLowerCase() === "import" && node.prelude) {
              let reference = "";
              css.walk(node.prelude, child => { if (child.type === "String" || child.type === "Url") reference = child.value; });
              const target = resolve(name, reference);
              if (target && files.has(target)) stylesheet(files.get(target)!, target, false, conditional, [...chain, name]);
              else dynamic = true;
            }
          }
          if (node.type !== "Rule" || node.prelude.type !== "SelectorList" || parents.some(p => /keyframes$/.test(p))) return;
          const parsed = declarations(css.generate(node.block).slice(1, -1));
          invalid ||= parsed.invalid;
          if(parsed.values.some(d=>d.property==="all"||/^animation/.test(d.property)))dynamic=true;
          node.prelude.children.forEach((selector: css.CssNode) => rules.push({ selector: css.generate(selector), declarations: parsed.values,
            internal, conditional: conditional || parents.length > 0, order: rules.length }));
        },
        leave(node: css.CssNode) { if (node.type === "Atrule") parents.pop(); },
      });
    } catch { invalid = true; }
    if (invalid) invalidFiles.add(name);
  }
  $("style, link[rel~='stylesheet' i]").each((_, node) => {
    if ($(node).attr("disabled") !== undefined) return;
    const media = normal($(node).attr("media") ?? "");
    const conditional = !!media && media !== "all" && media !== "screen";
    if (node.type === "style") stylesheet($(node).text(), path + " (internal)", $(node).parents("head").length > 0, conditional);
    else {
      const target = resolve(path, $(node).attr("href") ?? "");
      if (target && files.has(target)) stylesheet(files.get(target)!, target, false, conditional);
      else dynamic = true;
    }
  });
  const cache = new Map<Element, Map<string, Value>>();
  function style(element: Element, property: string, state = "", depth = 0): Value {
    if (depth > 15) return { value: "", uncertain: true };
    const key = property + ":" + state;
    if (cache.get(element)?.has(key)) return cache.get(element)!.get(key)!;
    const candidates: { value: string; weight: number[] }[] = [];
    let uncertain = false;
    function match(rule: StyleRule) {
      const states = [...rule.selector.matchAll(/:(link|hover|visited|active|focus)\b/gi)].map(m => m[1].toLowerCase());
      if (states.some(s => s !== state)) return false;
      const selector = rule.selector.replace(/:(?:link|hover|visited|active|focus)\b/gi, "[href]");
      try { return $(element).is(selector); } catch { uncertain = true; return false; }
    }
    for (const rule of rules) {
      if (!match(rule)) continue;
      for (const declaration of rule.declarations) {
        const value = expanded(declaration, property);
        if (value === undefined) continue;
        if (rule.conditional || /:(?:is|where|not|has|nth-)|::|[>+~]\s*$/.test(rule.selector)) { uncertain = true; continue; }
        candidates.push({ value, weight: [Number(declaration.important),0,specificity(rule.selector),rule.order] });
      }
    }
    if(!inlineCache.has(element))inlineCache.set(element,declarations($(element).attr("style") ?? ""));
    const inline = inlineCache.get(element)!;
    if(inline.values.some(d=>d.property==="all"||/^animation/.test(d.property)))dynamic=true;
    for (const [index,declaration] of inline.values.entries()) {
      const value = expanded(declaration, property);
      if (value !== undefined) candidates.push({ value, weight: [Number(declaration.important),1,0,index] });
    }
    let value = candidates.sort((a,b) => {
      for(let i=0;i<a.weight.length;i++){const difference=b.weight[i]-a.weight[i];if(difference)return difference;}return 0;
    })[0]?.value ?? "";
    if(!value && property==="list-style-type" && (element.name==="ol"||element.name==="ul"))
      value=({I:"upper-roman",i:"lower-roman",a:"lower-alpha",A:"upper-alpha","1":"decimal"} as Record<string,string>)[$(element).attr("type")??""] || (element.name==="ol"?"decimal":"disc");
    if(!value && (property==="width"||property==="height") && ["marquee","img","table"].includes(element.name)){
      const hint=$(element).attr(property)??"";
      if(/^\d+(?:\.\d+)?$/.test(hint))value=hint+"px";
    }
    if (/^(?:inherit|unset)$/.test(value) || (!value && /^(?:color|font-size|visibility|list-style-type)$/.test(property))) {
      const parent = $(element).parent()[0];
      if (parent?.type === "tag") { const inherited = style(parent, property, state, depth+1); value = inherited.value; uncertain ||= inherited.uncertain; }
    }
    if (/var\(|calc\(|revert|initial|env\(|(?:color|lab|lch|oklab|oklch|color-mix)\(/i.test(value) || invalidFiles.size) uncertain = true;
    const result = { value: normal(value), uncertain };
    if (!cache.has(element)) cache.set(element, new Map());
    cache.get(element)!.set(key, result);
    return result;
  }
  function visible(element: Element): boolean {
    const ancestors = [element, ...$(element).parents().toArray().filter((n): n is Element => n.type === "tag")];
    return ancestors.every(node => {
      const display=style(node,"display"),visibility=style(node,"visibility"),opacity=style(node,"opacity"),font=style(node,"font-size");
      uncertainVisibility ||= display.uncertain||visibility.uncertain||opacity.uncertain||font.uncertain;
      return $(node).attr("hidden") === undefined && display.value!=="none" && !["hidden","collapse"].includes(visibility.value) &&
        !/^(?:0|0\.0+)$/.test(opacity.value) && !/^0(?:px|rem|em|%)?$/.test(font.value);
    });
  }
  function text(element: Element, skipLists = false): string {
    if(!visible(element))return "";
    const stack=[...element.children].reverse(),parts:string[]=[];
    while(stack.length){
      const node=stack.pop()!;
      if(node.type==="text")parts.push(node.data);
      else if(node.type==="tag"&&!["script","style","template"].includes(node.name)&&!(skipLists&&["ol","ul"].includes(node.name))&&visible(node)){
        if(["p","div","li","br","dd","dt","td","th","section"].includes(node.name))parts.push(" ");
        stack.push(...[...node.children].reverse());
      }
    }
    return normal(parts.join(""));
  }
  function meaningful(element: Element) { return visible(element) && !!text(element); }
  function image(element: Element): Result {
    const reference = ($(element).attr("src") ?? "").trim();
    if (!reference) return fail("The image has no source.");
    if (!visible(element)) return fail("The image is hidden.");
    const target = resolve(path, reference);
    if (target) return (submission.assets ?? []).some(asset => asset.path.replace(/\\/g,"/") === target && /^image\//.test(asset.mimeType))
      ? pass("Uploaded image found: " + target) : fail("Upload the referenced image: " + target + ".");
    if (/^(?:https?:|\/\/|data:image\/)/i.test(reference)) return review("Remote or embedded image content needs visual verification.");
    return fail("The image source is invalid.");
  }
  function link(element: Element): boolean {
    const href = ($(element).attr("href") ?? "").trim();
    if (!href || /^javascript:|^data:/i.test(href)) return false;
    if (href.startsWith("#")) {
      try { return nodes($,"[id],a[name]").some(node => ($(node).attr("id") ?? $(node).attr("name")) === decodeURIComponent(href.slice(1))); }
      catch { return false; }
    }
    if (/^https?:\/\/|^\/\//i.test(href)) { try { return ["http:","https:"].includes(new URL(href,"https://labtrack.invalid").protocol); } catch { return false; } }
    const target = resolve(path,href);
    return !!target && files.has(target);
  }
  function any(elements: Element[], predicate: (element: Element) => Result, missing: string): Result {
    const results = elements.map(predicate);
    return results.find(result => result.passed) ?? results.find(result => result.needsReview) ?? results[0] ?? fail(missing);
  }
  function property(element: Element, name: string, accept: (value: string) => boolean, expected: string): Result {
    const actual = style(element,name);
    if (actual.uncertain) return review("Cannot resolve " + name + " reliably from this CSS. Expected " + expected + ".");
    return accept(actual.value) ? pass(name + " is " + actual.value + ".") : fail("Expected " + name + ": " + expected + "; found " + (actual.value || "no matching declaration") + ".");
  }
  function color(value: string, expected: "navy" | "lightgray" | "black") {
    const colors = { navy:["navy","#000080","#000080ff"], lightgray:["lightgray","lightgrey","#d3d3d3","#d3d3d3ff"], black:["black","#000","#000000","#000000ff"] };
    if (colors[expected].includes(value)) return true;
    const hsl=value.match(/^hsla?\(([-\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:\s*[,/]\s*([\d.%]+))?\)$/i);
    if(hsl){
      const h=((Number(hsl[1])%360)+360)%360/60,s=Number(hsl[2])/100,l=Number(hsl[3])/100,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),m=l-c/2;
      const channels=(h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x]).map(v=>(v+m)*255);
      const target=expected==="navy"?[0,0,128]:expected==="lightgray"?[211,211,211]:[0,0,0];
      return (!hsl[4]||hsl[4]==="1"||hsl[4]==="100%")&&channels.every((n,i)=>Math.abs(n-target[i])<0.6);
    }
    const rgb = value.match(/^rgba?\(([\d\s,./%]+)\)$/i);
    if (!rgb) return false;
    const components = rgb[1].replace(/[,/]/g," ").trim().split(/\s+/).map((part,index) => part.endsWith("%") ? Number(part.slice(0,-1))*(index===3?0.01:2.55) : Number(part));
    const target = expected === "navy" ? [0,0,128] : expected === "lightgray" ? [211,211,211] : [0,0,0];
    return target.every((n,i) => Math.abs(components[i]-n) < 0.6) && (components.length === 3 || components[3] === 1);
  }
  function length(element: Element, value: string): number | undefined {
    if (/^(?:0|\d+(?:\.\d+)?px)$/.test(value)) return parseFloat(value);
    if (/^\d+(?:\.\d+)?(?:rem|em)$/.test(value)) {
      const base = value.endsWith("rem") ? nodes($,"html")[0] : element;
      const font = base ? style(base,"font-size") : { value:"",uncertain:false };
      if (font.uncertain || (font.value && !/^\d+(?:\.\d+)?px$/.test(font.value))) return;
      return parseFloat(value) * (font.value ? parseFloat(font.value) : 16);
    }
    return;
  }
  function dimension(element: Element, name: string, expected: number): Result {
    const actual=style(element,name);
    if(actual.value&&length(element,actual.value)===undefined)return review("Resolve "+name+" in preview; expected "+expected+"px, declared "+actual.value+".");
    return property(element,name,value => length(element,value) === expected, expected+"px");
  }
  function border(element: Element, exact: boolean): Result {
    const width = style(element,"border-top-width"), kind = style(element,"border-top-style");
    const tint = style(element,"border-top-color");
    if (width.uncertain || kind.uncertain || tint.uncertain) return review("Border styling requires visual review.");
    if (!exact && Number($(element).attr("border")) > 0) return pass("A nonzero HTML table border is declared.");
    const allSides=["top","right","bottom","left"].map(side=>{
      const w=style(element,"border-"+side+"-width"),s=style(element,"border-"+side+"-style"),c=style(element,"border-"+side+"-color");
      const size=length(element,w.value)??({thin:1,medium:3,thick:5} as Record<string,number>)[w.value]??(!w.value&&s.value?3:0);
      return {uncertain:w.uncertain||s.uncertain||c.uncertain,visible:size>0&&!!s.value&&!["none","hidden"].includes(s.value),
        correct:size===2&&s.value==="solid"&&color(c.value==="currentcolor"?style(element,"color").value||"black":c.value,"black")};
    });
    if(allSides.some(side=>side.uncertain))return review("Border styling requires visual review.");
    return exact ? allSides.every(side=>side.correct)
      ? pass("All four borders are 2px solid black.") : fail("Expected a 2px solid black border on all four sides.")
      : allSides.every(side=>side.visible) ? pass("A visible table border is declared.") :
        element.name==="table"&&$(element).find("th,td").length>0&&$(element).find("th,td").toArray().every(cell=>border(cell,false).passed)
          ?pass("Visible cell borders frame the data table."):fail("The table needs a nonzero visible border.");
  }
  const allTables = nodes($,"body table").filter(visible);
  const tables = [...allTables].sort((a,b)=>Number(tableHeaders(b))-Number(tableHeaders(a)) || rows(b).length-rows(a).length).slice(0,1);
  const marquees = nodes($,"body marquee");
  const lists = nodes($,"body ol");
  const subjects = lists.filter(element => $(element).children("li").toArray().some(li => /oop|web engineering|database systems/.test(text(li))));
  const technologies = nodes($,"body ul").filter(element => $(element).children("li").toArray().some(li => /html5|css3/.test(text(li))));
  const upward = marquees.filter(element => normal($(element).attr("direction") ?? "") === "up")
    .sort((a,b)=>{
      const score=(e:Element)=>Number(meaningful(e))*10+Number(dimension(e,"width",300).passed)+Number(dimension(e,"height",200).passed)+Number(border(e,true).passed);
      return score(b)-score(a);
    }).slice(0,1);
  function moving(element: Element, textRequired=true): Result {
    if (!visible(element)) return fail("This marquee is hidden.");
    if (textRequired && !text(element)) return fail("The marquee needs nonempty text.");
    if ($(element).attr("scrollamount") !== undefined && Number($(element).attr("scrollamount")) <= 0) return fail("scrollamount must allow movement.");
    return pass("Visible moving marquee content is present.");
  }
  function items(element: Element) {
    return $(element).children("li").toArray().map(li => text(li,true));
  }
  function orderedContent(element: Element, expected: string[]): boolean {
    const actual = items(element);
    return expected.every((value,index) => actual[index] === value) && actual.length === expected.length;
  }
  function nested(element: Element) { return nodes($,"ol").filter(node => $(node).parents("li").toArray().some(li =>
    $(li).parent()[0] === element && items(element)[$(li).index()] === "html5")); }
  function tableHeaders(element: Element): boolean {
    const row = $(element).find("tr").filter((_,row) => $(row).closest("table")[0] === element && $(row).children("th").length > 0).first();
    return row.children("th").toArray().map(th => text(th)).join("|") === "student id|name|department|gpa";
  }
  function rows(element: Element) {
    return $(element).find("tr").toArray().filter(row => $(row).closest("table")[0] === element);
  }
  function grid(element: Element): { valid: boolean; dataRows: number; merged: boolean } {
    const all = rows(element), cells: boolean[][] = [];
    let merged=false,dataRows=0,valid=all.length>0;
    all.forEach((row,index) => {
      cells[index] ??= [];
      const data=$(row).children("td").toArray();
      if (data.length) dataRows++;
      let column=0;
      for (const cell of $(row).children("td,th").toArray()) {
        while (cells[index][column]) column++;
        const span = (name:string) => $(cell).attr(name) === undefined ? 1 : /^\d+$/.test($(cell).attr(name)!) ? Number($(cell).attr(name)) : NaN;
        const across=span("colspan"),rawDown=span("rowspan");
        const down=rawDown===0?all.slice(index).filter(next=>next.parent===row.parent).length:rawDown;
        if (!Number.isInteger(across)||!Number.isInteger(down)||across<1||down<1||across>4||index+down>all.length) { valid=false; continue; }
        if (!text(cell)) valid=false;
        merged ||= across>1||down>1;
        for(let y=index;y<index+down;y++)for(let x=column;x<column+across;x++){
          cells[y] ??= [];
          if(cells[y][x]||x>=4)valid=false;
          cells[y][x]=true;
        }
        column+=across;
      }
    });
    valid &&= cells.length===all.length && cells.every(row => row.length===4 && [0,1,2,3].every(index=>row[index]));
    return {valid,dataRows,merged};
  }
  function check(key: LabThreeCheck): Result {
    switch(key) {
      case "heading-navy": return any(nodes($,"body h1[style]").filter(meaningful), element => {
        const inline=declarations($(element).attr("style") ?? "");
        const declaration=inline.values.filter(d=>d.property==="color").at(-1);
        if(declaration&&/var\(|env\(|inherit|currentcolor/.test(declaration.value))return review("The heading color depends on inherited or unresolved values.");
        if (!declaration || !color(normal(declaration.value),"navy")) return fail("Put a navy color declaration in the heading's inline style.");
        return property(element,"color",v=>color(v,"navy"),"navy");
      },"A visible, nonempty h1 with inline navy styling is missing.");
      case "body-background": return any(nodes($,"body"), element => {
        if (!rules.some(r=>r.internal && r.declarations.some(d=>expanded(d,"background-color")!==undefined) && (()=>{try{return $(element).is(r.selector);}catch{return false;}})()))
          return fail("Define the body background in an internal style block.");
        return property(element,"background-color",v=>color(v,"lightgray"),"lightgray");
      },"Body background styling is missing.");
      case "link-state": case "hover-state": case "visited-state": {
        const state=key.split("-")[0];
        const matching=rules.filter(rule=>rule.internal && rule.selector.includes(":"+state) && rule.declarations.length>0 &&
          nodes($,"body a[href]").some(element=>{try{return $(element).is(rule.selector.replace(/:(?:link|hover|visited)\b/g,"[href]"))&&meaningful(element);}catch{return false;}}));
        if(matching.length&&matching.every(rule=>rule.conditional||rule.declarations.some(d=>/var\(|env\(/.test(d.value))))return review("The a:"+state+" styling depends on conditional CSS or unresolved variables.");
        return matching.length ? pass("Internal CSS contains a valid a:"+state+" rule for a link.") : fail("Add a nonempty internal a:"+state+" rule matching a visible link.");
      }
      case "linked-stylesheet": return any(nodes($,"head link[rel~='stylesheet' i]"), element=>{
        const target=resolve(path,$(element).attr("href")??"");
        if(!target||posix.basename(target).toLowerCase()!=="style.css"||!files.has(target))return fail("Link the uploaded style.css from this page's head.");
        return invalidFiles.has(target) || !files.get(target)!.trim() ? fail("style.css is empty or contains invalid CSS.") : pass("Linked stylesheet found and parsed: "+target);
      },"A stylesheet link to the uploaded style.css is missing.");
      case "external-link": return any(nodes($,"body a[target]"), element=>{
        const href=($(element).attr("href")??"").trim();
        return normal($(element).attr("target")??"")==="_blank" && /^https?:\/\/|^\/\//i.test(href) && link(element) &&
          (meaningful(element)||$(element).find("img").toArray().some(img=>image(img).passed))
          ? pass("A visible external link opens in a new tab.") : fail("Use a visible HTTP(S) external link with target=\"_blank\".");
      },"An external new-tab link is missing.");
      case "bookmark-link": return nodes($,'body a[href="#section2"]').some(meaningful) ? pass("Bookmark link to #section2 found.") : fail("Add a visible link to #section2.");
      case "bookmark-target": return nodes($,'body a[href="#section2"]').some(element=>link(element)) ? pass("section2 exists in the same HTML page.") : fail("The #section2 link needs its destination in the same page.");
      case "clickable-image": return any(nodes($,"body a img"),element=>{
        const anchor=$(element).closest("a")[0];
        if(!anchor||anchor.type!=="tag"||!link(anchor))return fail("The image must be inside a link with a valid nonempty destination.");
        return image(element);
      },"A clickable image is missing.");
      case "image-float": return any(nodes($,"body a img").filter(element=>image(element).passed),element=>property(element,"float",v=>v==="left","left"),"An uploaded clickable image is missing.");
      case "image-wrapping": return any(nodes($,"body a img").filter(element=>image(element).passed),element=>{
        const floated=property(element,"float",v=>v==="left","left");if(!floated.passed)return floated;
        const parent=$(element).closest("a").parent()[0];
        if(!parent||parent.type!=="tag"||!meaningful(parent))return fail("Add meaningful text beside the floated image.");
        const offset=(node:Element)=>(node as Element&{sourceCodeLocation?:{startOffset:number}}).sourceCodeLocation?.startOffset??-1;
        const textNodes=nodes($,"p,span,div,section").filter(node=>node!==element && offset(node)>offset(element) &&
          $(node).parents().toArray().includes(parent) && meaningful(node) &&
          [node,...$(node).parentsUntil(parent).toArray().filter((n):n is Element=>n.type==="tag")].every(ancestor=>!["left","both"].includes(style(ancestor,"clear").value)));
        const anchor=$(element).closest("a")[0],contents=$(parent).contents().toArray();
        const bareText=contents.slice(contents.indexOf(anchor)+1).some(node=>node.type==="text"&&!!normal(node.data));
        if(!textNodes.length&&!bareText)return fail("Add text after the image without clearing the left float.");
        const width=style(element,"width");
        if(width.value==="100%"||width.value==="100vw")return fail("A full-width image leaves no room for text beside it.");
        if(width.uncertain)return review("Image width and actual text wrapping need visual verification.");
        return pass("A left-floating image and surrounding text are present; verify the final wrap in preview.");
      },"A floated uploaded image and surrounding text are missing.");
      case "marquee-scroll": case "marquee-alternate": case "marquee-slide": return any(marquees.filter(element=>{
        const behavior=normal($(element).attr("behavior")??"scroll"),direction=normal($(element).attr("direction")??"left");
        return behavior===key.slice(8) && (key!=="marquee-scroll"||direction==="left");
      }),element=>moving(element),"The required marquee behavior/direction is missing.");
      case "marquee-up": return any(upward,element=>moving(element),"An upward-scrolling text marquee is missing.");
      case "marquee-height": return any(upward,element=>dimension(element,"height",200),"An upward marquee with height 200px is missing.");
      case "marquee-width": return any(upward,element=>dimension(element,"width",300),"An upward marquee with width 300px is missing.");
      case "marquee-border": return any(upward,element=>border(element,true),"An upward marquee with a 2px solid black border is missing.");
      case "marquee-image": return any(nodes($,"body marquee img"),element=>{
        const parent=$(element).closest("marquee")[0];if(!parent)return fail("The image must be inside a marquee.");
        if(parent.type!=="tag")return fail("The image must be inside a marquee.");
        const movement=moving(parent,false);return movement.passed?image(element):movement;
      },"An uploaded image inside a marquee is missing.");
      case "table-centered": return any(tables,element=>{
        if(normal($(element).attr("align")??"")==="center")return pass("The table is centered using align=center.");
        const left=style(element,"margin-left"),right=style(element,"margin-right");
        if(left.uncertain||right.uncertain)return review("Table centering needs visual verification.");
        if(left.value==="auto"&&right.value==="auto")return pass("The table has automatic left and right margins.");
        const parent=$(element).parent()[0];
        if(parent?.type==="tag"){
          const display=style(parent,"display"),justify=style(parent,"justify-content"),items=style(parent,"justify-items");
          if(display.uncertain||justify.uncertain||items.uncertain)return review("Table centering depends on conditional layout CSS.");
          if((display.value==="flex"&&justify.value==="center")||(display.value==="grid"&&items.value==="center"))return pass("The parent layout centers the table.");
        }
        return fail("Center the table using automatic margins, a centered parent layout, or align=center.");
      },"A visible centered data table is missing.");
      case "table-border": return any(tables,element=>border(element,false),"A visible table border is missing.");
      case "table-headers": return tables.some(tableHeaders)?pass("The four required headers appear in the correct order."):fail("Use one header row: Student ID, Name, Department, GPA.");
      case "table-rows": return any(tables.filter(tableHeaders),element=>{
        const result=grid(element);
        return result.valid&&result.dataRows>=3?pass("At least three nonempty four-column data rows are present."):fail("Provide at least three complete data rows; cells and spans must fill four columns.");
      },"A table with the required four-column header is missing.");
      case "table-spans": return any(tables.filter(tableHeaders),element=>{
        const result=grid(element);
        return result.valid&&result.merged?pass("A colspan/rowspan greater than one fits the table grid."):fail("Use colspan or rowspan greater than one without empty, overlapping or out-of-range cells.");
      },"A meaningful merged cell in the data table is missing.");
      case "subjects-numbering": return any(subjects,element=>{
        const value=style(element,"list-style-type");
        const marker=value.value||($(element).attr("type")==="I"?"upper-roman":"");
        return value.uncertain?review("Core Subjects numbering depends on unresolved CSS."):marker==="upper-roman" ? pass("Core Subjects uses uppercase Roman numerals."):fail("Use uppercase Roman numbering for Core Subjects.");
      },"The Core Subjects ordered list is missing.");
      case "subjects-content": return subjects.some(element=>orderedContent(element,["oop","web engineering","database systems"]))?pass("All three subjects appear in order."):fail("List OOP, Web Engineering and Database Systems as three ordered-list items in that order.");
      case "technology-bullets": return any(technologies,element=>property(element,"list-style-type",v=>v==="square","square"),"The Web Technologies unordered list is missing.");
      case "technology-content": return technologies.some(element=>orderedContent(element,["html5","css3"]))?pass("HTML5 and CSS3 are the two outer items."):fail("List HTML5 and CSS3 as the outer Web Technologies items.");
      case "nested-numbering": return any(technologies.flatMap(nested),element=>{
        const value=style(element,"list-style-type");
        const marker=value.value||($(element).attr("type")==="a"?"lower-alpha":"");
        return value.uncertain?review("Nested list markers depend on unresolved CSS."):["lower-alpha","lower-latin"].includes(marker)?pass("The HTML5 nested list uses lowercase alphabetic markers."):fail("Use lowercase alphabetic numbering for the list under HTML5.");
      },"Put an ordered list inside the HTML5 list item.");
      case "nested-content": return technologies.flatMap(nested).some(element=>orderedContent(element,["headings","tables"]))?pass("Headings and Tables appear in order under HTML5."):fail("Nest Headings and Tables under HTML5, in that order.");
      case "definition-html": case "definition-css": {
        const term=key==="definition-html"?"html":"css",definition=term==="html"?"hypertext markup language":"cascading style sheets";
        return nodes($,"body dl dt").some(element=>text(element)===term && $(element).nextUntil("dt").toArray().some(node=>node.type==="tag"&&node.name==="dd"&&text(node)===definition&&visible(node)))
          ?pass(term.toUpperCase()+" has its correct paired description."):fail("Use <dt>"+term.toUpperCase()+"</dt> followed by <dd>"+definition+"</dd> in the same description list.");
      }
    }
  }
  return (key: LabThreeCheck):Result => {
    const result=check(key);
    if(dynamic||uncertainVisibility)return review("Scripts, conditional CSS, remote styles or unresolved imports can change this page. "+result.detail);
    return result;
  };
}

export function createLabThreeChecker(submission: Submission, documents: Document[], keys: string[]) {
  const supported=keys.filter(isLabThreeCheck);
  const choices=documents.map(document=>{
    const check=context(document,submission);
    const results=new Map(supported.map(key=>[key,check(key)]));
    return {document,results,score:[...results.values()].filter(result=>result.passed).length};
  }).sort((a,b)=>b.score-a.score);
  const selected=choices[0];
  return (key:string):Result => {
    if(!isLabThreeCheck(key))return fail("Unknown Lab 3 requirement. Edit the checklist.");
    if(!selected)return fail("No analyzed HTML page is available. Upload the task files and review any analysis-limit warning.");
    const result=selected.results.get(key)??fail("This check was not configured.");
    return {...result,detail:selected.document.path+": "+result.detail};
  };
}
