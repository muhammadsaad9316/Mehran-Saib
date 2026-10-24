import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { Store } from "./store.js";

test("real SQL and API retain compact projects, reject stale edits/reviews, reconcile lost commits and serve a 41-student burst", async (t) => {
  const database = new PGlite();
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  try {
    await database.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) await database.exec(await readFile(new URL(name, directory), "utf8"));
    const password = "IsolatedFixture2026!";
    const passwordHash = await hashPassword(password);
    const users = [{ id: "teacher", name: "Fixture teacher", email: "teacher@example.test", role: "teacher", passwordHash },
      ...Array.from({ length: 41 }, (_, index) => ({ id: `student-${index + 1}`, name: `Fixture ${index + 1}`, email: `s${index + 1}@example.test`, role: "student", rollNumber: String(index + 1), passwordHash }))];
    for (const [index, user] of users.entries()) await database.query("insert into public.labtrack_records values('users',$1,$2,$3)", [user.id, JSON.stringify(user), index]);
    let loseResponse = false;
    let writeCalls = 0;
    t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
      if (url.includes("/labtrack_meta?")) return Response.json((await database.query("select revision from public.labtrack_meta where id=1")).rows);
      const name = url.split("/").at(-1)!;
      assert.match(name, /^labtrack_[a-z_]+$/);
      const body = JSON.parse(String(options.body)) as Record<string, unknown>;
      const keys = Object.keys(body);
      keys.forEach(key => assert.match(key, /^[a-z_]+$/));
      try {
        const result = await database.query<{ value: unknown }>(`select public.${name}(${keys.map((key, index) => `${key}=>$${index + 1}`).join(",")}) as value`, keys.map(key => typeof body[key] === "object" ? JSON.stringify(body[key]) : body[key]));
        if (name === "labtrack_write_scoped") {
          writeCalls++;
          if (loseResponse) { loseResponse = false; throw new TypeError("lost fixture acknowledgement", { cause: { code: "ECONNRESET" } }); }
        }
        return Response.json(result.rows[0].value);
      } catch (error) {
        if (error instanceof TypeError) throw error;
        return Response.json({ code: (error as { code?: string }).code }, { status: 409 });
      }
    });
    const app = await createApp({ production: false, demo: false, mongoUri: "", supabaseUrl: "https://sql-fixture.supabase.co", supabaseKey: "sb_secret_sql_fixture_only" });
    apps.push(app);
    const teacher = request.agent(app), student = request.agent(app);
    await teacher.post("/api/auth/login").send({ email: "teacher@example.test", password }).expect(200);
    await student.post("/api/auth/login").send({ email: "1", password }).expect(200);
    const draft = { title: "Fixture lab", description: "", published: true, tasks: [{ id: "task", title: "Heading", description: "", maxMarks: 10, requirements: [{ id: "heading", label: "Heading", type: "tag", value: "h1" }] }] };
    const operationKey = "10000000-0000-4000-8000-000000000001";
    const lab = (await teacher.post("/api/labs").set("Idempotency-Key", operationKey).send(draft).expect(201)).body;
    const duplicate = (await teacher.post("/api/labs").set("Idempotency-Key", operationKey).send(draft).expect(201)).body;
    assert.equal(duplicate.id, lab.id);
    const updated = (await teacher.patch(`/api/labs/${lab.id}`).send({ ...lab, title: "Saved in tab A" }).expect(200)).body;
    await teacher.patch(`/api/labs/${lab.id}`).send({ ...lab, description: "Stale tab B" }).expect(409);
    assert.equal(updated.revision, lab.revision + 1);
    const source = "<html><body><h1>Private fixture heading</h1></body></html>";
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCBkAAAAASUVORK5CYII=", "base64");
    const upload = (expectedRevision: number) => student.post("/api/submissions").field("labId", lab.id).field("taskId", "task").field("expectedRevision", String(expectedRevision)).attach("files", Buffer.from(source), "index.html").attach("files", image, "image.png");
    const submission = (await upload(0).expect(201)).body;
    const state = (await teacher.get("/api/state").expect(200)).body;
    assert.equal(state.submissions[0].sourceOmitted, true);
    assert.equal(state.submissions[0].files[0].content, "");
    assert.ok(!JSON.stringify(state).includes("Private fixture heading"));
    const project = (await student.get(`/api/submissions/${submission.id}/source?revision=1`).expect(200)).body;
    assert.equal(project.files[0].content, source);
    assert.equal(project.binaryAssets, undefined);
    const asset = await student.get(`/api/submissions/${submission.id}/files/image.png?revision=1`).expect(200);
    assert.deepEqual(asset.body, image);
    const analysis = (await teacher.get(`/api/submissions/${submission.id}/analysis?revision=1`).expect(200)).body;
    assert.equal(analysis.met, 1);
    assert.equal(typeof analysis.evidenceVersion, "string");
    await upload(0).expect(409);
    await upload(1).expect(201);
    await teacher.patch(`/api/submissions/${submission.id}/grade`).send({ marks: 0, published: false, revision: 1, expectedGradeAt: "" }).expect(409);
    await teacher.patch(`/api/submissions/${submission.id}/grade`).send({ marks: 0, published: false, revision: 2, expectedGradeAt: "" }).expect(200);
    await upload(2).expect(409);
    assert.equal((await teacher.get("/api/state")).body.submissions[0].grade.marks, 0);
    const publishedResult = await teacher.patch(`/api/submissions/${submission.id}/grade`).send({ marks: 0, published: true, revision: 2 }).expect(200);
    const acknowledged = await student.post(`/api/submissions/${submission.id}/result-viewed`).send({ revision: 2, gradedAt: publishedResult.body.grade.gradedAt }).expect(200);
    const retainedResult = (await student.get("/api/state").expect(200)).body.submissions[0];
    assert.equal(retainedResult.grade.viewedAt, acknowledged.body.viewedAt);
    assert.equal(retainedResult.revision, 2);
    assert.equal(retainedResult.grade.gradedAt, publishedResult.body.grade.gradedAt);
    const sqlViewed = await database.query<{ viewed: string }>("select document->'grade'->>'viewedAt' as viewed from public.labtrack_records where collection='submissions' and id=$1", [submission.id]);
    assert.equal(sqlViewed.rows[0].viewed, acknowledged.body.viewedAt);
    await teacher.get(`/api/submissions/${submission.id}/analysis?revision=1`).expect(409);
    await student.get(`/api/submissions/${submission.id}/source?revision=1`).expect(409);
    await student.get(`/api/submissions/${submission.id}/files/image.png?revision=1`).expect(409);
    await student.get("/api/ready").expect(403);
    await teacher.get("/api/ready").expect(200);
    const before = writeCalls;
    loseResponse = true;
    await teacher.post("/api/labs").set("Idempotency-Key", "10000000-0000-4000-8000-000000000002").send({ ...draft, title: "Acknowledgement lost" }).expect(201);
    assert.equal(writeCalls, before + 1);
    assert.equal((await teacher.get("/api/state")).body.labs.length, 2);
    const stores = Array.from({ length: 41 }, () => new Store("unused", undefined, { url: "https://sql-fixture.supabase.co", secretKey: "sb_secret_sql_fixture_only", compact: true, cache: true }, 8));
    await Promise.all(stores.map(store => store.open()));
    await Promise.all(stores.map((store, index) => store.mutate(data => data.sessions.push({ id: `burst-${index}`, userId: `student-${index + 1}`, expiresAt: Date.now() + 600000 }))));
    assert.equal((await database.query<{ total: number }>("select count(*)::integer as total from public.labtrack_records where collection='sessions' and id like 'burst-%'")).rows[0].total, 41);
    await Promise.all(stores.map(store => store.close()));
  } finally {
    await Promise.all(apps.map(app => app.locals.store.close()));
    await database.close();
  }
});
