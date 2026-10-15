import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SQL migrations retain private projects, permit independent stale writes and keep grading available under the content ceiling", async () => {
  const database = new PGlite();
  try {
    await database.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const names = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
    const payloadMigration = "20261015122901_reliability_payloads.sql";
    for (const name of names.slice(0, names.indexOf(payloadMigration))) await database.exec(await readFile(new URL(name, directory), "utf8"));
    const project = { id: "submission", studentId: "student", labId: "lab", taskId: "task", revision: 1,
      files: [{ path: "index.html", content: "<h1>Private fixture source</h1>" }],
      binaryAssets: [{ path: "image.png", mimeType: "image/png", base64: "cHJpdmF0ZSBmaXh0dXJl" }] };
    const lab = { id: "lab", revision: 1, tasks: [{ id: "task", maxMarks: 10 }] };
    for (const [collection, document] of [["labs", lab], ["submissions", project]] as const)
      await database.query("insert into public.labtrack_records(collection,id,document,position) values($1,$2,$3,0)", [collection, document.id, JSON.stringify(document)]);
    const migration = await readFile(new URL(payloadMigration, directory), "utf8");
    await database.exec(migration);
    const value = async (sql: string, params: unknown[] = []) => (await database.query<{ value: unknown }>(sql, params)).rows[0].value;
    const full = await value("select public.labtrack_read() as value") as { revision: number; data: { submissions: typeof project[] } };
    assert.deepEqual(full.data.submissions[0], project);
    const compact = await value("select public.labtrack_read_compact() as value") as { revision: number; data: { submissions: { id: string; revision: number; sourceOmitted: boolean; files: { path: string; content: string }[] }[] } };
    assert.equal(compact.data.submissions[0].files[0].content, "");
    assert.equal(compact.data.submissions[0].sourceOmitted, true);
    assert.ok(!JSON.stringify(compact).includes("cHJpdmF0ZSBmaXh0dXJl"));
    assert.deepEqual(await value("select public.labtrack_project('submission',1,false) as value"), { files: project.files });
    assert.equal(await value("select public.labtrack_project('submission',2,true) as value"), null);
    const start = compact.revision;
    for (let index = 0; index < 41; index++) {
      const session = { id: `session-${index}`, userId: `user-${index}`, expiresAt: Date.now() + 600000 };
      const upserts = [{ collection: "sessions", id: session.id, document: session, position: 0 }];
      const expected = [{ collection: "sessions", id: session.id, document: null }, { collection: "labs", id: lab.id, document: lab }];
      const revision = await value("select public.labtrack_write_scoped($1,$2,$3,$4) as value", [start, JSON.stringify(upserts), "[]", JSON.stringify(expected)]);
      assert.equal(Number(revision), start + index + 1);
    }
    assert.equal((await database.query<{ total: number }>("select count(*)::integer as total from public.labtrack_records where collection='sessions'")).rows[0].total, 41);
    const grade = { ...compact.data.submissions[0], grade: { marks: 0, published: false } };
    const write = (document: unknown, expected: unknown, revision: number) => value("select public.labtrack_write_scoped($1,$2,'[]',$3) as value", [revision,
      JSON.stringify([{ collection: "submissions", id: "submission", document, position: 0 }]), JSON.stringify(expected)]);
    const guards = [{ collection: "labs", id: "lab", document: lab }, { collection: "submissions", id: "submission", document: compact.data.submissions[0] }];
    assert.equal(Number(await write(grade, guards, start)), start + 42);
    await assert.rejects(write({ ...grade, grade: { marks: 5 } }, guards, start), (error: { code?: string }) => error.code === "PT409");
    const functionSql = migration.match(/create or replace function public\.labtrack_write_scoped[\s\S]*?\$\$;/)![0];
    // Lower only the ceiling in this isolated database so quota branches can be tested without filling a disk.
    await database.exec(functionSql.replace("400000000", "1"));
    assert.equal(Number(await write({ ...grade, grade: { marks: 1 } }, [], start + 42)), start + 43);
    assert.equal(Number(await write({ ...project, files: [{ path: "index.html", content: "x".repeat(1000) }] }, [], start + 43)), -1);
    assert.equal(Number(await write({ ...project, files: [{ path: "index.html", content: "x" }], binaryAssets: [] }, [], start + 43)), start + 44);
    for (const role of ["anon", "authenticated"]) {
      const permission = await value("select has_table_privilege($1,'public.labtrack_payloads','SELECT') or has_function_privilege($1,'public.labtrack_project(text,bigint,boolean)','EXECUTE') as value", [role]);
      assert.equal(permission, false);
    }
    assert.equal(await value("select bool_or(prosecdef) as value from pg_proc where proname like 'labtrack_%'"), false);
  } finally { await database.close(); }
});

