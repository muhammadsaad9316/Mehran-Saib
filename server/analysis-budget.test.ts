import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { analysisProjects, ANALYSIS_MAX_PROJECTS, type AnalysisSubmission } from "./analysis-budget.js";
import { SupabaseConflictError, SupabasePersistence } from "./supabase.js";
import type { Submission } from "../shared/types.js";

const project = (id: string, files: Submission["files"]): Submission => ({
  id, files, revision: 1, studentId: id, labId: "lab", taskId: "task", link: null,
  submittedAt: "2026-10-23T00:00:00Z", status: "submitted", late: false,
});

test("private SQL bounds analysis source before transfer, preserving revisions, paths and namespace isolation", async () => {
  const database = new PGlite();
  try {
    await database.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const migrations = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
    for (const name of migrations) await database.exec(await readFile(new URL(name, directory), "utf8"));
    assert.ok(migrations.some(name => name.endsWith("_bounded_analysis_sources.sql")));
    const fixtures = [
      project("unicode", [{ path: "unicode.txt", content: "é".repeat(100_000) }]),
      project("large", [{ path: "large.html", content: "x".repeat(200_001) }, { path: "later.css", content: "body{}" }]),
      project("files", Array.from({ length: 41 }, (_, index) => ({ path: `${index}.txt`, content: `file-${index}` }))),
      ...Array.from({ length: 11 }, (_, index) => project(`aggregate-${index}`, [{ path: "index.html", content: "a".repeat(200_000) }])),
    ];
    const value = async <T>(sql: string, args: unknown[] = []) => (await database.query<{ value: T }>(sql, args)).rows[0].value;
    for (const prefix of ["labtrack", "labtrack_demo"]) {
      for (const [position, fixture] of fixtures.entries()) {
        const { files, ...metadata } = fixture;
        await database.query(`insert into public.${prefix}_records values('submissions',$1,$2,$3)`, [fixture.id,
          JSON.stringify({ ...metadata, sourceOmitted: true, files: files.map(file => ({ path: file.path, content: "" })) }), position]);
        await database.query(`insert into public.${prefix}_payloads values('submissions',$1,$2)`, [fixture.id,
          JSON.stringify({ files, binaryAssets: [{ path: "image.png", base64: "cHJpdmF0ZQ==", mimeType: "image/png" }] })]);
      }
      const expected = fixtures.map(({ id, revision }) => ({ id, revision }));
      const read = (items = expected) => value<AnalysisSubmission[] | null>(`select public.${prefix}_analysis_projects($1) as value`, [JSON.stringify(items)]);
      const actual = (await read())!;
      const local = analysisProjects(fixtures);
      assert.deepEqual(actual.map(item => item.id), expected.map(item => item.id));
      assert.deepEqual(actual.map(item => item.files), local.map(item => item.files));
      assert.deepEqual(actual.map(item => !!item.analysisSourceLimited), local.map(item => !!item.analysisSourceLimited));
      assert.ok(actual.reduce((sum, item) => sum + item.files.reduce((size, file) => size + Buffer.byteLength(file.content), 0), 0) <= 2_000_000);
      assert.equal(actual[0].files[0].content, fixtures[0].files[0].content, "exact UTF-8 byte boundary is retained");
      assert.equal(actual[1].files[1].path, "later.css");
      assert.ok(actual[1].files.every(file => file.content === ""));
      assert.equal(actual[2].files[39].content, "file-39");
      assert.equal(actual[2].files[40].content, "");
      assert.ok(actual.at(-1)!.analysisSourceLimited);
      assert.ok(!JSON.stringify(actual).includes("cHJpdmF0ZQ=="));
      assert.equal(await read([{ id: "unicode", revision: 2 }]), null);
      assert.equal(await read([{ id: "missing", revision: 1 }]), null);
      assert.deepEqual((await read(expected.slice(0, 3).reverse()))!.map(item => item.id), expected.slice(0, 3).reverse().map(item => item.id));
      assert.deepEqual(await read([]), []);
      await assert.rejects(read(Array.from({ length: 201 }, (_, index) => ({ id: `project-${index}`, revision: 1 }))), (error: { code?: string }) => error.code === "PT400");
      await assert.rejects(read([expected[0], expected[0]]), (error: { code?: string }) => error.code === "PT400");
      const full = await value<{ files: Submission["files"] }>(`select public.${prefix}_project('large',1,false) as value`);
      assert.deepEqual(full.files, fixtures[1].files, "analysis never changes full source reads");
      const saved = await value(`select payload as value from public.${prefix}_payloads where id='large'`);
      await database.query(`update public.${prefix}_payloads set payload=$1 where id='large'`, [JSON.stringify({ files: [{ path: "bad.txt", content: null }, { path: "large.txt", content: "x".repeat(200_001) }] })]);
      assert.equal(await read([{ id: "large", revision: 1 }]), null, "malformed content cannot poison the byte counter");
      await database.query(`update public.${prefix}_payloads set payload=$1 where id='large'`, [JSON.stringify({ files: null })]);
      assert.equal(await read([{ id: "large", revision: 1 }]), null);
      await database.query(`update public.${prefix}_payloads set payload=$1 where id='large'`, [JSON.stringify(saved)]);
      for (const role of ["anon", "authenticated"]) assert.equal(await value(`select has_function_privilege($1,'public.${prefix}_analysis_projects(jsonb)','EXECUTE') as value`, [role]), false);
      assert.equal(await value(`select has_function_privilege('service_role','public.${prefix}_analysis_projects(jsonb)','EXECUTE') as value`), true);
      const security = (await database.query<{ prosecdef: boolean; proconfig: string[] }>(`select prosecdef,proconfig from pg_proc where oid='public.${prefix}_analysis_projects(jsonb)'::regprocedure`)).rows[0];
      assert.equal(security.prosecdef, false);
      assert.ok(security.proconfig.includes('search_path=""'));
    }
    await database.query("update public.labtrack_demo_payloads set payload=jsonb_set(payload,'{files,0,content}','\"demo only\"') where id='unicode'");
    assert.equal((await value<AnalysisSubmission[]>("select public.labtrack_demo_analysis_projects('[{\"id\":\"unicode\",\"revision\":1}]') as value"))[0].files[0].content, "demo only");
    assert.equal((await value<AnalysisSubmission[]>("select public.labtrack_analysis_projects('[{\"id\":\"unicode\",\"revision\":1}]') as value"))[0].files[0].content, fixtures[0].files[0].content);
  } finally { await database.close(); }
});

