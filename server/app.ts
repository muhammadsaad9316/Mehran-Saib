import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  Lab,
  Requirement,
  Submission,
  Task,
  User,
} from "../shared/types.js";
import { analyzeSubmission, analyzeTaskSubmissions } from "./analysis.js";
import { evidenceVersion } from "../shared/evidence.js";
import { logFailure } from "./diagnostics.js";
import { stableJson } from "./serialization.js";
import { SupabaseConflictError, SupabaseUnavailableError, SupabaseWriteUnconfirmedError } from "./supabase.js";
import {
  canonicalRollNumber,
  renumberLegacyStudents,
} from "../shared/roster.js";
import {
  buildMarksSheet,
  buildPrintMarksSheet,
  marksSheetCsv,
  marksSheetHtml,
  marksSheetSelectionHtml,
} from "./marks-sheet.js";
import { marksSheetXlsx } from "./marks-sheet-xlsx.js";
import { analyzeInstructions } from "./instructions.js";
import { hashPassword, sessionToken, verifyPassword } from "./auth.js";
import { demoDatabase, migrateDemoRoster } from "./seed.js";
import {
  Store,
  type Database,
  type StoredSubmission,
  type StoredUser,
} from "./store.js";
import {
  HttpError,
  MAX_UPLOAD_BYTES,
  parseUploads,
  safeFilePath,
} from "./uploads.js";

const COOKIE_NAME = "labtrack_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_SETUP_DURATION = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_COOLDOWN_DURATION = 60 * 1000;
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const upload = multer({
  storage: multer.memoryStorage(),
  preservePath: true,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 60,
    fields: 4,
    fieldSize: 2000,
    parts: 65,
  },
});

export interface AppOptions {
  sessionCookieName?: string;
  dataDir?: string;
  mongoUri?: string;
  demo?: boolean;
  clientOrigin?: string;
  production?: boolean;
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  serverless?: boolean;
}

function text(
  value: unknown,
  label: string,
  maximum: number,
  minimum = 1,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < minimum ||
    value.length > maximum
  )
    throw new HttpError(
      400,
      `${label} must contain ${minimum}–${maximum} characters.`,
    );
  return value.trim();
}

function number(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    throw new HttpError(
      400,
      `${label} must be a number from ${minimum} to ${maximum}.`,
    );
  return value;
}

function passwordValue(value: unknown, minimum = 1): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > 256 ||
    !value.trim()
  )
    throw new HttpError(
      400,
      `Password must contain ${minimum}–256 characters.`,
    );
  return value;
}

function publicUser(user: StoredUser): User {
  const { passwordHash: _, authVersion: __, ...safe } = user;
  return safe;
}

function publicSubmission(
  submission: StoredSubmission,
  teacher: boolean,
  includeSource = true,
): Submission {
  const { binaryAssets: _, ...safe } = submission;
  if (!teacher && safe.grade && !safe.grade.published) {
    delete safe.grade;
    safe.status = "submitted";
  }
  if (!includeSource) {
    safe.files = safe.files.map(file => ({ path: file.path, content: "" }));
    safe.sourceOmitted = true;
  }
  return safe;
}

function addActivity(
  data: Database,
  type: "submission" | "grade" | "lab",
  message: string,
) {
  data.activity.unshift({
    id: randomUUID(),
    type,
    text: message,
    time: new Date().toISOString(),
  });
  data.activity = data.activity.slice(0, 100);
}

function validLink(value: unknown): string | null {
  if (value == null || value === "") return null;
  const input = text(value, "Project link", 1000);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, "Enter a full HTTP or HTTPS project URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new HttpError(
      400,
      "Enter an HTTP or HTTPS URL without embedded credentials.",
    );
  return url.toString();
}

