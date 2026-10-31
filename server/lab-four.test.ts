import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { Store } from "./store.js";
import { createApp } from "./app.js";
import { initialLabs } from "./seed.js";
import { analyzeSubmission } from "./analysis.js";
import { labMetadata } from "./lab-instructions.js";
import { addLabFour, labFourAssignment, labFourDocumentHash } from "./lab-four.js";
import type { Submission } from "../shared/types.js";

test("Lab 4 appends once, publishes two tasks and preserves existing work, grades, accounts and sessions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-lab4-"));
  const store = new Store(directory);
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await store.open();
    await store.mutate(data => {
      data.labs = initialLabs().slice(0, 2);
      data.users = [
        { id: "teacher", name: "Teacher", email: "teacher@example.test", role: "teacher", passwordHash: "fixture" },
        { id: "student", name: "Student", email: "student@example.test", role: "student", rollNumber: "1", passwordHash: "fixture" },
      ];
      data.sessions = ["teacher", "student"].map((userId, index) => ({ id: String(index + 1).repeat(64), userId, expiresAt: Date.now() + 600000 }));
      data.submissions = [{ id: "saved-work", studentId: "student", labId: "lab1", taskId: "lab1-task1", revision: 6,
        files: [{ path: "original.html", content: "<h1>Existing student work</h1>" }], binaryAssets: [{ path: "image.png", mimeType: "image/png", base64: "aGVsbG8=" }],
        link: null, submittedAt: "2026-10-24T12:00:00Z", status: "graded", late: false,
        grade: { marks: 0, feedback: "Keep this draft grade", published: false, gradedAt: "2026-10-24T13:00:00Z" } }];
      data.activity = [{ id: "saved-activity", type: "grade", text: "Existing grade", time: "2026-10-24T13:00:00Z" }];
    });
    const before = structuredClone(store.data);
    const additions = await Promise.all([addLabFour(store), addLabFour(store)]);
    assert.equal(additions.filter(Boolean).length, 1, "concurrent preparation must append exactly one lab");
    assert.deepEqual(store.data.labs.slice(0, 2), before.labs);
    for (const key of ["submissions", "users", "sessions", "activity"] as const) assert.deepEqual(store.data[key], before[key]);
    const after = structuredClone(store.data);
    assert.equal(await addLabFour(store), false);
    assert.deepEqual(store.data, after);
    await store.close();
    app = await createApp({ dataDir: directory, production: false, demo: false, mongoUri: "", supabaseUrl: "", supabaseKey: "" });
    const cookie = "labtrack_session=" + "2".repeat(64);
    const state = (await request(app).get("/api/state").set("Cookie", cookie).expect(200)).body;
    const saved = state.labs.find((lab: { id: string }) => lab.id === "lab4");
    assert.equal(saved.published, true);
    assert.equal(saved.dueDate, "");
    assert.equal(saved.totalMarks, 20);
    assert.deepEqual(saved.tasks.map((task: { id: string; maxMarks: number }) => [task.id, task.maxMarks]), [["lab4-task1", 10], ["lab4-task2", 10]]);
    assert.equal(saved.instructionFile.content, undefined);
    assert.equal(saved.instructionFile.sha256, labFourDocumentHash);
    assert.equal(state.submissions[0].grade, undefined, "previous draft grades remain private");
    const download = await request(app).get("/api/labs/lab4/instructions?revision=1").set("Cookie", cookie).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => callback(null, Buffer.concat(chunks)));
      response.on("error", callback);
    }).expect(200);
    assert.ok(Buffer.isBuffer(download.body));
    assert.equal(createHash("sha256").update(download.body).digest("hex"), labFourDocumentHash);
    await request(app).get("/api/labs/lab4/instructions?revision=0").set("Cookie", cookie).expect(409);
    await request(app).get("/api/labs/lab4/instructions?revision=1").expect(401);
    await request(app).post("/api/labs").set("Cookie", "labtrack_session=" + "1".repeat(64)).send(await labFourAssignment()).expect(201);
    await request(app).post("/api/submissions").set("Cookie", cookie).field("labId", "lab4").field("taskId", "lab4-task2")
      .attach("files", Buffer.from("<form><textarea required maxlength=20></textarea></form>"), "registration.htm").expect(201);
    assert.deepEqual(app.locals.store.data.submissions.find((work: Submission) => work.id === "saved-work"), before.submissions[0]);
  } finally {
    await app?.locals.close();
    await store.close();
    if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("labtrack-lab4-")) await rm(directory, { recursive: true, force: true });
  }
});

