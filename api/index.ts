import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/app.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "The database connection is not configured." }));
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
  } catch {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: "The workspace is temporarily unavailable. Try again shortly." }));
    } else res.end();
  } finally {
    await app?.locals.store?.close();
  }
}
