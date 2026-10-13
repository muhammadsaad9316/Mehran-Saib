import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
export { createApp } from "./app.js";

export async function startServer() {
  const environmentFile = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
  const app = await createApp();
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || "127.0.0.1";
  const server = app.listen(port, host, () =>
    console.log(`LabTrack API running at http://${host}:${port}`),
  );
  async function shutdown() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.locals.store?.close();
    process.exit(0);
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
