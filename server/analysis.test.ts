import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSubmission, analyzeTaskSubmissions } from "./analysis.js";
import type { Submission, Task } from "../shared/types.js";
import { initialLabs } from "./seed.js";
import { analysisProjects } from "./analysis-budget.js";

const task: Task = {
  id: "task-1",
  title: "HTML",
  description: "",
  maxMarks: 10,
  requirements: [],
};
function submission(id: string, path: string, content: string): Submission {
  return {
    id,
    studentId: id,
    labId: "lab-1",
    taskId: task.id,
    files: [{ path, content }],
    link: null,
    submittedAt: "2026-10-12T00:00:00Z",
    status: "submitted",
    revision: 1,
    late: false,
  };
}

test("structural budgets stop deeply nested HTML, CSS and JavaScript before scoring", () => {
  const rules: Task = { ...task, requirements: [{ id: "p", label: "Paragraph", type: "tag", value: "p" }] };
  const sources = [
    ["index.html", "<div>".repeat(18_000) + "<p>hello</p>" + "</div>".repeat(18_000)],
    ["index.html", '< nope "' + "<div>".repeat(18_000) + "</div>".repeat(18_000)],
    ["index.html", "<p>x</p>".repeat(2_001)],
    ["index.html", "<div/>".repeat(2_001)],
    ["index.html", `<${"custom".repeat(30)}>`.repeat(130)],
    ["main.js", "(".repeat(130) + "1" + ")".repeat(130)],
    ["main.js", "let answer=1;".repeat(5_000)],
    ["style.css", "div{".repeat(130) + "color:red;" + "}".repeat(130)],
  ];
  for (const [path, source] of sources) {
    const work = submission("a", path, source);
    const result = analyzeSubmission(work, [submission("b", path, source)], rules);
    assert.ok(result.quality.some(issue => /Analysis limit/.test(issue.title)), path);
    assert.equal(result.requirements[0].needsReview, true, path);
    assert.ok(result.similarities.every(pair => !pair.comparable), path);
    assert.equal(analyzeTaskSubmissions([work], rules).submissions[0].comparable, false, path);
    assert.equal(work.files[0].content, source, "budget checks do not modify saved source");
  }
});

test("omitted analysis source keeps complete filenames and asks for manual review", () => {
  const original = submission("a", "large.html", "x".repeat(200_001));
  original.files.push({ path: "nested/style.css", content: "body{color:red}" });
  const [bounded] = analysisProjects([original]);
  const result = analyzeSubmission(bounded, [], { ...task, requirements: [
    { id: "file", label: "Stylesheet", type: "file", value: "style.css" },
    { id: "element", label: "Paragraph", type: "tag", value: "p" },
  ] });
  assert.deepEqual(bounded.files.map(file => file.path), original.files.map(file => file.path));
  assert.equal(result.requirements[0].passed, true);
  assert.equal(result.requirements[1].needsReview, true);
  assert.ok(result.quality.some(issue => /omitted before loading/.test(issue.detail)));
  assert.equal(analyzeTaskSubmissions([bounded], task).submissions[0].comparable, false);
  assert.equal(original.files[0].content.length, 200_001);
});

test("HTML filename checks accept renamed pages in single and batch analysis, while other filenames remain exact", () => {
  const rules: Task = { ...task, requirements: [
    { id: "page", label: "index.html included", type: "file", value: "index.html" },
    { id: "css", label: "Stylesheet included", type: "file", value: "style.css" },
  ] };
  for (const path of ["T1.html", "task folder/T1.HTML", "solution.htm"]) {
    const own = submission("a", path, "<h1>My task</h1>");
    const result = analyzeSubmission(own, [], rules);
    assert.equal(result.met, 1);
    assert.equal(result.requirements[0].label, "HTML page uploaded (any filename)");
    assert.ok(result.requirements[0].detail.includes(path));
    assert.equal(result.requirements[1].passed, false);
    assert.match(result.requirements[1].detail, /style\.css/);
    assert.equal(analyzeTaskSubmissions([own], rules).submissions[0].met, result.met);
  }
  assert.equal(rules.requirements[0].value, "index.html");
  for (const own of [submission("a", "style.css", "body{}"), { ...submission("a", "notes.txt", "My task"), assets: [{ path: "index.html", mimeType: "image/png" }] }]) {
    const result = analyzeSubmission(own, [], rules);
    assert.equal(result.requirements[0].passed, false);
    assert.match(result.requirements[0].detail, /Any \.html or \.htm filename/);
  }
});

