import { posix } from "node:path";
import { parse, tokenizer, type Node } from "acorn";
import { load, type CheerioAPI } from "cheerio";
import * as css from "css-tree";
import type {
  AnalysisResult,
  Requirement,
  Submission,
  Task,
  TaskAnalysis,
} from "../shared/types.js";

const MAX_FILES = 40;
const MAX_CHARACTERS = 200_000;
const MAX_PEERS = 200;
const MAX_PEER_CHARACTERS = 2_000_000;
const WINDOW = 9;
type Quality = AnalysisResult["quality"][number];
type Feature = {
  value: string;
  start?: number;
  end?: number;
  context?: string;
};
type SourceElement = {
  sourceCodeLocation?: { startOffset: number; endOffset: number };
};
type ParsedFile = {
  path: string;
  kind: "html" | "css" | "js";
  shingles: Map<string, { source: string; count: number }>;
};
type FingerprintSummary = {
  blocks: Map<string, { source: string; count: number }>;
  total: number;
};
type ParsedSubmission = {
  files: ParsedFile[];
  documents: { path: string; $: CheerioAPI; text: string }[];
  quality: Quality[];
  fingerprintSummaries: Map<ParsedFile["kind"], FingerprintSummary>;
};

const normalizeText = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();
const cleanPath = (value: string) =>
  posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, "");
const textBoundaries = new Set("html head title body address article aside blockquote br dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td th thead tr ul".split(" "));
const boilerplate = new Set([
  "html",
  "head",
  "body",
  "meta",
  "title",
  "link",
  "script",
  "style",
]);

function excludedTags(task: Task) {
  const tags = new Set<string>();
  for (const requirement of task.requirements.filter(
    (r) => r.type === "tag" || r.type === "attribute",
  )) {
    try {
      css.walk(
        css.parse(requirement.value, { context: "selectorList" }),
        (node) => {
          if (node.type === "TypeSelector") tags.add(node.name.toLowerCase());
        },
      );
    } catch {
      /* The checklist reports malformed selectors. */
    }
  }
  return tags;
}

function shingles(
  features: Feature[],
  source: string,
  path: string,
  minimum: number,
): Map<string, { source: string; count: number }> {
  const result = new Map<string, { source: string; count: number }>();
  if (features.length < minimum) {
    if (features.length) result.set(`short:${features.map((feature) => feature.value).join("\u0001")}`, { source: `${path}\n${source.slice(0, 800)}`, count: features.length });
    return result;
  }
  for (let i = 0; i <= features.length - WINDOW; i++) {
    const block = features.slice(i, i + WINDOW);
    const signature = block.map((f) => f.value).join("\u0001");
    const existing = result.get(signature);
    if (existing) { existing.count++; continue; }
    const first = block[0];
    const last = block[block.length - 1];
    const snippet =
      first.start !== undefined && last.end !== undefined
        ? source.slice(first.start, last.end)
        : [...new Set(block.map((f) => f.context).filter(Boolean))].join("\n");
    result.set(signature, { source: `${path}\n${snippet.slice(0, 800)}`, count: 1 });
  }
  return result;
}

