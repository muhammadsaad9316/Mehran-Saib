import { createHash } from "node:crypto";
import type { Database, StoredSubmission } from "./store.js";

export interface SupabaseConfig {
  url: string;
  secretKey: string;
  cache?: boolean;
  compact?: boolean;
}
export class SupabaseConflictError extends Error {}
export class SupabaseStorageLimitError extends Error {}
export class SupabaseWriteUnconfirmedError extends Error {}
export class SupabaseWriteConfirmedError extends Error {}
export class SupabaseUnavailableError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

function connectionError(error: unknown) {
  const cause = error as { name?: string; cause?: { code?: string } } | null;
  const code = cause?.cause?.code;
  const safeCodes = ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"];
  return new SupabaseUnavailableError(
    "Supabase could not be reached. Check the backend connection.",
    cause?.name === "TimeoutError" || cause?.name === "AbortError"
      ? "TIMEOUT" : code && safeCodes.includes(code) ? code : "NETWORK_ERROR",
  );
}
// One bounded, private snapshot per warm instance; the revision is checked on every read.
let snapshot: { key: string; revision: number; data: Database } | undefined;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const collections = [
  "users",
  "labs",
  "submissions",
  "activity",
  "sessions",
] as const;

export class SupabasePersistence {
  private revision = 0;
  private readonly endpoint: string;
  private readonly cacheKey: string;

  constructor(
    private readonly config: SupabaseConfig,
    private readonly request: typeof fetch = fetch,
  ) {
    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      throw new Error("SUPABASE_URL must be an HTTPS project origin.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("SUPABASE_URL must be an HTTPS project origin.");
    if (
      !config.secretKey.startsWith("sb_secret_") &&
      !this.isServiceRoleKey(config.secretKey)
    )
      throw new Error(
        "Configure a server-only Supabase secret key, not a publishable or anonymous key.",
      );
    this.endpoint = `${url.origin}/rest/v1/rpc/`;
    this.cacheKey = createHash("sha256").update(`${url.origin}|${config.secretKey}|${config.compact === true}`).digest("hex");
  }

  private isServiceRoleKey(key: string) {
    try {
      return (
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role === "service_role"
      );
    } catch {
      return false;
    }
  }

  private async rpc(name: string, body: unknown, deadline?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(`${this.endpoint}${name}`, {
        method: "POST",
        headers: {
          apikey: this.config.secretKey,
          ...(this.config.secretKey.startsWith("sb_secret_")
            ? {}
            : { Authorization: `Bearer ${this.config.secretKey}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: deadline
          ? AbortSignal.any([deadline, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw connectionError(error);
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as {
        code?: string;
      };
      if (detail?.code === "PT409" || detail?.code === "40001" || detail?.code === "23505")
        throw new SupabaseConflictError(
          "The database was updated by another process.",
        );
      if (detail?.code === "PGRST202")
        throw new Error(
          "Apply the committed Supabase migrations before starting the backend.",
        );
      const message = `Supabase persistence failed (HTTP ${response.status}). Check the backend configuration.`;
      if ([502, 503, 504].includes(response.status))
        throw new SupabaseUnavailableError(message, `HTTP_${response.status}`);
      throw new Error(message);
    }
    try {
      return await response.json();
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error("Supabase returned an invalid JSON response.");
      throw connectionError(error);
    }
  }

  async load(deadline?: AbortSignal): Promise<Database> {
    const cached = this.config.cache && snapshot?.key === this.cacheKey ? snapshot : undefined;
    const result = (await this.rpc(
      this.config.compact ? "labtrack_read_compact" : this.config.cache ? "labtrack_read_if_changed" : "labtrack_read",
      this.config.cache || this.config.compact ? { known_revision: cached?.revision ?? -1 } : {},
      deadline,
    )) as {
      revision: number;
      data: Database | null;
    };
    if (cached && result?.data === null && result.revision === cached.revision) {
      this.revision = result.revision;
      return structuredClone(cached.data);
    }
    if (
      !Number.isSafeInteger(result?.revision) ||
      result.revision < 0 ||
      !collections.every((name) => Array.isArray(result?.data?.[name]))
    )
      throw new Error("Supabase returned an invalid LabTrack database.");
    this.revision = result.revision;
    this.remember(result.data!);
    return result.data!;
  }

  private remember(data: Database) {
    if (!this.config.cache || (snapshot?.key === this.cacheKey && snapshot.revision > this.revision)) return;
    if (Buffer.byteLength(JSON.stringify(data)) > MAX_SNAPSHOT_BYTES) {
      if (snapshot?.key === this.cacheKey) snapshot = undefined;
      return;
    }
    snapshot = { key: this.cacheKey, revision: this.revision, data: structuredClone(data) };
  }

  async loginAttempt(key: string, clear: boolean): Promise<boolean> {
    const result = await this.rpc("labtrack_login_attempt", { attempt_key: key, clear_attempts: clear });
    if (typeof result !== "boolean") throw new Error("Supabase returned an invalid login limit.");
    return result;
  }

  async check(): Promise<void> {
    let response: Response;
    try {
      response = await this.request(`${new URL(this.config.url).origin}/rest/v1/labtrack_meta?select=revision&id=eq.1`, {
        headers: { apikey: this.config.secretKey, ...(this.config.secretKey.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${this.config.secretKey}` }) },
        signal: AbortSignal.timeout(5000), redirect: "error",
      });
      if (!response.ok) throw new SupabaseUnavailableError("Database readiness failed.", `HTTP_${response.status}`);
      const result = await response.json();
      if (!Array.isArray(result) || !Number.isSafeInteger(result[0]?.revision)) throw new Error("Invalid database readiness response.");
    } catch (error) {
      if (error instanceof SupabaseUnavailableError) throw error;
      throw connectionError(error);
    }
  }