test("SQL login limiter atomically admits five attempts and enforces a full fixed one-minute cooldown", async () => {
  const database = new PGlite();
  try {
    await database.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const names = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
    const limiterMigration = "20261015172900_five_attempt_login_cooldown.sql";
    for (const name of names.slice(0, names.indexOf(limiterMigration))) await database.exec(await readFile(new URL(name, directory), "utf8"));
    const key = "a".repeat(64);
    await database.query("insert into public.labtrack_login_limits values ($1, 9, now() + interval '15 minutes')", [key]);
    await database.exec(await readFile(new URL(limiterMigration, directory), "utf8"));
    const value = async <T>(sql: string, params: unknown[] = []) => (await database.query<{ value: T }>(sql, params)).rows[0].value;
    const attempt = (attemptKey = key, clear = false) => value<boolean>("select public.labtrack_login_attempt($1,$2) as value", [attemptKey, clear]);
    const bucket = () => value<{ attempts: number; reset_at: string }>("select row_to_json(limits) as value from public.labtrack_login_limits limits where key=$1", [key]);
    assert.equal((await bucket()).attempts, 5);
    assert.ok(await value<boolean>("select reset_at <= clock_timestamp() + interval '1 minute' as value from public.labtrack_login_limits where key=$1", [key]));
    assert.equal(await attempt(), false, "old blocked buckets stay blocked for no more than one minute");
    assert.equal(await attempt(key, true), true);
    const results = await Promise.all(Array.from({ length: 20 }, () => attempt()));
    assert.equal(results.filter(Boolean).length, 5, "queued concurrent RPC calls reserve exactly five slots");
    const blockedBucket = await bucket();
    assert.equal(blockedBucket.attempts, 5);
    assert.equal(await attempt(), false);
    assert.deepEqual(await bucket(), blockedBucket, "blocked attempts neither increment nor extend the bucket");
    assert.equal(await attempt("b".repeat(64)), true, "a separate account retains its own budget");

    await database.query("update public.labtrack_login_limits set attempts=4, reset_at=now() + interval '5 seconds' where key=$1", [key]);
    assert.equal(await attempt(), true);
    assert.ok(await value<boolean>("select reset_at > clock_timestamp() + interval '59 seconds' as value from public.labtrack_login_limits where key=$1", [key]), "the fifth slot starts a full minute even near the initial window boundary");
    assert.equal(await attempt(), false);
    await database.query("update public.labtrack_login_limits set reset_at=now() where key=$1", [key]);
    assert.equal(await attempt(), true, "expiry permits a new budget at the boundary");
    assert.equal((await bucket()).attempts, 1);
    assert.equal(await attempt(key, true), true);
    assert.equal(await value<number>("select count(*)::integer as value from public.labtrack_login_limits where key=$1", [key]), 0);
    assert.equal(await attempt(), true, "successful authentication clears the budget");
    for (const invalid of [null, "a".repeat(63), "g".repeat(64)]) {
      await assert.rejects(value("select public.labtrack_login_attempt($1) as value", [invalid]), (error: { code?: string }) => error.code === "PT400");
    }
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await value("select has_function_privilege($1,'public.labtrack_login_attempt(text,boolean)','EXECUTE') or has_table_privilege($1,'public.labtrack_login_limits','SELECT,INSERT,UPDATE,DELETE') as value", [role]), false);
    }
    assert.equal(await value("select has_function_privilege('service_role','public.labtrack_login_attempt(text,boolean)','EXECUTE') as value"), true);
    const security = (await database.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where oid='public.labtrack_login_attempt(text,boolean)'::regprocedure")).rows[0];
    assert.equal(security.prosecdef, false);
    assert.ok(security.proconfig.includes('search_path=""'));
    assert.equal(await value("select relrowsecurity as value from pg_class where oid='public.labtrack_login_limits'::regclass"), true);
  } finally { await database.close(); }
});
