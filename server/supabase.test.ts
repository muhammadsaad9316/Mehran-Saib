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

test("unchanged serverless snapshots transfer no records, isolate callers and refresh after external writes", async () => {
  let revision = 0;
  const data = emptyDatabase();
  data.sessions.push({ id: "first", userId: "u1", expiresAt: 100 });
  const known: number[] = [];
  const fetchSnapshot: typeof fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    known.push(body.known_revision);
    return json({ revision, data: body.known_revision === revision ? null : data });
  };
  const cacheConfig = { ...config, url: "https://cache-test.supabase.co", cache: true };
  const first = new SupabasePersistence(cacheConfig, fetchSnapshot);
  (await first.load()).sessions[0].id = "caller-edit";
  const second = new SupabasePersistence(cacheConfig, fetchSnapshot);
  assert.equal((await second.load()).sessions[0].id, "first");
  data.sessions.push({ id: "external", userId: "u2", expiresAt: 200 });
  revision++;
  assert.equal((await second.load()).sessions.length, 2);
  assert.deepEqual(known, [-1, 0, 0]);
  const rotated = new SupabasePersistence({ ...cacheConfig, secretKey: "sb_secret_rotated_testing" }, fetchSnapshot);
  await rotated.load();
  assert.equal(known.at(-1), -1);
});

test("conditional reads fail closed without a matching snapshot and do not reuse stale data on errors", async () => {
  const cachedConfig = { ...config, url: "https://invalid-cache.supabase.co", cache: true };
  const invalid = new SupabasePersistence(cachedConfig, async () => json({ revision: 0, data: null }));
  await assert.rejects(invalid.load(), /invalid LabTrack database/);
  let unavailable = false;
  const checked = new SupabasePersistence(cachedConfig, async () => unavailable
    ? json({}, 503) : json({ revision: 0, data: emptyDatabase() }));
  await checked.load();
  unavailable = true;
  await assert.rejects(checked.load(), /HTTP 503/);
});

test("storage budget rejects a save without retries or changing saved records", async (t) => {
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("labtrack_read")) return json({ revision: 0, data: emptyDatabase() });
    writes++;
    return json(-1);
  });
  const store = new Store("unused", undefined, config, 8);
  await store.open();
  await assert.rejects(store.mutate(data => data.sessions.push({ id: "new", userId: "u", expiresAt: 100 })),
    (error: { status: number; message: string }) => error.status === 507 && /storage is nearly full/.test(error.message));
  assert.equal(writes, 1);
  assert.deepEqual(store.data, emptyDatabase());
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
  for (const code of ["PT409", "40001"]) {
    const conflict = new SupabasePersistence(config, async () =>
      json({ code }, 409),
    );
    await assert.rejects(
      conflict.write(emptyDatabase(), {
        ...emptyDatabase(),
        sessions: [{ id: "s", userId: "u", expiresAt: 1 }],
      }),
      SupabaseConflictError,
    );
  }
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

test("serverless writes preserve concurrent saves from independent instances", async (t) => {
  let remote = emptyDatabase();
  let revision = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    if (url.endsWith("labtrack_read_if_changed"))
      return json({ revision, data: body.known_revision === revision ? null : remote });
    if (body.expected_revision !== revision) return json({ code: "PT409" }, 409);
    for (const item of body.upserts) {
      const rows = remote[item.collection as keyof typeof remote] as { id: string }[];
      const index = rows.findIndex(row => row.id === item.id);
      if (index < 0) rows.push(item.document);
      else rows[index] = item.document;
    }
    return json(++revision);
  });
  const cachedConfig = { ...config, url: "https://concurrent-cache.supabase.co", cache: true };
  const a = new Store("unused", undefined, cachedConfig, 8);
  const b = new Store("unused", undefined, cachedConfig, 8);
  await Promise.all([a.open(), b.open()]);
  await Promise.all([
    a.mutate(data => data.sessions.push({ id: "a", userId: "u1", expiresAt: 100 })),
    b.mutate(data => data.sessions.push({ id: "b", userId: "u2", expiresAt: 100 })),
  ]);
  assert.deepEqual(remote.sessions.map(s => s.id).sort(), ["a", "b"]);
  assert.equal(revision, 2);
});

test("serverless conflict retries are bounded and repeat validation against fresh records", async (t) => {
  let writes = 0;
  let validations = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("labtrack_read")) return json({ revision: writes, data: emptyDatabase() });
    writes++;
    return json({ code: "PT409" }, 409);
  });
  const store = new Store("unused", undefined, config, 3);
  await store.open();
  await assert.rejects(store.mutate(data => {
    validations++;
    data.sessions.push({ id: "s", userId: "u", expiresAt: 100 });
  }), (error: { status: number }) => error.status === 409);
  assert.equal(writes, 3);
  assert.equal(validations, 3);
  assert.deepEqual(store.data, emptyDatabase());
});

