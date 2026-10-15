import { useEffect, useState } from "react";
import type { Submission } from "../shared/types";
import { api } from "./api";

export function useSubmissionSource(summary: Submission) {
  const [loaded, setLoaded] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!summary.sourceOmitted) return;
    const controller = new AbortController();
    let active = true;
    setLoaded(null); setError("");
    api<Submission>(`/submissions/${summary.id}/source?revision=${summary.revision}`, { signal: controller.signal })
      .then(project => {
        if (project.id !== summary.id || project.revision !== summary.revision || project.sourceOmitted) throw new Error("The project changed. Refresh the workspace.");
        if (active) setLoaded(project);
      })
      .catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; controller.abort(); };
  }, [summary.id, summary.revision, summary.sourceOmitted]);
  const matches = loaded?.id === summary.id && loaded.revision === summary.revision;
  return { project: summary.sourceOmitted && matches ? { ...summary, files: loaded.files, sourceOmitted: false } : summary,
    loading: Boolean(summary.sourceOmitted && !matches), error };
}
