import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSubmission, analyzeTaskSubmissions } from "./analysis.js";
import { labThreeDraft } from "./lab-three.js";
import { labThreeHtml as html, labThreeSample as sample } from "./fixtures/lab-three-samples.js";
import { labThreeChecks, type LabThreeCheck } from "../shared/lab-three-checks.js";

test("each Lab 3 semantic requirement rejects its own missing or incorrect evidence", async () => {
  const lab=await labThreeDraft();
  const edits:Record<LabThreeCheck,(source:string)=>string>={
    "heading-navy":s=>s.replace('style="color:navy"','style="color:red"'),
    "body-background":s=>s.replace("background-color:lightgray","background-color:red"),
    "link-state":s=>s.replace(/a:link\{[^}]*\}/,""),
    "hover-state":s=>s.replace(/a:hover\{[^}]*\}/,""),
    "visited-state":s=>s.replace(/a:visited\{[^}]*\}/,""),
    "linked-stylesheet":s=>s.replace('href="style.css"','href="unrelated.css"'),
    "external-link":s=>s.replace('target="_blank"','target="_self"'),
    "bookmark-link":s=>s.replace('href="#section2">Jump','href="#wrong">Jump'),
    "bookmark-target":s=>s.replace('id="section2"','id="wrong"'),
    "clickable-image":s=>s.replace('href="#section2"><img','href=""><img'),
    "image-float":s=>s.replace('style="float:left"','style="float:right"'),
    "image-wrapping":s=>s.replace("<p>Text wrapping around the photograph.</p>",""),
    "marquee-scroll":s=>s.replace('direction="left"','direction="right"'),
    "marquee-alternate":s=>s.replace('behavior="alternate"','behavior="slide"'),
    "marquee-slide":s=>s.replace('behavior="slide"','behavior="alternate"'),
    "marquee-up":s=>s.replace('direction="up"','direction="down"'),
    "marquee-height":s=>s.replace("height:200px","height:1px"),
    "marquee-width":s=>s.replace("width:300px","width:1px"),
    "marquee-border":s=>s.replace("border:2px solid black","border:1px dashed red"),
    "marquee-image":s=>s.replace('src="photo.png"','src=""'),
    "table-centered":s=>s.replace("margin:auto;",""),
    "table-border":s=>s.replace("border:1px solid black","border:0"),
    "table-headers":s=>s.replace("<th>GPA</th>","<th>Wrong</th>"),
    "table-rows":s=>s.replace(/<tr><td>3.*?<\/tr>/,"").replace('rowspan="3"','rowspan="2"'),
    "table-spans":s=>s.replace('rowspan="3"','rowspan="1"'),
    "subjects-numbering":s=>s.replace('type="I"','type="i"'),
    "subjects-content":s=>s.replace("<li>OOP</li>","<li>Wrong</li>"),
    "technology-bullets":s=>s.replace("list-style-type:square","list-style-type:circle"),
    "technology-content":s=>s.replace("<li>CSS3</li>","<li>Wrong</li>"),
    "nested-numbering":s=>s.replace('type="a"','type="A"'),
    "nested-content":s=>s.replace("<li>Tables</li>","<li>Wrong</li>"),
    "definition-html":s=>s.replace("HyperText Markup Language","Wrong expansion"),
    "definition-css":s=>s.replace("Cascading Style Sheets","Wrong expansion"),
  };
  for(const [id,,key] of labThreeChecks){
    const task=Number(id[3])-1,submission=sample(task,edits[key](html[task]));
    const result=analyzeSubmission(submission,[],lab.tasks[task]);
    assert.equal(result.requirements.find(rule=>rule.id===id)?.passed,false,key);
    const batch=analyzeTaskSubmissions([submission],lab.tasks[task]).submissions[0];
    assert.equal(batch.met,result.met,key+": batch disagreement");
    assert.ok(result.requirements.find(rule=>rule.id===id)?.detail,key+": no explanation");
  }
});

test("complete projects pass all 37 configured checks and one missing item produces one specific failure",async()=>{
  const lab=await labThreeDraft();
  assert.equal(lab.tasks.reduce((n,t)=>n+t.requirements.length,0),37);
  for(let i=0;i<3;i++){
    const result=analyzeSubmission(sample(i),[],lab.tasks[i]);
    assert.equal(result.met,result.total,JSON.stringify(result.requirements.filter(rule=>!rule.passed)));
  }
  const result=analyzeSubmission(sample(1,html[1].replace("height:200px","height:100px")),[],lab.tasks[1]);
  assert.equal(result.met,result.total-1);
  assert.deepEqual(result.requirements.filter(rule=>!rule.passed).map(rule=>rule.id),["l3t2-height"]);
  assert.match(result.requirements.find(rule=>rule.id==="l3t2-height")!.detail,/200px.*100px/);
});

