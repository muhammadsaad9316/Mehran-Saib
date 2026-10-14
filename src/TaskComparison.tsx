import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import type { AnalysisResult, AppState, Submission, Task, TaskAnalysis } from "../shared/types";
import { api } from "./api";
import { buildPreview, resolvePath } from "./preview";
import { useSubmissionAssets } from "./submission-assets";

interface Props {
  left: Submission; right: Submission; task: Task; state: AppState;
  pair?: TaskAnalysis["pairs"][number]; onBack: () => void; onRefresh: () => Promise<unknown>;
  loading: boolean; available: boolean;
}

export default function TaskComparison({ left, right, task, state, pair, onBack, onRefresh, loading, available }: Props) {
  const [view, setView] = useState("preview");
  const [evidence, setEvidence] = useState<{ fingerprint: string; blocks: { source: string; peer: string }[] } | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [gradingWarning, setGradingWarning] = useState("");
  const evidenceFingerprint = JSON.stringify([left.id, left.revision, right.id, right.revision, task.description, task.requirements]);
  const blocks = evidence?.fingerprint === evidenceFingerprint ? evidence.blocks : [];
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setEvidence(null); setEvidenceError("");
    api<AnalysisResult>(`/submissions/${left.id}/analysis?peerId=${encodeURIComponent(right.id)}`, { signal: controller.signal })
      .then((analysis) => { if (active) setEvidence({ fingerprint: evidenceFingerprint, blocks: analysis.similarities.find((match) => match.submissionId === right.id)?.matchingBlocks || [] }); })
      .catch((cause) => { if (active) setEvidenceError(cause.message); });
    return () => { active = false; controller.abort(); };
  }, [evidenceFingerprint]);
  return <section className="task-comparison" aria-label="Side by side task comparison">
    <div className="task-comparison-heading">
      <button className="teacher-text-button" onClick={onBack}><ArrowLeft size={16} /> Back to tasks</button>
      <strong>{task.title}</strong>
      <span>{pair ? pair.comparable ? `${pair.percentage}% matching code` : "Incomplete comparison" : loading ? "Comparison updating…" : available ? "No substantial match" : "Comparison unavailable"}</span>
    </div>
    {pair && <p className="task-check-note">{pair.comparable ? `Matching coverage: ${pair.sourceCoverage}% of the left task and ${pair.peerCoverage}% of the right task. Required boilerplate is excluded; similarity does not prove copying.` : "Some source files could not be analyzed completely. Review these tasks manually."}</p>}
    <div className="comparison-view-switch" role="group" aria-label="Comparison view">
      <button aria-pressed={view === "preview"} onClick={() => setView("preview")}>Preview both</button>
      <button aria-pressed={view === "source"} onClick={() => setView("source")}>Source code side by side</button>
    </div>
    {evidenceError && <p className="error" role="alert">{evidenceError}</p>}
    {gradingWarning && <p className="error" role="alert">{gradingWarning}</p>}
    {view === "source" && <p className="task-check-note">Highlighted lines show sample matching blocks; the score covers both tasks.</p>}
    <div className="task-comparison-grid">
      {[left, right].map((submission, index) => <ComparisonPane key={`${submission.id}-${submission.revision}`} submission={submission} task={task} state={state} onRefresh={onRefresh} view={view} matches={blocks.map((block) => index === 0 ? block.source : block.peer)} onStale={() => setGradingWarning("The submission changed while you were grading. Review the latest revision before saving marks again.")} onGradeSaved={() => setGradingWarning("")} />)}
    </div>
  </section>;
}

