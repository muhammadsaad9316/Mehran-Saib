import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient, type Db } from "mongodb";
import type { Activity, Lab, Submission, User } from "../shared/types.js";
import {
  SupabasePersistence,
  SupabaseConflictError,
  type SupabaseConfig,
} from "./supabase.js";
import { HttpError } from "./uploads.js";

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
  private supabase?: SupabasePersistence;

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

  async open(): Promise<void> {
    if (this.supabase) {
      this.data = await this.supabase.load();
      return;
    }
    if (this.mongoUri) {
      this.client = new MongoClient(this.mongoUri);
      await this.client.connect();
      this.db = this.client.db();
      for (const name of collections) {
        const records = await this.db.collection(name).find({}).toArray();
        (this.data[name] as unknown[]) = records.map(({ _id, ...value }) => ({
          ...value,
          id: String(_id),
        }));
      }
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
      let previous = this.data;
      let next = structuredClone(previous);
      let result = change(next);
      if (this.supabase) {
        for (let attempt = 0; ; attempt++) {
          try {
            await this.supabase.write(previous, next);
            break;
          } catch (error) {
            if (!(error instanceof SupabaseConflictError)) throw error;
            this.data = await this.supabase.load();
            if (attempt + 1 >= this.writeAttempts)
              throw new HttpError(409, "The database changed. Refresh your workspace before saving again.");
            await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 75));
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
                previous[name].map((item) => [item.id, JSON.stringify(item)]),
              );
              const after = new Set(next[name].map((item) => item.id));
              const operations = next[name]
                .filter((item) => before.get(item.id) !== JSON.stringify(item))
                .map((item) => {
                  const { id, ...value } = item;
                  return {
                    replaceOne: {
                      filter: { _id: id },
                      replacement: { _id: id, ...value },
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

  async loginAttempt(key: string, clear = false): Promise<boolean> {
    if (!this.supabase) throw new Error("Shared login limits require Supabase.");
    return this.supabase.loginAttempt(key, clear);
  }
}