test("page text respects block boundaries and br without splitting words around inline tags", () => {
  const result = analyzeSubmission(submission("a", "T1.html", '<html><head><title>Course title</title></head><body><p>Web Eng<strong>ineering</strong><br>Semester 7</p><p>Hello</p>world<script>Hidden text</script></body></html>'), [], {
    ...task,
    requirements: [
      { id: "break", label: "Course and semester", type: "text", value: "Web Engineering Semester 7" },
      { id: "blocks", label: "Adjacent blocks", type: "text", value: "Hello world" },
      { id: "hidden", label: "Script content", type: "text", value: "Hidden text" },
    ],
  });
  assert.deepEqual(result.requirements.map(rule => rule.passed), [true, true, false]);
});

test("comments cannot fulfill element or visible text requirements", () => {
  const result = analyzeSubmission(
    submission(
      "a",
      "index.html",
      "<!-- <pre>Required passage</pre> --><p>A page</p>",
    ),
    [],
    {
      ...task,
      requirements: [
        { id: "pre", label: "Preformatted text", type: "tag", value: "pre" },
        {
          id: "text",
          label: "Passage",
          type: "text",
          value: "Required passage",
        },
      ],
    },
  );
  assert.equal(result.met, 0);
});

test("required headings, fixed assignment text and document boilerplate do not produce similarity", () => {
  const source =
    "<!doctype html><html><head><title>Lab</title></head><body><h1>Welcome to Web Engineering</h1><p>This is my first HTML lab assignment.</p></body></html>";
  const result = analyzeSubmission(
    submission("a", "index.html", source),
    [submission("b", "index.html", source)],
    {
      ...task,
      requirements: [
        { id: "h1", label: "Heading", type: "tag", value: "h1" },
        { id: "p", label: "Paragraph", type: "tag", value: "p" },
        {
          id: "heading-text",
          label: "Heading text",
          type: "text",
          value: "Welcome to Web Engineering",
        },
        {
          id: "paragraph-text",
          label: "Paragraph text",
          type: "text",
          value: "This is my first HTML lab assignment.",
        },
      ],
    },
  );
  assert.equal(result.met, 4);
  assert.deepEqual(result.similarities, []);
});

test("substantial JavaScript with renamed variables yields matching evidence", () => {
  const first =
    "function calculateTotals(prices) { let sum = 0; for (const price of prices) { if (price > 0) { sum += price * 1.05; } } return Math.round(sum * 100) / 100; }";
  const second =
    "function tally(items){let total=0;for(const item of items){if(item>0){total+=item*1.05;}}return Math.round(total*100)/100;}";
  const result = analyzeSubmission(
    submission("a", "app.js", first),
    [submission("b", "solution.js", second)],
    task,
  );
  assert.equal(result.similarities[0].percentage, 100);
  assert.match(result.similarities[0].matchingBlocks[0].source, /app\.js/);
  assert.match(result.similarities[0].matchingBlocks[0].peer, /solution\.js/);
});

test("invalid JavaScript is reported without crashing or scored as a match", () => {
  const broken = submission("a", "app.js", "function broken( { return ;");
  const result = analyzeSubmission(
    broken,
    [submission("b", "app.js", broken.files[0].content)],
    task,
  );
  assert.ok(result.quality.some((issue) => issue.title.includes("syntax")));
  assert.deepEqual(result.similarities, []);
});

