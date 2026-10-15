import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient, type Db } from "mongodb";
import type { Activity, Lab, Submission, User } from "../shared/types.js";
import {
  SupabasePersistence,
  SupabaseConflictError,
  SupabaseStorageLimitError,
  SupabaseUnavailableError,
  SupabaseWriteUnconfirmedError,
  SupabaseWriteConfirmedError,
  type SupabaseConfig,
} from "./supabase.js";
import { HttpError } from "./uploads.js";
import { stableJson } from "./serialization.js";

export interface StoredUser extends User {
  passwordHash: string;
}
export interface StoredSubmission extends Submission {
  binaryAssets?: { path: string; mimeType: string; base64: string }[];
}
export interface Session {
  id: string;
  userId: string;
  expiresAt: number;
}
export interface Database {
  users: StoredUser[];
  labs: Lab[];
  submissions: StoredSubmission[];
  activity: Activity[];
  sessions: Session[];
}

export const emptyDatabase = (): Database => ({
  users: [],
  labs: [],
  submissions: [],
  activity: [],
  sessions: [],
});
const collections = [
  "users",
  "labs",
  "submissions",
  "activity",
  "sessions",
] as const;

export class Store {
  data: Database = emptyDatabase();
  private pending: Promise<unknown> = Promise.resolve();
  private client?: MongoClient;
  private db?: Db;
  private mongoOrderInitialized = true;
  private supabase?: SupabasePersistence;
  private requiresReload = false;

  constructor(
    private readonly dataDir: string,
    private readonly mongoUri?: string,
    supabase?: SupabaseConfig,
    private readonly writeAttempts = 1,
  ) {
    if (mongoUri && supabase)
      throw new Error("Configure one database provider: Supabase or MongoDB.");
    if (supabase) this.supabase = new SupabasePersistence(supabase);
  }

