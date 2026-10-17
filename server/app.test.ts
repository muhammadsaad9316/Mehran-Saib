import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { load } from "cheerio";
import type { Express } from "express";
import { createApp } from "./app.js";
import type { Submission } from "../shared/types.js";

test("teachers can publish without a deadline, then set or remove it while late flags follow the current deadline", async () => {
  const deadlineDir = await mkdtemp(
    path.join(os.tmpdir(), "labtrack-deadline-test-"),
  );
  const deadlineApp = await createApp({
    ...localDatabase,
    dataDir: deadlineDir,
    demo: true,
    production: false,
  });
  const teacher = request.agent(deadlineApp);
  const student = request.agent(deadlineApp);
  await teacher
    .post("/api/auth/demo")
    .set("Host", "localhost")
    .send({ role: "teacher" })
    .expect(200);
  await student
    .post("/api/auth/demo")
    .set("Host", "localhost")
    .send({ role: "student" })
    .expect(200);
  try {
    const created = await teacher
      .post("/api/labs")
      .send({
        title: "Teacher-controlled deadline",
        description: "An assignment with an optional deadline.",
        published: true,
        tasks: [
          {
            id: "optional-deadline-task",
            title: "HTML page",
            description: "Create an HTML heading.",
            maxMarks: 10,
            requirements: [
              {
                id: "optional-deadline-heading",
                label: "Heading present",
                type: "tag",
                value: "body h1",
              },
            ],
          },
        ],
      })
      .expect(201);
    const labId = created.body.id;
    assert.equal(created.body.dueDate, "");
    await student
      .patch(`/api/labs/${labId}`)
      .send({ dueDate: "2000-01-01T00:00:00Z" })
      .expect(403);
    const submit = () =>
      student
        .post("/api/submissions")
        .field("labId", labId)
        .field("taskId", "optional-deadline-task")
        .attach(
          "files",
          Buffer.from(
            "<!DOCTYPE html><html><body><h1>Course work</h1></body></html>",
          ),
          "course.html",
        );
    assert.equal((await submit().expect(201)).body.late, false);
    const dated = await teacher
      .patch(`/api/labs/${labId}`)
      .send({ dueDate: "2000-01-01T00:00:00Z" })
      .expect(200);
    assert.equal(dated.body.dueDate, "2000-01-01T00:00:00.000Z");
    assert.equal((await submit().expect(201)).body.late, true);
    await teacher
      .patch(`/api/labs/${labId}`)
      .send({ dueDate: "invalid" })
      .expect(400);
    const cleared = await teacher
      .patch(`/api/labs/${labId}`)
      .send({ dueDate: "" })
      .expect(200);
    assert.equal(cleared.body.dueDate, "");
    assert.equal((await submit().expect(201)).body.late, false);
  } finally {
    await deadlineApp.locals.store.close();
    await rm(deadlineDir, { recursive: true, force: true });
  }
});

let app: Express;
let dataDir: string;
let teacher: ReturnType<typeof request.agent>;
let student: ReturnType<typeof request.agent>;
// Test fixtures must never inherit hosted database credentials from the shell.
const localDatabase = { mongoUri: "", supabaseUrl: "", supabaseKey: "" };

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "labtrack-test-"));
  app = await createApp({
    ...localDatabase,
    dataDir,
    demo: true,
    production: false,
  });
  teacher = request.agent(app);
  student = request.agent(app);
  await teacher
    .post("/api/auth/demo")
    .set("Host", "localhost")
    .send({ role: "teacher" })
    .expect(200);
  await student
    .post("/api/auth/demo")
    .set("Host", "localhost")
    .send({ role: "student" })
    .expect(200);
});

after(async () => {
  await app?.locals.store.close();
  await rm(dataDir, { recursive: true, force: true });
});

