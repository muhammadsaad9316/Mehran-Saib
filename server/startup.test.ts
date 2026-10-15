import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyDatabase } from "./store.js";
import { SupabaseUnavailableError } from "./supabase.js";

const options = {
  production: false,
  demo: false,
  mongoUri: "",
  supabaseUrl: "https://startup-fixture.supabase.co",
  supabaseKey: "sb_secret_startup_fixture_only",
};
const privateDetail = "private-response-password-session-source";
const fixture = () => ({
  ...emptyDatabase(),
  users: [{
    id: "fixture-teacher", name: "Teacher", email: "teacher@example.test",
    role: "teacher" as const, passwordHash: "fixture-hash",
  }],
});

test("persistent startup recovers after two unavailable reads and serves health without writing", async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => warnings.push(message));
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(url.endsWith("labtrack_read_compact"));
    assert.ok(init.signal instanceof AbortSignal);
    reads++;
    if (reads === 1)
      throw new TypeError(privateDetail, { cause: { code: "ECONNRESET" } });
    if (reads === 2)
      return Response.json({ message: privateDetail }, { status: 503 });
    return Response.json({ revision: 1, data: fixture() });
  });
  const app = await createApp(options);
  try {
    await request(app).get("/api/health").expect(200, { ok: true });
    assert.equal(reads, 3);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /ECONNRESET/);
    assert.match(warnings[1], /HTTP_503/);
    assert.ok(warnings.every(message => !message.includes(privateDetail) && !message.includes(options.supabaseKey)));
    assert.deepEqual(app.locals.store.data, fixture());
  } finally {
    await app.locals.store.close();
  }
});

test("persistent startup stops after three unavailable reads and exposes only sanitized diagnostics", async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => warnings.push(message));
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () => {
    reads++;
    throw new TypeError(privateDetail, { cause: { code: options.supabaseKey } });
  });
  await assert.rejects(createApp(options), (error: Error) => {
    assert.ok(error instanceof SupabaseUnavailableError);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.match(error.message, /after 3 read attempt/);
    assert.match(error.message, /restart the API/);
    assert.ok(!error.message.includes(privateDetail));
    assert.ok(!error.message.includes(options.supabaseKey));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(reads, 3);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every(message => !message.includes(privateDetail) && !message.includes(options.supabaseKey)));
});

test("startup configuration, authorization, migration and invalid data errors fail without retries", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  let reads = 0;
  let response = () => Response.json({}, { status: 401 });
  t.mock.method(globalThis, "fetch", async () => { reads++; return response(); });
  for (const [settings, message] of [
    [{ ...options, supabaseUrl: "http://example.test" }, /HTTPS/],
    [{ ...options, supabaseKey: "sb_publishable_fixture" }, /server-only/],
  ] as const) {
    await assert.rejects(createApp(settings), message);
    assert.equal(reads, 0);
  }
  for (const [makeResponse, message] of [
    [() => Response.json({ message: privateDetail }, { status: 401 }), /HTTP 401/],
    [() => Response.json({ message: privateDetail }, { status: 403 }), /HTTP 403/],
    [() => Response.json({ code: "PGRST202", message: privateDetail }, { status: 404 }), /migrations/],
    [() => new Response("invalid JSON"), /invalid JSON/],
    [() => Response.json({ revision: 0, data: { users: [] } }), /invalid LabTrack database/],
  ] as const) {
    response = makeResponse;
    const previous = reads;
    await assert.rejects(createApp(options), message);
    assert.equal(reads, previous + 1);
  }
  assert.equal(warn.mock.callCount(), 0);
});

test("serverless initialization remains fail-fast on an unavailable database", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.ok(url.endsWith("labtrack_read_compact"));
    reads++;
    return Response.json({ message: privateDetail }, { status: 503 });
  });
  await assert.rejects(createApp({ ...options, serverless: true }), /HTTP 503/);
  assert.equal(reads, 1);
  assert.equal(warn.mock.callCount(), 0);
});

test("startup never replays a bootstrap write whose response was lost", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  let reads = 0;
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("labtrack_read_compact")) {
      reads++;
      return Response.json({ revision: 0, data: emptyDatabase() });
    }
    assert.ok(url.endsWith("labtrack_write_scoped"));
    writes++;
    throw new TypeError(privateDetail, { cause: { code: "ECONNRESET" } });
  });
  await assert.rejects(createApp({
    ...options, adminEmail: "teacher@example.test", adminPassword: "FixtureTeacher2026!",
  }), SupabaseUnavailableError);
  assert.equal(reads, 2); // One initial read and one read-only reconciliation; no bootstrap replay.
  assert.equal(writes, 1);
  assert.equal(warn.mock.callCount(), 0);
});

test("a connection lost while reading the initial response body is retried safely", async (t) => {
  t.mock.method(console, "warn", () => {});
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.ok(url.endsWith("labtrack_read_compact"));
    reads++;
    if (reads === 1) return new Response(new ReadableStream({
      start(controller) {
        controller.error(new TypeError(privateDetail, { cause: { code: "ECONNRESET" } }));
      },
    }));
    return Response.json({ revision: 1, data: fixture() });
  });
  const app = await createApp(options);
  try {
    assert.equal(reads, 2);
    assert.deepEqual(app.locals.store.data, fixture());
  } finally {
    await app.locals.store.close();
  }
});

test("an expired shared startup deadline prevents further read attempts", async (t) => {
  const deadline = new AbortController();
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) =>
    milliseconds === 45000 ? deadline.signal : timeout(milliseconds));
  const warn = t.mock.method(console, "warn", () => {});
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    reads++;
    deadline.abort(new DOMException("Fixture timeout", "TimeoutError"));
    assert.equal(init.signal?.aborted, true);
    throw new DOMException("Fixture timeout", "TimeoutError");
  });
  await assert.rejects(createApp(options), (error: Error) =>
    error instanceof SupabaseUnavailableError && error.code === "TIMEOUT");
  assert.equal(reads, 1);
  assert.equal(warn.mock.callCount(), 0);
});
