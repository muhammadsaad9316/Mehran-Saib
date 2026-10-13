import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const args = [
  "--input-type=module",
  "-e",
  "const {config} = await import('./vercel.mjs'); process.stdout.write(JSON.stringify(config));",
];
test("Vercel proxies API requests before the SPA fallback and disables API caching", () => {
  const config = JSON.parse(
    execFileSync(process.execPath, args, {
      cwd,
      env: {
        ...process.env,
        LABTRACK_API_ORIGIN: "https://labtrack-api.example.test",
      },
      encoding: "utf8",
    }),
  );
  assert.deepEqual(config.rewrites[0], {
    source: "/api/:path*",
    destination: "https://labtrack-api.example.test/api/:path*",
  });
  assert.equal(config.rewrites[1].destination, "/index.html");
  assert.equal(config.framework, "vite");
  assert.equal(config.headers[0].headers[0].value, "no-store");
});
test("Vercel refuses an absent backend, insecure URLs or embedded credentials", () => {
  for (const value of [
    "",
    "http://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test/path",
    "https://api.example.test?key=test",
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd,
      env: { ...process.env, LABTRACK_API_ORIGIN: value },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LABTRACK_API_ORIGIN/);
  }
});