test("Supabase stale writes reload the latest state and return a refreshable conflict", async (t) => {
  let reads = 0;
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("labtrack_read")) {
      const data = emptyDatabase();
      if (reads++)
        data.sessions.push({ id: "remote", userId: "u", expiresAt: 100 });
      return json({ revision: reads, data });
    }
    writes++;
    return json({ code: "PT409" }, 409);
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
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  await store.close();
});

test("a committed write with a lost response is reconciled without replay and refreshes persistent state", async (t) => {
  const remote = emptyDatabase();
  let revision = 0;
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    if (url.endsWith("labtrack_read")) return json({ revision, data: structuredClone(remote) });
    writes++;
    const body = JSON.parse(String(options.body));
    remote.sessions = body.upserts.find((item: { collection: string }) => item.collection === "sessions") ? [body.upserts[0].document] : [];
    revision++;
    throw new TypeError("private transport detail", { cause: { code: "ECONNRESET" } });
  });
  const store = new Store("unused", undefined, config);
  await store.open();
  const saved = await store.mutate(data => {
    data.sessions.push({ id: "saved-once", userId: "u1", expiresAt: 100 });
    return "acknowledged";
  });
  assert.equal(saved, "acknowledged");
  assert.equal(writes, 1);
  assert.deepEqual(store.data, remote);
  await store.close();
});

test("41 delayed independent classroom writes complete within the bounded retry policy", async (t) => {
  const remote = emptyDatabase();
  let revision = 0;
  let randomSeed = 12345;
  t.mock.method(Math, "random", () => ((randomSeed = (1664525 * randomSeed + 1013904223) >>> 0) / 4294967296));
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    await new Promise(resolve => setTimeout(resolve, 20));
    const body = JSON.parse(String(options.body));
    if (url.endsWith("labtrack_read_compact")) return json({ revision, data: body.known_revision === revision ? null : structuredClone(remote) });
    if (body.expected_revision !== revision && body.expected_documents.some((expected: { collection: keyof typeof remote; id: string; document: unknown }) => {
      const current = remote[expected.collection].find(item => item.id === expected.id) || null;
      return JSON.stringify(current) !== JSON.stringify(expected.document);
    })) return json({ code: "PT409" }, 409);
    for (const item of body.upserts) {
      const rows = remote[item.collection as keyof typeof remote] as { id: string }[];
      const index = rows.findIndex(row => row.id === item.id);
      if (index < 0) rows.push(item.document); else rows[index] = item.document;
    }
    return json(++revision);
  });
  const stores = Array.from({ length: 41 }, () => new Store("unused", undefined, { ...config, url: "https://class-burst-test.supabase.co", cache: true, compact: true }, 8));
  await Promise.all(stores.map(store => store.open()));
  await Promise.all(stores.map((store, index) => store.mutate(data => data.sessions.push({ id: `session-${index}`, userId: `student-${index}`, expiresAt: 100 }))));
  assert.equal(remote.sessions.length, 41);
  assert.equal(new Set(remote.sessions.map(session => session.id)).size, 41);
  assert.equal(revision, 41);
  await Promise.all(stores.map(store => store.close()));
});

test("a confirmed compact write stays acknowledged when refresh fails and blocks stale reads until recovery", async (t) => {
  const remote = emptyDatabase();
  let revision = 0, writes = 0, unavailable = false;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    if (url.endsWith("labtrack_read_compact")) {
      if (unavailable) return json({}, 503);
      return json({ revision, data: structuredClone(remote) });
    }
    const body = JSON.parse(String(options.body));
    remote.sessions = [body.upserts[0].document];
    writes++;
    unavailable = true;
    return json(++revision);
  });
  const store = new Store("unused", undefined, { ...config, compact: true });
  await store.open();
  assert.equal(await store.mutate(data => {
    data.sessions.push({ id: "confirmed", userId: "u1", expiresAt: 100 });
    return "saved";
  }), "saved");
  assert.equal(writes, 1);
  await assert.rejects(store.ensureFresh(), /Supabase/);
  unavailable = false;
  remote.sessions.push({ id: "another-client", userId: "u2", expiresAt: 100 });
  await store.ensureFresh();
  assert.deepEqual(store.data, remote);
  assert.equal(writes, 1);
  await store.close();
});
