import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import { analyzeInstructions, draftRequirementsFromText } from "./instructions.js";

test("drafts task-specific rules from explicit syntax without counting comments", () => {
  const draft = draftRequirementsFromText('Task 1: Basics\nCreate lab1.html. Add <h1> and <p title="Tooltip">. <!-- <script> -->\nExercise 2 — Output\nUse <pre>. No particular filename is required.');
  assert.equal(draft.tasks.length, 2);
  assert.equal(draft.tasks[0].title, "Basics");
  assert.equal(draft.tasks[1].title, "Output");
  assert.ok(draft.tasks[0].requirements.some(rule => rule.type === "file" && rule.value === "*.html"));
  assert.ok(draft.tasks[0].requirements.some(rule => rule.type === "attribute" && rule.attribute === "title" && rule.value === 'p[title="Tooltip"]'));
  assert.ok(!draft.tasks[0].requirements.some(rule => rule.value === "script"));
  assert.deepEqual(draft.tasks[1].requirements.map(rule => rule.value), ["pre"]);
  assert.match(draft.notice, /teacher review/i);
});

test("hint headings and example attribute values do not become rigid assignment requirements", () => {
  const article = draftRequirementsFromText('Create a webpage titled “Emerging Technologies in Computer Science.” Add a main heading and suitable subheadings. Write two paragraphs. Demonstrate bold, strong, italic, emphasized, highlighted, deleted, and inserted text. Hints: <h1> – <h6>, <p>.').tasks[0];
  assert.ok(article.requirements.some(rule => rule.value === "h2, h3, h4, h5, h6"));
  assert.ok(!article.requirements.some(rule => rule.value === "h6"));
  assert.ok(article.requirements.some(rule => rule.value === "Emerging Technologies in Computer Science"));
  for (const tag of ["b", "strong", "i", "em", "mark", "del", "ins"])
    assert.ok(article.requirements.some(rule => rule.value === tag));
  const font = draftRequirementsFromText('Use the <font> tag with different colors, sizes and faces. Hints: <font color="blue" size="5" face="Arial">.').tasks[0];
  for (const attribute of ["color", "size", "face"])
    assert.ok(font.requirements.some(rule => rule.type === "attribute" && rule.value === "font" && rule.attribute === attribute));
  assert.ok(!font.requirements.some(rule => /blue|Arial/.test(rule.value)));
  const tooltip = draftRequirementsFromText('Add a paragraph, for example <p title="Tooltip text">.').tasks[0];
  assert.ok(tooltip.requirements.some(rule => rule.type === "attribute" && rule.value === "p" && rule.attribute === "title"));
  const separate = draftRequirementsFromText('For example <p title="Example">. Set <body bgcolor="gray">. Use an external stylesheet, for example style.css.').tasks[0];
  assert.ok(separate.requirements.some(rule => rule.value === 'body[bgcolor="gray"]'));
  assert.ok(!separate.requirements.some(rule => rule.type === "file" && rule.value === "style.css"));
  const headings = draftRequirementsFromText('Display all six heading levels from <h1> to <h6>.').tasks[0];
  for (let level = 1; level <= 6; level++)
    assert.ok(headings.requirements.some(rule => rule.value === `h${level}`));
});

test("plain prose creates a reviewable task without inventing checklist rules", () => {
  const draft = draftRequirementsFromText("Create a welcoming website about your university.");
  assert.equal(draft.tasks.length, 1);
  assert.equal(draft.tasks[0].requirements.length, 0);
  assert.equal(draft.tasks[0].maxMarks, 10);
  assert.throws(() => draftRequirementsFromText(" "), /No readable text/);
  assert.throws(() => draftRequirementsFromText(Array.from({ length: 21 }, (_, index) => `Task ${index + 1}: Example\n<p>`).join("\n")), /more than 20 tasks/);
  assert.equal(draftRequirementsFromText("Task 1\nUse <pre>.").tasks[0].title, "Task 1");
  const bounded = draftRequirementsFromText("Task 1: Files\n" + Array.from({ length: 100 }, (_, index) => `file${index}.css`).join(" ") + "\n" + "x".repeat(9000));
  assert.equal(bounded.tasks[0].requirements.length, 80);
  assert.equal(bounded.tasks[0].description.length, 8000);
});

