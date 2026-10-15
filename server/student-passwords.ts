import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashPassword, verifyPassword } from "./auth.js";
import { canonicalRollNumber } from "../shared/roster.js";
import { Store, type StoredUser } from "./store.js";

export interface TemporaryCredential {
  id: string;
  rollNumber: string;
  password: string;
  previousPasswordHash: string;
  passwordHash: string;
  authVersion: string;
}
function roster(users: StoredUser[]) {
  const students = users.filter(user => user.role === "student").sort((a, b) => Number(a.rollNumber) - Number(b.rollNumber));
  if (students.length !== 41 || students.some((user, index) => canonicalRollNumber(user.rollNumber) !== String(index + 1)))
    throw new Error("Expected exactly one existing student for each roll number 1–41.");
  return students;
}
export async function prepareStudentPasswords(users: StoredUser[]): Promise<TemporaryCredential[]> {
  const used = new Set<string>();
  return Promise.all(roster(users).map(async user => {
    let password: string;
    do { password = String(randomInt(10000000, 100000000)); } while (used.has(password));
    used.add(password);
    return { id: user.id, rollNumber: user.rollNumber!, password, previousPasswordHash: user.passwordHash,
      passwordHash: `setup$${await hashPassword(password)}`, authVersion: randomUUID() };
  }));
}
export async function applyStudentPasswords(store: Store, plan: TemporaryCredential[]) {
  if (!Array.isArray(plan) || plan.length !== 41 || new Set(plan.map(item => item.id)).size !== 41 ||
      new Set(plan.map(item => item.password)).size !== 41 || plan.some(item => !/^\d{8}$/.test(item.password) ||
        !item.passwordHash || !item.previousPasswordHash || !item.authVersion)) throw new Error("Invalid private credential plan.");
  if (!(await Promise.all(plan.map(item => verifyPassword(item.password, item.passwordHash)))).every(Boolean))
    throw new Error("The credential sheet does not match its password hashes.");
  return store.mutate(data => {
    const students = roster(data.users);
    const entries = students.map(user => ({ user, entry: plan.find(item => item.id === user.id && item.rollNumber === user.rollNumber) }));
    if (entries.some(item => !item.entry)) throw new Error("The roster changed. No passwords were changed.");
    if (entries.every(({ user, entry }) => user.passwordHash === entry!.passwordHash && user.authVersion === entry!.authVersion && user.mustChangePassword)) return false;
    if (entries.some(({ user, entry }) => user.passwordHash !== entry!.previousPasswordHash))
      throw new Error("An account password changed after preparation. Refusing to overwrite it.");
    for (const { user, entry } of entries) {
      user.passwordHash = entry!.passwordHash;
      user.authVersion = entry!.authVersion;
      user.mustChangePassword = true;
    }
    const ids = new Set(students.map(user => user.id));
    data.sessions = data.sessions.filter(session => !ids.has(session.userId));
    return true;
  });
}
async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  if (process.env.MONGODB_URI) throw new Error("Use the supported classroom Supabase or local JSON configuration.");
  if (Boolean(process.env.SUPABASE_URL) !== Boolean(process.env.SUPABASE_SECRET_KEY)) throw new Error("Incomplete Supabase configuration.");
  const [command] = process.argv.slice(2);
  if (!["prepare", "apply"].includes(command)) throw new Error("Use prepare or apply.");
  const directory = path.join(root, ".data");
  const planPath = path.join(directory, "student-first-login-plan.json");
  const sheetPath = path.join(directory, "student-temporary-passwords.csv");
  const store = new Store(process.env.LABTRACK_DATA_DIR || directory, undefined,
    process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? {
      url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY, compact: true, cache: true,
    } : undefined);
  await store.open();
  try {
    await mkdir(directory, { recursive: true });
    const plan: TemporaryCredential[] = existsSync(planPath) ? JSON.parse(await readFile(planPath, "utf8")) : await prepareStudentPasswords(store.data.users);
    if (!existsSync(planPath)) await writeFile(planPath, JSON.stringify(plan), { flag: "wx", mode: 0o600 });
    const sheet = "Roll number,Temporary password\r\n" + plan.map(item => `${item.rollNumber},${item.password}`).join("\r\n") + "\r\n";
    if (existsSync(sheetPath)) {
      if (await readFile(sheetPath, "utf8") !== sheet) throw new Error("The existing credential sheet differs. It was not overwritten.");
    } else await writeFile(sheetPath, sheet, { flag: "wx", mode: 0o600 });
    const changed = command === "apply" ? await applyStudentPasswords(store, plan) : false;
    console.log(JSON.stringify({ command, students: plan.length, changed, privateSheet: sheetPath, passwordsLogged: false }));
  } finally { await store.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("Student password setup failed. Check the private configuration, plan and roster. No private values were logged.");
  process.exitCode = 1;
});
