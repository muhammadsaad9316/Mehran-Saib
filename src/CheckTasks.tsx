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
import { firstPendingSubmission } from "./review-queue";
import TaskComparison from "./TaskComparison";
import { evidenceVersion } from "../shared/evidence";
import { allowNavigation } from "./navigation-guard";

export default function CheckTasks({ state, onReview, onRefresh }: { state: AppState; onReview: (submission: Submission) => void; onRefresh: () => Promise<unknown> }) {
  const [labId, setLabId] = useState(state.labs[0]?.id || "");
  const lab = state.labs.find((item) => item.id === labId) || state.labs[0];
  const [taskId, setTaskId] = useState(lab?.tasks[0]?.id || "");
  const task = lab?.tasks.find((item) => item.id === taskId) || lab?.tasks[0];
  const [threshold, setThreshold] = useState(70);
  const [filter, setFilter] = useState("all");
  const [sortMode, setSortMode] = useState<"roll" | "pending" | "similarity" | "failed_reqs">("roll");
  const [query, setQuery] = useState("");
  const [analysisResult, setAnalysisResult] = useState<{ fingerprint: string; value: TaskAnalysis } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [comparison, setComparison] = useState<[string, string] | null>(null);
  const submissions = state.submissions.filter((item) => item.labId === lab?.id && item.taskId === task?.id);
  const fingerprint = task ? evidenceVersion(task, submissions) : "";
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
      .then((value) => { if (value.evidenceVersion !== fingerprint) throw new Error("The task evidence changed. Refresh the workspace."); if (active) setAnalysisResult({ fingerprint, value }); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [lab?.id, task?.id, fingerprint, reload]);
  const pairs = result?.pairs.filter((pair) => pair.comparable && pair.percentage > threshold) || [];
  const flagged = new Set(pairs.flatMap((pair) => [pair.leftId, pair.rightId]));
  const students = [...state.students]
    .filter((student) => {
      const submission = submissions.find((item) => item.studentId === student.id);
      const matches = /^\d+$/.test(query.trim())
        ? student.rollNumber === String(Number(query.trim()))
        : `${student.name} ${student.rollNumber}`.toLowerCase().includes(query.trim().toLowerCase());
      return (
        matches &&
        (filter === "all" ||
          (filter === "similar"
            ? !!submission && flagged.has(submission.id)
            : filter === "pending"
              ? !!submission && !submission.grade
              : !submission))
      );
    })
    .sort((a, b) => {
      if (sortMode === "pending") {
        const aSub = submissions.find((item) => item.studentId === a.id);
        const bSub = submissions.find((item) => item.studentId === b.id);
        const aRank = aSub ? (aSub.grade ? 1 : 0) : 2;
        const bRank = bSub ? (bSub.grade ? 1 : 0) : 2;
        if (aRank !== bRank) return aRank - bRank;
        return byRollNumber(a, b);
      }
      if (sortMode === "similarity") {
        const aSub = submissions.find((item) => item.studentId === a.id);
        const bSub = submissions.find((item) => item.studentId === b.id);
        const aMatches = pairs.filter((p) => p.leftId === aSub?.id || p.rightId === aSub?.id);
        const bMatches = pairs.filter((p) => p.leftId === bSub?.id || p.rightId === bSub?.id);
        const aPct = aMatches.length ? Math.max(...aMatches.map((p) => p.percentage)) : -1;
        const bPct = bMatches.length ? Math.max(...bMatches.map((p) => p.percentage)) : -1;
        if (bPct !== aPct) return bPct - aPct;
        return byRollNumber(a, b);
      }
      if (sortMode === "failed_reqs") {
        const aSub = submissions.find((item) => item.studentId === a.id);
        const bSub = submissions.find((item) => item.studentId === b.id);
        const aAnalysis = result?.submissions.find((s) => s.submissionId === aSub?.id);
        const bAnalysis = result?.submissions.find((s) => s.submissionId === bSub?.id);
        const aFailed = aSub && aAnalysis && aAnalysis.total ? Math.max(0, aAnalysis.total - aAnalysis.met) : -1;
        const bFailed = bSub && bAnalysis && bAnalysis.total ? Math.max(0, bAnalysis.total - bAnalysis.met) : -1;
        if (bFailed !== aFailed) return bFailed - aFailed;
        return byRollNumber(a, b);
      }
      return byRollNumber(a, b);
    });
  const left = comparison && submissions.find((item) => item.id === comparison[0]);
  const right = comparison && submissions.find((item) => item.id === comparison[1]);
  if (!lab || !task) return <p className="teacher-empty">No lab tasks yet.</p>;
  const totalStudents = state.students.length;
  const totalSubmitted = submissions.length;
  const gradedCount = submissions.filter((item) => !!item.grade).length;
  const pendingCount = submissions.filter((item) => !item.grade).length;
  const nextUngraded = firstPendingSubmission(state.students, submissions);
  const missingCount = Math.max(0, totalStudents - totalSubmitted);
  const gradedPct = totalStudents > 0 ? Math.round((gradedCount / totalStudents) * 100) : 0;
  const pendingPct = totalStudents > 0 ? Math.round((pendingCount / totalStudents) * 100) : 0;

  return <div className="task-check-page">
    <div className="task-check-toolbar">
      <label>Lab<select aria-label="Check tasks lab" value={lab.id} onChange={(event) => { if (!allowNavigation()) return; const selected = state.labs.find((item) => item.id === event.target.value)!; setLabId(selected.id); setTaskId(selected.tasks[0]?.id || ""); }}>
        {state.labs.map((item, index) => <option key={item.id} value={item.id}>Lab {index + 1} · {item.title}</option>)}
      </select></label>
      <label>Flag matches<select aria-label="Similarity threshold" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}><option value={70}>Over 70%</option><option value={50}>Over 50%</option></select></label>
      <button className="task-check-refresh" aria-label="Refresh task submissions" disabled={loading || refreshing} onClick={async () => { if (!allowNavigation()) return; setError(""); setRefreshing(true); try { await onRefresh(); setReload((value) => value + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh submissions."); } finally { setRefreshing(false); } }}><ArrowsClockwise size={18} /> {refreshing ? "Refreshing…" : "Refresh"}</button>
    </div>
    <div className="task-check-task-switcher" role="group" aria-label="Check tasks task">
      {lab.tasks.map((item, index) => {
        const pending = state.submissions.filter((work) => work.labId === lab.id && work.taskId === item.id && !work.grade).length;
        return <button key={item.id} type="button" aria-pressed={item.id === task.id}
          title={item.title} onClick={() => { if (allowNavigation()) setTaskId(item.id); }}>
          <span>Task {index + 1}</span><small>{pending} pending</small>
        </button>;
      })}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p className="task-check-note" role="status">Checking submissions…</p>}
    {result?.notices.map((notice) => <p className="task-check-note" role="status" key={notice}>{notice}</p>)}
    {left && right ? <TaskComparison left={left} right={right} task={task} state={state} loading={loading} available={!!result} pair={result?.pairs.find((pair) => (pair.leftId === left.id && pair.rightId === right.id) || (pair.leftId === right.id && pair.rightId === left.id))} onBack={() => setComparison(null)} onRefresh={onRefresh} /> : <>
      <div className="task-check-summary" aria-label="Grading progress overview">
        <div className="task-progress-card">
          <div className="task-progress-header">
            <div className="task-progress-meta">
              <span className="task-progress-stat stat-graded">
                <CheckCircle size={15} weight="fill" />
                <strong>{gradedCount}/{totalStudents}</strong> Graded <span className="stat-pct">({gradedPct}%)</span>
              </span>
              <span className="task-progress-separator" aria-hidden="true">·</span>
              <span className="task-progress-stat stat-pending">
                <Clock size={15} weight="bold" />
                <strong>{pendingCount}</strong> Pending
              </span>
              <span className="task-progress-separator" aria-hidden="true">·</span>
              <span className="task-progress-stat stat-missing">
                <Minus size={15} weight="bold" />
                <strong>{missingCount}</strong> Missing
              </span>
              {result && flagged.size > 0 && (
                <>
                  <span className="task-progress-separator" aria-hidden="true">·</span>
                  <span className="task-progress-stat stat-flagged">
                    <strong>{flagged.size}</strong> to compare
                  </span>
                </>
              )}
            </div>
            {gradedCount === totalStudents && totalStudents > 0 && (
              <span className="task-progress-complete-badge">
                🎉 All {totalStudents} graded!
              </span>
            )}
            <button
              type="button"
              className="teacher-primary-button task-check-start"
              disabled={!nextUngraded || refreshing}
              title={nextUngraded ? `Open the next ungraded submission for Task ${lab.tasks.indexOf(task) + 1}` : "No submitted work is awaiting a grade for this task."}
              onClick={() => { if (nextUngraded) onReview(nextUngraded); }}
            >
              {nextUngraded ? "Review next ungraded" : "No ungraded submissions"}
              <ArrowRight size={16} weight="bold" />
            </button>
          </div>
          <div
            className="task-progress-bar-track"
            role="progressbar"
            aria-valuenow={gradedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${gradedCount} of ${totalStudents} students graded (${gradedPct}%)`}
          >
            <div
              className="task-progress-segment segment-graded"
              style={{ width: `${gradedPct}%` }}
              title={`${gradedCount} graded (${gradedPct}%)`}
            />
            <div
              className="task-progress-segment segment-pending"
              style={{ width: `${pendingPct}%` }}
              title={`${pendingCount} pending review (${pendingPct}%)`}
            />
          </div>
        </div>
      </div>
      <div className="task-check-filters">
        <div role="group" aria-label="Task submission filter">{[["all", "All students"], ["pending", "Pending"], ["similar", "Similar tasks"], ["missing", "Missing"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <div className="task-check-search-sort">
          <label className="task-sort-label" htmlFor="task-check-sort-select">
            <span>Sort:</span>
            <select
              id="task-check-sort-select"
              aria-label="Sort task submissions"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "roll" | "pending" | "similarity" | "failed_reqs")}
            >
              <option value="roll">Roll Number (1–41)</option>
              <option value="pending">Pending First</option>
              <option value="similarity">Highest Similarity First</option>
              <option value="failed_reqs">Failed Requirements First</option>
            </select>
          </label>
          <input aria-label="Find task student" placeholder="Roll no. or name" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      <p className="task-check-note">Flags require substantial matching code in both tasks. Required boilerplate is excluded. Grades are assigned by you.</p>
      <div className="teacher-table-scroll task-table-scroll">
        <table className="teacher-roster-table task-check-table"><thead><tr><th>Student</th><th>Status</th><th>Requirements</th><th>Quality</th><th>Similarity</th><th>Marks</th><th>Actions</th></tr></thead><tbody>
          {students.map((student) => {
            const submission = submissions.find((item) => item.studentId === student.id);
            const analysis = result?.submissions.find((item) => item.submissionId === submission?.id);
            const allMatches = (result?.pairs || []).filter(
              (pair) => pair.comparable && (pair.leftId === submission?.id || pair.rightId === submission?.id)
            );
            const topMatch = allMatches[0];
            const topPct = topMatch ? topMatch.percentage : 0;
            const isHighRisk = topPct > 70;
            const isModerateRisk = topPct >= 50 && topPct <= 70;
            const isCleanMatch = Boolean(submission && (!topMatch || topPct < 50));

            const matches = pairs.filter((pair) => pair.leftId === submission?.id || pair.rightId === submission?.id);
            const best = topMatch || matches[0];
            const isGraded = Boolean(submission?.grade);
            const isPending = Boolean(submission && !submission.grade);
            const isMissing = !submission;

            const rowClass = [
              isHighRisk
                ? "task-row-flagged-high"
                : isModerateRisk
                  ? "task-row-flagged-moderate"
                  : best
                    ? "task-row-flagged"
                    : "",
              isGraded ? "task-row-graded" : "",
              isPending ? "task-row-pending" : "",
              isMissing ? "task-row-missing" : "",
              submission ? "task-row-clickable" : "",
            ].filter(Boolean).join(" ");

            return <tr
              key={student.id}
              className={rowClass}
              onClick={() => {
                if (submission) {
                  onReview(submission);
                }
              }}
              onKeyDown={(e) => {
                if (submission && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onReview(submission);
                }
              }}
              tabIndex={submission ? 0 : undefined}
              role={submission ? "button" : undefined}
              aria-label={
                submission
                  ? `Review Roll ${student.rollNumber} ${student.name ? `(${student.name})` : ""}`
                  : `Roll ${student.rollNumber} has not submitted yet`
              }
            >
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
                    <span
                      className={`task-req-badge ${
                        analysis.met === analysis.total
                          ? "req-all-met"
                          : "req-incomplete"
                      }`}
                    >
                      {analysis.met === analysis.total && (
                        <CheckCircle size={13} weight="fill" />
                      )}
                      {analysis.met}/{analysis.total} met
                    </span>
                  ) : (
                    <span className="task-req-none">No checks set</span>
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
                    <span className="task-quality-badge quality-issues">
                      {analysis.qualityCount} {analysis.qualityCount === 1 ? "issue" : "issues"}
                    </span>
                  ) : (
                    <span className="task-quality-badge quality-clean">
                      <CheckCircle size={13} weight="fill" /> Clean
                    </span>
                  )
                ) : (
                  "—"
                )}
              </td>
              <td>
                {isHighRisk && topMatch ? (
                  <span className="task-match-badge match-high" title={`High similarity: ${topPct}% match with peer code`}>
                    <span aria-hidden="true">🚨</span> {topPct}% · Match
                  </span>
                ) : isModerateRisk && topMatch ? (
                  <span className="task-match-badge match-moderate" title={`Moderate similarity: ${topPct}% match with peer code`}>
                    <span aria-hidden="true">⚠️</span> {topPct}% · Match
                  </span>
                ) : isCleanMatch ? (
                  <span className="task-match-badge match-clean">
                    <CheckCircle size={13} weight="fill" /> Clean
                  </span>
                ) : submission ? (
                  loading ? "Checking…" : analysis?.comparable ? "Clean" : "Needs manual review"
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
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(submission);
                      }}
                      title="Grade this student"
                    >
                      Grade <ArrowRight size={13} weight="bold" />
                    </button>
                  )}
                  {isGraded && submission && (
                    <button
                      className="task-action-btn task-action-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(submission);
                      }}
                      title="View or modify saved grade"
                    >
                      <PencilSimple size={13} /> Edit grade
                    </button>
                  )}
                  {best && best.percentage >= 50 && (
                    <button
                      className="task-compare-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setComparison([best.leftId, best.rightId]);
                      }}
                      title={`Compare side-by-side with peer (${best.percentage}% match)`}
                    >
                      Compare
                    </button>
                  )}
                </div>
                {allMatches.length > 1 && (
                  <details
                    className="task-other-matches"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <summary>{allMatches.length} matches</summary>
                    {allMatches.map((pair) => {
                      const peer = submissions.find(
                        (item) =>
                          item.id ===
                          (pair.leftId === submission?.id ? pair.rightId : pair.leftId),
                      );
                      const user = state.students.find((item) => item.id === peer?.studentId);
                      return (
                        <button
                          key={`${pair.leftId}-${pair.rightId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setComparison([pair.leftId, pair.rightId]);
                          }}
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
        {!students.length && (
          <div className={`task-check-empty-state ${filter === "pending" && pendingCount === 0 ? "task-all-graded-empty" : ""}`}>
            {filter === "pending" && pendingCount === 0 ? (
              <>
                <span className="empty-celebrate-icon" role="img" aria-label="Celebration">🎉</span>
                <h3>All submissions for this task are graded!</h3>
                <p>Great job! Every student who submitted has been reviewed and given marks.</p>
                <button type="button" onClick={() => setFilter("all")}>
                  View all students ({totalStudents})
                </button>
              </>
            ) : filter === "similar" && !result ? (
              loading ? (
                <p className="task-check-note">Comparisons are updating…</p>
              ) : (
                <p className="task-check-note">Comparison unavailable. Refresh to try again.</p>
              )
            ) : filter === "similar" && flagged.size === 0 ? (
              <>
                <CheckCircle size={32} weight="fill" className="green" />
                <h3>No similar code matches over {threshold}%</h3>
                <p>All compared projects appear distinct. No submissions were flagged for this task.</p>
                <button type="button" onClick={() => setFilter("all")}>
                  View all students
                </button>
              </>
            ) : filter === "missing" && missingCount === 0 ? (
              <>
                <CheckCircle size={32} weight="fill" className="green" />
                <h3>Full submission turnout!</h3>
                <p>All {totalStudents} students in the roster have submitted work for this task.</p>
                <button type="button" onClick={() => setFilter("all")}>
                  View all students
                </button>
              </>
            ) : query.trim() ? (
              <>
                <h3>No student matches "{query.trim()}"</h3>
                <p>Check the roll number or name, or clear the search to view all students.</p>
                <button type="button" onClick={() => setQuery("")}>
                  Clear search
                </button>
              </>
            ) : (
              <p className="teacher-empty">No students match this filter.</p>
            )}
          </div>
        )}
      </div>
    </>}
  </div>;
}