test("valid alternative links, nested lists, equivalent colors and CSS cascade are handled",async()=>{
  const lab=await labThreeDraft();
  const alternatives=[
    sample(0,html[0].replace("https://example.com","//example.com").replace("color:navy","color:#000080").replace("background-color:lightgray","background-color:rgb(211,211,211)")),
    sample(2,html[2].replace('<li>HTML5<ol type="a">','<li>HTML5<div><ol type="a">').replace("</ol></li><li>CSS3","</ol></div></li><li>CSS3")),
    sample(1,html[1].replace("height:200px;width:300px","height:12.5rem;width:18.75rem")),
    sample(0,html[0].replace('style="color:navy"','style="color:hsl(240,100%,25.098%)"')),
  ];
  for(const submission of alternatives){
    const task=lab.tasks.find(t=>t.id===submission.taskId)!;
    const result=analyzeSubmission(submission,[],task);
    assert.equal(result.met,result.total,JSON.stringify(result.requirements.filter(r=>!r.passed)));
  }
  const overridden=html[0].replace("</style>","h1{color:red!important}</style>");
  assert.equal(analyzeSubmission(sample(0,overridden),[],lab.tasks[0]).requirements.find(r=>r.id==="l3t1-inline")?.passed,false);
  const later=html[0].replace('style="color:navy"','style="color:red;color:navy"');
  assert.equal(analyzeSubmission(sample(0,later),[],lab.tasks[0]).met,lab.tasks[0].requirements.length);
});

test("no green ticks for empty or hidden content, missing assets, wrong text placement and split-page evidence",async()=>{
  const lab=await labThreeDraft();
  const cases=[
    [0,html[0].replace("color:navy","color:navy").replace('src="photo.png"','src=""'),"l3t1-image"],
    [1,html[1].replace("<body>",'<body style="display:none">'),"l3t2-scroll"],
    [1,html[1].replace(">Continuous</marquee>","></marquee>"),"l3t2-scroll"],
    [1,html[1].replace('behavior="alternate"','behavior="alternate" scrollamount="0"'),"l3t2-alternate"],
    [1,html[1].replace("border:2px solid black","border:2px solid black;border-bottom:0"),"l3t2-border"],
    [1,html[1].replace("border:2px solid black","border:2px solid blue"),"l3t2-border"],
    [1,html[1].replace("border:2px solid black","border:2px solid hsl(0,100%,50%)"),"l3t2-border"],
    [2,html[2].replace("HyperText Markup Language","Wrong")+'<p>HyperText Markup Language</p>',"l3t3-html"],
    [2,html[2].replace("<li>OOP</li>","<li><span style='display:none'>OOP</span></li>"),"l3t3-subjects"],
    [0,html[0].replace("<p>Text wrapping around the photograph.</p>",'<div style="clear:both"><p>Text</p></div>'),"l3t1-wrap"],
    [0,html[0].replace("<p>Text wrapping around the photograph.</p>","").replace('<a href="#section2"><img','<p>Text before the image.</p><a href="#section2"><img'),"l3t1-wrap"],
  ] as const;
  for(const [task,source,id] of cases)assert.equal(analyzeSubmission(sample(task,source),[],lab.tasks[task]).requirements.find(r=>r.id===id)?.passed,false,id);
  const missing=sample(0);missing.assets=[];
  assert.equal(analyzeSubmission(missing,[],lab.tasks[0]).requirements.find(r=>r.id==="l3t1-image")?.passed,false);
  const split=sample(0,html[0].replace('id="section2"','id="wrong"'));
  split.files.push({path:"other.html",content:'<section id="section2">Wrong page</section>'});
  assert.equal(analyzeSubmission(split,[],lab.tasks[0]).requirements.find(r=>r.id==="l3t1-destination")?.passed,false);
});

test("semantic checks respect the source scan limits and never read CSS after the budget",async()=>{
  const lab=await labThreeDraft(),submission=sample(0);
  submission.files.splice(1,0,{path:"large.txt",content:"x".repeat(200001)});
  const result=analyzeSubmission(submission,[],lab.tasks[0]);
  assert.ok(result.met<result.total);
  assert.ok(result.quality.some(issue=>issue.title==="Analysis limit reached"));
  assert.equal(result.requirements.find(rule=>rule.id==="l3t1-external")?.passed,false);
});

test("scripts, remote styles, CSS variables and conditional CSS request review instead of claiming success",async()=>{
  const lab=await labThreeDraft();
  for(const source of [
    html[0].replace("</head>",'<script>document.body.style.color="red"</script></head>'),
    html[0].replace("</head>",'<link rel="stylesheet" href="https://example.com/theme.css"></head>'),
    html[0].replace("color:navy","color:var(--heading)"),
    html[0].replace("</style>","@media(max-width:600px){body{display:none}}</style>"),
  ]){
    const result=analyzeSubmission(sample(0,source),[],lab.tasks[0]);
    assert.ok(result.requirements.some(rule=>rule.needsReview));
    assert.ok(result.met<result.total);
    assert.ok(analyzeTaskSubmissions([sample(0,source)],lab.tasks[0]).submissions[0].reviewCount);
  }
});

test("layout evidence must describe one table and one upward marquee, not unrelated fragments",async()=>{
  const lab=await labThreeDraft();
  const marquee=html[1].replace("width:300px","width:1px").replace("</body>",'<marquee direction="up" style="width:300px;height:1px">Other box</marquee></body>');
  const result=analyzeSubmission(sample(1,marquee),[],lab.tasks[1]);
  assert.ok(result.met<result.total);
  const table=html[2].replace("margin:auto;","").replace("</body>",'<table style="margin:auto;border:1px solid"><tr><td>Other table</td></tr></table></body>');
  assert.equal(analyzeSubmission(sample(2,table),[],lab.tasks[2]).requirements.find(r=>r.id==="l3t3-table")?.passed,false);
});