test("CSS formatting normalizes, missing project dependencies are reported and cross-task peers are ignored", () => {
  const source =
    ".header { color: #123456; padding: 12px; margin: 0; display: flex; gap: 8px; border: 1px solid black; font-size: 16px; line-height: 1.5; }";
  const own = submission("a", "style.css", source);
  own.files.push({
    path: "index.html",
    content:
      '<link rel="stylesheet" href="missing.css"><img src="portrait.png">',
  });
  const peer = submission(
    "b",
    "style.css",
    source.replace(/\s*([{};:])\s*/g, "$1"),
  );
  const result = analyzeSubmission(
    own,
    [peer, { ...peer, id: "other-task", studentId: "other", taskId: "task-2" }],
    task,
  );
  assert.equal(result.similarities.length, 1);
  assert.ok(result.similarities[0].percentage > 80);
  assert.ok(
    result.quality.some(
      (issue) =>
        issue.title === "Missing local dependencies" &&
        issue.detail.includes("missing.css"),
    ),
  );
});

test("an inserted document wrapper does not fulfill an explicit html requirement", () => {
  const result = analyzeSubmission(
    submission("a", "index.html", "<p>A fragment</p>"),
    [],
    {
      ...task,
      requirements: [
        { id: "html", label: "HTML document", type: "tag", value: "html" },
      ],
    },
  );
  assert.equal(result.met, 0);
});

test("required text split across formatting elements is checked in document order and excluded from comparison", () => {
  const source =
    "<p>Web <strong>Engineering</strong> is an <em>essential</em> course for students because it teaches how modern applications are built.</p>";
  const result = analyzeSubmission(
    submission("a", "essay.html", source),
    [submission("b", "essay.html", source)],
    {
      ...task,
      requirements: [
        {
          id: "passage",
          label: "Required passage",
          type: "text",
          value:
            "Web Engineering is an essential course for students because it teaches how modern applications are built.",
        },
      ],
    },
  );
  assert.equal(result.met, 1);
  assert.deepEqual(result.similarities, []);
});

test("native selector groups match alternatives and commas in attribute values remain intact", () => {
  const result = analyzeSubmission(
    submission(
      "a",
      "article.html",
      '<h2>One subheading</h2><p title="course, semester">Content</p>',
    ),
    [],
    {
      ...task,
      requirements: [
        {
          id: "subheading",
          label: "Subheading present",
          type: "tag",
          value: "body h2, body h3, body h4, body h5, body h6",
        },
        {
          id: "comma",
          label: "Tooltip has required text",
          type: "tag",
          value: 'p[title="course, semester"]',
        },
        {
          id: "attribute",
          label: "Any paragraph or heading has tooltip",
          type: "attribute",
          value: "h1, h2, p",
          attribute: "title",
        },
      ],
    },
  );
  assert.equal(result.met, 3);
});

test("whole-task matching rejects a shared fragment inside a much larger project", () => {
  const common = 'function total(values){let sum=0;for(const value of values){if(value>0){sum+=value*1.05;}}return Math.round(sum*100)/100;}';
  const own = submission("a", "common.js", common);
  own.files.push({ path: "original.js", content: Array.from({length: 20}, (_, i) => `export const record${i} = {title: "distinct entry ${i}", score: ${i + 17}, active: true};`).join("\n") });
  const peer = submission("b", "common.js", common);
  const result = analyzeSubmission(own, [peer], task);
  assert.ok(result.similarities[0].percentage < 50);
  assert.equal(result.similarities[0].peerCoverage, 100);
});

test("repeated code counts towards the whole task rather than disappearing in a set", () => {
  const common = 'function total(values){let sum=0;for(const value of values){if(value>0){sum+=value*1.05;}}return Math.round(sum*100)/100;}';
  const own = submission("a", "one.js", common);
  for (let i = 0; i < 8; i++) own.files.push({ path: `copy${i}.js`, content: common });
  const result = analyzeSubmission(own, [submission("b", "one.js", common)], task);
  assert.ok(result.similarities[0].percentage < 50);
});

