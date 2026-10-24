import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeProjectFiles, uploadSize } from "./upload-selection";

test("adding files preserves earlier files and replaces only matching project paths", () => {
  const html = new File(["<h1>First</h1>"], "index.html");
  const css = new File(["h1{}"], "style.css");
  const updated = new File(["<h1>Updated</h1>"], "INDEX.html");
  const nested = new File(["Nested"], "index.html");
  Object.defineProperty(nested, "webkitRelativePath", { value: "project/index.html" });
  const added = mergeProjectFiles([html], [css, nested]);
  assert.deepEqual(added.files, [html, css, nested]);
  assert.equal(added.replaced, 0);
  const replaced = mergeProjectFiles(added.files, [updated]);
  assert.deepEqual(replaced.files, [updated, css, nested]);
  assert.equal(replaced.replaced, 1);
  assert.deepEqual(mergeProjectFiles(added.files, []).files, added.files);
  assert.equal(uploadSize(1536), "1.5 KB");
  assert.equal(uploadSize(4 * 1024 * 1024), "4.00 MB");
});
