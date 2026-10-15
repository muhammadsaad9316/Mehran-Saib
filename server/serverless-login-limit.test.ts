import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import handler from "../api/index.js";
import { hashPassword } from "./auth.js";

test("serverless login shares an atomic five-attempt cooldown across requests and account aliases", async t => {
  const environment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    MONGODB_URI: process.env.MONGODB_URI,
  };
  const origin = "https://serverless-login-limit-fixture.supabase.co";
  Object.assign(process.env, { SUPABASE_URL: origin, SUPABASE_SECRET_KEY: "sb_secret_login_limit_fixture_only", MONGODB_URI: "" });
  t.after(() => {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const database = new PGlite();
  try {
    await database.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort())
      await database.exec(await readFile(new URL(name, directory), "utf8"));
    const password = "LoginLimitFixture2026!";
    const passwordHash = await hashPassword(password);
    const users = [
      { id: "fixture-teacher", name: "Fixture teacher", email: "teacher@example.test", role: "teacher", passwordHash },
      { id: "fixture-student", name: "Fixture student", email: "student@example.test", role: "student", rollNumber: "1", passwordHash },
    ];
    for (const [index, user] of users.entries())
      await database.query("insert into public.labtrack_records values('users',$1,$2,$3)", [user.id, JSON.stringify(user), index]);
    await database.exec("set role service_role");
    let limiterUnavailable = false;
    t.mock.method(console, "error", () => undefined);
    t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
      assert.ok(url.startsWith(`${origin}/rest/v1/`));
      if (url.includes("/labtrack_meta?"))
        return Response.json((await database.query("select revision from public.labtrack_meta where id=1")).rows);
      const name = url.split("/").at(-1)!;
      assert.match(name, /^labtrack_[a-z_]+$/);
      if (name === "labtrack_login_attempt" && limiterUnavailable)
        return Response.json({}, { status: 503 });
      const body = JSON.parse(String(options.body)) as Record<string, unknown>;
      const keys = Object.keys(body);
      keys.forEach(key => assert.match(key, /^[a-z_]+$/));
      try {
        const result = await database.query<{ value: unknown }>(
          `select public.${name}(${keys.map((key, index) => `${key}=>$${index + 1}`).join(",")}) as value`,
          keys.map(key => typeof body[key] === "object" ? JSON.stringify(body[key]) : body[key]),
        );
        return Response.json(result.rows[0].value);
      } catch (error) {
        return Response.json({ code: (error as { code?: string }).code }, { status: 409 });
      }
    });
    const login = (email: string, suppliedPassword = "incorrect") => request(handler)
      .post("/api/auth/login").send({ email, password: suppliedPassword });
    const aliases = ["1", "01", "student@example.test", "STUDENT@example.test"];
    const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) => login(aliases[index % aliases.length])));
    assert.equal(attempts.filter(response => response.status === 401).length, 5);
    assert.equal(attempts.filter(response => response.status === 429).length, 15);
    for (const response of attempts) {
      assert.equal(response.headers["set-cookie"], undefined);
      if (response.status === 429) assert.equal(response.headers["retry-after"], "60");
    }
    const blockedCorrect = await login("student@example.test", password).expect(429).expect("Retry-After", "60");
    assert.equal(blockedCorrect.headers["set-cookie"], undefined);
    const otherAccount = await login("teacher@example.test", password).expect(200);
    assert.ok(otherAccount.headers["set-cookie"]);
    await database.exec("update public.labtrack_login_limits set reset_at = now() - interval '1 second'");
    const successful = await login("1", password).expect(200);
    assert.ok(successful.headers["set-cookie"]);
    assert.equal((await database.query<{ total: number }>("select count(*)::integer as total from public.labtrack_login_limits")).rows[0].total, 0);
    for (let index = 0; index < 5; index++) await login(aliases[index % aliases.length]).expect(401);
    await login("1").expect(429).expect("Retry-After", "60");
    const sessionsBeforeFailure = (await database.query<{ total: number }>("select count(*)::integer as total from public.labtrack_records where collection='sessions'")).rows[0].total;
    limiterUnavailable = true;
    const unavailable = await login("teacher@example.test", password).expect(503);
    assert.equal(unavailable.headers["set-cookie"], undefined);
    assert.equal((await database.query<{ total: number }>("select count(*)::integer as total from public.labtrack_records where collection='sessions'")).rows[0].total, sessionsBeforeFailure);
  } finally {
    await database.close();
  }
});
