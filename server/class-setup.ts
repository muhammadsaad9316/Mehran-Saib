import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashPassword, verifyPassword } from "./auth.js";
import { classRosterNames, initialLabs } from "./seed.js";
import { Store, type StoredUser } from "./store.js";
import type { Lab } from "../shared/types.js";

export interface ClassCredential {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  rollNumber?: string;
  password: string;
}

const root = fileURLToPath(new URL("../", import.meta.url));
const privateDirectory = path.join(root, ".data");
const credentialsPath = path.join(privateDirectory, "class-credentials.json");
const sheetPath = path.join(privateDirectory, "class-credentials.csv");
const environmentPath = path.join(root, ".env");

export function generateClassCredentials(
  teacherEmail = "teacher@labtrack.local",
  teacherName = "Mehran Sahib",
  teacherPassword = `LT-${randomBytes(18).toString("base64url")}`,
): ClassCredential[] {
  return [
    {
      id: randomUUID(),
      role: "teacher",
      name: teacherName,
      email: teacherEmail.toLowerCase(),
      password: teacherPassword,
    },
    ...classRosterNames.map((name, index) => ({
      id: randomUUID(),
      role: "student" as const,
      name,
      email: `roll${index + 1}@students.labtrack.local`,
      rollNumber: String(index + 1),
      password: `LT-${randomBytes(15).toString("base64url")}`,
    })),
  ];
}

function validateCredentials(credentials: ClassCredential[]) {
  const teachers = credentials.filter((item) => item.role === "teacher");
  const students = credentials.filter((item) => item.role === "student");
  if (
    credentials.length !== 42 ||
    teachers.length !== 1 ||
    students.length !== 41 ||
    new Set(credentials.map((item) => item.id)).size !== 42 ||
    new Set(credentials.map((item) => item.email)).size !== 42 ||
    credentials.some(
      (item) =>
        !item.id ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) ||
        item.password.length < 12 ||
        item.password.length > 256,
    ) ||
    students.some((item, index) => item.rollNumber !== String(index + 1))
  )
    throw new Error(
      "The private class credentials file is invalid; no accounts were changed.",
    );
}