test("Lab 4 refuses duplicate or edited labs and handles compact metadata without replacing attachments", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-lab4-conflict-"));
  const store = new Store(directory);
  try {
    await store.open();
    const lab = await labFourAssignment();
    for (const existing of [{ ...lab, published: false }, { ...lab, id: "another-lab" }, { ...lab, title: "Teacher's edited title" }]) {
      await store.mutate(data => { data.labs = [existing]; });
      const before = structuredClone(store.data);
      await assert.rejects(addLabFour(store), /already exists/);
      assert.deepEqual(store.data, before);
    }
    await store.mutate(data => { data.labs = [labMetadata(lab)]; });
    const before = structuredClone(store.data);
    assert.equal(await addLabFour(store), false);
    assert.deepEqual(store.data, before, "a repeat after a compact Supabase read must not rewrite the lab");
  } finally {
    await store.close();
    if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("labtrack-lab4-")) await rm(directory, { recursive: true, force: true });
  }
});

test("Lab 4 retains the original document and advisory checks cover both supplied tasks", async () => {
  const lab = await labFourAssignment();
  assert.equal(createHash("sha256").update(Buffer.from(lab.instructionFile!.content!, "base64")).digest("hex"), labFourDocumentHash);
  const solutions = [
    '<!doctype html><html><body><header>Example University</header><nav><a href="#home">Home</a><a href="#departments">Departments</a><a href="#contact">Contact</a></nav><section id="home"><div>University information <span>Welcome</span></div></section><article><h2>Vision and Mission</h2><p>Education for all.</p></article><aside>University news</aside><footer id="contact">Contact: info@example.test. Copyright 2026.</footer></body></html>',
    '<!doctype html><html><body><form><fieldset><legend>Student details</legend><label>Name<input name="name" placeholder="Student name" required maxlength="60"></label><input type="email" name="email"><input type="password" name="password"><input type="date" name="dob"><input type="tel" name="phone"><label>Gender<input type="radio" name="gender" value="female"><input type="radio" name="gender" value="male"></label><input type="checkbox" name="skills" value="html"><select name="department"><option>Computer Science</option></select><textarea name="address" required maxlength="20"></textarea><button>Submit</button><input type="reset"></fieldset></form></body></html>',
  ];
  for (const [index, task] of lab.tasks.entries()) {
    const submission: Submission = { id: "sample", studentId: "student", labId: lab.id, taskId: task.id, revision: 1,
      files: [{ path: `different-name-${index}.htm`, content: solutions[index] }], link: null, status: "submitted", late: false, submittedAt: "2026-10-31T12:00:00Z" };
    const original = structuredClone(submission);
    const result = analyzeSubmission(submission, [], task);
    assert.ok(result.requirements.every(rule => rule.passed), JSON.stringify(result.requirements.filter(rule => !rule.passed)));
    assert.deepEqual(submission, original, "checks must not create grades or alter work");
    const empty = analyzeSubmission({ ...submission, files: [{ path: "any.html", content: "<html><body></body></html>" }] }, [], task);
    assert.equal(empty.met, 1, "empty pages meet only the uploaded-file check");
    const comments = analyzeSubmission({ ...submission, files: [{ path: "comments.html", content: `<!-- ${solutions[index]} -->` }] }, [], task);
    assert.equal(comments.met, 1, "comments must not fulfill assignment checks");
    if (index === 1) for (const html of [solutions[index].replace(" required maxlength=\"20\"", " maxlength=\"20\""), solutions[index].replace('maxlength="20"', 'maxlength="21"')]) {
      const missing = analyzeSubmission({ ...submission, files: [{ path: "form.html", content: html }] }, [], task);
      assert.equal(missing.requirements.find(rule => rule.id === "l4t2-address")?.passed, false);
    }
  }
});