  metadata(data: Database): Database {
    if (!this.config.compact) return data;
    return { ...data, submissions: data.submissions.map(({ binaryAssets: _, ...item }) => ({ ...item,
      sourceOmitted: true, files: item.files.map(file => ({ path: file.path, content: "" })) })) };
  }

  async projects(submissions: StoredSubmission[]): Promise<StoredSubmission[]> {
    if (!submissions.length) return [];
    const result = await this.rpc("labtrack_projects", { expected_submissions: submissions.map(({ id, revision }) => ({ id, revision })) });
    if (!Array.isArray(result) || result.length !== submissions.length) throw new SupabaseConflictError("The reviewed submissions changed.");
    return submissions.map(item => {
      const loaded = result.find(value => value?.id === item.id && value?.revision === item.revision);
      if (!loaded || !Array.isArray(loaded.files)) throw new SupabaseConflictError("The reviewed submissions changed.");
      return loaded as StoredSubmission;
    });
  }

  async asset(submission: StoredSubmission, filename: string): Promise<{ mimeType: string; content?: string; base64?: string } | undefined> {
    const result = await this.rpc("labtrack_asset", { submission_id: submission.id, expected_revision: submission.revision, asset_path: filename }) as { revision?: number; file?: { mimeType: string; content?: string; base64?: string } } | null;
    if (result?.revision !== submission.revision) throw new SupabaseConflictError("The reviewed submission changed.");
    return result.file || undefined;
  }

  async write(previous: Database, next: Database, deadline?: AbortSignal, credentialUserId?: string): Promise<Database | undefined> {
    const upserts: {
      collection: string;
      id: string;
      document: unknown;
      position: number;
    }[] = [];
    const deletions: { collection: string; id: string }[] = [];
    for (const collection of collections) {
      const before = new Map(
        previous[collection].map((document, position) => [
          document.id,
          { document: JSON.stringify(document), position },
        ]),
      );
      const after = new Set(next[collection].map((document) => document.id));
      next[collection].forEach((document, position) => {
        const old = before.get(document.id);
        if (
          old?.document !== JSON.stringify(document) ||
          old.position !== position
        )
          upserts.push({ collection, id: document.id, document, position });
      });
      for (const id of before.keys())
        if (!after.has(id)) deletions.push({ collection, id });
    }
    if (!upserts.length && !deletions.length) return;
    let revision: unknown;
    const expected = new Map<string, { collection: string; id: string; document: unknown }>();
    if (this.config.compact) {
      for (const name of collections) {
        const changed = new Set([...upserts, ...deletions].filter(item => item.collection === name).map(item => item.id));
        for (const item of previous[name])
          // Independent credential changes depend on their account, not classmates' passwords.
          if (changed.has(item.id) || name === "labs" || (name === "users" && (!credentialUserId || item.id === credentialUserId))) expected.set(`${name}:${item.id}`, { collection: name, id: item.id, document: item });
        for (const id of changed) if (!expected.has(`${name}:${id}`)) expected.set(`${name}:${id}`, { collection: name, id, document: null });
      }
    }
    try { revision = await this.rpc(this.config.compact ? "labtrack_write_scoped" : "labtrack_write", {
      expected_revision: this.revision,
      upserts,
      deletions,
      ...(this.config.compact ? { expected_documents: [...expected.values()] } : {}),
    }, deadline); }
    catch (error) {
      if (error instanceof Error && error.message === "Supabase returned an invalid JSON response.")
        throw new SupabaseWriteUnconfirmedError("Supabase did not confirm the save. Refresh before repeating it.");
      throw error;
    }
    if (revision === -1)
      throw new SupabaseStorageLimitError("Classroom storage is nearly full. Contact your teacher before uploading more files.");
    if (
      !Number.isSafeInteger(revision) ||
      (this.config.compact ? Number(revision) <= this.revision : Number(revision) !== this.revision + 1)
    )
      throw new SupabaseWriteUnconfirmedError("Supabase did not confirm the database revision.");
    this.revision = Number(revision);
    if (this.config.compact) {
      try { return await this.load(deadline); }
      catch { throw new SupabaseWriteConfirmedError("The save succeeded, but its updated workspace could not be loaded."); }
    }
    const metadata = this.metadata(next);
    this.remember(metadata);
    return this.config.compact ? metadata : undefined;
  }
}
