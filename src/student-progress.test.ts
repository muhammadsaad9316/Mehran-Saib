import assert from "node:assert/strict";
import test from "node:test";
import type { Lab, Submission } from "../shared/types";
import { studentProgress } from "./student-progress";

test("student progress counts current tasks and only published marks for that student", () => {
  const lab: Lab = {
    id: "lab",
    title: "Lab",
    description: "",
    published: true,
    dueDate: "",
    totalMarks: 30,
    tasks: ["one", "two", "three"].map((id) => ({
      id,
      title: id,
      description: "",
      maxMarks: 10,
      requirements: [],
    })),
  };
  const submission = (
    id: string,
    studentId: string,
    taskId: string,
    published?: boolean,
  ): Submission => ({
    id,
    studentId,
    taskId,
    labId: "lab",
    files: [],
    link: null,
    submittedAt: "2026-10-12T12:00:00Z",
    status: published === undefined ? "submitted" : "graded",
    revision: 1,
    late: false,
    ...(published === undefined
      ? {}
      : {
          grade: {
            marks: 8,
            feedback: "Feedback",
            published,
            gradedAt: "2026-10-12T13:00:00Z",
          },
        }),
  });
  const result = studentProgress(
    lab,
    [
      submission("own", "student", "one", true),
      submission("draft", "student", "two", false),
      submission("peer", "other", "three", true),
      submission("removed", "student", "removed-task", true),
      {
        ...submission("another-lab", "student", "three", true),
        labId: "different",
      },
    ],
    "student",
  );
  assert.equal(result.submitted, 2);
  assert.equal(result.remaining, 1);
  assert.equal(result.graded, 1);
  assert.equal(result.marks, 8);
  assert.equal(result.gradedMaximum, 10);
  assert.deepEqual(
    result.work.map((item) => item.id),
    ["own", "draft"],
  );
});