function validateLab(body: unknown, old?: Lab): Lab {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Lab details are required.");
  const input = body as Record<string, unknown>;
  const title = text(input.title, "Lab title", 120);
  const description = text(input.description ?? "", "Lab description", 8000, 0);
  const dueDate = text(input.dueDate ?? "", "Due date", 50, 0);
  if (dueDate && !Number.isFinite(Date.parse(dueDate)))
    throw new HttpError(400, "Enter a valid deadline or leave it empty.");
  if (typeof input.published !== "boolean")
    throw new HttpError(400, "Published must be true or false.");
  if (
    !Array.isArray(input.tasks) ||
    input.tasks.length < 1 ||
    input.tasks.length > 20
  )
    throw new HttpError(400, "A lab needs 1–20 tasks.");
  const taskIds = new Set<string>();
  const tasks: Task[] = input.tasks.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new HttpError(400, "Invalid task details.");
    const task = item as Record<string, unknown>;
    const id =
      typeof task.id === "string" && task.id
        ? text(task.id, "Task ID", 100)
        : randomUUID();
    if (taskIds.has(id)) throw new HttpError(400, "Task IDs must be unique.");
    taskIds.add(id);
    if (!Array.isArray(task.requirements) || task.requirements.length > 80)
      throw new HttpError(400, "A task may have up to 80 requirements.");
    const ruleIds = new Set<string>();
    const requirements: Requirement[] = task.requirements.map(
      (item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          throw new HttpError(400, "Invalid requirement.");
        const rule = item as Record<string, unknown>;
        if (!["tag", "attribute", "text", "file"].includes(String(rule.type)))
          throw new HttpError(400, "Unknown requirement type.");
        const ruleId =
          typeof rule.id === "string" && rule.id
            ? text(rule.id, "Requirement ID", 100)
            : randomUUID();
        if (ruleIds.has(ruleId))
          throw new HttpError(
            400,
            "Requirement IDs must be unique within each task.",
          );
        ruleIds.add(ruleId);
        return {
          id: ruleId,
          label: text(rule.label, "Requirement label", 200),
          type: rule.type as Requirement["type"],
          value: text(rule.value, "Requirement value", 500),
          ...(rule.type === "attribute"
            ? { attribute: text(rule.attribute, "Attribute name", 100) }
            : {}),
        };
      },
    );
    return {
      id,
      title: text(task.title, "Task title", 120),
      description: text(task.description ?? "", "Task description", 8000, 0),
      maxMarks: number(task.maxMarks, "Maximum marks", 0.5, 1000),
      requirements,
    };
  });
  let instructionFile: Lab["instructionFile"];
  if (input.instructionFile != null) {
    const attachment = input.instructionFile as Record<string, unknown>;
    const name = text(attachment.name, "Instruction filename", 160);
    if (!/\.(pdf|docx?|txt|md)$/i.test(name) || /[\\/\x00-\x1f]/.test(name))
      throw new HttpError(
        400,
        "Instructions must be a PDF, Word or text document.",
      );
    const content = text(
      attachment.content,
      "Instruction file",
      7 * 1024 * 1024,
    );
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        content,
      ) ||
      Buffer.from(content, "base64").length > 3 * 1024 * 1024
    )
      throw new HttpError(
        400,
        "Instruction file must be valid base64 and no larger than 3 MB.",
      );
    const acceptedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "application/octet-stream",
    ];
    const contentType =
      typeof attachment.contentType === "string" && attachment.contentType
        ? attachment.contentType
        : "application/octet-stream";
    if (!acceptedTypes.includes(contentType))
      throw new HttpError(400, "Unsupported instruction document type.");
    instructionFile = { name, content, contentType };
  }
  return {
    id: old?.id || randomUUID(),
    revision: (old?.revision || 0) + 1,
    title,
    description,
    dueDate: dueDate ? new Date(dueDate).toISOString() : "",
    published: input.published,
    tasks,
    totalMarks: tasks.reduce((sum, task) => sum + task.maxMarks, 0),
    ...(instructionFile ? { instructionFile } : {}),
  };
}

