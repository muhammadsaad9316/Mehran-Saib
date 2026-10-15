import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { load } from "cheerio";
import { marksSheetXlsx } from "./marks-sheet-xlsx.js";
import {
  buildMarksSheet,
  buildPrintMarksSheet,
  marksInWords,
  marksSheetCsv,
  marksSheetHtml,
  marksSheetSelectionHtml,
} from "./marks-sheet.js";
import {
  canonicalRollNumber,
  renumberLegacyStudents,
} from "../shared/roster.js";
import type { Lab, Submission, User } from "../shared/types.js";

test("legacy rolls become 1–41 without changing account IDs or names", () => {
  const users = Array.from({ length: 41 }, (_, i) => ({
    id: `student-${i + 1}`,
    name: `Student ${i + 1}`,
    email: `s${i + 1}@example.test`,
    role: "student" as const,
    rollNumber: `22-CS-${String(i + 1).padStart(3, "0")}`,
  }));
  const migrated = renumberLegacyStudents([...users].reverse());
  for (const user of migrated) {
    assert.equal(user.rollNumber, user.id.slice(8));
    assert.equal(user.name, `Student ${user.rollNumber}`);
  }
  assert.deepEqual(renumberLegacyStudents(migrated), migrated);
  assert.equal(canonicalRollNumber("01"), "1");
  assert.equal(canonicalRollNumber("41"), "41");
  for (const value of ["0", "42", "1.5", "22-CS-001", NaN])
    assert.equal(canonicalRollNumber(value), null);
});
test("marks sheets use numeric roll order, complete task totals, and blank incomplete marks", () => {
  const students: User[] = [10, 2, 1].map((roll) => ({
    id: `s${roll}`,
    name: roll === 10 ? "=TEST()" : `Student ${roll}`,
    email: "test@example.test",
    role: "student",
    rollNumber: String(roll),
  }));
  const lab: Lab = {
    id: "lab2",
    title: "Formatting",
    description: "",
    dueDate: "2026-10-16",
    totalMarks: 20,
    published: true,
    tasks: [1, 2].map((i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      description: "",
      maxMarks: 10,
      requirements: [],
    })),
  };
  const submission = (
    studentId: string,
    taskId: string,
    marks: number,
  ): Submission => ({
    id: `${studentId}-${taskId}`,
    studentId,
    taskId,
    labId: lab.id,
    files: [],
    link: null,
    submittedAt: "2026-10-12",
    status: "graded",
    revision: 1,
    late: false,
    grade: { marks, feedback: "", published: false, gradedAt: "2026-10-12" },
  });
  const sheet = buildMarksSheet(lab, 2, students, [
    submission("s1", "t1", 0),
    submission("s1", "t2", 0),
    submission("s2", "t1", 8.5),
    submission("s2", "t2", 9),
    submission("s10", "t1", 5),
  ]);
  assert.deepEqual(
    sheet.rows.map((row) => row.rollNumber),
    ["1", "2", "10"],
  );
  assert.equal(sheet.rows[0].marks, 0);
  assert.equal(sheet.rows[0].words, "Zero");
  assert.equal(sheet.rows[1].marks, 17.5);
  assert.equal(sheet.rows[1].words, "Seventeen point five");
  assert.equal(sheet.rows[2].marks, null);
  const csv = marksSheetCsv(sheet);
  assert.match(csv, /Lab 2 Marks Sheet \(Fall 2026\)/);
  assert.match(csv, /Semester: 7th/);
  assert.match(csv, /Subject: Web Engineering/);
  assert.match(csv, /R\. No","Name","Marks in Figure","Marks in Words/);
  assert.match(csv, /'=TEST\(\)/);
  assert.equal(csv.split("\r\n").length, 7);
  const workbook = new AdmZip(marksSheetXlsx(sheet));
  const worksheet = load(workbook.readAsText("xl/worksheets/sheet1.xml"), { xmlMode: true });
  assert.equal(worksheet('c[r="C6"] v').text(), "0");
  assert.equal(worksheet('c[r="C7"] v').text(), "17.5");
  assert.equal(worksheet('c[r="C8"] v').length, 0);
  assert.equal(worksheet('c[r="B8"]').attr("t"), "inlineStr");
  assert.equal(worksheet('c[r="B8"] t').text(), "=TEST()");
  assert.equal(worksheet("f").length, 0);
});

