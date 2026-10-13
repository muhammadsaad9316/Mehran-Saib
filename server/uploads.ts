import AdmZip from "adm-zip";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 60;
const MAX_TEXT_BYTES = 1024 * 1024;
const textExtensions = new Set(["html", "htm", "css", "js", "txt", "json"]);
const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function safeFilePath(filename: string): string {
  const normalized = filename.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.length > 200 ||
    normalized.startsWith("/") ||
    normalized.includes(":") ||
    /[\x00-\x1f\x7f]/.test(normalized)
  ) {
    throw new HttpError(400, "Invalid file path.");
  }
  if (
    normalized
      .split("/")
      .some(
        (part) =>
          part === ".." || part === "." || !part || part.startsWith("."),
      )
  ) {
    throw new HttpError(400, "Hidden files and unsafe paths are not allowed.");
  }
  return normalized;
}

export interface ParsedFiles {
  files: { path: string; content: string }[];
  binaryAssets: { path: string; mimeType: string; base64: string }[];
}

export function parseUploads(
  uploads: { originalname: string; buffer: Buffer }[],
): ParsedFiles {
  const result: ParsedFiles = { files: [], binaryAssets: [] };
  const names = new Set<string>();
  let bytes = 0;

  function add(filename: string, buffer: Buffer) {
    const filePath = safeFilePath(filename);
    const extension = filePath.split(".").pop()?.toLowerCase() || "";
    if (!textExtensions.has(extension) && !imageTypes[extension])
      throw new HttpError(
        400,
        `Unsupported file type: ${filePath}. Use HTML, CSS, JS, TXT, JSON or raster images.`,
      );
    if (names.has(filePath.toLowerCase()))
      throw new HttpError(400, `Duplicate file path: ${filePath}.`);
    names.add(filePath.toLowerCase());
    bytes += buffer.length;
    if (names.size > MAX_FILES || bytes > MAX_UPLOAD_BYTES)
      throw new HttpError(
        413,
        "A project can contain at most 60 files and 4 MB of extracted content.",
      );
    if (textExtensions.has(extension)) {
      if (buffer.length > MAX_TEXT_BYTES)
        throw new HttpError(413, `Text file ${filePath} exceeds 1 MB.`);
      try {
        result.files.push({
          path: filePath,
          content: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          400,
          `Text file ${filePath} must use UTF-8 encoding.`,
        );
      }
    } else
      result.binaryAssets.push({
        path: filePath,
        mimeType: imageTypes[extension],
        base64: buffer.toString("base64"),
      });
  }

  for (const upload of uploads) {
    if (upload.buffer.length > MAX_UPLOAD_BYTES)
      throw new HttpError(413, "Upload exceeds 4 MB.");
    if (upload.originalname.toLowerCase().endsWith(".zip")) {
      let archive: AdmZip;
      try {
        archive = new AdmZip(upload.buffer);
      } catch {
        throw new HttpError(400, "Could not read this ZIP file.");
      }
      const entries = archive.getEntries();
      if (entries.length > MAX_FILES + 20)
        throw new HttpError(413, "ZIP contains too many entries.");
      for (const entry of entries) {
        if (entry.isDirectory) {
          safeFilePath(entry.entryName.replace(/\/$/, ""));
          continue;
        }
        safeFilePath(entry.entryName);
        if ((entry.header.flags & 1) !== 0)
          throw new HttpError(400, "Encrypted ZIP files are not supported.");
        if (entry.header.size > MAX_UPLOAD_BYTES - bytes)
          throw new HttpError(413, "ZIP extracted content exceeds 4 MB.");
        let content: Buffer;
        try {
          content = entry.getData();
        } catch {
          throw new HttpError(
            400,
            "ZIP contains an unreadable or damaged entry.",
          );
        }
        add(entry.entryName, content);
      }
    } else add(upload.originalname, upload.buffer);
  }
  return result;
}
