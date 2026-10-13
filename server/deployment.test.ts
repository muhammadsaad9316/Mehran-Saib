import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Vercel routes API requests to its serverless backend before the SPA fallback", () => {
  const config = JSON.parse(execFileSync(process.execPath, [
    "--input-type=module", "-e",
    "const {config} = await import('./vercel.mjs'); process.stdout.write(JSON.stringify(config));",
  ], { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8" }));
  assert.deepEqual(config.rewrites[0], { source: "/api/:path*", destination: "/api/index" });
  assert.equal(config.rewrites[1].destination, "/index.html");
  assert.equal(config.framework, "vite");
  assert.equal(config.headers[0].headers[0].value, "no-store");
  assert.equal(config.functions["api/index.ts"].maxDuration, 60);
});
