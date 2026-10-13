import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { generateClassCredentials, provisionClass } from "./class-setup.js";
import { Store } from "./store.js";
import { verifyPassword } from "./auth.js";

test("class setup creates 1 teacher and 41 hashed accounts, retains work and refuses password resets", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "labtrack-class-test-"),
  );
  const store = new Store(directory);
  t.after(async () => {
    await store.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("labtrack-class-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  await store.open();
  const credentials = generateClassCredentials();
  assert.equal(await provisionClass(store, credentials), 42);
  assert.equal(
    store.data.users.filter((item) => item.role === "student").length,
    41,
  );
  assert.deepEqual(
    store.data.users
      .filter((item) => item.role === "student")
      .map((item) => item.rollNumber),
    Array.from({ length: 41 }, (_, index) => String(index + 1)),
  );
  assert.equal(store.data.labs.length, 2);
  assert.ok(store.data.labs.every((lab) => !lab.published));
  assert.equal(store.data.submissions.length, 0);
  assert.ok(store.data.users.every((item) => !("password" in item)));
  const student = store.data.users.find((item) => item.rollNumber === "13")!;
  assert.equal(student.name, "Muhammad Saad");
  assert.ok(
    await verifyPassword(
      credentials.find((item) => item.rollNumber === "13")!.password,
      student.passwordHash,
    ),
  );
  await store.mutate((data) => {
    data.activity.push({
      id: "keep",
      type: "grade",
      text: "Existing teacher work",
      time: new Date().toISOString(),
    });
    data.users.find((item) => item.rollNumber === "16")!.name =
      "Teacher-supplied name";
  });
  const before = JSON.stringify(store.data);
  assert.equal(await provisionClass(store, credentials), 0);
  assert.equal(JSON.stringify(store.data), before);
  const changed = structuredClone(credentials);
  changed[0].password = "Different-password-request";
  await assert.rejects(
    provisionClass(store, changed),
    /No passwords were reset/,
  );
  assert.equal(JSON.stringify(store.data), before);
});