test("only teachers can rename students, with stale-name protection and no account or work changes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-name-test-"));
  const nameApp = await createApp({ ...localDatabase, dataDir: directory, demo: true, production: false });
  try {
    const editor = request.agent(nameApp);
    const learner = request.agent(nameApp);
    await editor.post("/api/auth/demo").set("Host", "localhost").send({ role: "teacher" }).expect(200);
    await learner.post("/api/auth/demo").set("Host", "localhost").send({ role: "student" }).expect(200);
    const store = nameApp.locals.store;
    const original = structuredClone(store.data);
    const target = original.users.find((user: { rollNumber?: string }) => user.rollNumber === "1")!;
    const route = `/api/students/${target.id}`;
    const change = { name: "  Updated Student Name  ", previousName: target.name };
    await request(nameApp).patch(route).send(change).expect(401);
    await learner.patch(route).send(change).expect(403);
    for (const name of ["", "   ", "a".repeat(101), 42, null])
      await editor.patch(route).send({ ...change, name }).expect(400);
    await editor.patch(route).send({ name: "Updated Student Name" }).expect(400);
    await editor.patch(route).send({ ...change, previousName: "stale" }).expect(409);
    await editor.patch("/api/students/missing").send(change).expect(404);
    const teacherId = original.users.find((user: { role: string }) => user.role === "teacher")!.id;
    await editor.patch(`/api/students/${teacherId}`).send(change).expect(404);
    assert.deepEqual(store.data, original);
    const response = await editor.patch(route).send({ ...change, role: "teacher", rollNumber: "41", email: "changed@example.test", password: "changed" }).expect(200);
    assert.equal(response.body.name, "Updated Student Name");
    assert.ok(!("passwordHash" in response.body) && !("authVersion" in response.body));
    const expected = structuredClone(original);
    expected.users.find((user: { id: string }) => user.id === target.id)!.name = "Updated Student Name";
    assert.deepEqual(store.data, expected);
    await editor.patch(route).send(change).expect(409);
    assert.equal((await learner.get("/api/state").expect(200)).body.user.name, "Updated Student Name");
  } finally {
    await nameApp.locals.store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("instruction generation requires teacher access and returns reviewable draft checks", async () => {
  const instructionFile = {
    name: "brief.txt",
    contentType: "text/plain",
    content: Buffer.from(
      "Task 1: Headings\nCreate lab.html with <h1> and <p>.",
    ).toString("base64"),
  };
  await request(app)
    .post("/api/instructions/analyze")
    .send({ instructionFile })
    .expect(401);
  await student
    .post("/api/instructions/analyze")
    .send({ instructionFile })
    .expect(403);
  const response = await teacher
    .post("/api/instructions/analyze")
    .send({ instructionFile })
    .expect(200);
  assert.equal(response.body.tasks.length, 1);
  assert.ok(
    response.body.tasks[0].requirements.some(
      (rule: { value: string }) => rule.value === "*.html",
    ),
  );
  assert.match(response.body.notice, /review/i);
  await teacher
    .post("/api/instructions/analyze")
    .send({ instructionFile: { ...instructionFile, content: "invalid" } })
    .expect(400);
});

test("an absent local Supabase key returns a clear uncached setup response; production fails closed", async () => {
  const options = {
    ...localDatabase,
    supabaseUrl: "https://labtrack-test.supabase.co",
    supabaseKey: "",
    production: false,
    demo: false,
  };
  const setup = await createApp(options);
  const response = await request(setup).get("/api/state").expect(503);
  assert.match(response.body.error, /SUPABASE_SECRET_KEY.*\.env/);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  await request(setup)
    .post("/api/auth/login")
    .send({ email: "teacher@example.test", password: "unused-password" })
    .expect(503);
  await assert.rejects(
    createApp({ ...options, production: true }),
    /Set both SUPABASE_URL/,
  );
});

test("anonymous state exposes no private roster, labs, submissions or activity", async () => {
  const response = await request(app).get("/api/state").expect(200);
  assert.equal(response.body.user, null);
  for (const key of ["students", "labs", "submissions", "activity"])
    assert.deepEqual(response.body[key], []);
  assert.equal(response.body.demo, true);
});

test("teacher sees demo roster; student sees only their published labs and submissions", async () => {
  const overview = await teacher.get("/api/state").expect(200);
  assert.equal(overview.body.students.length, 41);
  assert.equal(
    overview.body.students.find(
      (s: { rollNumber: string }) => s.rollNumber === "1",
    ).name,
    "Muhammad Haroon",
  );
  assert.equal(
    overview.body.students.find(
      (s: { rollNumber: string }) => s.rollNumber === "41",
    ).name,
    "Saman Ali",
  );
  assert.deepEqual(
    overview.body.students
      .filter((s: { name: string }) => !s.name)
      .map((s: { rollNumber: string }) => s.rollNumber),
    ["16", "26", "27", "30", "34", "37", "39"],
  );
  assert.deepEqual(
    overview.body.students
      .map((student: { rollNumber: string }) => Number(student.rollNumber))
      .sort((a: number, b: number) => a - b),
    Array.from({ length: 41 }, (_, i) => i + 1),
  );
  assert.equal(overview.body.labs.length, 3);
  assert.ok(!JSON.stringify(overview.body).includes("passwordHash"));
  const own = await student.get("/api/state").expect(200);
  assert.equal(own.body.students.length, 1);
  assert.equal(own.body.labs.length, 2);
  assert.ok(
    own.body.submissions.every(
      (submission: { studentId: string }) =>
        submission.studentId === own.body.user.id,
    ),
  );
  await student.get("/api/submissions/submission-2-2-1/analysis").expect(404);
  await student
    .get("/api/submissions/submission-2-2-1/files/article.html")
    .expect(404);
  await student.get("/api/reports.csv").expect(403);
  await student.post("/api/labs").send({}).expect(403);
});

test("unpublishing a lab hides retained submission file and analysis URLs from students", async () => {
  const submissionPath = "/api/submissions/submission-2-1-1";
  await student.get(`${submissionPath}/files/article.html`).expect(200);
  await teacher.patch("/api/labs/lab2").send({ published: false }).expect(200);
  try {
    const own = await student.get("/api/state").expect(200);
    assert.ok(!own.body.labs.some((lab: { id: string }) => lab.id === "lab2"));
    assert.ok(!own.body.submissions.some((submission: Submission) => submission.labId === "lab2"));
    await student.get(`${submissionPath}/files/article.html`).expect(404);
    await student.get(`${submissionPath}/analysis`).expect(404);
    await teacher.get(`${submissionPath}/files/article.html`).expect(200);
    await teacher.get(`${submissionPath}/analysis`).expect(200);
  } finally {
    await teacher.patch("/api/labs/lab2").send({ published: true }).expect(200);
  }
  await student.get(`${submissionPath}/files/article.html`).expect(200);
});

test("students can sign in by roll number and roster numbers must be 1–41", async () => {
  const byRoll = request.agent(app);
  await byRoll
    .post("/api/auth/login")
    .send({ email: "01", password: "LabTrack2026!" })
    .expect(200);
  const state = await byRoll.get("/api/state").expect(200);
  assert.equal(state.body.user.id, "student-01");
  assert.equal(state.body.user.rollNumber, "1");
  assert.equal(state.body.user.role, "student");
  await byRoll
    .post("/api/auth/login")
    .send({ email: "1", password: "wrong-password" })
    .expect(401);
  const details = {
    name: "Test Student",
    email: "new-student@example.test",
    password: "Test-Student-Password",
    rollNumber: "42",
  };
  await teacher.post("/api/students").send(details).expect(400);
  await teacher
    .post("/api/students")
    .send({ ...details, rollNumber: "01" })
    .expect(409);
});

test("foreign browser origins cannot mutate session state", async () => {
  await teacher
    .post("/api/auth/logout")
    .set("Origin", "https://attacker.example")
    .send({})
    .expect(403);
  await teacher
    .post("/api/auth/logout")
    .set("Sec-Fetch-Site", "cross-site")
    .send({})
    .expect(403);
  const state = await teacher.get("/api/state").expect(200);
  assert.equal(state.body.user.role, "teacher");
  await request(app)
    .post("/api/auth/demo")
    .set("Host", "localhost")
    .set("Origin", "http://127.0.0.1:5173")
    .send({ role: "student" })
    .expect(200);
});

test("grades respect task bounds and drafts remain private until published", async () => {
  await teacher
    .patch("/api/submissions/submission-2-1-1/grade")
    .send({ marks: 11, feedback: "", published: true, revision: 1 })
    .expect(400);
  await teacher
    .patch("/api/submissions/submission-2-1-1/grade")
    .send({ marks: -1, feedback: "", published: true, revision: 1 })
    .expect(400);
  await teacher
    .patch("/api/submissions/submission-2-1-1/grade")
    .send({
      marks: 8.5,
      feedback: "Draft feedback",
      published: false,
      revision: 1,
    })
    .expect(200);
  const own = await student.get("/api/state").expect(200);
  const privateGrade = own.body.submissions.find(
    (submission: { id: string }) => submission.id === "submission-2-1-1",
  );
  assert.equal(privateGrade.grade, undefined);
  assert.equal(privateGrade.status, "submitted");
  await teacher
    .patch("/api/submissions/submission-2-1-1/grade")
    .send({
      marks: 8.5,
      feedback: "Published feedback",
      published: true,
      revision: 1,
    })
    .expect(200);
  const published = await student.get("/api/state").expect(200);
  assert.equal(
    published.body.submissions.find(
      (submission: { id: string }) => submission.id === "submission-2-1-1",
    ).grade.marks,
    8.5,
  );
});

test("task resubmission preserves identity, increases revision and requires regrading", async () => {
  const htmlOptions = {
    filename: "article.html",
    filepath: "site/article.html",
  };
  const cssOptions = { filename: "style.css", filepath: "site/style.css" };
  const response = await student
    .post("/api/submissions")
    .field("labId", "lab2")
    .field("taskId", "lab2-task1")
    .attach(
      "files",
      Buffer.from(
        "<!doctype html><html><title>Updated work</title><body><h1>Updated article</h1></body></html>",
      ),
      htmlOptions,
    )
    .attach("files", Buffer.from("body { color: navy; }"), cssOptions)
    .expect(201);
  assert.equal(response.body.id, "submission-2-1-1");
  assert.equal(response.body.revision, 2);
  assert.equal(response.body.grade, undefined);
  assert.equal(response.body.status, "submitted");
  assert.deepEqual(
    response.body.files.map((file: { path: string }) => file.path),
    ["site/article.html", "site/style.css"],
  );
  const file = await student
    .get("/api/submissions/submission-2-1-1/files/site/article.html")
    .expect(200);
  assert.match(file.headers["content-type"], /text\/plain/);
  assert.match(file.headers["content-disposition"], /attachment/);
  assert.equal(file.headers["x-content-type-options"], "nosniff");
  const state = await teacher.get("/api/state").expect(200);
  assert.equal(
    state.body.submissions.filter(
      (submission: { studentId: string; labId: string; taskId: string }) =>
        submission.studentId === "student-01" &&
        submission.labId === "lab2" &&
        submission.taskId === "lab2-task1",
    ).length,
    1,
  );
  await teacher
    .patch("/api/submissions/submission-2-1-1/grade")
    .send({ marks: 8, feedback: "Stale review", published: true, revision: 1 })
    .expect(409);
});

test("URL-only submissions are validated and server-side files are rejected", async () => {
  await student
    .post("/api/submissions")
    .field("labId", "lab2")
    .field("taskId", "lab2-task2")
    .field("link", "javascript:alert(1)")
    .expect(400);
  await student
    .post("/api/submissions")
    .field("labId", "lab2")
    .field("taskId", "lab2-task2")
    .attach("files", Buffer.from("<?php echo 1;"), "index.php")
    .expect(400);
  const submitted = await student
    .post("/api/submissions")
    .field("labId", "lab2")
    .field("taskId", "lab2-task2")
    .field("link", "https://example.com/student-project")
    .expect(201);
  assert.equal(submitted.body.link, "https://example.com/student-project");
  assert.deepEqual(submitted.body.files, []);
});

test("teacher cannot remove already-submitted tasks or lower a recorded maximum", async () => {
  const { body: state } = await teacher.get("/api/state").expect(200);
  const lab = state.labs.find((item: { id: string }) => item.id === "lab2");
  await teacher
    .patch("/api/labs/lab2")
    .send({ tasks: lab.tasks.slice(1) })
    .expect(409);
  await teacher
    .patch("/api/labs/lab2")
    .send({
      tasks: lab.tasks.map((task: { id: string; maxMarks: number }) => ({
        ...task,
        maxMarks: 1,
      })),
    })
    .expect(409);
});

test("CSV matches the lab marks sheet and escapes potential spreadsheet formulas", async () => {
  await app.locals.store.mutate(
    (data: { users: { id: string; name: string }[] }) => {
      data.users.find((user) => user.id === "student-40")!.name =
        '=HYPERLINK("https://example.com")';
    },
  );
  const report = await teacher.get("/api/reports.csv?labId=lab2").expect(200);
  assert.match(report.text, /Lab 2 Marks Sheet \(Fall 2026\)/);
  assert.match(report.text, /Semester: 7th/);
  assert.match(report.text, /"41","Saman Ali","",""/);
  assert.match(report.text, /"16","","[\d.]+","[^\"]+"/);
  assert.match(report.text, /"39","","",""/);
  assert.match(report.text, /'=HYPERLINK/);
  assert.equal(report.text.split("\r\n").length, 45);
  const printable = await teacher
    .get("/api/reports/print?labId=lab2")
    .expect(200);
  assert.match(printable.text, /Subject: Web Engineering/);
  await student.get("/api/reports/print?labId=lab2").expect(403);
  await teacher.get("/api/reports.csv?labId=unknown").expect(404);
});

test("print selection and previews enforce teacher access and canonical lab ordering", async () => {
  const choose = await teacher.get("/api/reports/print?select=1&labId=lab2").expect(200);
  const form = load(choose.text);
  assert.equal(form('input:checked').attr("value"), "lab2");
  assert.ok(form('input[name="labId"]').length >= 2);
  assert.equal(form("table").length, 0);
  const empty = await teacher.get("/api/reports/print").expect(200);
  assert.match(empty.text, /Choose one lab/);
  const single = load((await teacher.get("/api/reports/print?labId=lab2").expect(200)).text);
  assert.match(single("thead").text(), /Task 1/);
  assert.equal(single("tbody tr").length, 41);
  const multiple = await teacher.get("/api/reports/print?labId=lab2&labId=lab1&labId=lab2").expect(200);
  const doc = load(multiple.text);
  assert.equal(multiple.headers["cache-control"], "no-store");
  assert.deepEqual(doc("thead th").map((_, el) => doc(el).contents().first().text()).get(), ["R. No", "Name", "Lab 1", "Lab 2", "Total"]);
  assert.equal(doc("tbody tr").length, 41);
  assert.equal(doc("tbody tr").first().find("td").first().text(), "1");
  assert.equal(doc("tbody tr").last().find("td").first().text(), "41");
  await request(app).get("/api/reports/print?select=1").expect(401);
  await student.get("/api/reports/print?select=1").expect(403);
  await student.get("/api/reports/print?labId=lab1&labId=lab2").expect(403);
  await teacher.get("/api/reports/print?labId=unknown").expect(404);
  await teacher.get("/api/reports/print?labId=lab1&labId=unknown").expect(404);
  await teacher.get("/api/reports/print?labId=").expect(404);
});

test("Excel marks sheets are teacher-only attachments and reject unknown labs", async () => {
  const workbook = await teacher.get("/api/reports.xlsx?labId=lab2")
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
      res.on("error", callback);
    })
    .expect(200);
  assert.match(workbook.headers["content-type"], /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(workbook.headers["content-disposition"], /lab-2-marks-sheet-fall-2026\.xlsx/);
  assert.equal(workbook.headers["cache-control"], "no-store");
  assert.ok(Buffer.isBuffer(workbook.body));
  assert.equal(workbook.body.subarray(0, 2).toString(), "PK");
  await student.get("/api/reports.xlsx?labId=lab2").expect(403);
  await request(app).get("/api/reports.xlsx?labId=lab2").expect(401);
  await teacher.get("/api/reports.xlsx?labId=unknown").expect(404);
});

test("legacy demo names migrate without changing accounts, sessions, submissions or later name edits", async () => {
  await app.locals.store.mutate(
    (data: { users: { id: string; name: string }[] }) => {
      data.users.find((user) => user.id === "student-01")!.name = "Ali Raza";
      data.users.find((user) => user.id === "student-16")!.name = "Sana Javed";
      data.users.find((user) => user.id === "student-41")!.name = "Student 41";
    },
  );
  const before = structuredClone(app.locals.store.data);
  const reopened = await createApp({
    ...localDatabase,
    dataDir,
    demo: true,
    production: false,
  });
  try {
    const after = reopened.locals.store.data;
    assert.equal(after.users.length, 42);
    assert.deepEqual(
      after.users.map(({ name, ...account }: { name: string }) => account),
      before.users.map(({ name, ...account }: { name: string }) => account),
    );
    assert.equal(
      after.users.find((user: { id: string }) => user.id === "student-01").name,
      "Muhammad Haroon",
    );
    assert.equal(
      after.users.find((user: { id: string }) => user.id === "student-16").name,
      "",
    );
    assert.equal(
      after.users.find((user: { id: string }) => user.id === "student-41").name,
      "Saman Ali",
    );
    assert.equal(
      after.users.find((user: { id: string }) => user.id === "student-40").name,
      '=HYPERLINK("https://example.com")',
    );
    assert.deepEqual(after.submissions, before.submissions);
    assert.deepEqual(after.sessions, before.sessions);
    assert.deepEqual(after.labs, before.labs);
    assert.equal(
      reopened.locals.store.data.submissions.find(
        (submission: { id: string }) => submission.id === "submission-2-1-1",
      ).revision,
      2,
    );
    assert.ok(reopened.locals.store.data.sessions.length >= 2);
  } finally {
    await reopened.locals.store.close();
  }
});

test("production rejects an unconfigured, ephemeral database", async () => {
  const previous = process.env.LABTRACK_DATA_DIR;
  delete process.env.LABTRACK_DATA_DIR;
  try {
    await assert.rejects(
      createApp({
        ...localDatabase,
        production: true,
        demo: false,
        adminEmail: "",
        adminPassword: "",
      }),
      /Production requires/,
    );
  } finally {
    if (previous === undefined) delete process.env.LABTRACK_DATA_DIR;
    else process.env.LABTRACK_DATA_DIR = previous;
  }
});

test("production refuses demo mode; real bootstrap creates hashed teacher credentials", async () => {
  await assert.rejects(
    createApp({ ...localDatabase, dataDir, production: true, demo: true }),
    /Demo access/,
  );
  await assert.rejects(
    createApp({ ...localDatabase, dataDir, production: true, demo: false }),
    /demo database/,
  );
  const realDir = await mkdtemp(path.join(os.tmpdir(), "labtrack-real-test-"));
  const real = await createApp({
    ...localDatabase,
    dataDir: realDir,
    demo: false,
    production: true,
    adminEmail: "teacher@university.edu",
    adminPassword: "Very-Long-Test-Password",
  });
  try {
    await request(real)
      .post("/api/auth/demo")
      .set("Host", "localhost")
      .send({ role: "teacher" })
      .expect(403);
    await request(real)
      .post("/api/auth/login")
      .send({ email: "teacher@university.edu", password: "wrong-password" })
      .expect(401);
    const login = await request(real)
      .post("/api/auth/login")
      .send({
        email: "teacher@university.edu",
        password: "Very-Long-Test-Password",
      })
      .expect(200);
    assert.equal(login.body.role, "teacher");
    assert.equal(login.body.passwordHash, undefined);
    assert.notEqual(
      real.locals.store.data.users[0].passwordHash,
      "Very-Long-Test-Password",
    );
    assert.match(login.headers["set-cookie"][0], /HttpOnly/);
    assert.match(login.headers["set-cookie"][0], /SameSite=Strict/);
    assert.match(login.headers["set-cookie"][0], /Secure/);
  } finally {
    await real.locals.store.close();
    await rm(realDir, { recursive: true, force: true });
  }
});

test("teachers can publish and edit a manually reviewed lab without automatic checks", async () => {
  const task = { id: "manual-review-task", title: "HTML page", description: "Create a page about your course.", maxMarks: 10, requirements: [] };
  const created = await teacher.post("/api/labs").send({ title: "Manual review lab", description: "", published: true, tasks: [task] }).expect(201);
  const submitted = await student.post("/api/submissions")
    .field("labId", created.body.id).field("taskId", task.id)
    .attach("files", Buffer.from("<h1>My course</h1>"), "course.html").expect(201);
  await teacher.patch(`/api/labs/${created.body.id}`)
    .send({ revision: created.body.revision, tasks: [{ ...task, description: "Create an introduction to your course." }] }).expect(200);
  const state = await student.get("/api/state").expect(200);
  const savedLab = state.body.labs.find((lab: { id: string }) => lab.id === created.body.id);
  assert.equal(savedLab.published, true);
  assert.deepEqual(savedLab.tasks[0].requirements, []);
  assert.equal(savedLab.tasks[0].id, submitted.body.taskId);
  assert.ok(state.body.submissions.some((submission: { id: string }) => submission.id === submitted.body.id));
});

test("task analysis is teacher-only, scoped to one lab task, and does not change grades", async () => {
  await request(app).get('/api/labs/lab1/analysis?taskId=lab1-task1').expect(401);
  await student.get('/api/labs/lab1/analysis?taskId=lab1-task1').expect(403);
  await teacher.get('/api/labs/lab1/analysis?taskId=lab2-task1').expect(404);
  const before = await teacher.get('/api/state').expect(200);
  const response = await teacher.get('/api/labs/lab1/analysis?taskId=lab1-task1').expect(200);
  assert.equal(response.body.taskId, 'lab1-task1');
  const eligible = before.body.submissions.filter((submission: Submission) => submission.labId === 'lab1' && submission.taskId === 'lab1-task1');
  assert.equal(response.body.submissions.length, eligible.length);
  const ids = new Set(eligible.map((submission: Submission) => submission.id));
  assert.ok(response.body.pairs.every((pair: {leftId: string; rightId: string}) => ids.has(pair.leftId) && ids.has(pair.rightId) && pair.leftId !== pair.rightId));
  const after = await teacher.get('/api/state').expect(200);
  assert.deepEqual(after.body.submissions, before.body.submissions);
});

test("the analyzer demo uses its own sign-in cookie without replacing the classroom cookie", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'labtrack-cookie-isolation-'));
  const isolated = await createApp({...localDatabase, dataDir: directory, demo: true, production: false, sessionCookieName: 'labtrack_analysis_demo'});
  try {
    const login = await request(isolated).post('/api/auth/demo').set('Host','localhost').send({role:'teacher'}).expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    assert.ok(cookies.every(value => value.startsWith('labtrack_analysis_demo=')));
    const ownCookie = cookies[0].split(';')[0];
    const state = await request(isolated).get('/api/state').set('Cookie',`labtrack_session=classroom-session; ${ownCookie}`).expect(200);
    assert.equal(state.body.user.role,'teacher');
    const logout = await request(isolated).post('/api/auth/logout').set('Cookie',ownCookie).expect(200);
    assert.ok((logout.headers['set-cookie'] as unknown as string[]).every(value => value.startsWith('labtrack_analysis_demo=')));
  } finally {
    await isolated.locals.store.close();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('labtrack-cookie-isolation-'));
    await rm(directory,{recursive:true,force:true});
  }
});

