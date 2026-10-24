import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import handler from "../api/index.js";
import { publicDemoLogins } from "../shared/demo.js";
import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";
import { Store } from "./store.js";
import { assertPublicDemoDatabase, publicDemoDatabase, publicDemoRequest } from "./public-demo.js";

test("public demo and classroom API requests use independent private SQL records, payloads, revisions and login budgets", async t => {
  const database = new PGlite();
  t.after(() => database.close());
  await database.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const demoMigration = "20261019093050_public_demo_isolation.sql";
  const migrations = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
  for (const name of migrations.filter(name => name < demoMigration))
    await database.exec(await readFile(new URL(name, directory), "utf8"));
  const value = async (sql: string, params: unknown[] = []) => (await database.query<{ value: unknown }>(sql, params)).rows[0].value;
  const passwordHash = await hashPassword("ClassroomFixture2026!");
  const normalUsers = [
    { id: "normal-teacher", name: "Classroom Teacher", email: "classroom@example.test", role: "teacher", passwordHash },
    { id: "normal-student", name: "Classroom Student", email: "class-student@example.test", role: "student", rollNumber: "1", passwordHash },
  ];
  const normalLab = { id: "normal-lab", revision: 1, title: "Classroom-only lab", description: "Private classroom fixture", dueDate: "", published: true, totalMarks: 10,
    tasks: [{ id: "normal-task", title: "Classroom task", description: "Sample", maxMarks: 10, requirements: [] }] };
  await value("select public.labtrack_write((select revision from public.labtrack_meta where id=1),$1,'[]') as value", [JSON.stringify([
    ...normalUsers.map((document, position) => ({ collection: "users", id: document.id, document, position })),
    { collection: "labs", id: normalLab.id, document: normalLab, position: 0 },
  ])]);
  const beforeMigration = await value("select public.labtrack_read() as value");
  await database.exec(await readFile(new URL(demoMigration, directory), "utf8"));
  assert.deepEqual(await value("select public.labtrack_read() as value"), beforeMigration, "migration preserves populated classroom records and revision");
  assert.equal(await value("select count(*)::integer as value from public.labtrack_demo_records"), 0, "migration never copies classroom users or work");
  for (const name of migrations.filter(name => name > demoMigration)) await database.exec(await readFile(new URL(name, directory), "utf8"));
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  Object.assign(process.env, { SUPABASE_URL: "https://public-demo-fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_public_demo_fixture" });
  t.after(() => {
    for (const [key, entry] of Object.entries(previous)) {
      if (entry === undefined) delete process.env[key]; else process.env[key] = entry;
    }
  });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const location = new URL(url);
    assert.equal(location.hostname, "public-demo-fixture.supabase.co");
    const name = location.pathname.split("/").at(-1)!;
    if (/^labtrack_(?:demo_)?meta$/.test(name)) {
      const revision = await value(`select revision as value from public.${name} where id=1`);
      return Response.json([{ revision }]);
    }
    assert.match(name, /^labtrack_(?:demo_)?(?:read_workspace|write_scoped|login_attempt|projects|asset)$/);
    const body = JSON.parse(String(init.body));
    const keys = Object.keys(body);
    assert.ok(keys.every(key => /^[a-z_]+$/.test(key)));
    try {
      const result = await value(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) as value`,
        keys.map(key => typeof body[key] === "object" && body[key] !== null ? JSON.stringify(body[key]) : body[key]));
      return Response.json(typeof result === "bigint" ? Number(result) : result);
    } catch (error) {
      return Response.json({ code: (error as { code: string }).code }, { status: (error as { code: string }).code === "PT409" ? 409 : 500 });
    }
  });
  const login = async (email: string, password: string, demo = false, cookie = "") => {
    const result = await request(handler).post("/api/auth/login").set("Cookie", cookie)
      .set("X-Labtrack-Workspace", demo ? "demo" : "classroom").send({ email, password }).expect(200);
    return result.headers["set-cookie"][0].split(";")[0] as string;
  };
  const normalTeacher = await login("classroom@example.test", "ClassroomFixture2026!");
  const normalStudent = await login("1", "ClassroomFixture2026!");
  const normalUpload = await request(handler).post("/api/submissions").set("Cookie", normalStudent)
    .field("labId", "normal-lab").field("taskId", "normal-task")
    .attach("files", Buffer.from("<h1>Classroom-only source</h1>"), "index.html").expect(201);
  const classroomBefore = await value("select public.labtrack_read() as value");
  const limitsBefore = await value("select coalesce(jsonb_agg(row_to_json(limits)),'[]') as value from public.labtrack_login_limits limits");

  const [demoTeacher, demoStudent] = await Promise.all([
    login(publicDemoLogins.teacher.email, publicDemoLogins.teacher.password, true, normalTeacher),
    login(publicDemoLogins.student.email, publicDemoLogins.student.password, true),
  ]);
  assert.match(demoTeacher, /^labtrack_session=demo_[a-f0-9]{64}$/);
  const demoState = await request(handler).get("/api/state").set("Cookie", demoTeacher).expect(200);
  assert.equal(demoState.body.publicDemo, true);
  assert.equal(demoState.body.demo, false);
  assert.deepEqual(demoState.body.students.map((user: { id: string }) => user.id), ["public-demo-student"]);
  assert.ok(!JSON.stringify(demoState.body).includes("normal-"));
  assert.ok(!JSON.stringify(demoState.body).includes("passwordHash"));
  const demoUpload = await request(handler).post("/api/submissions").set("Cookie", demoStudent)
    .field("labId", "public-demo-lab").field("taskId", "public-demo-css")
    .attach("files", Buffer.from("<h1>Demo-only source</h1>"), "index.html").expect(201);
  const demoId = demoUpload.body.id;
  await request(handler).patch(`/api/submissions/${demoId}/grade`).set("Cookie", demoTeacher)
    .send({ revision: 1, marks: 8, feedback: "Demo feedback", published: true }).expect(200);
  const demoStudentState = await request(handler).get("/api/state").set("Cookie", demoStudent).expect(200);
  assert.equal(demoStudentState.body.submissions.find((item: { id: string }) => item.id === demoId).grade.marks, 8);
  const demoSource = await request(handler).get(`/api/submissions/${demoId}/source?revision=1`).set("Cookie", demoTeacher).expect(200);
  assert.match(JSON.stringify(demoSource.body), /Demo-only source/);

  for (const [cookie, foreignSubmission, foreignLab] of [[demoTeacher, normalUpload.body.id, "normal-lab"], [normalTeacher, demoId, "public-demo-lab"]]) {
    for (const endpoint of [`/api/submissions/${foreignSubmission}/source?revision=1`, `/api/submissions/${foreignSubmission}/files/index.html?revision=1`,
      `/api/submissions/${foreignSubmission}/analysis`, `/api/labs/${foreignLab}/analysis?taskId=normal-task`])
      await request(handler).get(endpoint).set("Cookie", cookie).expect(404);
    await request(handler).patch(`/api/submissions/${foreignSubmission}/grade`).set("Cookie", cookie)
      .send({ revision: 1, marks: 1, feedback: "Cross-workspace attempt", published: true }).expect(404);
    await request(handler).patch(`/api/labs/${foreignLab}`).set("Cookie", cookie).send({ published: false }).expect(404);
  }
  await request(handler).post("/api/submissions").set("Cookie", demoStudent).field("labId", "normal-lab").field("taskId", "normal-task")
    .attach("files", Buffer.from("<h1>Wrong classroom</h1>"), "index.html").expect(404);
  await request(handler).post("/api/submissions").set("Cookie", normalStudent).field("labId", "public-demo-lab").field("taskId", "public-demo-css")
    .attach("files", Buffer.from("<h1>Wrong classroom</h1>"), "index.html").expect(404);
  for (const cookie of [demoTeacher, demoStudent])
    await request(handler).post("/api/auth/password").set("Cookie", cookie).send({ newPassword: "ChangedPassword2026!" }).expect(403);
  await request(handler).post("/api/students").set("Cookie", demoTeacher)
    .send({ name: "Other", email: "other@example.test", rollNumber: "2", password: "OtherStudent2026!" }).expect(403);
  await request(handler).patch("/api/students/public-demo-student").set("Cookie", demoTeacher)
    .send({ name: "Changed", previousName: "Demo Student" }).expect(403);
  const tooManyTasks = { ...normalLab, tasks: Array.from({ length: 9 }, (_, i) => ({ ...normalLab.tasks[0], id: `task-${i}` })) };
  await request(handler).post("/api/labs").set("Cookie", demoTeacher).send(tooManyTasks).expect(400);
  await request(handler).post("/api/auth/demo").set("Cookie", demoTeacher).send({ role: "teacher" }).expect(403);
  await request(handler).get(`/api/submissions/${normalUpload.body.id}/source?revision=1`)
    .set("Cookie", normalTeacher.replace("labtrack_session=", "labtrack_session=demo_")).expect(401);
  await request(handler).get(`/api/submissions/${demoId}/source?revision=1`)
    .set("Cookie", demoTeacher.replace("=demo_", "=")).expect(401);
  for (const endpoint of ["/api/reports.csv", "/api/reports/print?labId=public-demo-lab"]) {
    const report = await request(handler).get(endpoint).set("Cookie", demoTeacher).expect(200);
    assert.ok(!report.text.includes("Classroom Student"));
    assert.ok(report.text.includes("Demo Student"));
  }
  for (const endpoint of ["/api/reports.csv?labId=normal-lab", "/api/reports.xlsx?labId=normal-lab", "/api/reports/print?labId=normal-lab"])
    await request(handler).get(endpoint).set("Cookie", demoTeacher).expect(404);
  const realState = await request(handler).get("/api/state").set("Cookie", normalTeacher).expect(200);
  assert.equal(realState.body.publicDemo, undefined);
  assert.equal(realState.body.submissions.length, 1);
  assert.equal(realState.body.submissions[0].id, normalUpload.body.id);
  assert.ok(!JSON.stringify(realState.body).includes("public-demo"));
  assert.deepEqual(await value("select public.labtrack_read() as value"), classroomBefore, "all demo operations leave classroom rows and revision untouched");
  assert.deepEqual(await value("select coalesce(jsonb_agg(row_to_json(limits)),'[]') as value from public.labtrack_login_limits limits"), limitsBefore);
  await login("classroom@example.test", "ClassroomFixture2026!", false, demoTeacher);
  await login(publicDemoLogins.teacher.email, publicDemoLogins.teacher.password, true);
  await login(publicDemoLogins.student.email, publicDemoLogins.student.password, true);
  const demoBefore = await value("select public.labtrack_demo_read() as value");
  await request(handler).patch(`/api/submissions/${normalUpload.body.id}/grade`).set("Cookie", normalTeacher)
    .send({ revision: 1, marks: 6, feedback: "Classroom-only feedback", published: true }).expect(200);
  assert.deepEqual(await value("select public.labtrack_demo_read() as value"), demoBefore, "classroom grading never writes demo tables");

  for (const table of ["records", "meta", "payloads", "login_limits"]) {
    assert.equal(await value(`select relrowsecurity as value from pg_class where oid='public.labtrack_demo_${table}'::regclass`), true);
    for (const role of ["anon", "authenticated"])
      assert.equal(await value("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as value", [role, `public.labtrack_demo_${table}`]), false);
  }
  const routines = (await database.query<{ signature: string; prosecdef: boolean; definition: string }>("select p.oid::regprocedure::text as signature,p.prosecdef,pg_get_functiondef(p.oid) as definition from pg_proc p where p.proname like 'labtrack_demo_%'")).rows;
  assert.equal(routines.length, 12);
  for (const routine of routines) {
    assert.equal(routine.prosecdef, false);
    assert.doesNotMatch(routine.definition.replaceAll("public.labtrack_lab_metadata", ""), /\bpublic\.labtrack_(?!demo_)/, "demo SQL uses only its own records/RPCs and the pure shared metadata projection");
    for (const role of ["anon", "authenticated"])
      assert.equal(await value("select has_function_privilege($1,$2,'EXECUTE') as value", [role, routine.signature]), false);
  }
  const classroomBeforeQuota = await value("select public.labtrack_read() as value");
  const writeFunction = routines.find(routine => routine.signature.startsWith("labtrack_demo_write_scoped("))!;
  // Lower only this isolated demo's budget to exercise rejection without filling a database.
  await database.exec(writeFunction.definition.replace("20000000", "1"));
  await request(handler).post("/api/submissions").set("Cookie", demoStudent)
    .field("labId", "public-demo-lab").field("taskId", "public-demo-html")
    .attach("files", Buffer.from(`<h1>${"larger demo project ".repeat(100)}</h1>`), "index.html").expect(507);
  await request(handler).patch(`/api/submissions/${demoId}/grade`).set("Cookie", demoTeacher)
    .send({ revision: 1, marks: 7, feedback: "Grading stays available at the demo content limit", published: true,
      expectedGradeAt: demoStudentState.body.submissions.find((item: { id: string }) => item.id === demoId).grade.gradedAt }).expect(200);
  assert.deepEqual(await value("select public.labtrack_read() as value"), classroomBeforeQuota);
});

test("persistent JSON routing separates shared logins, survives restart and refuses classroom data in the demo directory", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-public-demo-"));
  const options = { dataDir: directory, production: false, demo: false, mongoUri: "", supabaseUrl: "", supabaseKey: "",
    adminEmail: "teacher@example.test", adminPassword: "ClassroomFixture2026!" };
  let app = await createApp(options);
  t.after(async () => { await app.locals.close(); await rm(directory, { recursive: true, force: true }); });
  const student = request.agent(app);
  await student.post("/api/auth/login").set("X-Labtrack-Workspace", "demo").send(publicDemoLogins.student).expect(200);
  const signedIn = await student.get("/api/state").expect(200);
  assert.equal(signedIn.body.user.id, "public-demo-student");
  assert.equal(signedIn.body.publicDemo, true);
  assert.equal(app.locals.store.data.users.length, 1);
  assert.equal(app.locals.store.data.users[0].email, "teacher@example.test");
  await app.locals.close();
  app = await createApp(options);
  await request(app).post("/api/auth/login").set("X-Labtrack-Workspace", "demo").send(publicDemoLogins.student).expect(200);
  await app.locals.close();
  const demoStore = new Store(path.join(directory, "public-demo"));
  await demoStore.open();
  await demoStore.mutate(data => { data.users[0].email = "real-classroom@example.test"; });
  await demoStore.close();
  await assert.rejects(createApp({ ...options, publicDemo: true }), /refuses.*classroom/);
});

test("demo selection trusts neither query parameters nor arbitrary workspace headers for protected requests", async () => {
  assert.equal(publicDemoRequest({ url: "/api/state?workspace=demo", headers: { "x-labtrack-workspace": "demo" } }), false);
  assert.equal(publicDemoRequest({ url: "/api/auth/login", headers: { cookie: `labtrack_session=demo_${"a".repeat(64)}` } }), false);
  assert.equal(publicDemoRequest({ url: "/api/state", headers: { cookie: `labtrack_session=demo_${"a".repeat(64)}` } }), true);
  const seed = await publicDemoDatabase();
  assert.doesNotThrow(() => assertPublicDemoDatabase(seed));
  seed.users[1].mustChangePassword = true;
  assert.throws(() => assertPublicDemoDatabase(seed), /refuses.*classroom/);
});