export async function createApp(options: AppOptions = {}) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const demo =
    options.demo ?? (!production && process.env.LABTRACK_DEMO !== "false");
  if (production && demo)
    throw new Error("Demo access must be disabled in production.");
  const supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
  const supabaseKey = options.supabaseKey ?? process.env.SUPABASE_SECRET_KEY;
  const mongoUri = options.mongoUri ?? process.env.MONGODB_URI;
  if (!production && supabaseUrl && !supabaseKey) {
    const setup = express();
    setup.disable("x-powered-by");
    setup.use("/api", (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(503).json({
        error:
          "The local Supabase key is missing. Add SUPABASE_SECRET_KEY to .env and save it, then try again.",
      });
    });
    return setup;
  }
  if (Boolean(supabaseUrl) !== Boolean(supabaseKey))
    throw new Error(
      "Set both SUPABASE_URL and the server-only SUPABASE_SECRET_KEY.",
    );
  if (
    production &&
    !supabaseUrl &&
    !mongoUri &&
    !options.dataDir &&
    !process.env.LABTRACK_DATA_DIR
  )
    throw new Error(
      "Production requires a hosted database or an explicitly persistent LABTRACK_DATA_DIR.",
    );
  const store = new Store(
    options.dataDir ||
      process.env.LABTRACK_DATA_DIR ||
      path.join(rootDir, ".data"),
    mongoUri,
    supabaseUrl && supabaseKey
      ? { url: supabaseUrl, secretKey: supabaseKey, cache: true, compact: true }
      : undefined,
    options.serverless ? 8 : 1,
  );
  // Bootstrap below can write; only the initial read is safe to retry.
  await store.open(!options.serverless);
  if (
    production &&
    store.data.users.some(
      (user) =>
        user.id === "teacher-1" && user.email === "teacher@labtrack.edu",
    )
  ) {
    await store.close();
    throw new Error(
      "Production cannot use the demo database. Choose a fresh LABTRACK_DATA_DIR or MongoDB database and initialize a real teacher account.",
    );
  }
  if (store.data.users.length === 0) {
    if (demo) {
      const seed = await demoDatabase();
      await store.mutate((data) => Object.assign(data, seed));
    } else {
      const email = options.adminEmail ?? process.env.ADMIN_EMAIL;
      const password = options.adminPassword ?? process.env.ADMIN_PASSWORD;
      if (!email || !password) {
        await store.close();
        throw new Error(
          "Set ADMIN_EMAIL and ADMIN_PASSWORD to initialize a teacher account.",
        );
      }
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < 12 ||
        password.length > 256 ||
        !password.trim()
      ) {
        await store.close();
        throw new Error(
          "Admin email must be valid and password must be 12–256 characters.",
        );
      }
      const passwordHash = await hashPassword(password);
      await store.mutate((data) => {
        if (data.users.length) return;
        data.users.push({
          id: randomUUID(),
          name: options.adminName || process.env.ADMIN_NAME || "Teacher",
          email: email.toLowerCase(),
          role: "teacher",
          passwordHash,
        });
      });
    }
  }
  const students = store.data.users.filter((user) => user.role === "student");
  if (
    students.some(
      (user) => canonicalRollNumber(user.rollNumber) !== user.rollNumber,
    ) ||
    (demo && students.length < 41)
  ) {
    const seed =
      demo && students.length < 41 ? await demoDatabase() : undefined;
    await store.mutate((data) => {
      data.users = renumberLegacyStudents(data.users);
      if (seed) {
        for (const candidate of seed.users.filter(
          (user) => user.role === "student",
        )) {
          if (
            data.users.some(
              (user) =>
                user.rollNumber === candidate.rollNumber ||
                user.id === candidate.id ||
                user.email === candidate.email,
            )
          )
            continue;
          data.users.push(candidate);
        }
      }
    });
  }
  if (demo && migrateDemoRoster(store.data.users) !== store.data.users) {
    await store.mutate((data) => {
      data.users = migrateDemoRoster(data.users);
    });
  }
  const app = express();
  if (options.serverless) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.locals.store = store;
  app.locals.demo = demo;
  if (options.serverless) {
    // Chunk JSON responses so a class roster with project files can be streamed.
    app.use((_req, res, next) => {
      res.json = (body: unknown) => {
        const json = Buffer.from(JSON.stringify(body));
        res.type("json");
        for (let offset = 0; offset < json.length; offset += 64 * 1024)
          res.write(json.subarray(offset, offset + 64 * 1024));
        res.end();
        return res;
      };
      next();
    });
  }
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "8mb" }));
  app.use(cookieParser());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", async (req, res, next) => {
    const currentToken = req.cookies[options.sessionCookieName ?? COOKIE_NAME];
    if (!options.serverless && ((typeof currentToken === "string" && /^(?:setup_)?[a-f0-9]{64}$/.test(currentToken)) || req.path === "/auth/login")) await store.refresh();
    else await store.ensureFresh();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const trustedOrigin = options.clientOrigin || process.env.CLIENT_ORIGIN;
      const currentOrigin = `${req.protocol}://${req.get("host")}`;
      const developmentOrigin =
        !production &&
        ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress || "",
        ) &&
        /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):5173$/.test(origin || "");
      if (
        req.get("sec-fetch-site") === "cross-site" ||
        (origin &&
          origin !== currentOrigin &&
          origin !== trustedOrigin &&
          !developmentOrigin)
      )
        return next(new HttpError(403, "Request origin is not allowed."));
    }
    const token = req.cookies[options.sessionCookieName ?? COOKIE_NAME];
    const session =
      typeof token === "string" &&
      store.data.sessions.find(
        (item) => item.id === token && item.expiresAt > Date.now(),
      );
    res.locals.user = session
      ? store.data.users.find((user) => user.id === session.userId && user.authVersion === session.authVersion)
      : undefined;
    if (res.locals.user?.mustChangePassword &&
        !["/state", "/auth/password", "/auth/logout", "/auth/login"].includes(req.path))
      return next(new HttpError(403, "Create your own password before opening your workspace."));
    next();
  });

  const actor = (res: Response, role?: "teacher" | "student"): StoredUser => {
    const user = res.locals.user as StoredUser | undefined;
    if (!user) throw new HttpError(401, "Sign in to continue.");
    if (role && user.role !== role)
      throw new HttpError(403, "You do not have access to this action.");
    return user;
  };
  const accessibleSubmission = (
    id: string,
    res: Response,
  ): StoredSubmission => {
    const user = actor(res);
    const submission = store.data.submissions.find((item) => item.id === id);
    if (
      !submission ||
      (user.role === "student" &&
        (submission.studentId !== user.id ||
          !store.data.labs.some((lab) => lab.id === submission.labId && lab.published)))
    )
      throw new HttpError(404, "Submission not found.");
    return submission;
  };
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: production,
    path: "/",
    maxAge: SESSION_DURATION,
  };
  async function signIn(user: StoredUser, res: Response) {
    const token = (user.mustChangePassword ? "setup_" : "") + sessionToken();
    const duration = user.mustChangePassword ? PASSWORD_SETUP_DURATION : SESSION_DURATION;
    await store.mutate((data) => {
      const current = data.users.find(item => item.id === user.id);
      if (!current || current.passwordHash !== user.passwordHash || current.authVersion !== user.authVersion)
        throw new HttpError(401, "Your login changed. Sign in again with your current password.");
      const own = data.sessions
        .filter((item) => item.userId === user.id)
        .slice(-9)
        .map((item) => item.id);
      data.sessions = data.sessions.filter(
        (item) =>
          item.expiresAt > Date.now() &&
          (item.userId !== user.id || own.includes(item.id)),
      );
      data.sessions.push({
        id: token,
        userId: user.id,
        expiresAt: Date.now() + duration,
        ...(user.authVersion ? { authVersion: user.authVersion } : {}),
      });
    }, user.id);
    res.cookie(options.sessionCookieName ?? COOKIE_NAME, token, { ...cookieOptions, maxAge: duration });
    res.json(publicUser(user));
  }

  app.get("/api/ready", async (_req, res) => {
    actor(res, "teacher");
    try { await store.ready(); res.json({ ok: true }); }
    catch (error) {
      logFailure(error, "readiness", res.locals.requestId);
      res.status(503).json({ error: "The database is temporarily unavailable.", requestId: res.locals.requestId });
    }
  });
  app.get("/api/state", (_req, res) => {
    const user = res.locals.user as StoredUser | undefined;
    if (user?.mustChangePassword) return res.json({ user: publicUser(user), demo, students: [], labs: [], submissions: [], activity: [] });
    const teacher = user?.role === "teacher";
    const state: AppState = {
      user: user ? publicUser(user) : null,
      demo,
      students: user
        ? store.data.users
            .filter(
              (item) =>
                item.role === "student" && (teacher || item.id === user.id),
            )
            .map(publicUser)
        : [],
      labs: user
        ? store.data.labs.filter((lab) => teacher || lab.published)
        : [],
      submissions: user
        ? store.data.submissions
            .filter(
              (item) =>
                teacher ||
                (item.studentId === user.id &&
                  store.data.labs.some(
                    (lab) => lab.id === item.labId && lab.published,
                  )),
            )
            .map((item) => publicSubmission(item, teacher, false))
        : [],
      activity: teacher ? store.data.activity : [],
    };
    res.json(state);
  });

  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/auth/login", async (req, res) => {
    const email = text(
      req.body?.email,
      "Email or roll number",
      254,
    ).toLowerCase();
    const rollNumber = canonicalRollNumber(email);
    const user = store.data.users.find((item) =>
      rollNumber
        ? item.role === "student" && item.rollNumber === rollNumber
        : item.email === email,
    );
    const password = passwordValue(req.body?.password);
    // Account aliases share a budget; unknown identities cannot create unbounded buckets.
    const sharedKey = createHash("sha256").update(user?.id || "unregistered-account").digest("hex");
    let allowed: boolean;
    if (options.serverless) {
      allowed = await store.loginAttempt(sharedKey);
    } else {
      const now = Date.now();
      const previous = loginAttempts.get(sharedKey);
      const attempt = previous && previous.resetAt > now
        ? previous : { count: 0, resetAt: now + LOGIN_COOLDOWN_DURATION };
      allowed = attempt.count < LOGIN_ATTEMPT_LIMIT;
      if (allowed) {
        // Reserve before password verification yields so parallel guesses cannot bypass the limit.
        attempt.count++;
        if (attempt.count === LOGIN_ATTEMPT_LIMIT) attempt.resetAt = now + LOGIN_COOLDOWN_DURATION;
        loginAttempts.set(sharedKey, attempt);
      }
    }
    if (!allowed) {
      res.setHeader("Retry-After", "60");
      throw new HttpError(429, "Too many login attempts. Try again in one minute.");
    }
    const valid = user && (await verifyPassword(password, user.passwordHash));
    if (!valid) throw new HttpError(401, "Email, roll number or password is incorrect.");
    loginAttempts.delete(sharedKey);
    if (options.serverless) await store.loginAttempt(sharedKey, true);
    await signIn(user, res);
  });
  app.post("/api/auth/password", async (req, res) => {
    const user = actor(res, "student");
    if (!user.mustChangePassword) throw new HttpError(400, "Your personal password is already set.");
    const password = passwordValue(req.body?.newPassword, 6);
    if (await verifyPassword(password, user.passwordHash)) throw new HttpError(400, "Choose a new personal password.");
    const passwordHash = await hashPassword(password);
    const authVersion = randomUUID();
    const token = sessionToken();
    const currentToken = req.cookies[options.sessionCookieName ?? COOKIE_NAME];
    const result = await store.mutate(data => {
      const current = data.users.find(item => item.id === user.id);
      const session = data.sessions.find(item => item.id === currentToken && item.userId === user.id && item.expiresAt > Date.now());
      if (!current || !current.mustChangePassword || current.passwordHash !== user.passwordHash ||
          current.authVersion !== user.authVersion || !session || session.authVersion !== current.authVersion)
        throw new HttpError(409, "Your login changed. Sign in again before setting your password.");
      current.passwordHash = passwordHash;
      current.authVersion = authVersion;
      current.mustChangePassword = false;
      // Versions revoke older sessions without rewriting classmates' session positions.
      data.sessions.push({ id: token, userId: user.id, expiresAt: Date.now() + SESSION_DURATION, authVersion });
      return current;
    }, user.id);
    res.cookie(options.sessionCookieName ?? COOKIE_NAME, token, cookieOptions);
    res.json(publicUser(result));
  });
  app.post("/api/auth/demo", async (req, res) => {
    const localAddress = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress || "",
    );
    if (
      !demo ||
      !localAddress ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(req.hostname)
    )
      throw new HttpError(
        403,
        "Demo access is available only on the local development server.",
      );
    if (req.body?.role !== "teacher" && req.body?.role !== "student")
      throw new HttpError(400, "Choose teacher or student.");
    const user = store.data.users.find((item) => item.role === req.body.role);
    if (!user) throw new HttpError(404, "Demo account not found.");
    await signIn(user, res);
  });
  app.post("/api/auth/logout", async (req, res) => {
    const token = req.cookies[options.sessionCookieName ?? COOKIE_NAME];
    await store.mutate((data) => {
      data.sessions = data.sessions.filter((item) => item.id !== token);
    });
    res.clearCookie(options.sessionCookieName ?? COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
    res.json({ ok: true });
  });

  app.post("/api/students", async (req, res) => {
    actor(res, "teacher");
    const name = text(req.body?.name, "Student name", 100);
    const email = text(req.body?.email, "Email", 254).toLowerCase();
    const rollNumber = canonicalRollNumber(req.body?.rollNumber);
    if (!rollNumber)
      throw new HttpError(
        400,
        "Roll number must be a whole number from 1 to 41.",
      );
    const password = passwordValue(req.body?.password, 12);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpError(400, "Enter a valid email address.");
    const user: StoredUser = {
      id: randomUUID(),
      name,
      email,
      rollNumber,
      role: "student",
      passwordHash: `setup$${await hashPassword(password)}`,
      mustChangePassword: true,
      authVersion: randomUUID(),
    };
    await store.mutate((data) => {
      if (
        data.users.some(
          (item) => item.email === email || item.rollNumber === rollNumber,
        )
      )
        throw new HttpError(
          409,
          "That email or roll number is already registered.",
        );
      data.users.push(user);
    });
    res.status(201).json(publicUser(user));
  });
  app.post("/api/labs", async (req, res) => {
    const user = actor(res, "teacher");
    const lab = validateLab(req.body);
    const operationKey = req.get("Idempotency-Key");
    if (operationKey && !/^[a-f0-9-]{36}$/i.test(operationKey)) throw new HttpError(400, "Invalid save operation key.");
    if (operationKey) lab.id = createHash("sha256").update(`${user.id}:create-lab:${operationKey}`).digest("hex");
    const result = await store.mutate((data) => {
      const existing = data.labs.find(item => item.id === lab.id);
      if (existing) {
        const { id: _, revision: __, ...original } = existing;
        const { id: ___, revision: ____, ...incoming } = lab;
        if (stableJson(original) !== stableJson(incoming)) throw new HttpError(409, "This save operation already created a lab. Refresh before making another edit.");
        return existing;
      }
      data.labs.push(lab);
      addActivity(
        data,
        "lab",
        `${lab.title} ${lab.published ? "published" : "saved as draft"}`,
      );
      return lab;
    });
    res.status(201).json(result);
  });
  app.post("/api/instructions/analyze", async (req, res) => {
    actor(res, "teacher");
    try {
      res.json(await analyzeInstructions(req.body?.instructionFile));
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error
          ? error.message
          : "Could not read these instructions. Build the checklist manually.",
      );
    }
  });
  app.patch("/api/labs/:id", async (req, res) => {
    actor(res, "teacher");
    const old = store.data.labs.find((item) => item.id === req.params.id);
    if (!old) throw new HttpError(404, "Lab not found.");
    const expectedRevision = req.body?.revision ?? (req.body?.tasks ? 0 : old.revision || 0);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new HttpError(400, "A valid lab revision is required.");
    const lab = validateLab({ ...old, ...req.body }, old);
    await store.mutate((data) => {
      if ((data.labs.find((item) => item.id === old.id)?.revision || 0) !== expectedRevision ||
          JSON.stringify(data.labs.find((item) => item.id === old.id)) !== JSON.stringify(old))
        throw new HttpError(409, "This lab changed. Refresh before saving again.");
      for (const submission of data.submissions.filter(
        (item) => item.labId === lab.id,
      )) {
        const task = lab.tasks.find((item) => item.id === submission.taskId);
        if (!task)
          throw new HttpError(
            409,
            "A task with existing submissions cannot be removed.",
          );
        if (submission.grade && submission.grade.marks > task.maxMarks)
          throw new HttpError(
            409,
            "Maximum marks cannot be lower than a recorded grade.",
          );
      }
      data.labs = data.labs.map((item) => (item.id === lab.id ? lab : item));
      addActivity(data, "lab", `${lab.title} updated`);
    });
    res.json(lab);
  });
  app.post(
    "/api/submissions",
    (_req, res, next) => {
      actor(res, "student");
      next();
    },
    (req, res, next) => {
      const maximumRequest = MAX_UPLOAD_BYTES + 64 * 1024;
      if (Number(req.get("content-length")) > maximumRequest)
        return next(
          new HttpError(
            413,
            "Upload request exceeds the 4 MB project allowance.",
          ),
        );
      let received = 0;
      let rejected = false;
      const count = (chunk: Buffer) => {
        received += chunk.length;
        if (received > maximumRequest && !rejected) {
          rejected = true;
          req.unpipe();
          req.resume();
          res.status(413).json({
            error: "Upload request exceeds the 4 MB project allowance.",
          });
        }
      };
      req.on("data", count);
      req.once("end", () => req.removeListener("data", count));
      upload.array("files", 60)(req, res, (error) => {
        req.removeListener("data", count);
        if (!rejected) next(error);
      });
    },
    async (req, res) => {
      const user = actor(res, "student");
      const labId = text(req.body?.labId, "Lab ID", 100);
      const taskId = text(req.body?.taskId, "Task ID", 100);
      const lab = store.data.labs.find(
        (item) => item.id === labId && item.published,
      );
      const task = lab?.tasks.find((item) => item.id === taskId);
      if (!lab || !task)
        throw new HttpError(404, "Published lab task not found.");
      const link = validLink(req.body?.link);
      const parsed = parseUploads((req.files as Express.Multer.File[]) || []);
      if (!parsed.files.length && !link)
        throw new HttpError(
          400,
          "Upload at least one HTML/CSS/JS/text file or provide a project link.",
        );
      const submittedAt = new Date().toISOString();
      const expectedRevision = req.body?.expectedRevision === undefined ? undefined : Number(req.body.expectedRevision);
      if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0))
        throw new HttpError(400, "Invalid previous submission revision.");
      const result = await store.mutate((data) => {
        const currentLab = data.labs.find(
          (item) => item.id === labId && item.published,
        );
        const currentTask = currentLab?.tasks.find(
          (item) => item.id === taskId,
        );
        if (!currentLab || !currentTask)
          throw new HttpError(
            409,
            "The task changed while uploading. Refresh and try again.",
          );
        const old = data.submissions.find(
          (item) =>
            item.studentId === user.id &&
            item.labId === labId &&
            item.taskId === taskId,
        );
        if (expectedRevision !== undefined && (old?.revision || 0) !== expectedRevision)
          throw new HttpError(409, "Your submission already changed. Refresh and review the current work before replacing it.");
        const submission: StoredSubmission = {
          id: old?.id || randomUUID(),
          studentId: user.id,
          labId,
          taskId,
          files: parsed.files,
          assets: parsed.binaryAssets.map(({ path: assetPath, mimeType }) => ({
            path: assetPath,
            mimeType,
          })),
          binaryAssets: parsed.binaryAssets,
          link,
          submittedAt,
          status: "submitted",
          revision: (old?.revision || 0) + 1,
          late:
            Boolean(currentLab.dueDate) &&
            Date.parse(submittedAt) > Date.parse(currentLab.dueDate),
        };
        if (old)
          data.submissions = data.submissions.map((item) =>
            item.id === old.id ? submission : item,
          );
        else data.submissions.push(submission);
        addActivity(
          data,
          "submission",
          `${user.name} ${old ? "resubmitted" : "submitted"} ${currentTask.title}`,
        );
        return submission;
      });
      res.status(201).json(publicSubmission(result, false));
    },
  );
  app.patch("/api/submissions/:id/grade", async (req, res) => {
    actor(res, "teacher");
    const original = accessibleSubmission(req.params.id as string, res);
    const task = store.data.labs
      .find((lab) => lab.id === original.labId)
      ?.tasks.find((item) => item.id === original.taskId);
    if (!task) throw new HttpError(404, "Task not found.");
    const marks = number(req.body?.marks, "Marks", 0, task.maxMarks);
    const revision = number(
      req.body?.revision,
      "Reviewed revision",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (!Number.isInteger(revision))
      throw new HttpError(400, "Reviewed revision must be an integer.");
    const feedback = text(req.body?.feedback ?? "", "Feedback", 4000, 0);
    if (typeof req.body?.published !== "boolean")
      throw new HttpError(400, "Published must be true or false.");
    const published = req.body.published;
    const result = await store.mutate((data) => {
      const submission = data.submissions.find(
        (item) => item.id === original.id,
      )!;
      if (submission.revision !== revision)
        throw new HttpError(
          409,
          "This student has resubmitted. Refresh and review the new revision before grading.",
        );
      if (req.body?.expectedGradeAt !== undefined && req.body.expectedGradeAt !== (submission.grade?.gradedAt || ""))
        throw new HttpError(409, "This grade already changed. Refresh before editing it again.");
      const currentTask = data.labs
        .find((lab) => lab.id === submission.labId)
        ?.tasks.find((item) => item.id === submission.taskId);
      if (!currentTask) throw new HttpError(404, "Task not found.");
      number(marks, "Marks", 0, currentTask.maxMarks);
      const student = data.users.find(
        (item) => item.id === submission.studentId,
      )!;
      submission.grade = {
        marks,
        feedback,
        published,
        gradedAt: new Date().toISOString(),
      };
      submission.status = "graded";
      addActivity(
        data,
        "grade",
        `${published ? "Feedback published" : "Grade saved"} for roll no. ${student.rollNumber}${student.name ? ` · ${student.name}` : ""}`,
      );
      return submission;
    });
    res.json(publicSubmission(result, true));
  });
  app.get("/api/labs/:id/analysis", async (req, res) => {
    actor(res, "teacher");
    const lab = store.data.labs.find((item) => item.id === req.params.id);
    if (!lab) throw new HttpError(404, "Lab not found.");
    const task = lab.tasks.find((item) => item.id === req.query.taskId);
    if (!task) throw new HttpError(404, "Task not found.");
    const submissions = await store.projects(store.data.submissions.filter((submission) => submission.labId === lab.id && submission.taskId === task.id));
    res.json({ ...analyzeTaskSubmissions(submissions, task), evidenceVersion: evidenceVersion(task, submissions) });
  });
  app.get("/api/submissions/:id/analysis", async (req, res) => {
    const user = actor(res);
    const submission = accessibleSubmission(req.params.id as string, res);
    if (req.query.revision !== undefined && String(submission.revision) !== req.query.revision)
      throw new HttpError(409, "This submission changed. Refresh before reviewing its evidence.");
    const task = store.data.labs
      .find((lab) => lab.id === submission.labId)
      ?.tasks.find((item) => item.id === submission.taskId);
    if (!task) throw new HttpError(404, "Task not found.");
    const peers =
      user.role === "teacher"
        ? store.data.submissions.filter(
            (item) =>
              item.id !== submission.id &&
              item.labId === submission.labId &&
              item.taskId === submission.taskId &&
              (!req.query.peerId || item.id === req.query.peerId),
          )
        : [];
    const [project, ...projects] = await store.projects([submission, ...peers]);
    res.json({ ...analyzeSubmission(project, projects, task), evidenceVersion: evidenceVersion(task, [project, ...projects]) });
  });
  app.get("/api/submissions/:id/source", async (req, res) => {
    const submission = accessibleSubmission(req.params.id as string, res);
    if (String(submission.revision) !== req.query.revision) throw new HttpError(409, "This submission changed. Refresh before reviewing it.");
    const [project] = await store.projects([submission]);
    res.json(publicSubmission(project, actor(res).role === "teacher"));
  });
  app.get("/api/submissions/:id/files/*filename", async (req, res) => {
    const submission = accessibleSubmission(req.params.id as string, res);
    if (req.query.revision !== undefined && String(submission.revision) !== req.query.revision)
      throw new HttpError(409, "This submission changed. Refresh before loading its files.");
    const filename = safeFilePath(
      Array.isArray(req.params.filename)
        ? req.params.filename.join("/")
        : (req.params.filename as string),
    );
    const file = await store.file(submission, filename);
    if (!file) throw new HttpError(404, "File not found.");
    res.attachment(filename.split("/").pop()!);
    res.type(file.mimeType);
    res.send("base64" in file && typeof file.base64 === "string" ? Buffer.from(file.base64, "base64") : "content" in file ? file.content : "");
  });
  app.get(["/api/reports.csv", "/api/reports.xlsx"], (req, res) => {
    actor(res, "teacher");
    const labId =
      typeof req.query.labId === "string" ? req.query.labId : undefined;
    const index = labId
      ? store.data.labs.findIndex((lab) => lab.id === labId)
      : 0;
    const lab = store.data.labs[index];
    if (!lab) throw new HttpError(404, "Lab not found.");
    const sheet = buildMarksSheet(
      lab,
      index + 1,
      store.data.users,
      store.data.submissions,
    );
    if (req.path.endsWith(".xlsx")) {
      res
        .attachment(`lab-${index + 1}-marks-sheet-fall-2026.xlsx`)
        .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .send(marksSheetXlsx(sheet));
      return;
    }
    res
      .attachment(`lab-${index + 1}-marks-sheet-fall-2026.csv`)
      .type("text/csv")
      .send(marksSheetCsv(sheet));
  });
  app.get("/api/reports/print", (req, res) => {
    actor(res, "teacher");
    const rawIds = req.query.labId;
    if (rawIds !== undefined && typeof rawIds !== "string" &&
        !(Array.isArray(rawIds) && rawIds.every((id) => typeof id === "string"))) {
      throw new HttpError(400, "Choose valid lab IDs.");
    }
    const ids = rawIds === undefined ? [] : typeof rawIds === "string" ? [rawIds] : rawIds as string[];
    if (ids.some((id) => !store.data.labs.some((lab) => lab.id === id))) {
      throw new HttpError(404, "Lab not found.");
    }
    res.setHeader("Cache-Control", "no-store");
    if (req.query.select === "1" || ids.length === 0) {
      res.type("html").send(marksSheetSelectionHtml(store.data.labs, ids));
      return;
    }
    const labs = store.data.labs.map((lab, index) => ({ lab, labNumber: index + 1 }))
      .filter(({ lab }) => ids.includes(lab.id));
    const selection = new URLSearchParams({ select: "1" });
    labs.forEach(({ lab }) => selection.append("labId", lab.id));
    res
      .type("html")
      .send(
        marksSheetHtml(
          buildPrintMarksSheet(
            labs,
            store.data.users,
            store.data.submissions,
          ),
          `/api/reports/print?${selection}`,
        ),
      );
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API endpoint not found.")),
  );

  const dist = path.join(rootDir, "dist");
  if (existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get("/{*page}", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SupabaseConflictError) {
        res.status(409).json({ error: "The reviewed records changed. Refresh the workspace before continuing." });
        return;
      }
      if (error instanceof SupabaseUnavailableError || error instanceof SupabaseWriteUnconfirmedError) {
        logFailure(error, "unconfirmed_request", res.locals.requestId);
        res.status(503).json({ error: "The save could not be confirmed. Refresh the workspace before repeating it.", uncertain: true, requestId: res.locals.requestId });
        return;
      }
      if (error instanceof multer.MulterError) {
        res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
          error:
            "Upload limit exceeded. Use at most 60 files, 1 MB per text file, and 4 MB total extracted content.",
        });
        return;
      }
      if (error instanceof SyntaxError && "body" in error) {
        res.status(400).json({ error: "Invalid JSON request." });
        return;
      }
      const status = (error as { status?: number })?.status;
      if (status === 413) {
        res.status(413).json({ error: "Request is too large." });
        return;
      }
      logFailure(error, "request", res.locals.requestId);
      res
        .status(500)
        .json({ error: "The request could not be confirmed. Refresh before repeating a save.", requestId: res.locals.requestId });
    },
  );
  return app;
}
