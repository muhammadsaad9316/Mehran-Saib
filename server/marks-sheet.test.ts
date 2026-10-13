import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarksSheet,
  marksInWords,
  marksSheetCsv,
  marksSheetHtml,
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
  assert.match(
    marksSheetHtml({
      ...sheet,
      rows: [
        {
          rollNumber: "1",
          name: "<script>alert(1)</script>",
          marks: null,
          words: "",
        },
      ],
    }),
    /&lt;script&gt;/,
  );
});
test("marks in words supports the configured maximum and fractional grades", () => {
  assert.equal(marksInWords(24), "Twenty-four");
  assert.equal(marksInWords(100), "One hundred");
  assert.equal(marksInWords(20000), "Twenty thousand");
  assert.equal(marksInWords(9.25), "Nine point two five");
});
