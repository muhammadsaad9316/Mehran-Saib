import { createHash } from "node:crypto";
import type { Lab } from "../shared/types.js";

export function labMetadata(lab: Lab): Lab {
  if (!lab.instructionFile) return lab;
  const { content, ...file } = lab.instructionFile;
  const sha256 = content === undefined || /^[a-f0-9]{64}$/.test(file.sha256 || "")
    ? file.sha256
    : createHash("sha256").update(Buffer.from(content, "base64")).digest("hex");
  return { ...lab, instructionFile: { ...file, sha256 } };
}
