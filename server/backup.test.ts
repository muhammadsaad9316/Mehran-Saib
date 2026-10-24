import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encryptBackup, decryptBackup, runBackup } from "./backup.js";
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

test("backup rejects incomplete, conflicting or invalid providers before local fallback or key creation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-backup-config-"));
  try {
    const source = path.join(directory, "source");
    await mkdir(source);
    const json = JSON.stringify(emptyDatabase());
    await writeFile(path.join(source, "labtrack.json"), json);
    const cases: [NodeJS.ProcessEnv, RegExp][] = [
      [{ SUPABASE_URL: "https://fixture.supabase.co" }, /Set both/],
      [{ SUPABASE_SECRET_KEY: "sb_secret_fixture" }, /Set both/],
      [{ SUPABASE_URL: "https://fixture.supabase.co", MONGODB_URI: "mongodb://fixture" }, /Set both/],
      [{ SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_fixture", MONGODB_URI: "mongodb://fixture" }, /one database provider/],
      [{ MONGODB_URI: "mongodb://fixture" }, /provider snapshot/],
      [{ SUPABASE_URL: "http://fixture.invalid", SUPABASE_SECRET_KEY: "sb_secret_fixture" }, /HTTPS project origin/],
      [{ SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "publishable-fixture" }, /server-only Supabase secret key/],
    ];
    for (const [index, [config, message]] of cases.entries()) {
      const root = path.join(directory, `rejected-${index}`);
      await assert.rejects(runBackup(["backup"], root, { ...config, LABTRACK_DATA_DIR: source, LABTRACK_BACKUP_KEY: "invalid" }), message);
      assert.equal(existsSync(root), false, "invalid provider must not create private directories, keys or outputs");
    }
    assert.equal(await readFile(path.join(source, "labtrack.json"), "utf8"), json);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("JSON backup, verification and isolated restore remain independent of hosted source settings", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-backup-json-"));
  try {
    const source = path.join(directory, "source");
    await mkdir(source);
    const database = emptyDatabase();
    await writeFile(path.join(source, "labtrack.json"), JSON.stringify(database));
    const saved = await runBackup(["backup"], directory, { LABTRACK_DATA_DIR: source });
    assert.equal(saved.verified, true);
    const independentSource = { SUPABASE_URL: "incomplete-source", MONGODB_URI: "mongodb://fixture" };
    const verified = await runBackup(["verify", saved.output], directory, independentSource);
    assert.equal(verified.verified, true);
    const restored = await runBackup(["restore", saved.output, path.join(directory, "restored")], directory, independentSource);
    assert.deepEqual(JSON.parse(await readFile(restored.output, "utf8")), database);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("complete Supabase configuration reads only the selected provider", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-backup-supabase-"));
  const requests: string[] = [];
  const database = emptyDatabase();
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    requests.push(String(url));
    return Response.json({ revision: 1, data: database });
  });
  try {
    const key = randomBytes(32);
    const saved = await runBackup(["backup"], directory, {
      SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_fixture",
      LABTRACK_DATA_DIR: path.join(directory, "nonexistent-source"), LABTRACK_BACKUP_KEY: key.toString("base64"),
    });
    assert.deepEqual(requests, ["https://fixture.supabase.co/rest/v1/rpc/labtrack_read"]);
    assert.deepEqual(decryptBackup(await readFile(saved.output, "utf8"), key), database);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
