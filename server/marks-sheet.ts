import type { Lab, Submission, User } from "../shared/types.js";
import { byRollNumber } from "../shared/roster.js";

export const marksSheetCollege = "Govt. Degree College Lundkhwar, Mardan";
export interface MarksSheetRow {
  rollNumber: string;
  name: string;
  marks: number | null;
  words: string;
}
export interface MarksSheet {
  title: string;
  rows: MarksSheetRow[];
}

export function marksInWords(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 20_000)
    throw new Error("Marks are outside the supported range.");
  const ones = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  function integer(number: number): string {
    if (number < 20) return ones[number];
    if (number < 100)
      return (
        tens[Math.floor(number / 10)] +
        (number % 10 ? "-" + ones[number % 10] : "")
      );
    if (number < 1000)
      return (
        ones[Math.floor(number / 100)] +
        " hundred" +
        (number % 100 ? " and " + integer(number % 100) : "")
      );
    return (
      integer(Math.floor(number / 1000)) +
      " thousand" +
      (number % 1000 ? " " + integer(number % 1000) : "")
    );
  }
  const [whole, fraction] = String(value).split(".");
  const result =
    integer(Number(whole)) +
    (fraction
      ? " point " +
        fraction
          .split("")
          .map((digit) => ones[Number(digit)])
          .join(" ")
      : "");
  return result[0].toUpperCase() + result.slice(1);
}
export function buildMarksSheet(
  lab: Lab,
  labNumber: number,
  students: User[],
  submissions: Submission[],
): MarksSheet {
  return {
    title: `Lab ${labNumber} Marks Sheet (Fall 2026)`,
    rows: students
      .filter((user) => user.role === "student")
      .sort(byRollNumber)
      .map((student) => {
        const grades = lab.tasks.map(
          (task) =>
            submissions.find(
              (sub) =>
                sub.studentId === student.id &&
                sub.labId === lab.id &&
                sub.taskId === task.id,
            )?.grade,
        );
        const marks =
          grades.length && grades.every((grade) => grade !== undefined)
            ? Number(
                grades.reduce((sum, grade) => sum + grade!.marks, 0).toFixed(2),
              )
            : null;
        return {
          rollNumber: student.rollNumber || "",
          name: student.name,
          marks,
          words: marks === null ? "" : marksInWords(marks),
        };
      }),
  };
}
export function marksSheetCsv(sheet: MarksSheet): string {
  const rows: unknown[][] = [
    [marksSheetCollege, "", "", ""],
    [sheet.title, "", "", ""],
    ["BS: Computer Science", "Semester: 7th", "Subject: Web Engineering", ""],
    ["R. No", "Name", "Marks in Figure", "Marks in Words"],
    ...sheet.rows.map((row) => [
      row.rollNumber,
      row.name,
      row.marks ?? "",
      row.words,
    ]),
  ];
  const cell = (value: unknown) => {
    const raw = String(value);
    const safe = /^(?:\s*[=+\-@]|[\t\r\n])/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
export function marksSheetHtml(sheet: MarksSheet): string {
  const escape = (value: unknown) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(sheet.title)}</title><style>
  @page{size:A4 portrait;margin:15mm}*{box-sizing:border-box}body{margin:0;background:#eee;color:#000;font-family:"Times New Roman",serif}.print-controls{display:flex;justify-content:center;padding:18px;gap:16px;font-family:Arial,sans-serif;font-size:13px}.print-controls button{padding:9px 16px;border:1px solid #888;background:white;cursor:pointer}.print-controls p{margin:0;max-width:560px;line-height:1.5}.sheet{background:white;width:190mm;margin:0 auto 24px;padding:12mm 6mm 8mm;min-height:267mm}h1,h2{text-align:center;font-size:19px;line-height:1.3;margin:0 0 10px}h2{font-size:19px;margin-bottom:16px}.metadata{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:bold;margin-bottom:8px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}th,td{border:1px solid #000;padding:2px 4px;height:4.8mm;line-height:1.15}th{text-align:left;font-size:12px;height:7mm}th:first-child{width:12%}th:nth-child(2){width:37%}th:nth-child(3){width:24%}th:nth-child(4){width:27%}td:first-child,td:nth-child(3){text-align:center}td:last-child{font-size:11px}@media print{body{background:white}.print-controls{display:none}.sheet{padding:8mm 0 0;width:auto;margin:0;min-height:0}tr{break-inside:avoid}}@media screen and (max-width:760px){.sheet{margin:0;width:100%;padding:20px 10px}.metadata{font-size:11px}.print-controls{flex-wrap:wrap}}
  </style></head><body><div class="print-controls"><button onclick="window.print()">Print / Save PDF</button><p>Choose A4 and turn off browser headers and footers. Blank marks mean grading is incomplete. This sheet contains your saved lab grades.</p></div><main class="sheet"><h1>${marksSheetCollege}</h1><h2>${escape(sheet.title)}</h2><div class="metadata"><span>BS: Computer Science</span><span>Semester: 7th</span><span>Subject: Web Engineering</span></div><table><thead><tr><th>R. No</th><th>Name</th><th>Marks in Figure</th><th>Marks in Words</th></tr></thead><tbody>${sheet.rows.map((row) => `<tr><td>${escape(row.rollNumber)}</td><td>${escape(row.name)}</td><td>${row.marks ?? ""}</td><td>${escape(row.words)}</td></tr>`).join("")}</tbody></table></main></body></html>`;
}