test("reads a generated DOCX and extracts specified text and filenames", async () => {
  const archive = new AdmZip();
  archive.addFile("[Content_Types].xml", Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  archive.addFile("_rels/.rels", Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  archive.addFile("word/document.xml", Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Task 1: Welcome</w:t></w:r></w:p><w:p><w:r><w:t>Create welcome.html. Add an &lt;h1&gt; heading with the text: "Welcome".</w:t></w:r></w:p></w:body></w:document>'));
  const draft = await analyzeInstructions({ name: "fixture.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content: archive.toBuffer().toString("base64") });
  assert.equal(draft.tasks.length, 1);
  assert.ok(draft.tasks[0].requirements.some(rule => rule.type === "text" && rule.value === "Welcome"));
  assert.ok(draft.tasks[0].requirements.some(rule => rule.type === "file" && rule.value === "*.html"));
});

test("extracts the original Lab 1 DOCX into its three assignment tasks", async () => {
  const bytes = await readFile(new URL("./fixtures/Web Engineering.docx", import.meta.url));
  const draft = await analyzeInstructions({ name: "Web Engineering.docx", content: bytes.toString("base64"), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  assert.equal(draft.tasks.length, 3);
  assert.deepEqual(draft.tasks.map(task => task.requirements.filter(rule => rule.type === "file").map(rule => rule.value)), [["*.html"], ["*.html"], ["*.html"]]);
  assert.ok(draft.tasks[0].requirements.some(rule => rule.type === "text" && rule.value === "Welcome to Web Engineering"));
  assert.ok(draft.tasks[0].requirements.some(rule => rule.value === 'meta[charset="utf-8" i]'));
  assert.ok(draft.tasks[0].requirements.some(rule => rule.value === 'meta[name="author" i]' && rule.attribute === "content"));
  assert.ok(draft.tasks[0].requirements.some(rule => rule.value === "p" && rule.attribute === "title"));
  assert.ok(!draft.tasks[0].requirements.some(rule => rule.value.includes("Tooltip text")));
  for (let level = 1; level <= 6; level++)
    assert.ok(draft.tasks[1].requirements.some(rule => rule.value === `h${level}`));
  assert.ok(!draft.tasks[2].requirements.some(rule => rule.value === "b" || rule.value === "i"));
  assert.ok(draft.tasks[2].requirements.some(rule => rule.value === "strong"));
});

test("extracts the original Lab 2 PDF without inventing filenames", async () => {
  const bytes = await readFile(new URL("./fixtures/Web Engineering lab 2.pdf", import.meta.url));
  const draft = await analyzeInstructions({ name: "Web Engineering lab 2.pdf", content: bytes.toString("base64"), contentType: "application/pdf" });
  assert.equal(draft.tasks.length, 3);
  assert.match(draft.tasks[0].title, /Technical Article/);
  assert.match(draft.tasks[1].title, /Contact.*Page/);
  assert.ok(draft.tasks.every(task => task.requirements.every(rule => rule.type !== "file")));
  assert.ok(draft.tasks[1].requirements.some(rule => rule.attribute === "dir" && rule.value === 'bdo[dir="rtl" i]'));
});

test("rejects invalid base64, oversize content, malformed documents and legacy DOC", async () => {
  const attachment = { name: "instructions.pdf", contentType: "application/pdf", content: "YR==" };
  await assert.rejects(analyzeInstructions(attachment), /valid base64/);
  await assert.rejects(analyzeInstructions({ ...attachment, content: Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64") }), /3 MB/);
  await assert.rejects(analyzeInstructions({ ...attachment, content: Buffer.from("Not a PDF").toString("base64") }), /valid PDF/);
  await assert.rejects(analyzeInstructions({ ...attachment, name: "instructions.doc", contentType: "application/msword", content: Buffer.from("legacy").toString("base64") }), /legacy .doc/);
  await assert.rejects(analyzeInstructions({ ...attachment, name: "instructions.docx", contentType: "application/octet-stream", content: Buffer.from("Not a ZIP").toString("base64") }), /valid document/);
});

test("rejects a valid PDF with more than 25 pages before extracting text", async () => {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count 26 /Kids [${Array.from({ length: 26 }, (_, index) => `${index + 3} 0 R`).join(" ")}] >>`,
    ...Array.from({ length: 26 }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 29 0 R >>"),
    "<< /Length 0 >>\nstream\n\nendstream"];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const crossReference = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
  await assert.rejects(analyzeInstructions({ name: "long.pdf", contentType: "application/pdf", content: Buffer.from(pdf).toString("base64") }), /at most 25 pages/);
});
