import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "./app.js";
import { hashPassword } from "./auth.js";
import { Store } from "./store.js";

async function loginFixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-login-limit-"));
  const store = new Store(directory);
  await store.open();
  const passwordHash = await hashPassword("FixturePassword2026!");
  await store.mutate(data => {
    data.users = [
      { id: "teacher", name: "Teacher", email: "teacher@example.test", role: "teacher", passwordHash },
      { id: "student", name: "Student", email: "student@example.test", rollNumber: "1", role: "student", passwordHash },
    ];
  });
  await store.close();
  const app = await createApp({ dataDir: directory, demo: false, production: false, mongoUri: "", supabaseUrl: "", supabaseKey: "" });
  t.after(async () => {
    await app.locals.store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const login = (email = "1", password = "wrong") => request(app).post("/api/auth/login").send({ email, password });
  return { app, login };
}

test("parallel login guesses share five reservations across account aliases and stop for one minute", async t => {
  const { login } = await loginFixture(t);
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const guesses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    login(index % 2 ? "student@example.test" : "01").set("X-Forwarded-For", `192.0.2.${index + 1}`),
  ));
  assert.equal(guesses.filter(response => response.status === 401).length, 5);
  assert.equal(guesses.filter(response => response.status === 429).length, 15);
  for (const response of guesses.filter(response => response.status === 429)) {
    assert.equal(response.headers["retry-after"], "60");
    assert.match(response.body.error, /one minute/);
    assert.equal(response.headers["set-cookie"], undefined);
  }
  await login("1", "FixturePassword2026!").expect(429);
  await login("teacher@example.test", "FixturePassword2026!").expect(200);
  now += 59_999;
  await login().expect(429);
  now++;
  await login("student@example.test", "FixturePassword2026!").expect(200);
  // A successful login starts a fresh budget instead of retaining its reservation.
  for (let index = 0; index < 5; index++) await login().expect(401);
  await login().expect(429);
});

test("the fifth attempt starts a full minute cooldown and blocked requests never extend it", async t => {
  const { login } = await loginFixture(t);
  const startedAt = Date.now();
  let now = startedAt;
  t.mock.method(Date, "now", () => now);
  for (let index = 0; index < 5; index++) {
    now = startedAt + index * 10_000;
    await login().expect(401);
  }
  now = startedAt + 60_000;
  await login("1", "FixturePassword2026!").expect(429);
  now = startedAt + 99_999;
  await login().expect(429);
  now++;
  await login("1", "FixturePassword2026!").expect(200);
  for (let index = 0; index < 4; index++) await login().expect(401);
  await login("student@example.test", "FixturePassword2026!").expect(200);
  for (let index = 0; index < 5; index++) await login().expect(401);
  await login().expect(429);
});

test("unknown identities share one bounded budget without locking registered accounts", async t => {
  const { login } = await loginFixture(t);
  for (let index = 0; index < 5; index++) await login(`unknown-${index}@example.test`).expect(401);
  await login("another-unknown@example.test").expect(429);
  await login("1", "FixturePassword2026!").expect(200);
});

test("new password rules do not lock out existing short passwords", async t => {
  const { app, login } = await loginFixture(t);
  const passwordHash = await hashPassword("7");
  await app.locals.store.mutate((data: Store["data"]) => {
    data.users.find(user => user.id === "student")!.passwordHash = passwordHash;
  });
  await login("1", "7").expect(200);
});
