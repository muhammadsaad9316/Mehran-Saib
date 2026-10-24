import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("login cooldown reconciliation upgrades the missing historical policy without changing classroom data", async () => {
  const database = new PGlite();
  try {
    await database.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
      // Reproduce the observed hosted history, including the newer isolated demo.
      if (name === "20261015172900_five_attempt_login_cooldown.sql" || name.includes("reconcile_classroom_login_cooldown")) continue;
      await database.exec(await readFile(new URL(name, directory), "utf8"));
    }
    const value = async <T>(sql: string, params: unknown[] = []) =>
      (await database.query<{ value: T }>(sql, params)).rows[0].value;
    const key = "a".repeat(64);
    const attempt = (clear = false) => value<boolean>("select public.labtrack_login_attempt($1,$2) as value", [key, clear]);
    const bucket = () => value<{ attempts: number; reset_at: string }>("select row_to_json(limits) as value from public.labtrack_login_limits limits where key=$1", [key]);
    const documents = [
      { collection: "users", id: "student", document: { id: "student", role: "student", email: "fixture@example.test", rollNumber: "1", passwordHash: "fixture-only" } },
      { collection: "labs", id: "lab", document: { id: "lab", tasks: [{ id: "task", maxMarks: 10 }], instructionFile: { content: "Zml4dHVyZQ==" } } },
      { collection: "submissions", id: "work", document: { id: "work", studentId: "student", labId: "lab", taskId: "task", revision: 2, sourceOmitted: true, files: [{ path: "index.html", content: "" }], grade: { marks: 0, published: false } } },
    ];
    for (const [position, item] of documents.entries())
      await database.query("insert into public.labtrack_records values($1,$2,$3,$4)", [item.collection, item.id, JSON.stringify(item.document), position]);
    await database.query("insert into public.labtrack_payloads values('submissions','work',$1)", [JSON.stringify({ files: [{ path: "index.html", content: "<h1>Preserved fixture</h1>" }], binaryAssets: [{ path: "photo.png", base64: "Zml4dHVyZQ==", mimeType: "image/png" }] })]);
    const before = await value("select public.labtrack_read() as value");
    const demoBefore = await value("select pg_get_functiondef('public.labtrack_demo_login_attempt(text,boolean)'::regprocedure) as value");
    const oldResults = await Promise.all(Array.from({ length: 9 }, () => attempt()));
    assert.equal(oldResults.filter(Boolean).length, 8, "the simulated hosted policy still admits eight attempts");
    assert.ok(await value<boolean>("select reset_at > clock_timestamp() + interval '14 minutes' as value from public.labtrack_login_limits where key=$1", [key]));

    const reconciliation = await readFile(new URL("../supabase/migrations/20261023171435_reconcile_classroom_login_cooldown.sql", import.meta.url), "utf8");
    await database.exec(reconciliation);
    const reconciledBucket = await bucket();
    assert.equal(reconciledBucket.attempts, 5);
    assert.ok(await value<boolean>("select reset_at <= clock_timestamp() + interval '1 minute' as value from public.labtrack_login_limits where key=$1", [key]));
    assert.equal(await attempt(), false);
    assert.deepEqual(await bucket(), reconciledBucket, "blocked calls do not extend the shortened cooldown");
    await database.exec(reconciliation);
    assert.deepEqual(await bucket(), reconciledBucket, "a second reconciliation leaves an active new-policy bucket intact");
    assert.deepEqual(await value("select public.labtrack_read() as value"), before, "users, labs, grades, complete payloads and database revision are unchanged");
    assert.equal(await value("select pg_get_functiondef('public.labtrack_demo_login_attempt(text,boolean)'::regprocedure) as value"), demoBefore);

    await database.exec("set role service_role");
    assert.equal(await attempt(true), true);
    const newResults = await Promise.all(Array.from({ length: 20 }, () => attempt()));
    assert.equal(newResults.filter(Boolean).length, 5);
    const blockedBucket = await bucket();
    assert.equal(await attempt(), false);
    assert.deepEqual(await bucket(), blockedBucket);
    await database.query("update public.labtrack_login_limits set attempts=4, reset_at=clock_timestamp() + interval '5 seconds' where key=$1", [key]);
    assert.equal(await attempt(), true);
    assert.ok(await value<boolean>("select reset_at > clock_timestamp() + interval '59 seconds' as value from public.labtrack_login_limits where key=$1", [key]), "the fifth attempt starts a full minute");
    await database.query("update public.labtrack_login_limits set reset_at=clock_timestamp() - interval '1 second' where key=$1", [key]);
    assert.equal(await attempt(), true);
    assert.equal((await bucket()).attempts, 1, "an expired bucket starts a fresh budget");
    assert.equal(await attempt(true), true);
    assert.equal(await value<number>("select count(*)::integer as value from public.labtrack_login_limits where key=$1", [key]), 0);
    for (const role of ["anon", "authenticated"])
      assert.equal(await value("select has_function_privilege($1,'public.labtrack_login_attempt(text,boolean)','EXECUTE') or has_table_privilege($1,'public.labtrack_login_limits','SELECT,INSERT,UPDATE,DELETE') as value", [role]), false);
    assert.equal(await value("select has_function_privilege('service_role','public.labtrack_login_attempt(text,boolean)','EXECUTE') as value"), true);
    const security = (await database.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where oid='public.labtrack_login_attempt(text,boolean)'::regprocedure")).rows[0];
    assert.equal(security.prosecdef, false);
    assert.ok(security.proconfig.includes('search_path=""'));
  } finally { await database.close(); }
});
