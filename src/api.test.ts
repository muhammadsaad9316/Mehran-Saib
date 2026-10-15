import test from "node:test";
import assert from "node:assert/strict";
import { api } from "./api.js";

test("API reads recover from a proxy restart; writes and real API errors are not replayed", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return calls === 1
      ? new Response("", { status: 500 })
      : Response.json({ ready: true });
  });
  assert.deepEqual(await api("/state"), { ready: true });
  assert.equal(calls, 2);

  calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 500 });
  });
  await assert.rejects(api("/auth/login", { method: "POST" }), /temporarily unavailable/);
  assert.equal(calls, 1);

  calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { error: "Configure the database key" },
      { status: 503 },
    );
  });
  await assert.rejects(api("/state"), /Configure the database key/);
  assert.equal(calls, 1);
});

test("API deadlines abort stalled reads and mark timed-out writes uncertain without replay", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true }));
  });
  await assert.rejects(api("/state", { timeoutMs: 5 }), /timed out/);
  await assert.rejects(api("/submissions", { method: "POST", timeoutMs: 5 }), (error: { message: string; uncertain?: boolean }) => /could not be confirmed/.test(error.message) && error.uncertain === true);
  assert.equal(calls, 2);
});
