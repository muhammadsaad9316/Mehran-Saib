import type { Lab, Submission } from "../shared/types";

export function studentProgress(
  lab: Lab,
  submissions: Submission[],
  studentId: string,
) {
  const work = lab.tasks.flatMap((task) => {
    const submission = submissions.find(
      (item) =>
        item.labId === lab.id &&
        item.taskId === task.id &&
        item.studentId === studentId,
    );
    return submission ? [submission] : [];
  });
  const graded = work.filter((item) => item.grade?.published);
  return {
    work,
    submitted: work.length,
    remaining: lab.tasks.length - work.length,
    graded: graded.length,
    marks: graded.reduce((sum, item) => sum + item.grade!.marks, 0),
    gradedMaximum: graded.reduce(
      (sum, item) =>
        sum + lab.tasks.find((task) => task.id === item.taskId)!.maxMarks,
      0,
    ),
  };
}