async function classLabs(): Promise<Lab[]> {
  const labs = initialLabs()
    .slice(0, 2)
    .map((lab) => ({
      ...lab,
      published: false,
      description: lab.description.replace(
        "Demo deadlines and marks are illustrative.",
        "Review the deadline and marks before publishing.",
      ),
    }));
  const instructions = [
    {
      name: "Web Engineering.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    { name: "Web Engineering lab 2.pdf", contentType: "application/pdf" },
  ];
  for (const [index, document] of instructions.entries()) {
    labs[index].instructionFile = {
      ...document,
      content: (
        await readFile(new URL(`./fixtures/${document.name}`, import.meta.url))
      ).toString("base64"),
    };
  }
  return labs;
}

export async function provisionClass(
  store: Store,
  credentials: ClassCredential[],
) {
  validateCredentials(credentials);
  const teacher = credentials.find((item) => item.role === "teacher")!;
  if (
    store.data.users.some(
      (item) => item.role === "teacher" && item.email !== teacher.email,
    )
  )
    throw new Error(
      "This database already has another teacher. No accounts were changed.",
    );
  const additions: StoredUser[] = [];
  for (const credential of credentials) {
    const existing = store.data.users.find(
      (item) =>
        item.email === credential.email ||
        (credential.role === "student" &&
          item.role === "student" &&
          item.rollNumber === credential.rollNumber),
    );
    if (existing) {
      if (
        existing.role !== credential.role ||
        existing.email !== credential.email ||
        !(await verifyPassword(credential.password, existing.passwordHash))
      )
        throw new Error(
          "An existing account has different credentials. No passwords were reset.",
        );
      continue;
    }
    const { password, ...user } = credential;
    additions.push({ ...user, passwordHash: await hashPassword(password) });
  }
  if (!additions.length) return 0;
  const labs = await classLabs();
  await store.mutate((data) => {
    // Re-check identity conflicts inside the commit; existing work is never replaced.
    if (
      additions.some((candidate) =>
        data.users.some(
          (item) =>
            item.id === candidate.id ||
            item.email === candidate.email ||
            (candidate.role === "student" &&
              item.role === "student" &&
              item.rollNumber === candidate.rollNumber),
        ),
      )
    )
      throw new Error(
        "An account was added during setup. Refresh before provisioning again.",
      );
    data.users.push(...additions);
    if (!data.labs.length) data.labs = labs;
  });
  return additions.length;
}

async function prepareCredentials() {
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
  await mkdir(privateDirectory, { recursive: true });
  let credentials: ClassCredential[];
  if (existsSync(credentialsPath)) {
    credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
    validateCredentials(credentials);
  } else {
    credentials = generateClassCredentials(
      process.env.ADMIN_EMAIL || undefined,
      process.env.ADMIN_NAME || undefined,
      process.env.ADMIN_PASSWORD || undefined,
    );
    validateCredentials(credentials);
    await writeFile(credentialsPath, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  }
  const teacher = credentials.find((item) => item.role === "teacher")!;
  let environment = existsSync(environmentPath)
    ? await readFile(environmentPath, "utf8")
    : "";
  for (const [key, value] of [
    ["ADMIN_EMAIL", teacher.email],
    ["ADMIN_PASSWORD", teacher.password],
  ]) {
    if (new RegExp(`^${key}=`, "m").test(environment))
      environment = environment.replace(
        new RegExp(`^${key}=.*$`, "m"),
        `${key}=${JSON.stringify(value)}`,
      );
    else environment += `\n${key}=${JSON.stringify(value)}\n`;
  }
  await writeFile(environmentPath, environment, { mode: 0o600 });
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [
    ["Role", "R. No", "Name", "Login", "Password"],
    ...credentials.map((item) => [
      item.role,
      item.rollNumber || "",
      item.name,
      item.rollNumber || item.email,
      item.password,
    ]),
  ];
  await writeFile(
    sheetPath,
    "\uFEFF" +
      lines.map((line) => line.map(cell).join(",")).join("\r\n") +
      "\r\n",
    { mode: 0o600 },
  );
  console.log(
    "Private credentials prepared: .data/class-credentials.csv (1 teacher, 41 students).",
  );
  return credentials;
}

async function run() {
  const credentials = await prepareCredentials();
  if (process.argv.includes("--prepare")) return;
  if (process.argv.includes("--export-plan")) {
    const users: StoredUser[] = [];
    for (const { password, ...user } of credentials)
      users.push({ ...user, passwordHash: await hashPassword(password) });
    const labs = await classLabs();
    const upserts = [
      ...users.map((document, position) => ({
        collection: "users",
        id: document.id,
        document,
        position,
      })),
      ...labs.map((document, position) => ({
        collection: "labs",
        id: document.id,
        document,
        position,
      })),
    ];
    await writeFile(
      path.join(privateDirectory, "class-bootstrap-plan.json"),
      JSON.stringify(upserts),
      { mode: 0o600 },
    );
    console.log(
      "Private bootstrap plan prepared with password hashes; no plaintext passwords are in the database plan.",
    );
    return;
  }
  if (
    process.env.SUPABASE_URL !== "https://akudfcgksdjlipxxwfdu.supabase.co" ||
    !process.env.SUPABASE_SECRET_KEY
  )
    throw new Error(
      "Add the LabTrack SUPABASE_SECRET_KEY to the local .env before provisioning.",
    );
  const store = new Store(privateDirectory, undefined, {
    url: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  });
  try {
    await store.open();
    const added = await provisionClass(store, credentials);
    console.log(
      `Supabase class setup complete: ${added} accounts added. No sample submissions or grades were imported.`,
    );
  } finally {
    await store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
