import AdmZip from "adm-zip";
import { fileURLToPath } from "node:url";
import type { Requirement, Task } from "../shared/types.js";

export interface InstructionAttachment {
  name: string;
  content: string;
  contentType: string;
}

export interface InstructionDraft {
  tasks: Task[];
  notice: string;
  text: string;
}

const maxBytes = 5 * 1024 * 1024;
const htmlTags = new Set("html head title meta link style body h1 h2 h3 h4 h5 h6 p br hr pre b strong i em mark del ins sub sup q abbr address bdo samp var font a img div span section article header footer main nav aside ul ol li dl dt dd table caption thead tbody tfoot tr th td form label input textarea select option optgroup button fieldset legend script noscript code blockquote cite kbd small u s audio video source canvas iframe details summary time figure figcaption picture source area map object embed base wbr data output progress meter".split(" "));

function fileBytes(attachment: InstructionAttachment) {
  if (!attachment || typeof attachment !== "object" || typeof attachment.name !== "string" || typeof attachment.content !== "string" || typeof attachment.contentType !== "string") throw new Error("An instruction document is required.");
  if (!attachment.name || attachment.name.length > 160 || /[\\/\x00-\x1f]/.test(attachment.name)) throw new Error("Use a valid instruction filename of at most 160 characters.");
  if (!/\.(pdf|docx?|txt|md)$/i.test(attachment.name)) throw new Error("Choose a PDF, Word, or plain text instruction document.");
  const acceptedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown", "application/octet-stream"];
  if (!acceptedTypes.includes(attachment.contentType)) throw new Error("Unsupported instruction document type.");
  if (!attachment.content || attachment.content.length > 4 * Math.ceil(maxBytes / 3) || attachment.content.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.content)) throw new Error("Instructions must contain valid base64 and be no larger than 5 MB.");
  const bytes = Buffer.from(attachment.content, "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== attachment.content) throw new Error("Instructions must contain valid base64 and be no larger than 5 MB.");
  return bytes;
}

function candidateRules(text: string, taskNumber: number): Requirement[] {
  const candidates = new Map<string, Omit<Requirement, "id">>();
  function add(rule: Omit<Requirement, "id">) {
    if (!rule.value || rule.value.length > 500 || rule.label.length > 200) return;
    const key = `${rule.type}:${rule.value}:${rule.attribute ?? ""}`;
    if (!candidates.has(key)) candidates.set(key, rule);
  }
  const prose = text.replace(/<!--[\s\S]*?-->/g, " ");
  for (const match of prose.matchAll(/<\/?([a-z][a-z0-9-]*)(\s[^<>]*?)?\s*\/?>/gi)) {
    const tag = match[1].toLowerCase();
    if (!htmlTags.has(tag)) continue;
    add({ label: `${tag} element present`, type: "tag", value: tag });
    for (const attribute of (match[2] ?? "").matchAll(/\b([a-z][a-z0-9-]*)\s*=\s*(["'])(.*?)\2/gi)) {
      const name = attribute[1].toLowerCase();
      const value = attribute[3];
      if (!value || name.length > 100 || /[\x00-\x1f]/.test(value)) continue;
      const selector = `${tag}[${name}=${JSON.stringify(value)}]`;
      add({ label: `${tag} ${name} matches the shown value (review)`, type: "attribute", value: selector, attribute: name });
    }
  }
  for (const match of prose.matchAll(/\b([a-z0-9][a-z0-9._-]{0,150}\.(?:html?|css|js|json|svg|png|jpe?g|gif|webp))\b/gi)) {
    add({ label: `${match[1]} included (review)`, type: "file", value: match[1] });
  }
  const quotedText = /\b(?:titled|title\s*(?:to|is|:)|heading\s+with\s+(?:the\s+)?text\s*:|wrap)\s*[“"']([^”"'\n]{1,500})[”"']/gi;
  for (const match of prose.matchAll(quotedText)) {
    const value = match[1].trim();
    add({ label: "Specified text present (review placement)", type: "text", value });
  }
  return [...candidates.values()].slice(0, 80).map((rule, index) => ({ id: `draft-${taskNumber}-rule-${index + 1}`, ...rule }));
}

export function draftRequirementsFromText(input: string): InstructionDraft {
  if (typeof input !== "string" || input.length > 250_000) throw new Error("Instructions contain too much text. Split them into smaller documents.");
  const text = input.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (!text) throw new Error("No readable text was found. Use a text-based PDF or enter the checklist manually for scanned instructions.");
  const headings = [...text.matchAll(/^[ \t]*(?:Lab[ \t]+)?(?:Task|Exercise)[ \t]*(?:No\.?[ \t]*)?(\d{1,2})[ \t]*[:.)–—-]?[ \t]*([^\n]*)$/gmi)];
  if (headings.length > 20) throw new Error("Instructions contain more than 20 tasks. Split them into separate labs.");
  const sections = headings.length ? headings.map((heading, index) => ({
    title: heading[2].trim() || `Task ${heading[1]}`,
    content: text.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? text.length).trim(),
  })) : [{ title: "Instructions checklist", content: text }];
  const tasks = sections.map((section, index) => ({
    id: `draft-task-${index + 1}`,
    title: (section.title + (/^Page[ \t]*(?:\n|$)/i.test(section.content) ? " Page" : "")).slice(0, 120),
    description: section.content.slice(0, 8000),
    maxMarks: 10,
    requirements: candidateRules(section.content, index + 1),
  }));
  return {
    tasks, text,
    notice: "Generated a draft from explicit tags, shown attributes, filenames, and specified text. Examples may not be mandatory, and content, counts, layout, and behavior still need teacher review. Each task defaults to 10 marks. Review every task and requirement before publishing; excerpts and candidate lists are limited to 8,000 characters and 80 checks per task.",
  };
}

export async function analyzeInstructions(attachment: InstructionAttachment): Promise<InstructionDraft> {
  const bytes = fileBytes(attachment);
  const extension = attachment.name.split(".").pop()!.toLowerCase();
  let text: string;
  if (extension === "doc") throw new Error("Automatic extraction does not support legacy .doc files. Save the document as .docx or PDF, or build the checklist manually.");
  if (extension === "pdf") {
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("The attached file is not a valid PDF.");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const standardFontDataUrl = fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)).replace(/\\/g, "/");
    const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, useWorkerFetch: false, standardFontDataUrl });
    try {
      const document = await loading.promise;
      if (document.numPages > 25) throw new Error("PDF instructions may contain at most 25 pages. Split this document into separate labs.");
      const pages: string[] = [];
      let characterCount = 0;
      for (let index = 1; index <= document.numPages; index++) {
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
        characterCount += pageText.length;
        if (characterCount > 250_000) throw new Error("Instructions contain too much text. Split them into smaller documents.");
        pages.push(pageText);
        page.cleanup();
      }
      text = pages.join("\n");
    } catch (cause) {
      if (cause instanceof Error && /25 pages|too much text/.test(cause.message)) throw cause;
      throw new Error("Could not read this PDF. Remove any password protection or use a text-based PDF or DOCX document.");
    } finally {
      await loading.destroy();
    }
  } else if (extension === "docx") {
    try {
      const archive = new AdmZip(bytes);
      const entries = archive.getEntries();
      if (entries.length > 500 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 20 * 1024 * 1024 || !archive.getEntry("word/document.xml")) throw new Error("Document is too large or is not a DOCX file.");
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } catch {
      throw new Error("Could not read this DOCX. Use a valid document with at most 20 MB of uncompressed content, or export it as PDF.");
    }
  } else {
    text = bytes.toString("utf8");
  }
  return draftRequirementsFromText(text);
}
