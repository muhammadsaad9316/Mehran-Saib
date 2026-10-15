import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/app.js";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { SupabasePersistence } from "../server/supabase.js";
import { logFailure } from "../server/diagnostics.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const requestId = randomUUID();
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId });
    res.end(JSON.stringify(body));
  };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    reply(503, { error: "The database connection is not configured." });
    return;
  }
  const pathname = new URL(req.url || "/", "https://labtrack.invalid").pathname;
  const read = req.method === "GET" || req.method === "HEAD";
  if (read && pathname === "/api/health") {
    reply(200, { ok: true });
    return;
  }
  if (read && pathname === "/api/ready" && process.env.LABTRACK_READINESS_TOKEN && req.headers["x-readiness-token"] !== undefined) {
    const supplied = req.headers["x-readiness-token"];
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (typeof supplied !== "string" || process.env.LABTRACK_READINESS_TOKEN.length < 32 ||
        !timingSafeEqual(digest(supplied), digest(process.env.LABTRACK_READINESS_TOKEN))) {
      reply(401, { error: "Readiness authorization required." }); return;
    }
    try {
      await new SupabasePersistence({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY }).check();
      reply(200, { ok: true });
    } catch (error) {
      logFailure(error, "readiness", requestId);
      reply(503, { error: "Database readiness failed.", requestId });
    }
    return;
  }
  const session = /(?:^|;\s*)labtrack_session=([a-f0-9]{64})(?:;|$)/.test(req.headers.cookie || "");
  if (read && pathname === "/api/state" && !session) {
    reply(200, { user: null, demo: false, students: [], labs: [], submissions: [], activity: [] });
    return;
  }
  if (pathname === "/api/auth/demo") {
    reply(403, { error: "Demo access is disabled." });
    return;
  }
  if (!session && pathname !== "/api/auth/login") {
    reply(401, { error: "Sign in to continue." });
    return;
  }
  let app;
  try {
    // Each invocation owns its database snapshot, including on a warm instance.
    app = await createApp({ production: true, demo: false, serverless: true });
    await new Promise<void>((resolve) => {
      res.once("finish", resolve);
      res.once("close", resolve);
      app!(req, res);
    });
  } catch (error) {
    logFailure(error, "initialization", requestId);
    if (!res.headersSent) {
      reply(503, { error: "The workspace is temporarily unavailable. Try again shortly.", requestId });
    } else res.end();
  } finally {
    await app?.locals.store?.close();
  }
}