function inspect(submission: Submission, task: Task): ParsedSubmission {
  const result: ParsedSubmission = { files: [], documents: [], quality: [], fingerprintSummaries: new Map() };
  const paths = new Set(
    [...submission.files, ...(submission.assets ?? [])].map((f) =>
      cleanPath(f.path),
    ),
  );
  const requiredTags = excludedTags(task);
  const prescribedText = /Web Engineering/i.test(task.description) && /H2O/i.test(task.description) && /third/i.test(task.description) && /fourth/i.test(task.description)
    ? ["Web Engineering is an essential course for computer science students because it teaches how modern web applications are built. Understanding HTML is the foundation of all web development. Currently, I am in third fourth semester of my degree program. During our lectures, we learned that water is written as H2O and math formulas use terms like x2."]
    : [];
  const requiredText = [...task.requirements
    .filter((r) => r.type === "text")
    .map((r) => normalizeText(r.value)), ...prescribedText.map(normalizeText),
    ...[...task.description.matchAll(/[“"]([^”"\n]{12,8000})[”"]/g)].map((match) => normalizeText(match[1]))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const requiredWords = new Set(
    requiredText.flatMap((text) => text.match(/[\p{L}\p{N}_-]+/gu) ?? []),
  );
  const missing = new Set<string>();
  const issue = (
    severity: Quality["severity"],
    title: string,
    detail: string,
  ) => result.quality.push({ severity, title, detail });
  let characters = 0;

  function dependency(
    file: string,
    reference: string,
    extensions: string[] = [],
  ) {
    if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return;
    let decoded: string;
    try {
      decoded = decodeURIComponent(reference.split(/[?#]/)[0]);
    } catch {
      decoded = reference.split(/[?#]/)[0];
    }
    const target = cleanPath(
      decoded.startsWith("/")
        ? decoded.slice(1)
        : posix.join(posix.dirname(file), decoded),
    );
    if (
      !paths.has(target) &&
      !extensions.some((ext) => paths.has(target + ext))
    )
      missing.add(`${file} → ${reference}`);
  }

  function javascript(source: string, path: string) {
    try {
      let ast: Node;
      try {
        ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
      } catch {
        ast = parse(source, { ecmaVersion: "latest", sourceType: "script" });
      }
      const features: Feature[] = [];
      const tokens = tokenizer(source, { ecmaVersion: "latest" });
      for (
        let token = tokens.getToken();
        token.type.label !== "eof";
        token = tokens.getToken()
      ) {
        const label = token.type.label;
        const value = (token as typeof token & { value?: unknown }).value;
        features.push({
          value:
            label === "name" ? "identifier" : `${label}:${String(value ?? "")}`,
          start: token.start,
          end: token.end,
        });
      }
      let maximumNesting = 0;
      let advancedSyntax = false;
      const repeated = new Map<string, number>();
      const treeFeatures: Feature[] = [];
      function tokenIndex(offset: number) {
        let low = 0;
        let high = features.length;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (features[middle].start! < offset) low = middle + 1;
          else high = middle;
        }
        return low;
      }
      function walk(node: Node, nesting: number) {
        const item = node as Node & Record<string, unknown>;
        if (["ClassDeclaration", "ImportDeclaration", "AwaitExpression"].includes(node.type)) advancedSyntax = true;
        treeFeatures.push({
          value: `ast:${node.type}:${String(item.operator ?? "")}:${node.type === "Literal" ? String(item.value) : ""}`,
          context: source.slice(
            node.start,
            Math.min(node.end, node.start + 200),
          ),
        });
        const nested =
          nesting +
          ([
            "IfStatement",
            "ForStatement",
            "ForOfStatement",
            "ForInStatement",
            "WhileStatement",
            "DoWhileStatement",
            "FunctionDeclaration",
            "FunctionExpression",
            "ArrowFunctionExpression",
            "SwitchStatement",
          ].includes(node.type)
            ? 1
            : 0);
        maximumNesting = Math.max(maximumNesting, nested);
        if (
          [
            "ImportDeclaration",
            "ImportExpression",
            "ExportNamedDeclaration",
            "ExportAllDeclaration",
          ].includes(node.type)
        ) {
          const imported = item.source as { value?: unknown } | undefined;
          if (
            typeof imported?.value === "string" &&
            imported.value.startsWith(".")
          )
            dependency(path, imported.value, [".js", ".mjs", "/index.js"]);
        }
        if (node.type === "CallExpression") {
          const callee = item.callee as { type?: string; name?: string };
          const argument = (item.arguments as { value?: unknown }[])[0];
          if (
            callee.type === "Identifier" &&
            callee.name === "require" &&
            typeof argument?.value === "string" &&
            argument.value.startsWith(".")
          )
            dependency(path, argument.value, [
              ".js",
              ".mjs",
              ".json",
              "/index.js",
            ]);
        }
        if (
          [
            "ExpressionStatement",
            "VariableDeclaration",
            "IfStatement",
            "FunctionDeclaration",
          ].includes(node.type)
        ) {
          const statement = features.slice(
            tokenIndex(node.start),
            tokenIndex(node.end),
          );
          if (statement.length >= 24) {
            const fingerprint = statement.map((f) => f.value).join("|");
            repeated.set(fingerprint, (repeated.get(fingerprint) ?? 0) + 1);
          }
        }
        for (const value of Object.values(item)) {
          if (Array.isArray(value)) {
            for (const child of value)
              if (child && typeof child === "object" && "type" in child)
                walk(child as Node, nested);
          } else if (value && typeof value === "object" && "type" in value)
            walk(value as Node, nested);
        }
      }
      walk(ast, 0);
      if (advancedSyntax && task.requirements.some((requirement) => requirement.type === "tag"))
        issue("info", "Additional JavaScript features", `${path} uses classes, modules or asynchronous code alongside an HTML checklist. Review whether these features are relevant to this exercise.`);
      if (maximumNesting > 5)
        issue(
          "warning",
          "Deep JavaScript nesting",
          `${path} contains ${maximumNesting} nested control or function levels. Review whether the logic can be simplified.`,
        );
      if ([...repeated.values()].some((count) => count > 1))
        issue(
          "info",
          "Repeated JavaScript logic",
          `${path} repeats a substantial normalized statement or function. Review whether a shared function would make it clearer.`,
        );
      result.files.push({
        path,
        kind: "js",
        shingles: new Map([
          ...shingles(features, source, path, 24),
          ...shingles(treeFeatures, source, path, 24),
        ]),
      });
    } catch (error) {
      issue(
        "warning",
        "JavaScript syntax could not be parsed",
        `${path}: ${error instanceof Error ? error.message : "Invalid JavaScript"}. This file is excluded from similarity scoring.`,
      );
    }
  }

  function stylesheet(source: string, path: string) {
    try {
      const features: Feature[] = [];
      let recovered = false;
      const declarationBlocks = new Map<string, number>();
      const ast = css.parse(source, {
        positions: true,
        onParseError: () => {
          recovered = true;
        },
      });
      css.walk(ast, (node) => {
        if (node.type === "Rule") {
          const selector = node.prelude ? css.generate(node.prelude) : "";
          features.push({
            value: `selector:${selector}`,
            context: css.generate(node),
            start: node.loc?.start.offset,
            end: node.loc?.end.offset,
          });
          const declarations = [...node.block.children].filter((child) => child.type === "Declaration").map((child) => css.generate(child)).sort();
          if (declarations.length >= 4) {
            const signature = declarations.join(";");
            declarationBlocks.set(signature, (declarationBlocks.get(signature) ?? 0) + 1);
          }
        } else if (node.type === "Declaration") {
          const value = css.generate(node.value);
          const context = source.slice(
            node.loc?.start.offset ?? 0,
            node.loc?.end.offset ?? source.length,
          );
          features.push(
            { value: `property:${node.property.toLowerCase()}`, context, start: node.loc?.start.offset, end: node.loc?.end.offset },
            { value: `value:${value}`, context, start: node.loc?.start.offset, end: node.loc?.end.offset },
          );
        } else if (node.type === "Url") dependency(path, node.value);
        else if (
          node.type === "Atrule" &&
          node.name.toLowerCase() === "import" &&
          node.prelude
        )
          css.walk(node.prelude, (child) => {
            if (child.type === "String") dependency(path, child.value);
          });
      });
      if (recovered) {
        issue(
          "warning",
          "CSS syntax needs review",
          `${path} contains syntax the parser could not interpret. This file is excluded from similarity scoring.`,
        );
        return;
      }
      if ([...declarationBlocks.values()].some((count) => count > 1)) issue("info", "Repeated CSS declaration blocks", `${path} repeats a block of at least four declarations. Review whether these rules can be combined.`);
      result.files.push({
        path,
        kind: "css",
        shingles: shingles(features, source, path, 16),
      });
    } catch (error) {
      issue(
        "warning",
        "CSS syntax could not be parsed",
        `${path}: ${error instanceof Error ? error.message : "Invalid CSS"}. This file is excluded from similarity scoring.`,
      );
    }
  }

  if (submission.files.length > MAX_FILES)
    issue(
      "info",
      "Analysis limit reached",
      `Only the first ${MAX_FILES} text files were analyzed.`,
    );
  for (const file of submission.files.slice(0, MAX_FILES)) {
    characters += file.content.length;
    if (characters > MAX_CHARACTERS) {
      issue(
        "info",
        "Analysis limit reached",
        `Analysis stopped at ${MAX_CHARACTERS.toLocaleString()} source characters.`,
      );
      break;
    }
    const path = cleanPath(file.path);
    if (/\.m?js$/i.test(path)) javascript(file.content, path);
    else if (/\.css$/i.test(path)) stylesheet(file.content, path);
    else if (/\.html?$/i.test(path)) {
      const $ = load(file.content, { sourceCodeLocationInfo: true });
      const document = { path, $, text: "" };
      result.documents.push(document);
      const features: Feature[] = [];
      const textParts: string[] = [];
      const children = $.root()[0].children;
      const contentNodes: (typeof children[number] | string)[] = [...children].reverse();
      while (contentNodes.length) {
        const child = contentNodes.pop()!;
        if (typeof child === "string") textParts.push(child);
        else if (child.type === "text") textParts.push(child.data);
        else if (
          child.type !== "script" &&
          child.type !== "style" &&
          "children" in child
        ) {
          if ("name" in child && textBoundaries.has(child.name.toLowerCase())) {
            textParts.push(" ");
            contentNodes.push(" ");
          }
          for (let i = child.children.length - 1; i >= 0; i--)
            contentNodes.push(child.children[i]);
        }
      }
      const ids = new Set<string>();
      let duplicateIds = false;
      let depth = 0;
      const depths = new Map<object, number>();
      $("*").each((_index, element) => {
        if (
          element.type !== "tag" &&
          element.type !== "script" &&
          element.type !== "style"
        )
          return;
        const node = $(element);
        const tag = element.name.toLowerCase();
        const directText = node
          .contents()
          .filter((_i, child) => child.type === "text")
          .text();
        const elementDepth =
          (element.parent ? (depths.get(element.parent) ?? -1) : -1) + 1;
        depths.set(element, elementDepth);
        depth = Math.max(depth, elementDepth - 2);
        const id = node.attr("id");
        if (id) {
          if (ids.has(id)) duplicateIds = true;
          ids.add(id);
        }
        if (
          (tag === "script" ||
            tag === "img" ||
            tag === "iframe" ||
            tag === "source") &&
          node.attr("src")
        )
          dependency(path, node.attr("src")!);
        if (tag === "link" && /stylesheet/i.test(node.attr("rel") ?? ""))
          dependency(path, node.attr("href") ?? "");
        if (
          tag === "script" &&
          !node.attr("src") &&
          (!node.attr("type") ||
            /^(?:module|(?:text|application)\/javascript)$/i.test(
              node.attr("type")!,
            ))
        )
          javascript(node.text(), `${path} (inline script ${_index})`);
        if (tag === "style")
          stylesheet(node.text(), `${path} (inline style ${_index})`);
        if (boilerplate.has(tag)) return;
        const location = (element as SourceElement).sourceCodeLocation;
        const context = location
          ? file.content.slice(
              location.startOffset,
              Math.min(location.endOffset, location.startOffset + 800),
            )
          : `<${tag}>`;
        const parentTag =
          element.parent && "name" in element.parent ? element.parent.name : "";
        if (!requiredTags.has(tag))
          features.push({ value: `tag:${tag}:parent:${parentTag}`, context, start: location?.startOffset, end: location?.endOffset });
        for (const [attribute, value] of Object.entries(element.attribs)) {
          if (
            task.requirements.some(
              (r) => r.type === "attribute" && r.attribute === attribute,
            )
          )
            continue;
          features.push({
            value: `attribute:${attribute}=${normalizeText(value)}`,
            context,
            start: location?.startOffset,
            end: location?.endOffset,
          });
        }
        let text = normalizeText(directText);
        for (const required of requiredText)
          text = text.split(required).join(" ");
        for (const word of text.match(/[\p{L}\p{N}_-]+/gu) ?? [])
          if (!requiredWords.has(word))
            features.push({ value: `text:${word}`, context, start: location?.startOffset, end: location?.endOffset });
      });
      document.text = normalizeText(textParts.join(""));
      if (depth > 10)
        issue(
          "warning",
          "Deep HTML nesting",
          `${path} contains ${depth} nested elements. Review whether every wrapper is necessary.`,
        );
      if (duplicateIds)
        issue(
          "warning",
          "Duplicate element IDs",
          `${path} reuses an id attribute. IDs should be unique within a page.`,
        );
      result.files.push({
        path,
        kind: "html",
        shingles: shingles(features, file.content, path, 16),
      });
    }
  }
  if (missing.size)
    issue(
      "warning",
      "Missing local dependencies",
      [...missing].slice(0, 8).join("; "),
    );
  if (!submission.files.length)
    issue(
      "info",
      "No uploaded source to analyze",
      "External links are not fetched. Upload project files for requirement and code analysis.",
    );
  return result;
}

function checkRequirement(
  requirement: Requirement,
  parsed: ParsedSubmission,
  submission: Submission,
): AnalysisResult["requirements"][number] {
  let passed = false;
  let detail = "";
  let label = requirement.label;
  try {
    if (requirement.type === "file") {
      const expected = cleanPath(requirement.value).toLowerCase();
      if (/\.html?$/.test(expected)) {
        const page = submission.files.find((file) => /\.html?$/i.test(file.path));
        passed = !!page;
        label = "HTML page uploaded (any filename)";
        detail = page
          ? `${page.path} is an uploaded HTML page. Its filename is not restricted.`
          : "No HTML page was uploaded. Any .html or .htm filename is accepted.";
      } else {
        const matcher = new RegExp(
          `^${expected
            .split("*")
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*")}$`,
        );
        passed = [...submission.files, ...(submission.assets ?? [])].some(
          (file) =>
            matcher.test(cleanPath(file.path).toLowerCase()) ||
            matcher.test(posix.basename(cleanPath(file.path)).toLowerCase()),
        );
        detail = passed
          ? "A matching uploaded file is present."
          : `No uploaded file matches ${requirement.value}.`;
      }
    } else if (requirement.type === "text") {
      const expected = normalizeText(requirement.value);
      passed =
        !!expected &&
        parsed.documents.some((document) => document.text.includes(expected));
      detail = passed
        ? "Required text appears in parsed page content."
        : "Required text was not found in parsed page content.";
    } else {
      passed = parsed.documents.some(({ $ }) => {
        // Parser-inserted wrappers are not evidence that the student supplied the element.
        const elements = $(requirement.value)
          .toArray()
          .filter((node) => !!(node as SourceElement).sourceCodeLocation);
        return requirement.type === "attribute"
          ? !!requirement.attribute &&
              elements.some(
                (node) =>
                  ($(node).attr(requirement.attribute!) ?? "").trim().length >
                  0,
              )
          : elements.length > 0;
      });
      detail = passed
        ? "The required element or attribute is present in parsed HTML."
        : "The required element or attribute was not found in parsed HTML.";
    }
  } catch {
    detail =
      "This checklist rule has an invalid selector. The teacher should edit the rule.";
  }
  return { id: requirement.id, label, passed, detail };
}

function fingerprints(parsed: ParsedSubmission, kind: ParsedFile["kind"]) {
  const cached = parsed.fingerprintSummaries.get(kind);
  if (cached) return cached;
  const result = new Map<string, { source: string; count: number }>();
  let total = 0;
  for (const file of parsed.files.filter((file) => file.kind === kind)) {
    for (const [signature, block] of file.shingles) {
      const old = result.get(signature);
      result.set(signature, { source: old?.source ?? block.source, count: (old?.count ?? 0) + block.count });
      total += block.count;
    }
  }
  const summary = { blocks: result, total };
  parsed.fingerprintSummaries.set(kind, summary);
  return summary;
}

function complete(parsed: ParsedSubmission) {
  return !parsed.quality.some((issue) => /syntax|Analysis limit/i.test(issue.title));
}

function compare(parsed: ParsedSubmission, other: ParsedSubmission) {
  let overlap = 0;
  let ownTotal = 0;
  let peerTotal = 0;
  let substantialOverlap = 0;
  const matchingBlocks: { source: string; peer: string }[] = [];
  for (const kind of ["html", "css", "js"] as const) {
    const own = fingerprints(parsed, kind);
    const theirs = fingerprints(other, kind);
    ownTotal += own.total;
    peerTotal += theirs.total;
    for (const [signature, block] of own.blocks) {
      const matched = theirs.blocks.get(signature);
      if (!matched) continue;
      overlap += Math.min(block.count, matched.count);
      if (!signature.startsWith("short:")) substantialOverlap += Math.min(block.count, matched.count);
      if (!signature.startsWith("short:") && matchingBlocks.length < 3 && !matchingBlocks.some((item) => item.source === block.source)) {
        matchingBlocks.push({ source: block.source, peer: matched.source });
      }
    }
  }
  const sourceCoverage = ownTotal ? Math.floor(100 * overlap / ownTotal) : 0;
  const peerCoverage = peerTotal ? Math.floor(100 * overlap / peerTotal) : 0;
  return {
    percentage: Math.min(sourceCoverage, peerCoverage), sourceCoverage, peerCoverage,
    comparable: complete(parsed) && complete(other) && substantialOverlap >= 8,
    matchingBlocks,
  };
}

export function analyzeTaskSubmissions(submissions: Submission[], task: Task): TaskAnalysis {
  const selected = submissions.filter((submission) => submission.taskId === task.id);
  const analyzed: { submission: Submission; parsed: ParsedSubmission }[] = [];
  const notices: string[] = [];
  let characters = 0;
  for (const submission of selected.slice(0, MAX_PEERS)) {
    characters += Math.min(MAX_CHARACTERS, submission.files.slice(0, MAX_FILES).reduce((sum, file) => sum + file.content.length, 0));
    if (characters > MAX_PEER_CHARACTERS) break;
    analyzed.push({ submission, parsed: inspect(submission, task) });
  }
  if (analyzed.length < selected.length) notices.push(`Analyzed ${analyzed.length} of ${selected.length} submissions. The remaining submissions need individual review.`);
  const pairs: TaskAnalysis["pairs"] = [];
  for (let left = 0; left < analyzed.length; left++) {
    for (let right = left + 1; right < analyzed.length; right++) {
      const a = analyzed[left]; const b = analyzed[right];
      if (a.submission.labId !== b.submission.labId || a.submission.studentId === b.submission.studentId) continue;
      const result = compare(a.parsed, b.parsed);
      if (result.percentage > 0 && result.matchingBlocks.length) {
        const { matchingBlocks: _, ...score } = result;
        pairs.push({ leftId: a.submission.id, rightId: b.submission.id, ...score });
      }
    }
  }
  return {
    taskId: task.id,
    submissions: analyzed.map(({ submission, parsed }) => {
      const requirements = task.requirements.map((rule) => checkRequirement(rule, parsed, submission));
      return { submissionId: submission.id, revision: submission.revision, met: requirements.filter((rule) => rule.passed).length, total: requirements.length, qualityCount: parsed.quality.length, comparable: complete(parsed) && parsed.files.some((file) => [...file.shingles.keys()].some((key) => !key.startsWith("short:"))) };
    }),
    pairs: pairs.sort((a, b) => b.percentage - a.percentage), notices,
  };
}

export function analyzeSubmission(
  submission: Submission,
  peers: Submission[],
  task: Task,
): AnalysisResult {
  const parsed = inspect(submission, task);
  const requirements = task.requirements.map((requirement) =>
    checkRequirement(requirement, parsed, submission),
  );
  const eligible = peers.filter(
    (peer) =>
      peer.id !== submission.id &&
      peer.studentId !== submission.studentId &&
      peer.labId === submission.labId &&
      peer.taskId === submission.taskId,
  );
  const similarities: AnalysisResult["similarities"] = [];
  let compared = 0;
  let peerCharacters = 0;
  for (const peer of eligible.slice(0, MAX_PEERS)) {
    peerCharacters += Math.min(
      MAX_CHARACTERS,
      peer.files
        .slice(0, MAX_FILES)
        .reduce((sum, file) => sum + file.content.length, 0),
    );
    if (peerCharacters > MAX_PEER_CHARACTERS) break;
    compared++;
    const other = inspect(peer, task);
    const result = compare(parsed, other);
    if (result.percentage > 0 && result.matchingBlocks.length)
      similarities.push({
        studentId: peer.studentId,
        submissionId: peer.id,
        ...result,
      });
  }
  similarities.sort((a, b) => b.percentage - a.percentage);
  if (compared < eligible.length)
    parsed.quality.push({
      severity: "info",
      title: "Comparison limit reached",
      detail: `${compared} of ${eligible.length} peer submissions were compared within the ${MAX_PEERS}-peer / ${MAX_PEER_CHARACTERS.toLocaleString()}-character analysis limit.`,
    });
  return {
    requirements,
    met: requirements.filter((requirement) => requirement.passed).length,
    total: requirements.length,
    similarities,
    quality: parsed.quality,
    summary:
      "Similarity is the lower matching coverage of the two tasks' comparable non-required code, including repeated code and all analyzed HTML/CSS/JavaScript files. Required tags/text and standard HTML boilerplate are excluded. Small fragments and incomplete analysis cannot trigger a flag. Similarity supports review; it does not prove copying or change marks.",
  };
}
