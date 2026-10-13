import { test } from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { MAX_UPLOAD_BYTES, parseUploads, safeFilePath } from "./uploads.js";

test("safe project paths preserve nesting and reject traversal, hidden or absolute paths", () => {
  assert.equal(
    safeFilePath("project\\assets\\style.css"),
    "project/assets/style.css",
  );
  for (const filename of [
    "../index.html",
    "assets/../../index.html",
    "/index.html",
    "C:\\temp\\index.html",
    ".env",
    "assets/.secret",
    "a//b.html",
    "a/./b.html",
    "a\u0000.html",
  ])
    assert.throws(() => safeFilePath(filename));
});

test("ZIP import preserves nested files and rejects unsupported entries", () => {
  const zip = new AdmZip();
  zip.addFile("website/index.html", Buffer.from("<h1>Hello</h1>"));
  zip.addFile("website/assets/main.css", Buffer.from("h1 { color: red; }"));
  const parsed = parseUploads([
    { originalname: "website.zip", buffer: zip.toBuffer() },
  ]);
  assert.deepEqual(parsed.files.map((file) => file.path).sort(), [
    "website/assets/main.css",
    "website/index.html",
  ]);
  zip.addFile("website/run.exe", Buffer.from("executable"));
  assert.throws(
    () =>
      parseUploads([{ originalname: "website.zip", buffer: zip.toBuffer() }]),
    /Unsupported file type/,
  );
});

test("decompression limits reject highly compressed expansion before importing", () => {
  const zip = new AdmZip();
  zip.addFile("oversized.txt", Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65));
  assert.throws(
    () =>
      parseUploads([
        { originalname: "compressed.zip", buffer: zip.toBuffer() },
      ]),
    /extracted content exceeds/,
  );
});

test("invalid UTF-8, duplicate paths, too many files and oversized text are rejected", () => {
  assert.throws(
    () =>
      parseUploads([
        { originalname: "bad.html", buffer: Buffer.from([0xff, 0xfe]) },
      ]),
    /UTF-8/,
  );
  assert.throws(
    () =>
      parseUploads([
        { originalname: "index.html", buffer: Buffer.from("a") },
        { originalname: "INDEX.HTML", buffer: Buffer.from("b") },
      ]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      parseUploads(
        Array.from({ length: 61 }, (_, index) => ({
          originalname: `${index}.txt`,
          buffer: Buffer.from("a"),
        })),
      ),
    /at most 60/,
  );
  assert.throws(
    () =>
      parseUploads([
        {
          originalname: "large.txt",
          buffer: Buffer.alloc(1024 * 1024 + 1, 65),
        },
      ]),
    /exceeds 1 MB/,
  );
});

test("raster asset metadata stays separate from text preview files", () => {
  const parsed = parseUploads([
    {
      originalname: "images/photo.png",
      buffer: Buffer.from([137, 80, 78, 71]),
    },
  ]);
  assert.deepEqual(parsed.files, []);
  assert.equal(parsed.binaryAssets[0].path, "images/photo.png");
  assert.equal(parsed.binaryAssets[0].mimeType, "image/png");
});
