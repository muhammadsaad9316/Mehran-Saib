import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptBackup, decryptBackup } from "./backup.js";
import { emptyDatabase } from "./store.js";

test("encrypted backups restore all project bytes and grades, exclude sessions and reject damage or wrong keys", () => {
  const data = emptyDatabase();
  data.users = [{ id: "teacher", name: "T", email: "t@example.test", role: "teacher", passwordHash: "private-fixture-hash" },
    { id: "student", name: "S", email: "s@example.test", role: "student", rollNumber: "1", passwordHash: "fixture-hash" }];
  data.labs = [{ id: "lab", title: "Lab", description: "", dueDate: "", published: true, totalMarks: 10, tasks: [{ id: "task", title: "Task", description: "", maxMarks: 10, requirements: [] }] }];
  data.submissions = [{ id: "submission", studentId: "student", labId: "lab", taskId: "task", files: [{ path: "index.html", content: "Private fixture source" }], binaryAssets: [{ path: "image.png", mimeType: "image/png", base64: "aW1hZ2U=" }], link: null, revision: 1, submittedAt: new Date().toISOString(), status: "graded", late: false, grade: { marks: 0, feedback: "", published: false, gradedAt: new Date().toISOString() } }];
  data.sessions = [{ id: "private-session", userId: "teacher", expiresAt: Date.now() + 10000 }];
  const key = randomBytes(32);
  const encrypted = encryptBackup(data, key);
  assert.ok(!encrypted.includes("Private fixture source") && !encrypted.includes("private-fixture-hash"));
  assert.deepEqual(decryptBackup(encrypted, key), { ...data, sessions: [] });
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)), /verification failed/);
  const damaged = JSON.parse(encrypted); damaged.createdAt = "tampered";
  assert.throws(() => decryptBackup(JSON.stringify(damaged), key), /verification failed/);
  assert.throws(() => encryptBackup({ ...data, submissions: [{ ...data.submissions[0], taskId: "missing" }] }, key), /Invalid/);
});
