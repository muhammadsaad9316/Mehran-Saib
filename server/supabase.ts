import type { Database } from "./store.js";

export interface SupabaseConfig {
  url: string;
  secretKey: string;
}
export class SupabaseConflictError extends Error {}
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

  private async rpc(name: string, body: unknown): Promise<unknown> {
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
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error(
        "Supabase could not be reached. Check the backend connection.",
      );
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as {
        code?: string;
      };
      if (detail.code === "40001")
        throw new SupabaseConflictError(
          "The database was updated by another process.",
        );
      if (detail.code === "PGRST202")
        throw new Error(
          "Apply supabase/migrations/001_labtrack.sql before starting the backend.",
        );
      throw new Error(
        `Supabase persistence failed (HTTP ${response.status}). Check the backend configuration.`,
      );
    }
    return response.json();
  }

  async load(): Promise<Database> {
    const result = (await this.rpc("labtrack_read", {})) as {
      revision: number;
      data: Database;
    };
    if (
      !Number.isSafeInteger(result?.revision) ||
      result.revision < 0 ||
      !collections.every((name) => Array.isArray(result?.data?.[name]))
    )
      throw new Error("Supabase returned an invalid LabTrack database.");
    this.revision = result.revision;
    return result.data;
  }

  async write(previous: Database, next: Database): Promise<void> {
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
    const revision = await this.rpc("labtrack_write", {
      expected_revision: this.revision,
      upserts,
      deletions,
    });
    if (
      !Number.isSafeInteger(revision) ||
      Number(revision) !== this.revision + 1
    )
      throw new Error("Supabase did not confirm the database revision.");
    this.revision = Number(revision);
  }
}