test("print one lab with task marks, or multiple labs with lab totals, preserving incomplete and zero grades", () => {
  const students: User[] = [10, 2, 1].map((roll) => ({
    id: `s${roll}`, name: roll === 10 ? "<script>bad()</script>" : `Student ${roll}`,
    email: `${roll}@example.test`, role: "student", rollNumber: String(roll),
  }));
  const labs: Lab[] = [1, 2].map((number) => ({
    id: `lab${number}`, title: `Lab ${number} <content>`, description: "", dueDate: "",
    published: true, totalMarks: 20,
    tasks: [1, 2].map((task) => ({
      id: `t${task}`, title: `Task ${task}`, description: "", maxMarks: 10, requirements: [],
    })),
  }));
  function work(roll: number, lab: number, task: number, marks?: number): Submission {
    return {
      id: `${roll}-${lab}-${task}`, studentId: `s${roll}`, labId: `lab${lab}`, taskId: `t${task}`,
      files: [], link: null, submittedAt: "2026-10-15", revision: 1, late: false,
      status: marks === undefined ? "submitted" : "graded",
      ...(marks === undefined ? {} : { grade: { marks, feedback: "", published: false, gradedAt: "2026-10-15" } }),
    };
  }
  const submissions = [
    work(1, 1, 1, 0), work(1, 1, 2, 0), work(1, 2, 1, 0), work(1, 2, 2, 0),
    work(2, 1, 1, 8.5), work(2, 1, 2, 9.25), work(2, 2, 1, 7), work(2, 2, 2, 8),
    work(10, 1, 1, 5), work(10, 1, 2),
  ];
  const single = buildPrintMarksSheet([{ lab: labs[0], labNumber: 1 }], students, submissions);
  assert.deepEqual(single.columns, [{ label: "Task 1", maximum: 10 }, { label: "Task 2", maximum: 10 }]);
  assert.equal(single.totalMaximum, 20);
  assert.deepEqual(single.rows.map(({ rollNumber, marks, total }) => ({ rollNumber, marks, total })), [
    { rollNumber: "1", marks: [0, 0], total: 0 },
    { rollNumber: "2", marks: [8.5, 9.25], total: 17.75 },
    { rollNumber: "10", marks: [5, null], total: null },
  ]);
  const multiple = buildPrintMarksSheet(labs.map((lab, index) => ({ lab, labNumber: index + 1 })), students, submissions);
  assert.deepEqual(multiple.columns, [{ label: "Lab 1", maximum: 20 }, { label: "Lab 2", maximum: 20 }]);
  assert.equal(multiple.totalMaximum, 40);
  assert.deepEqual(multiple.rows.map(({ marks, total }) => ({ marks, total })), [
    { marks: [0, 0], total: 0 }, { marks: [17.75, 15], total: 32.75 }, { marks: [null, null], total: null },
  ]);
  const incomplete = buildPrintMarksSheet(labs.map((lab, index) => ({ lab, labNumber: index + 1 })), students,
    submissions.filter((submission) => submission.labId === "lab1"));
  assert.deepEqual(incomplete.rows[1].marks, [17.75, null]);
  assert.equal(incomplete.rows[1].total, null);
  const html = marksSheetHtml(multiple, "/api/reports/print?select=1&labId=lab1");
  const doc = load(html);
  assert.deepEqual(doc("thead th").map((_, el) => doc(el).contents().first().text()).get(), ["R. No", "Name", "Lab 1", "Lab 2", "Total"]);
  assert.deepEqual(doc("tbody tr").last().find("td").map((_, el) => doc(el).text()).get(), ["10", "<script>bad()</script>", "", "", ""]);
  assert.equal(doc("script").length, 0);
  assert.equal(doc(".print-controls a").attr("href"), "/api/reports/print?select=1&labId=lab1");
  const selection = load(marksSheetSelectionHtml(labs, ["lab2"]));
  assert.equal(selection('input:checked').attr("value"), "lab2");
  assert.equal(selection("content").length, 0);
  assert.equal(selection('form').attr("action"), "/api/reports/print");
});
test("marks in words supports the configured maximum and fractional grades", () => {
  assert.equal(marksInWords(24), "Twenty-four");
  assert.equal(marksInWords(100), "One hundred");
  assert.equal(marksInWords(20000), "Twenty thousand");
  assert.equal(marksInWords(9.25), "Nine point two five");
});

test("Excel exports readable, printable columns and safe literal text", () => {
  const workbook = new AdmZip(marksSheetXlsx({
    title: "Lab 1 Marks Sheet (Fall 2026)",
    rows: [{ rollNumber: "1", name: '=HYPERLINK("https://example.test") & <name>\u0001 😀', marks: 9.25, words: "Nine point two five" }],
  }));
  assert.equal(workbook.getEntries().length, 6);
  const xml = workbook.readAsText("xl/worksheets/sheet1.xml");
  const sheet = load(xml, { xmlMode: true });
  assert.equal(sheet('c[r="B6"] t').text(), '=HYPERLINK("https://example.test") & <name> 😀');
  assert.equal(sheet('c[r="C6"] v').text(), "9.25");
  assert.equal(sheet('c[r="C6"]').attr("t"), undefined);
  assert.equal(sheet("f, hyperlink").length, 0);
  assert.equal(sheet('col[min="2"]').attr("width"), "36");
  assert.equal(sheet('col[min="4"]').attr("width"), "42");
  assert.equal(sheet("pane").attr("state"), "frozen");
  assert.equal(sheet("pane").attr("topLeftCell"), "A6");
  assert.equal(sheet("autoFilter").attr("ref"), "A5:D6");
  assert.equal(sheet('mergeCell[ref="A1:D1"]').length, 1);
  assert.equal(sheet("pageSetup").attr("paperSize"), "9");
  assert.equal(sheet("pageSetup").attr("fitToWidth"), "1");
  assert.equal(sheet("pageSetup").attr("fitToHeight"), "0");
  assert.ok(!xml.includes("\u0001"));
  const styles = load(workbook.readAsText("xl/styles.xml"), { xmlMode: true });
  assert.equal(styles("cellXfs > xf").length, 11);
  assert.equal(styles('fgColor[rgb="FFF97316"]').length, 1);
  const names = load(workbook.readAsText("xl/workbook.xml"), { xmlMode: true });
  assert.equal(names('definedName[name="_xlnm.Print_Titles"]').text(), "'Marks sheet'!$1:$5");
  const empty = load(new AdmZip(marksSheetXlsx({ title: "Empty sheet", rows: [] })).readAsText("xl/worksheets/sheet1.xml"), { xmlMode: true });
  assert.equal(empty("autoFilter").length, 0);
  assert.equal(empty('mergeCell[ref="A7:D7"]').length, 1);
});