function ComparisonPane({ submission, task, state, onRefresh, view, matches, onStale, onGradeSaved }: { submission: Submission; task: Task; state: AppState; onRefresh: () => Promise<unknown>; view: string; matches: string[]; onStale: () => void; onGradeSaved: () => void }) {
  const student = state.students.find((user) => user.id === submission.studentId);
  const [entry, setEntry] = useState(submission.files.find((file) => /\.html?$/i.test(file.path))?.path || "");
  const [file, setFile] = useState(submission.files[0]?.path || "");
  const [marks, setMarks] = useState(String(submission.grade?.marks ?? ""));
  const [feedback, setFeedback] = useState(submission.grade?.feedback || "");
  const [publish, setPublish] = useState(submission.grade?.published ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const { assets, assetError } = useSubmissionAssets(submission);
  const preview = useMemo(() => buildPreview(submission, entry, assets), [submission, entry, assets]);
  useEffect(() => {
    const navigate = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "labtrack:navigate" || typeof event.data.href !== "string") return;
      const next = resolvePath(entry, event.data.href);
      if (next && submission.files.some((item) => item.path === next && /\.html?$/i.test(next))) setEntry(next);
    };
    window.addEventListener("message", navigate);
    return () => window.removeEventListener("message", navigate);
  }, [entry, submission.files]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      await api(`/submissions/${submission.id}/grade`, { method: "PATCH", body: JSON.stringify({ marks: Number(marks), feedback, published: publish, revision: submission.revision }) });
      onGradeSaved();
      setNotice(publish ? "Grade published." : "Draft grade saved.");
      try { await onRefresh(); }
      catch (cause) { setError(`The grade was saved, but the workspace could not refresh. ${cause instanceof Error ? cause.message : "Refresh before grading again."}`); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the grade.");
      if ((cause as { status?: number }).status === 409) {
        onStale();
        try { await onRefresh(); }
        catch (refreshCause) { setError(`The submission changed, and the latest revision could not load. ${refreshCause instanceof Error ? refreshCause.message : "Refresh the workspace before grading again."}`); }
      }
    } finally { setSaving(false); }
  }
  const label = `Roll ${student?.rollNumber ?? "?"}`;
  const content = submission.files.find((item) => item.path === file)?.content ?? "No uploaded source files.";
  const ranges = matches.flatMap((match) => {
    const newline = match.indexOf("\n");
    if (match.slice(0, newline) !== file) return [];
    const snippet = match.slice(newline + 1);
    const start = content.indexOf(snippet);
    return start < 0 || !snippet ? [] : [{ start, end: start + snippet.length }];
  });
  let offset = 0;
  return <article className="comparison-pane" aria-label={`${label} task`}>
    <header><h2>{label} · {student?.name || "Name not provided"}</h2><span>Revision {submission.revision} · {submission.late ? "Late" : "On time"}</span></header>
    {submission.link && <a className="comparison-project-link" href={submission.link} target="_blank" rel="noopener noreferrer">Project link</a>}
    <label className="comparison-file">{view === "preview" ? "HTML page" : "Source file"}
      <select aria-label={`${label} ${view === "preview" ? "HTML page" : "source file"}`} value={view === "preview" ? entry : file} onChange={(event) => view === "preview" ? setEntry(event.target.value) : setFile(event.target.value)}>
        {submission.files.filter((item) => view !== "preview" || /\.html?$/i.test(item.path)).map((item) => <option key={item.path} value={item.path}>{item.path}{view === "source" && matches.some((match) => match.startsWith(`${item.path}\n`)) ? " · matching code" : ""}</option>)}
      </select>
    </label>
    {view === "preview" ? entry ? <iframe ref={frame} title={`${label} project preview`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview} /> : <p className="comparison-empty">No uploaded HTML page. Open the project link or inspect source files.</p> : <pre className="comparison-source"><code>{content.split("\n").map((line, index) => {
      const start = offset; offset += line.length + 1;
      const highlighted = ranges.some((range) => range.start < offset && range.end > start);
      return <span key={index} className="comparison-source-line">{highlighted ? <mark>{line || " "}</mark> : line || " "}{"\n"}</span>;
    })}</code></pre>}
    {assetError && <p className="error" role="alert">{assetError}</p>}
    <form className="comparison-grade" onSubmit={save}>
      <fieldset disabled={saving}>
        <label className="field">Marks / {task.maxMarks}<input aria-label={`${label} marks`} type="number" required min={0} max={task.maxMarks} step="any" value={marks} onChange={(event) => setMarks(event.target.value)} /></label>
        <label className="field">Feedback<textarea aria-label={`${label} feedback`} maxLength={4000} rows={2} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
        <label className="comparison-publish"><input aria-label={`${label} publish grade`} type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /> Publish grade</label>
        <button className="teacher-primary-button" type="submit" disabled={saving || marks === "" || !Number.isFinite(Number(marks)) || Number(marks) < 0 || Number(marks) > task.maxMarks}>{saving ? "Saving…" : "Save grade"}</button>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    </form>
  </article>;
}