  async open(retrySupabaseRead = false): Promise<void> {
    if (this.supabase) {
      const deadline = retrySupabaseRead ? AbortSignal.timeout(45000) : undefined;
      for (let attempt = 1; ; attempt++) {
        try {
          this.data = await this.supabase.load(deadline);
          return;
        } catch (error) {
          if (!retrySupabaseRead || !(error instanceof SupabaseUnavailableError)) throw error;
          const exhausted = new SupabaseUnavailableError(
            `Supabase startup failed after ${attempt} read attempt(s) (${error.code}). Restore the connection and restart the API.`,
            error.code,
          );
          if (attempt >= 3 || deadline!.aborted) throw exhausted;
          const wait = 500 * 2 ** (attempt - 1) + Math.random() * 250;
          console.warn(`LabTrack: Supabase startup read unavailable (${error.code}); retry ${attempt + 1}/3 in ${Math.round(wait)} ms.`);
          try {
            await delay(wait, undefined, { signal: deadline });
          } catch {
            throw exhausted;
          }
        }
      }
    }
    if (this.mongoUri) {
      this.client = new MongoClient(this.mongoUri);
      await this.client.connect();
      this.db = this.client.db();
      for (const name of collections) {
        const records = await this.db.collection(name).find({}).toArray();
        if (records.some(record => !Number.isSafeInteger(record._labtrackPosition))) this.mongoOrderInitialized = false;
        records.sort((a, b) => Number.isSafeInteger(a._labtrackPosition) && Number.isSafeInteger(b._labtrackPosition)
          ? a._labtrackPosition - b._labtrackPosition : name === "activity" ? String(b.time).localeCompare(String(a.time)) : 0);
        (this.data[name] as unknown[]) = records.map(({ _id, _labtrackPosition: _, ...value }) => ({
          ...value,
          id: String(_id),
        }));
      }
      if (!this.mongoOrderInitialized) await this.mutate(() => undefined);
      return;
    }
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = JSON.parse(
        await readFile(path.join(this.dataDir, "labtrack.json"), "utf8"),
      );
      for (const name of collections) {
        if (!Array.isArray(raw[name]))
          throw new Error(`Invalid persisted ${name} collection`);
      }
      this.data = raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async mutate<T>(change: (database: Database) => T): Promise<T> {
    const operation = this.pending.then(async () => {
      await this.ensureFresh();
      const deadline = this.writeAttempts > 1 ? AbortSignal.timeout(45000) : undefined;
      let previous = this.data;
      let next = structuredClone(previous);
      let result = change(next);
      if (this.supabase) {
        for (let attempt = 0; ; attempt++) {
          try {
            const refreshed = await this.supabase.write(previous, next, deadline);
            if (refreshed) { this.data = refreshed; return result; }
            break;
          } catch (error) {
            if (error instanceof SupabaseWriteConfirmedError) {
              this.data = this.supabase.metadata(next);
              this.requiresReload = true;
              return result;
            }
            if (error instanceof SupabaseUnavailableError || error instanceof SupabaseWriteUnconfirmedError) {
              this.requiresReload = true;
              try {
                await this.ensureFresh(AbortSignal.timeout(5000));
                const wanted = this.supabase.metadata(next);
                const confirmed = collections.every(name => {
                  const before = new Map(previous[name].map(item => [item.id, stableJson(item)]));
                  const current = new Map(this.data[name].map(item => [item.id, stableJson(item)]));
                  const after = new Set(wanted[name].map(item => item.id));
                  return wanted[name].every(item => before.get(item.id) === stableJson(item) || current.get(item.id) === stableJson(item)) &&
                    [...before.keys()].every(id => after.has(id) || !current.has(id));
                });
                if (confirmed) return result;
              } catch { /* Keep the store unavailable until an authoritative reload succeeds. */ }
              throw error;
            }
            if (error instanceof SupabaseStorageLimitError)
              throw new HttpError(507, error.message);
            if (!(error instanceof SupabaseConflictError)) throw error;
            this.requiresReload = true;
            await this.ensureFresh(deadline);
            if (attempt + 1 >= this.writeAttempts)
              throw new HttpError(409, "The database changed. Refresh your workspace before saving again.");
            try { await delay(100 + Math.random() * Math.min(5000, 250 * 2 ** attempt), undefined, { signal: deadline }); }
            catch { throw new HttpError(409, "The save deadline was reached. Refresh before saving again."); }
            previous = this.data;
            next = structuredClone(previous);
            // Re-run validation against current records; never replay an old snapshot.
            result = change(next);
          }
        }
      } else if (this.db) {
        // shortcut: in-memory reads assume one server process; refresh shared state before scaling horizontally.
        await this.client!.withSession(async (session) => {
          await session.withTransaction(async () => {
            for (const name of collections) {
              const before = new Map(
                previous[name].map((item, position) => [item.id, { text: JSON.stringify(item), position }]),
              );
              const after = new Set(next[name].map((item) => item.id));
              const operations = next[name]
                .map((item, position) => ({ item, position }))
                .filter(({ item, position }) => !this.mongoOrderInitialized || before.get(item.id)?.text !== JSON.stringify(item) || before.get(item.id)?.position !== position)
                .map(({ item, position }) => {
                  const { id, ...value } = item;
                  return {
                    replaceOne: {
                      filter: { _id: id },
                      replacement: { _id: id, ...value, _labtrackPosition: position },
                      upsert: true,
                    },
                  };
                });
              const removed = [...before.keys()].filter((id) => !after.has(id));
              if (operations.length)
                await this.db!.collection<{
                  _id: string;
                  [key: string]: unknown;
                }>(name).bulkWrite(operations, { session });
              if (removed.length)
                await this.db!.collection<{
                  _id: string;
                  [key: string]: unknown;
                }>(name).deleteMany({ _id: { $in: removed } }, { session });
            }
          });
        });
        this.mongoOrderInitialized = true;
      } else {
        const destination = path.join(this.dataDir, "labtrack.json");
        const temporary = `${destination}.tmp`;
        await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
        await rename(temporary, destination);
      }
      this.data = next;
      return result;
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async close(): Promise<void> {
    await this.pending;
    await this.client?.close();
  }

  async ready(): Promise<void> {
    if (this.supabase) await this.supabase.check();
    else if (this.db) await this.db.command({ ping: 1 });
  }

  async projects(submissions: StoredSubmission[]): Promise<StoredSubmission[]> {
    return this.supabase && submissions.some(item => item.sourceOmitted) ? this.supabase.projects(submissions) : submissions;
  }

  async file(submission: StoredSubmission, filename: string) {
    if (this.supabase && submission.sourceOmitted) return this.supabase.asset(submission, filename);
    return submission.binaryAssets?.find(item => item.path === filename) ||
      submission.files.filter(item => item.path === filename).map(item => ({ ...item, mimeType: "text/plain" }))[0];
  }

  async ensureFresh(deadline?: AbortSignal): Promise<void> {
    if (this.requiresReload && this.supabase) {
      this.data = await this.supabase.load(deadline);
      this.requiresReload = false;
    }
  }

  async refresh(): Promise<void> {
    const operation = this.pending.then(async () => {
      if (!this.supabase) return;
      this.requiresReload = true;
      await this.ensureFresh();
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async loginAttempt(key: string, clear = false): Promise<boolean> {
    if (!this.supabase) throw new Error("Shared login limits require Supabase.");
    return this.supabase.loginAttempt(key, clear);
  }
}
