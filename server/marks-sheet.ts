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
export interface PrintMarksSheet {
  title: string;
  columns: { label: string; maximum: number }[];
  totalMaximum: number;
  rows: { rollNumber: string; name: string; marks: (number | null)[]; total: number | null }[];
}

export function buildPrintMarksSheet(
  labs: { lab: Lab; labNumber: number }[],
  students: User[],
  submissions: Submission[],
): PrintMarksSheet {
  const single = labs.length === 1;
  const orderedStudents = students.filter((user) => user.role === "student").sort(byRollNumber);
  const sheets = labs.map(({ lab, labNumber }) => buildMarksSheet(lab, labNumber, students, submissions));
  return {
    title: `${single ? "Lab" : "Labs"} ${labs.map(({ labNumber }) => labNumber).join(", ")} Marks Sheet (Fall 2026)`,
    columns: single
      ? labs[0].lab.tasks.map((task, index) => ({ label: `Task ${index + 1}`, maximum: task.maxMarks }))
      : labs.map(({ lab, labNumber }) => ({ label: `Lab ${labNumber}`, maximum: lab.totalMarks })),
    totalMaximum: labs.reduce((sum, { lab }) => sum + lab.totalMarks, 0),
    rows: (sheets[0]?.rows ?? []).map((row, index) => {
      const totals = sheets.map((sheet) => sheet.rows[index].marks);
      return {
        rollNumber: row.rollNumber,
        name: row.name,
        marks: single
          ? labs[0].lab.tasks.map((task) => submissions.find((sub) =>
              sub.labId === labs[0].lab.id && sub.taskId === task.id &&
              sub.studentId === orderedStudents[index].id,
            )?.grade?.marks ?? null)
          : totals,
        total: totals.every((marks) => marks !== null)
          ? Number(totals.reduce<number>((sum, marks) => sum + marks!, 0).toFixed(2)) : null,
      };
    }),
  };
}

const escapeHtml = (value: unknown) =>
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

export function marksSheetSelectionHtml(labs: Lab[], selectedIds: string[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Choose labs · Marks sheet</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#182230;font:16px Arial,sans-serif}main{max-width:600px;margin:48px auto;padding:28px;background:white;border:1px solid #e2e8f0;border-radius:12px}h1{font-size:26px;margin-top:0}p{line-height:1.6;color:#475569}fieldset{border:0;margin:24px 0;padding:0}legend{font-weight:bold;margin-bottom:12px}label{display:flex;align-items:center;gap:12px;padding:14px 4px;border-bottom:1px solid #e2e8f0;cursor:pointer}input{width:20px;height:20px;accent-color:#c2410c;flex-shrink:0}button{padding:13px 20px;border:0;border-radius:6px;background:#f97316;color:#182230;font-size:16px;font-weight:bold;cursor:pointer}:focus-visible{outline:3px solid #c2410c;outline-offset:3px}@media(max-width:640px){main{margin:16px;padding:20px}button{width:100%}}
  </style></head><body><main><h1>Print marks sheet</h1><p>Choose one lab to show each task’s marks and the lab total. Choose multiple labs to show each lab’s total and an overall total.</p><form action="/api/reports/print" method="get"><fieldset><legend>Labs to include</legend>${labs.map((lab, index) => `<label><input type="checkbox" name="labId" value="${escapeHtml(lab.id)}"${selectedIds.includes(lab.id) ? " checked" : ""}><span>Lab ${index + 1} · ${escapeHtml(lab.title)}</span></label>`).join("")}</fieldset><button type="submit"${labs.length ? "" : " disabled"}>Preview marks sheet</button><p role="status" id="selection-status" aria-live="polite">Select at least one lab.</p></form></main><script>const form=document.querySelector('form');const button=form.querySelector('button');const status=document.getElementById('selection-status');function update(){const count=form.querySelectorAll('input:checked').length;button.disabled=count===0;status.textContent=count===0?'Select at least one lab.':count===1?'Task marks and lab total.':'Lab totals and overall total.'}form.addEventListener('change',update);update();</script></body></html>`;
}

export function marksSheetHtml(sheet: PrintMarksSheet, selectionUrl: string): string {
  const wide = sheet.columns.length > 5;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(sheet.title)}</title><style>
  @page{size:A4 ${wide ? "landscape" : "portrait"};margin:12mm}*{box-sizing:border-box}body{margin:0;background:#eee;color:#000;font-family:"Times New Roman",serif}.print-controls{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;padding:18px;gap:16px;font:13px Arial,sans-serif}.print-controls button,.print-controls a{padding:10px 16px;border:1px solid #888;background:white;color:#000;cursor:pointer}.print-controls p{margin:0;max-width:560px;line-height:1.5}.sheet-scroll{overflow-x:auto}.sheet{background:white;width:${wide ? "273" : "186"}mm;margin:0 auto 24px;padding:10mm 4mm}h1,h2{text-align:center;font-size:19px;line-height:1.3;margin:0 0 10px}h2{margin-bottom:16px}.metadata{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:bold;margin-bottom:8px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${sheet.columns.length > 12 ? "9" : "12"}px}th,td{border:1px solid #000;padding:3px;height:5mm;line-height:1.2;text-align:center;overflow-wrap:anywhere}th:first-child{width:8%}th:nth-child(2){width:25%}th:nth-child(2),td:nth-child(2){text-align:left}th small{display:block;font-weight:normal}td:last-child{font-weight:bold}tr{break-inside:avoid}:focus-visible{outline:3px solid #c2410c;outline-offset:3px}@media print{body{background:white}.print-controls{display:none}.sheet-scroll{overflow:visible}.sheet{padding:0;width:auto;margin:0}}@media(max-width:760px){.print-controls{justify-content:flex-start}}
  </style></head><body><div class="print-controls"><a href="${escapeHtml(selectionUrl)}">Choose labs</a><button onclick="window.print()">Print / Save PDF</button><p>Choose A4 and turn off browser headers and footers. Blank marks or totals mean grading is incomplete. Saved draft grades are included.</p></div><div class="sheet-scroll"><main class="sheet"><h1>${marksSheetCollege}</h1><h2>${escapeHtml(sheet.title)}</h2><div class="metadata"><span>BS: Computer Science</span><span>Semester: 7th</span><span>Subject: Web Engineering</span></div><table><thead><tr><th scope="col">R. No</th><th scope="col">Name</th>${sheet.columns.map((column) => `<th scope="col">${escapeHtml(column.label)}<small>out of ${column.maximum}</small></th>`).join("")}<th scope="col">Total<small>out of ${sheet.totalMaximum}</small></th></tr></thead><tbody>${sheet.rows.map((row) => `<tr><td>${escapeHtml(row.rollNumber)}</td><td>${escapeHtml(row.name)}</td>${row.marks.map((marks) => `<td>${marks ?? ""}</td>`).join("")}<td>${row.total ?? ""}</td></tr>`).join("")}</tbody></table></main></div></body></html>`;
}
