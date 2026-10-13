import test from "node:test";
import assert from "node:assert/strict";
import { SupabasePersistence, SupabaseConflictError } from "./supabase.js";
import { Store, emptyDatabase } from "./store.js";

const config = {
  url: "https://labtrack-test.supabase.co",
  secretKey: "sb_secret_test_only",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("Supabase sends only changed records and deletions in one versioned transaction", async () => {
  const previous = emptyDatabase();
  previous.users.push({
    id: "u1",
    name: "Teacher",
    email: "teacher@example.test",
    role: "teacher",
    passwordHash: "test-hash",
  });
  previous.sessions.push({ id: "old-session", userId: "u1", expiresAt: 0 });
  const bodies: Record<string, unknown>[] = [];
  const request: typeof fetch = async (url, options) => {
    assert.equal(new Headers(options?.headers).get("apikey"), config.secretKey);
    assert.equal(new Headers(options?.headers).get("Authorization"), null);
    assert.ok(options?.signal);
    if (String(url).endsWith("labtrack_read"))
      return json({ revision: 7, data: previous });
    bodies.push(JSON.parse(String(options?.body)));
    return json(8);
  };
  const persistence = new SupabasePersistence(config, request);
  const loaded = await persistence.load();
  assert.deepEqual(loaded, previous);
  const next = structuredClone(previous);
  next.users[0].name = "Updated teacher";
  next.sessions = [];
  await persistence.write(previous, next);
  assert.deepEqual(bodies, [
    {
      expected_revision: 7,
      upserts: [
        { collection: "users", id: "u1", document: next.users[0], position: 0 },
      ],
      deletions: [{ collection: "sessions", id: "old-session" }],
    },
  ]);
  await persistence.write(next, next);
  assert.equal(bodies.length, 1);
});

test("Supabase rejects browser keys, invalid state, conflicts and errors without exposing secrets", async () => {
  assert.throws(
    () => new SupabasePersistence({ ...config, url: "http://example.test" }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      new SupabasePersistence({ ...config, secretKey: "sb_publishable_test" }),
    /server-only/,
  );
  const invalid = new SupabasePersistence(config, async () =>
    json({ revision: 0, data: { users: [] } }),
  );
  await assert.rejects(invalid.load(), /invalid LabTrack database/);
  const unavailable = new SupabasePersistence(config, async () =>
    json({ message: config.secretKey }, 503),
  );
  await assert.rejects(
    unavailable.load(),
    (error: Error) =>
      /HTTP 503/.test(error.message) &&
      !error.message.includes(config.secretKey),
  );
  const conflict = new SupabasePersistence(config, async () =>
    json({ code: "40001" }, 409),
  );
  await assert.rejects(
    conflict.write(emptyDatabase(), {
      ...emptyDatabase(),
      sessions: [{ id: "s", userId: "u", expiresAt: 1 }],
    }),
    SupabaseConflictError,
  );
});

test("Supabase store keeps failed writes out of memory and recovers its write queue", async (t) => {
  let fail = true;
  let revision = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("labtrack_read"))
      return json({ revision, data: emptyDatabase() });
    if (fail) return json({ message: "database unavailable" }, 503);
    return json(++revision);
  });
  const store = new Store("unused-supabase-test-directory", undefined, config);
  await store.open();
  const change = (data: ReturnType<typeof emptyDatabase>) =>
    data.sessions.push({ id: "s1", userId: "u1", expiresAt: 100 });
  await assert.rejects(store.mutate(change), /HTTP 503/);
  assert.deepEqual(store.data, emptyDatabase());
  fail = false;
  await store.mutate(change);
  assert.equal(store.data.sessions.length, 1);
  await store.close();
});

test("Supabase stale writes reload the latest state and return a refreshable conflict", async (t) => {
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("labtrack_read")) {
      const data = emptyDatabase();
      if (reads++)
        data.sessions.push({ id: "remote", userId: "u", expiresAt: 100 });
      return json({ revision: reads, data });
    }
    return json({ code: "40001" }, 409);
  });
  const store = new Store("unused-supabase-test-directory", undefined, config);
  await store.open();
  await assert.rejects(
    store.mutate((data) =>
      data.sessions.push({ id: "stale", userId: "u", expiresAt: 100 }),
    ),
    (error: { status: number }) => error.status === 409,
  );
  assert.equal(store.data.sessions[0].id, "remote");
  await store.close();
});
