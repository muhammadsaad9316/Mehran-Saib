import type { Submission, Task } from "./types.js";

// A consistency fingerprint, not an authorization token or an authorship score.
export function evidenceVersion(task: Task, submissions: Pick<Submission, "id" | "revision">[]) {
  const text = JSON.stringify([task.id, task.description, task.requirements,
    submissions.map(item => `${item.id}:${item.revision}`).sort()]);
  let hash = 14695981039346656037n;
  for (let index = 0; index < text.length; index++)
    hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(index))) * 1099511628211n);
  return hash.toString(16);
}