test("Supabase analysis caps candidates before the RPC and retains incomplete markers", async () => {
  const candidates = Array.from({ length: 201 }, (_, index) => ({ ...project(`s-${index}`, [{ path: "index.html", content: "" }]), sourceOmitted: true }));
  let calls = 0;
  const adapter = new SupabasePersistence({ url: "https://analysis-fixture.supabase.co", secretKey: "sb_secret_fixture" }, async (url, options) => {
    calls++;
    assert.ok(String(url).endsWith("/labtrack_analysis_projects"));
    const expected = JSON.parse(String(options?.body)).expected_submissions;
    assert.equal(expected.length, ANALYSIS_MAX_PROJECTS);
    return Response.json(candidates.slice(0, ANALYSIS_MAX_PROJECTS).map(item => ({ ...item, sourceOmitted: undefined, analysisSourceLimited: true })));
  });
  const results = await adapter.analysisProjects(candidates);
  assert.equal(results.length, ANALYSIS_MAX_PROJECTS);
  assert.ok(results.every(item => item.analysisSourceLimited));
  assert.equal(calls, 1);
  const stale = new SupabasePersistence({ url: "https://analysis-fixture.supabase.co", secretKey: "sb_secret_fixture" }, async () => Response.json([{ ...candidates[0], revision: 2 }]));
  await assert.rejects(stale.analysisProjects([candidates[0]]), SupabaseConflictError);
});
