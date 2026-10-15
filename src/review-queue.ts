import type { Lab, Submission, User } from "../shared/types";
import { byRollNumber } from "../shared/roster";

export type ReviewQueueMode = "pending" | "all";

export function firstPendingSubmission(students: User[], submissions: Submission[]): Submission | null {
  for (const student of [...students].sort(byRollNumber)) {
    const pending = submissions.find((item) => item.studentId === student.id && !item.grade);
    if (pending) return pending;
  }
  return null;
}

export function reviewQueue(
  lab: Lab,
  students: User[],
  submissions: Submission[],
  current: Submission,
  mode: ReviewQueueMode,
) {
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const labSubmissions = submissions.filter((item) => item.labId === lab.id)
    .sort((a, b) => {
      const left = studentMap.get(a.studentId);
      const right = studentMap.get(b.studentId);
      return left && right ? byRollNumber(left, right) : 0;
    });
  const allTaskSubmissions = labSubmissions.filter((item) => item.taskId === current.taskId);
  const activeQueue = allTaskSubmissions.filter((item) => mode === "all" || !item.grade || item.id === current.id);
  const index = activeQueue.findIndex((item) => item.id === current.id);
  const nextSubmission = activeQueue[index + 1]
    ?? (mode === "pending" ? activeQueue.find((item) => item.id !== current.id && !item.grade) : undefined)
    ?? null;
  const prevSubmission = index > 0 ? activeQueue[index - 1] : null;
  const taskIndex = lab.tasks.findIndex((task) => task.id === current.taskId);
  const otherTasks = [...lab.tasks.slice(taskIndex + 1), ...lab.tasks.slice(0, taskIndex)];
  let nextTaskSubmission: Submission | null = null;
  for (const task of otherTasks) {
    nextTaskSubmission = labSubmissions.find((item) => item.taskId === task.id && !item.grade) ?? null;
    if (nextTaskSubmission) break;
  }
  return { allTaskSubmissions, activeQueue, nextSubmission, prevSubmission, nextTaskSubmission };
}
