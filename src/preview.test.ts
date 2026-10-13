import test from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_CSP, resolvePath } from "./preview";
test("local dependency paths preserve nested projects and reject external resources", () => {
  assert.equal(
    resolvePath("pages/index.html", "../css/main.css"),
    "css/main.css",
  );
  assert.equal(
    resolvePath("index.html", "./pages/contact.html#details"),
    "pages/contact.html",
  );
  assert.equal(resolvePath("index.html", "https://example.com/app.js"), null);
  assert.equal(resolvePath("index.html", "//example.com/app.js"), null);
  assert.equal(resolvePath("index.html", "javascript:alert(1)"), null);
  assert.equal(
    resolvePath("index.html", "images/photo%201.png"),
    "images/photo 1.png",
  );
  assert.equal(resolvePath("index.html", "images/photo%xx.png"), null);
});
test("preview policy blocks network access and nested browsing contexts", () => {
  for (const rule of [
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ])
    assert.ok(PREVIEW_CSP.includes(rule));
});
