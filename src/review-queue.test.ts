import assert from "node:assert/strict";
import test from "node:test";
import type { Lab, Submission, User } from "../shared/types";
import { firstPendingSubmission, reviewQueue } from "./review-queue";

const students: User[] = [10, 2, 1].map((roll) => ({
  id: `student-${roll}`, rollNumber: String(roll), name: `Student ${roll}`,
  email: `${roll}@example.test`, role: "student",
}));
const lab: Lab = {
  id: "lab", title: "Lab", description: "", dueDate: "", published: true,
  totalMarks: 40,
  tasks: [1, 2, 3, 4].map((number) => ({
    id: `task-${number}`, title: `Task ${number}`, description: "", maxMarks: 10, requirements: [],
  })),
};
function work(roll: number, task = 1, marks?: number, published = true): Submission {
  return {
    id: `work-${roll}-${task}`, studentId: `student-${roll}`, labId: lab.id,
    taskId: `task-${task}`, files: [], link: null, revision: 1, late: false,
    status: marks === undefined ? "submitted" : "graded", submittedAt: "2026-10-15T08:00:00Z",
    ...(marks === undefined ? {} : { grade: { marks, published, feedback: "", gradedAt: "2026-10-15T09:00:00Z" } }),
  };
}

test("review entry selects the first roster submission in numeric roll order and skips saved grades or missing work", () => {
  const pending = [work(10), work(2), work(1, 1, 0, false)];
  assert.equal(firstPendingSubmission(students, pending)?.id, "work-2-1");
  assert.equal(firstPendingSubmission(students, [work(10), work(1)])?.id, "work-1-1");
  assert.equal(firstPendingSubmission(students, [work(1, 1, 0), work(2, 1, 5, false)]), null);
  assert.equal(firstPendingSubmission(students, []), null);
  assert.equal(firstPendingSubmission(students, [work(41)]), null);
});

test("pending queue uses numeric roll order, skips saved zero/draft grades, and wraps before leaving the task", () => {
  const current = work(10);
  const submissions = [current, work(2, 1, 0, false), work(1), work(2, 2)];
  const queue = reviewQueue(lab, students, submissions, current, "pending");
  assert.deepEqual(queue.activeQueue.map((item) => item.studentId), ["student-1", "student-10"]);
  assert.equal(queue.nextSubmission?.id, "work-1-1");
  assert.equal(queue.prevSubmission?.id, "work-1-1");
});

test("last pending submission advances through lab task order and skips empty or fully graded tasks", () => {
  const current = work(2);
  const queue = reviewQueue(lab, students,
    [work(10, 4), work(1, 3, 0), work(2, 3, 4, false), current, work(2, 4), work(1, 1, 8)],
    current, "pending");
  assert.equal(queue.nextSubmission, null);
  assert.equal(queue.nextTaskSubmission?.id, "work-2-4");
});

test("task transitions wrap to earlier tasks with pending work and stay in the current lab", () => {
  const current = work(1, 4);
  const unrelated = { ...work(1, 2), id: "other-lab", labId: "other" };
  const queue = reviewQueue(lab, students, [current, unrelated, work(10, 1), work(2, 1)], current, "pending");
  assert.equal(queue.nextTaskSubmission?.id, "work-2-1");
});

test("all mode includes graded students without wrapping within the task", () => {
  const first = work(1, 1, 0);
  const last = work(10, 1, 9);
  const submissions = [last, work(2), first, work(2, 2)];
  assert.equal(reviewQueue(lab, students, submissions, first, "all").nextSubmission?.id, "work-2-1");
  const queue = reviewQueue(lab, students, submissions, last, "all");
  assert.equal(queue.nextSubmission, null);
  assert.equal(queue.prevSubmission?.id, "work-2-1");
  assert.equal(queue.nextTaskSubmission?.id, "work-2-2");
});

test("completion excludes the current submission and never invents grades for missing work", () => {
  const current = work(1);
  const submissions = [current, work(2, 2, 0), work(10, 3, 5, false)];
  const before = structuredClone(submissions);
  const queue = reviewQueue(lab, students, submissions, current, "pending");
  assert.equal(queue.nextSubmission, null);
  assert.equal(queue.nextTaskSubmission, null);
  assert.deepEqual(submissions, before);
});

test("resubmission returns to the pending queue and the currently reviewed grade stays navigable", () => {
  const current = work(2, 1, 8);
  const revised = { ...work(1), revision: 2 };
  const queue = reviewQueue(lab, students, [current, revised], current, "pending");
  assert.deepEqual(queue.activeQueue.map((item) => item.id), [revised.id, current.id]);
  assert.equal(queue.nextSubmission?.revision, 2);
});
