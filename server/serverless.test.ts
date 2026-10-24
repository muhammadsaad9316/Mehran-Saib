import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import handler from "../api/index.js";
import { createApp } from "./app.js";
import { emptyDatabase } from "./store.js";
import { hashPassword } from "./auth.js";

test("concurrent first requests initialize one teacher after a database conflict", async (t) => {
  const remote = emptyDatabase();
  let revision = 0;
  let initialReads = 0;
  let writes = 0;
  let conflicts = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.endsWith("labtrack_read_workspace")) {
      if (remote.users.length === 0) initialReads++;
      return json({ revision, data: body.known_revision === revision ? null : remote });
    }
    assert.ok(url.endsWith("labtrack_write_scoped"));
    writes++;
    if (body.expected_revision !== revision) {
      conflicts++;
      return json({ code: "PT409" }, 409);
    }
    for (const item of body.upserts) {
      assert.equal(item.collection, "users");
      remote.users.push(item.document);
    }
    return json(++revision);
  });
  const options = {
    production: true, demo: false, serverless: true, mongoUri: "",
    supabaseUrl: "https://bootstrap-test.supabase.co", supabaseKey: "sb_secret_bootstrap_testing",
    adminEmail: "bootstrap@example.test", adminPassword: "BootstrapFixture2026!",
  };
  const apps = await Promise.all([createApp(options), createApp(options)]);
  try {
    assert.equal(initialReads, 2);
    assert.equal(conflicts, 1);
    assert.equal(writes, 2);
    assert.equal(revision, 1);
    assert.equal(remote.users.length, 1);
    assert.equal(remote.users[0].role, "teacher");
    assert.equal(apps[0].locals.store.data.users[0].id, apps[1].locals.store.data.users[0].id);
  } finally {
    await Promise.all(apps.map(app => app.locals.store.close()));
  }
});

test("serverless requests retain sessions, read fresh data, upload and grade without a shared process", async (t) => {
  const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY, LABTRACK_READINESS_TOKEN: process.env.LABTRACK_READINESS_TOKEN };
  Object.assign(process.env, { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_testing", LABTRACK_READINESS_TOKEN: "fixture-monitor-token-32-characters-minimum" });
  t.after(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let remote = emptyDatabase();
  let revision = 0;
  const passwordHash = await hashPassword("ServerlessTest2026!");
  remote.users = [
    { id: "qa-teacher", name: "Teacher", email: "qa@example.test", role: "teacher", passwordHash },
    { id: "qa-student", name: "Student", email: "student@example.test", role: "student", rollNumber: "1", passwordHash },
  ];
  const budgets = new Map<string, number>();
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    if (url.includes("/labtrack_meta?")) return Response.json([{ revision }]);
    const body = JSON.parse(String(options.body));
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.endsWith("labtrack_read_workspace"))
      return json({ revision, data: body.known_revision === revision ? null : remote });
    if (url.endsWith("labtrack_login_attempt")) {
      if (body.clear_attempts) { budgets.delete(body.attempt_key); return json(true); }
      const count = (budgets.get(body.attempt_key) || 0) + 1;
      budgets.set(body.attempt_key, count);
      return json(count <= 5);
    }
    if (body.expected_revision !== revision) return json({ code: "PT409" }, 409);
    for (const item of body.deletions) {
      const rows = remote[item.collection as keyof typeof remote] as { id: string }[];
      const index = rows.findIndex(row => row.id === item.id);
      if (index >= 0) rows.splice(index, 1);
    }
    for (const item of body.upserts) {
      const rows = remote[item.collection as keyof typeof remote] as { id: string }[];
      const index = rows.findIndex(row => row.id === item.id);
      if (index >= 0) rows[index] = item.document;
      else rows.push(item.document);
    }
    return json(++revision);
  });
  const login = async (email: string) => {
    const response = await request(handler).post("/api/auth/login")
      .set("Host", "labtrack.example.test").set("X-Forwarded-Proto", "https")
      .set("Origin", "https://labtrack.example.test")
      .send({ email, password: "ServerlessTest2026!" }).expect(200);
    assert.match(response.headers["set-cookie"][0], /Secure/);
    return response.headers["set-cookie"][0].split(";")[0];
  };
  const teacher = await login("qa@example.test");
  await request(handler).get("/api/ready").set("Cookie", teacher).expect(200);
  const student = await login("1");
  const lab = await request(handler).post("/api/labs").set("Cookie", teacher).send({
    title: "Serverless lab", description: "Test", published: true,
    tasks: [{ id: "qa-task", title: "Task", description: "Test", maxMarks: 10, requirements: [] }],
  }).expect(201);
  const submitted = await request(handler).post("/api/submissions").set("Cookie", student)
    .field("labId", lab.body.id).field("taskId", "qa-task")
    .attach("files", Buffer.from("<h1>My work</h1>"), "index.html").expect(201);
  await request(handler).patch(`/api/submissions/${submitted.body.id}/grade`).set("Cookie", teacher)
    .send({ marks: 9, revision: 1, feedback: "Well done", published: true }).expect(200);
  const state = await request(handler).get("/api/state").set("Cookie", student).expect(200);
  assert.equal(state.body.submissions[0].grade.marks, 9);
  assert.equal(state.body.students.length, 1);
  const anonymous = await request(handler).get("/api/state").expect(200);
  assert.deepEqual(anonymous.body.submissions, []);
  for (let n = 0; n < 5; n++)
    await request(handler).post("/api/auth/login").send({ email: `unknown-${n}@example.test`, password: "wrong" }).expect(401);
  await request(handler).post("/api/auth/login").send({ email: "another-unknown@example.test", password: "wrong" }).expect(429).expect("Retry-After", "60");
  assert.equal(budgets.size, 1);
  await login("qa@example.test");
});

