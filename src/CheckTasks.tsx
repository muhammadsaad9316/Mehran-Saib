import { useEffect, useState } from "react";
import {
  ArrowsClockwise,
  CheckCircle,
  Clock,
  Minus,
  ArrowRight,
  PencilSimple,
} from "@phosphor-icons/react";
import type { AppState, Submission, TaskAnalysis } from "../shared/types";
import { byRollNumber } from "../shared/roster";
import { api } from "./api";
import TaskComparison from "./TaskComparison";

export default function CheckTasks({ state, onReview, onRefresh }: { state: AppState; onReview: (submission: Submission) => void; onRefresh: () => Promise<unknown> }) {
  const [labId, setLabId] = useState(state.labs[0]?.id || "");
  const lab = state.labs.find((item) => item.id === labId) || state.labs[0];
  const [taskId, setTaskId] = useState(lab?.tasks[0]?.id || "");
  const task = lab?.tasks.find((item) => item.id === taskId) || lab?.tasks[0];
  const [threshold, setThreshold] = useState(70);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [analysisResult, setAnalysisResult] = useState<{ fingerprint: string; value: TaskAnalysis } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [comparison, setComparison] = useState<[string, string] | null>(null);
  const submissions = state.submissions.filter((item) => item.labId === lab?.id && item.taskId === task?.id);
  const fingerprint = JSON.stringify([
    lab?.id,
    task?.id,
    task?.description,
    task?.requirements,
    submissions.map((item) => `${item.id}:${item.revision}`).sort(),
  ]);
  const result = analysisResult?.fingerprint === fingerprint ? analysisResult.value : null;
  useEffect(() => {
    setComparison(null);
  }, [lab?.id, task?.id]);
  useEffect(() => {
    if (!lab || !task) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(""); setAnalysisResult(null);
    api<TaskAnalysis>(`/labs/${encodeURIComponent(lab.id)}/analysis?taskId=${encodeURIComponent(task.id)}`, { signal: controller.signal })
      .then((value) => { if (active) setAnalysisResult({ fingerprint, value }); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [lab?.id, task?.id, fingerprint, reload]);
  const pairs = result?.pairs.filter((pair) => pair.comparable && pair.percentage > threshold) || [];
  const flagged = new Set(pairs.flatMap((pair) => [pair.leftId, pair.rightId]));
  const students = [...state.students].sort(byRollNumber).filter((student) => {
    const submission = submissions.find((item) => item.studentId === student.id);
    const matches = /^\d+$/.test(query.trim()) ? student.rollNumber === String(Number(query.trim())) : `${student.name} ${student.rollNumber}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (filter === "all" || (filter === "similar" ? !!submission && flagged.has(submission.id) : filter === "pending" ? !!submission && !submission.grade : !submission));
  });
  const left = comparison && submissions.find((item) => item.id === comparison[0]);
  const right = comparison && submissions.find((item) => item.id === comparison[1]);
  if (!lab || !task) return <p className="teacher-empty">No lab tasks yet.</p>;
  return <div className="task-check-page">
    <div className="task-check-toolbar">
      <label>Lab<select aria-label="Check tasks lab" value={lab.id} onChange={(event) => { const selected = state.labs.find((item) => item.id === event.target.value)!; setLabId(selected.id); setTaskId(selected.tasks[0]?.id || ""); }}>
        {state.labs.map((item, index) => <option key={item.id} value={item.id}>Lab {index + 1} · {item.title}</option>)}
      </select></label>
      <label>Task<select aria-label="Check tasks task" value={task.id} onChange={(event) => setTaskId(event.target.value)}>{lab.tasks.map((item, index) => <option key={item.id} value={item.id}>Task {index + 1} · {item.title}</option>)}</select></label>
      <label>Flag matches<select aria-label="Similarity threshold" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}><option value={70}>Over 70%</option><option value={50}>Over 50%</option></select></label>
      <button className="task-check-refresh" aria-label="Refresh task submissions" disabled={loading || refreshing} onClick={async () => { setError(""); setRefreshing(true); try { await onRefresh(); setReload((value) => value + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh submissions."); } finally { setRefreshing(false); } }}><ArrowsClockwise size={18} /> {refreshing ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p className="task-check-note" role="status">Checking submissions…</p>}
    {result?.notices.map((notice) => <p className="task-check-note" role="status" key={notice}>{notice}</p>)}
    {left && right ? <TaskComparison left={left} right={right} task={task} state={state} loading={loading} available={!!result} pair={result?.pairs.find((pair) => (pair.leftId === left.id && pair.rightId === right.id) || (pair.leftId === right.id && pair.rightId === left.id))} onBack={() => setComparison(null)} onRefresh={onRefresh} /> : <>
      <div className="task-check-summary">
        <span><strong>{submissions.length}/{state.students.length}</strong> submitted</span>
        <span><strong>{submissions.filter((item) => !item.grade).length}</strong> pending review</span>
        <span><strong>{loading ? "…" : result ? flagged.size : "—"}</strong> students to compare</span>
      </div>
      <div className="task-check-filters">
        <div role="group" aria-label="Task submission filter">{[["all", "All students"], ["pending", "Pending"], ["similar", "Similar tasks"], ["missing", "Missing"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <input aria-label="Find task student" placeholder="Roll no. or name" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <p className="task-check-note">Flags require substantial matching code in both tasks. Required boilerplate is excluded. Grades are assigned by you.</p>
      <div className="teacher-table-scroll">
        <table className="teacher-roster-table task-check-table"><thead><tr><th>Student</th><th>Status</th><th>Requirements</th><th>Quality</th><th>Similarity</th><th>Marks</th><th>Actions</th></tr></thead><tbody>
          {students.map((student) => {
            const submission = submissions.find((item) => item.studentId === student.id);
            const analysis = result?.submissions.find((item) => item.submissionId === submission?.id);
            const matches = pairs.filter((pair) => pair.leftId === submission?.id || pair.rightId === submission?.id);
            const best = matches[0];
            const isGraded = Boolean(submission?.grade);
            const isPending = Boolean(submission && !submission.grade);
            const isMissing = !submission;

            const rowClass = [
              best ? "task-row-flagged" : "",
              isGraded ? "task-row-graded" : "",
              isPending ? "task-row-pending" : "",
              isMissing ? "task-row-missing" : "",
            ].filter(Boolean).join(" ");

            return <tr key={student.id} className={rowClass}>
              <td>
                <div className="task-student-cell">
                  <strong>Roll {student.rollNumber}</strong>
                  <span className="task-student-name">{student.name || "Name not provided"}</span>
                </div>
              </td>
              <td>
                <div className="task-status-cell">
                  {isMissing ? (
                    <span className="task-status-badge status-missing">
                      <Minus size={13} weight="bold" /> Missing
                    </span>
                  ) : isGraded ? (
                    <span className="task-status-badge status-graded">
                      <CheckCircle size={14} weight="fill" /> Graded
                    </span>
                  ) : (
                    <span className="task-status-badge status-pending">
                      <Clock size={14} weight="bold" /> To review
                    </span>
                  )}
                  {submission?.late && <span className="task-late">Late</span>}
                </div>
              </td>
              <td>
                {analysis ? (
                  analysis.total ? (
                    <span className={`task-req-badge ${analysis.met === analysis.total ? "req-all-met" : "req-partial"}`}>
                      {analysis.met}/{analysis.total} met
                    </span>
                  ) : (
                    "No checks set"
                  )
                ) : submission ? (
                  loading ? "Checking…" : "Unavailable"
                ) : (
                  "—"
                )}
              </td>
              <td>
                {analysis ? (
                  analysis.qualityCount ? (
                    <span className="task-quality-badge">{analysis.qualityCount} observations</span>
                  ) : (
                    <span className="task-quality-clean">Clean</span>
                  )
                ) : (
                  "—"
                )}
              </td>
              <td>
                {best ? (
                  <span className="task-match-badge">{best.percentage}% · {matches.length} {matches.length === 1 ? "match" : "matches"}</span>
                ) : submission ? (
                  loading ? "Checking…" : analysis?.comparable ? `None over ${threshold}%` : "Needs manual review"
                ) : (
                  "—"
                )}
              </td>
              <td>
                {isGraded && submission?.grade ? (
                  <span className="task-score-pill">
                    <strong>{submission.grade.marks}</strong>
                    <small>/{task.maxMarks}</small>
                    {submission.grade.published ? "" : <span className="task-draft-badge">Draft</span>}
                  </span>
                ) : isPending ? (
                  <span className="task-score-pending">Needs score</span>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <div className="task-row-actions">
                  {isPending && submission && (
                    <button
                      className="task-action-btn task-action-grade"
                      onClick={() => onReview(submission)}
                      title="Grade this student"
                    >
                      Grade <ArrowRight size={13} weight="bold" />
                    </button>
                  )}
                  {isGraded && submission && (
                    <button
                      className="task-action-btn task-action-edit"
                      onClick={() => onReview(submission)}
                      title="View or modify saved grade"
                    >
                      <PencilSimple size={13} /> Edit grade
                    </button>
                  )}
                  {best && (
                    <button
                      className="task-compare-button"
                      onClick={() => setComparison([best.leftId, best.rightId])}
                    >
                      Compare
                    </button>
                  )}
                </div>
                {matches.length > 1 && (
                  <details className="task-other-matches">
                    <summary>All matches</summary>
                    {matches.map((pair) => {
                      const peer = submissions.find(
                        (item) =>
                          item.id ===
                          (pair.leftId === submission?.id ? pair.rightId : pair.leftId),
                      );
                      const user = state.students.find((item) => item.id === peer?.studentId);
                      return (
                        <button
                          key={`${pair.leftId}-${pair.rightId}`}
                          onClick={() => setComparison([pair.leftId, pair.rightId])}
                        >
                          Roll {user?.rollNumber} · {pair.percentage}%
                        </button>
                      );
                    })}
                  </details>
                )}
              </td>
            </tr>;
          })}
        </tbody></table>
        {!students.length && <p className="teacher-empty">{filter === "similar" && !result ? loading ? "Comparisons are updating…" : "Comparison unavailable. Refresh to try again." : "No students match this filter."}</p>}
      </div>
    </>}
  </div>;
}
