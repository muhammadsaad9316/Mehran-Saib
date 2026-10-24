import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import request from "supertest";
import { createApp } from "./app.js";
import { HttpError, MAX_UPLOAD_BYTES, parseUploads, safeFilePath } from "./uploads.js";

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

test("damaged ZIP central directories return a readable client error", () => {
  const zip = new AdmZip();
  zip.addFile("index.html", Buffer.from("<h1>Hello</h1>"));
  const bytes = zip.toBuffer();
  const centralHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(centralHeader >= 0);
  bytes.writeUInt32LE(0, centralHeader);
  assert.throws(
    () => parseUploads([{ originalname: "broken.zip", buffer: bytes }]),
    (error: unknown) => error instanceof HttpError && error.status === 400 && error.message === "Could not read this ZIP file.",
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

test("inherited object keys are rejected as upload extensions, including ZIP entries", () => {
  for (const extension of ["constructor", "__proto__"]) {
    const filename = `payload.${extension}`;
    const file = { originalname: filename, buffer: Buffer.from("fixture") };
    const zip = new AdmZip();
    zip.addFile(filename, file.buffer);
    for (const upload of [file, { originalname: "project.zip", buffer: zip.toBuffer() }]) {
      assert.throws(
        () => parseUploads([upload]),
        (error: unknown) => error instanceof HttpError && error.status === 400 && /Unsupported file type/.test(error.message),
      );
    }
  }
});

test("invalid upload extensions leave the JSON store usable for subsequent submissions and logout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-upload-types-"));
  const app = await createApp({ dataDir: directory, demo: true, production: false, mongoUri: "", supabaseUrl: "", supabaseKey: "" });
  try {
    const teacher = request.agent(app), student = request.agent(app);
    await teacher.post("/api/auth/demo").set("Host", "localhost").send({ role: "teacher" }).expect(200);
    const lab = await teacher.post("/api/labs").send({
      title: "Upload validation", published: true,
      tasks: [{ id: "upload-task", title: "Upload task", maxMarks: 10, requirements: [] }],
    }).expect(201);
    await student.post("/api/auth/demo").set("Host", "localhost").send({ role: "student" }).expect(200);
    const submit = (filename: string) => student.post("/api/submissions")
      .field("labId", lab.body.id).field("taskId", "upload-task")
      .attach("files", Buffer.from("<h1>Fixture</h1>"), "index.html")
      .attach("files", Buffer.from("fixture"), filename);
    for (const extension of ["constructor", "__proto__"]) await submit(`payload.${extension}`).expect(400);
    const saved = await submit("image.png").expect(201);
    assert.deepEqual(saved.body.assets, [{ path: "image.png", mimeType: "image/png" }]);
    await student.post("/api/auth/logout").expect(200);
    await teacher.patch(`/api/labs/${lab.body.id}`).send({ title: "Store remains usable" }).expect(200);
  } finally {
    await app.locals.close();
    await rm(directory, { recursive: true, force: true });
  }
});
