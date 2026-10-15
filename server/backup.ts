import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SupabasePersistence } from "./supabase.js";
import { canonicalRollNumber } from "../shared/roster.js";
import { safeFilePath } from "./uploads.js";
import type { Database } from "./store.js";

export function validateBackup(value: unknown): Database {
  const data = value as Database;
  for (const name of ["users", "labs", "submissions", "activity", "sessions"] as const) {
    if (!Array.isArray(data?.[name]) || data[name].some(item => !item || typeof item.id !== "string") || new Set(data[name].map(item => item.id)).size !== data[name].length)
      throw new Error(`Invalid backup ${name} collection.`);
  }
  const emails = new Set<string>(), rolls = new Set<string>(), slots = new Set<string>();
  for (const user of data.users) {
    if (!["teacher", "student"].includes(user.role) || typeof user.passwordHash !== "string" || !user.passwordHash || typeof user.email !== "string" || emails.has(user.email.toLowerCase())) throw new Error("Invalid backup account.");
    emails.add(user.email.toLowerCase());
    if (user.role === "student") {
      const roll = canonicalRollNumber(user.rollNumber);
      if (!roll || rolls.has(roll)) throw new Error("Invalid backup roll number.");
      rolls.add(roll);
    }
  }
  for (const lab of data.labs) {
    if (!Array.isArray(lab.tasks) || new Set(lab.tasks.map(task => task.id)).size !== lab.tasks.length || lab.tasks.some(task => !Number.isFinite(task.maxMarks) || task.maxMarks <= 0)) throw new Error("Invalid backup lab tasks.");
  }
  for (const submission of data.submissions) {
    const task = data.labs.find(lab => lab.id === submission.labId)?.tasks.find(item => item.id === submission.taskId);
    const slot = JSON.stringify([submission.studentId, submission.labId, submission.taskId]);
    if (!task || !data.users.some(user => user.id === submission.studentId && user.role === "student") || slots.has(slot) || !Number.isSafeInteger(submission.revision) || submission.revision < 1 || !Array.isArray(submission.files) || (submission as { sourceOmitted?: boolean }).sourceOmitted)
      throw new Error("Invalid or incomplete backup submission.");
    slots.add(slot);
    for (const file of submission.files) { safeFilePath(file.path); if (typeof file.content !== "string") throw new Error("Missing backup source."); }
    for (const asset of submission.binaryAssets || []) { safeFilePath(asset.path); if (typeof asset.base64 !== "string" || Buffer.from(asset.base64, "base64").toString("base64") !== asset.base64) throw new Error("Invalid backup asset."); }
    if (submission.grade && (!Number.isFinite(submission.grade.marks) || submission.grade.marks < 0 || submission.grade.marks > task.maxMarks)) throw new Error("Invalid backup grade.");
  }
  return data;
}

export function encryptBackup(database: Database, key: Buffer) {
  if (key.length !== 32) throw new Error("The backup encryption key must contain 32 bytes.");
  const data = validateBackup({ ...database, sessions: [] });
  const metadata = { version: 1, createdAt: new Date().toISOString(), keyId: createHash("sha256").update(key).digest("hex").slice(0, 16) };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(JSON.stringify(metadata)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return JSON.stringify({ ...metadata, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}

export function decryptBackup(encrypted: string, key: Buffer): Database {
  try {
    const file = JSON.parse(encrypted);
    const { version, createdAt, keyId } = file;
    if (version !== 1 || key.length !== 32) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
    decipher.setAAD(Buffer.from(JSON.stringify({ version, createdAt, keyId })));
    decipher.setAuthTag(Buffer.from(file.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(file.ciphertext, "base64")), decipher.final()]);
    const database = validateBackup(JSON.parse(plaintext.toString("utf8")));
    if (database.sessions.length) throw new Error();
    return database;
  } catch { throw new Error("Backup verification failed: wrong key, damaged file or invalid classroom data."); }
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  const [command, filename, destination] = process.argv.slice(2);
  const privateDirectory = path.join(root, ".data");
  await mkdir(privateDirectory, { recursive: true });
  const keyFile = path.join(privateDirectory, "backup-key");
  let key: Buffer;
  if (process.env.LABTRACK_BACKUP_KEY) key = Buffer.from(process.env.LABTRACK_BACKUP_KEY, "base64");
  else {
    if (!existsSync(keyFile) && command === "backup") await writeFile(keyFile, randomBytes(32), { mode: 0o600, flag: "wx" });
    key = await readFile(keyFile);
  }
  if (key.length !== 32) throw new Error("Configure LABTRACK_BACKUP_KEY as a base64-encoded 32-byte key, or retain the private local backup-key file.");
  let database: Database;
  let output = filename;
  if (command === "backup") {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
      database = await new SupabasePersistence({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY }).load();
    else if (process.env.MONGODB_URI) throw new Error("For MongoDB, use a provider snapshot until a database-specific export is configured.");
    else database = JSON.parse(await readFile(path.join(process.env.LABTRACK_DATA_DIR || privateDirectory, "labtrack.json"), "utf8"));
    output ||= path.join(privateDirectory, "backups", `classroom-${new Date().toISOString().replaceAll(":", "-")}.enc.json`);
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    const encrypted = encryptBackup(database, key);
    decryptBackup(encrypted, key);
    await writeFile(output, encrypted, { mode: 0o600, flag: "wx" });
  } else {
    if (!filename || !["verify", "restore"].includes(command)) throw new Error("Use backup [output], verify <encrypted-file>, or restore <encrypted-file> <new-directory>.");
    database = decryptBackup(await readFile(filename, "utf8"), key);
    if (command === "restore") {
      if (!destination) throw new Error("Choose a new isolated restore directory.");
      await mkdir(path.dirname(path.resolve(destination)), { recursive: true });
      await mkdir(destination);
      output = path.join(path.resolve(destination), "labtrack.json");
      await writeFile(output, JSON.stringify(database), { mode: 0o600, flag: "wx" });
    }
  }
  console.log(JSON.stringify({ command, output: path.resolve(output!), verified: true, users: database.users.length, labs: database.labs.length, submissions: database.submissions.length, sessionsExcluded: true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("Backup/restore failed. Check the private configuration, file paths, key and database connection. Existing files were not overwritten.");
  process.exitCode = 1;
});