test("health checks, anonymous state and unsigned protected requests do not query Supabase", async (t) => {
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  Object.assign(process.env, { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_testing" });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () => { reads++; throw new Error("Unexpected database read"); });
  await request(handler).get("/api/health").expect(200).expect("Cache-Control", "no-store");
  const anonymous = await request(handler).get("/api/state").expect(200);
  assert.equal(anonymous.body.user, null);
  assert.deepEqual(anonymous.body.students, []);
  await request(handler).get("/api/state").set("Cookie", "labtrack_session=malformed").expect(200);
  await request(handler).post("/api/auth/demo").send({ role: "teacher" }).expect(403);
  await request(handler).get("/api/reports.csv").expect(401);
  assert.equal(reads, 0);
});

test("serverless readiness requires a private monitor token, probes only metadata and sanitizes failures", async (t) => {
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY, LABTRACK_READINESS_TOKEN: process.env.LABTRACK_READINESS_TOKEN };
  const token = "isolated-monitor-token-32-characters-minimum";
  Object.assign(process.env, { SUPABASE_URL: "https://ready-test.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_testing", LABTRACK_READINESS_TOKEN: token });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  let probes = 0, unavailable = false;
  const logs: string[] = [];
  t.mock.method(console, "error", (line: string) => logs.push(line));
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.match(url, /\/labtrack_meta\?select=revision/);
    probes++;
    if (unavailable) throw new Error("private-provider-details");
    return Response.json([{ revision: 1 }]);
  });
  await request(handler).get("/api/ready").expect(401);
  await request(handler).get("/api/ready").set("X-Readiness-Token", "wrong").expect(401);
  assert.equal(probes, 0);
  await request(handler).get("/api/ready").set("X-Readiness-Token", token).expect(200);
  unavailable = true;
  const failed = await request(handler).get("/api/ready").set("X-Readiness-Token", token).expect(503);
  assert.equal(failed.body.requestId, failed.headers["x-request-id"]);
  assert.ok(failed.body.requestId);
  assert.doesNotMatch(JSON.stringify(failed.body) + logs.join(""), /private-provider-details|sb_secret_testing|isolated-monitor/);
  process.env.LABTRACK_READINESS_TOKEN = "too-short";
  await request(handler).get("/api/ready").set("X-Readiness-Token", "too-short").expect(401);
  assert.equal(probes, 2);
});
