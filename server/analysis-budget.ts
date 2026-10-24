import type { Submission } from "../shared/types.js";

// Keep these hard ceilings aligned with the private analysis-projects SQL RPC.
export const ANALYSIS_MAX_FILES = 40;
export const ANALYSIS_MAX_SOURCE_BYTES = 200_000;
export const ANALYSIS_MAX_PROJECTS = 200;
export const ANALYSIS_MAX_TOTAL_BYTES = 2_000_000;
export type AnalysisSubmission = Submission & { analysisSourceLimited?: boolean };

/** Preserve filename checks, but never truncate a file into misleading parser input. */
export function analysisProjects(submissions: Submission[]): AnalysisSubmission[] {
  let total = 0;
  return submissions.slice(0, ANALYSIS_MAX_PROJECTS).map(submission => {
    let bytes = 0;
    let limited = false;
    const files = submission.files.map((file, index) => {
      const size = Buffer.byteLength(file.content);
      if (limited || index >= ANALYSIS_MAX_FILES || bytes + size > ANALYSIS_MAX_SOURCE_BYTES || total + size > ANALYSIS_MAX_TOTAL_BYTES) {
        limited = true;
        return { path: file.path, content: "" };
      }
      bytes += size;
      total += size;
      return { ...file };
    });
    return { ...submission, files, sourceOmitted: false,
      ...(limited || (submission as AnalysisSubmission).analysisSourceLimited ? { analysisSourceLimited: true } : {}) };
  });
}