test("batch analysis flags every matching student and keeps different tasks separate", () => {
  const common = 'function total(values){let sum=0;for(const value of values){if(value>0){sum+=value*1.05;}}return Math.round(sum*100)/100;}';
  const peers = ["a", "b", "c"].map(id => submission(id, "app.js", common));
  const result = analyzeTaskSubmissions([...peers, { ...peers[0], id: "other-task", taskId: "task-2" }], task);
  assert.equal(result.submissions.length, 3);
  assert.equal(result.pairs.length, 3);
  assert.ok(result.pairs.every(pair => pair.percentage === 100 && pair.comparable));
  const individual = analyzeSubmission(peers[0], peers.slice(1), task);
  assert.equal(individual.similarities[0].percentage, result.pairs[0].percentage);
});

test("incomplete parsing and tiny shared fragments cannot trigger a similarity flag", () => {
  const common = 'function total(values){let sum=0;for(const value of values){if(value>0){sum+=value*1.05;}}return Math.round(sum*100)/100;}';
  const own = submission("a", "valid.js", common);
  own.files.push({ path: "broken.js", content: "function broken(" });
  const result = analyzeTaskSubmissions([own, submission("b", "valid.js", common)], task);
  assert.equal(result.pairs[0].comparable, false);
  assert.equal(result.submissions[0].comparable, false);
  assert.deepEqual(analyzeTaskSubmissions([submission("c", "index.html", "<h1>Hello</h1>"), submission("d", "index.html", "<h1>Hello</h1>")], task).pairs, []);
});

test("the supplied Lab 1 practice paragraph is excluded even in an older saved checklist", () => {
  const essay = initialLabs()[0].tasks[2];
  const text = '<h2>Essay</h2><p><strong>Web Engineering</strong> is an <em>essential</em> course for computer science students because it teaches how modern web applications are built. Understanding <mark>HTML</mark> is the foundation of all web development.</p><hr><p>Currently, I am in <del>third</del> <ins>fourth</ins> semester of my degree program. During our lectures, we learned that water is written as H<sub>2</sub>O and math formulas use terms like x<sup>2</sup>.</p>';
  const a = { ...submission("a", "lab3_essay.html", text), taskId: essay.id };
  const b = { ...submission("b", "lab3_essay.html", text), taskId: essay.id };
  assert.deepEqual(analyzeTaskSubmissions([a, b], essay).pairs, []);
});

test("identical multi-file projects retain full coverage including smaller linked pages", () => {
  const own = submission("a", "app.js", 'function total(values){let sum=0;for(const value of values){if(value>0){sum+=value*1.05;}}return Math.round(sum*100)/100;}');
  own.files.push({path: 'contact.html', content: '<p>Contact our research team</p><a href="index.html">Go back</a>'});
  const peer = {...own, id: 'b', studentId: 'b'};
  assert.equal(analyzeSubmission(own, [peer], task).similarities[0].percentage, 100);
});

test("41-student batch scores retain repeated multi-file counts and agree with individual review", () => {
  const common = 'function total(values){let sum=0;for(const value of values){if(value>0){sum+=value*1.05;}}return Math.round(sum*100)/100;}';
  const peers = Array.from({ length: 41 }, (_, index) => {
    const project = submission(`student-${index}`, "app.js", common);
    for (let copy = 0; copy < index % 3; copy++)
      project.files.push({ path: `copy-${copy}.js`, content: common });
    project.files.push({ path: "contact.html", content: "<p>Contact our research team</p>" });
    return project;
  });
  const batch = analyzeTaskSubmissions(peers, task);
  assert.equal(batch.submissions.length, 41);
  assert.equal(batch.pairs.length, 820);
  assert.ok(batch.pairs.every((pair) => pair.comparable));
  const individual = analyzeSubmission(peers[0], peers.slice(1), task);
  for (const match of individual.similarities) {
    const pair = batch.pairs.find((candidate) => candidate.leftId === peers[0].id && candidate.rightId === match.submissionId)!;
    assert.equal(pair.percentage, match.percentage);
    assert.equal(pair.sourceCoverage, match.sourceCoverage);
    assert.equal(pair.peerCoverage, match.peerCoverage);
    assert.equal(pair.comparable, match.comparable);
    assert.equal(pair.sourceCoverage, 100);
    assert.equal(pair.percentage === 100, Number(match.studentId.split("-")[1]) % 3 === 0);
  }
});
