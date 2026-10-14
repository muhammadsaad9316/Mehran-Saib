import { useEffect, useMemo, useState } from "react";
import {
  X,
  Code,
  Eye,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  FileCode,
  ArrowSquareOut,
  FloppyDisk,
  DownloadSimple,
  CaretRight,
  CaretLeft,
  ArrowRight,
  Clock,
  Globe,
  ChartBar,
} from "@phosphor-icons/react";
import type { AppState, AnalysisResult, Submission } from "../shared/types";
import { byRollNumber } from "../shared/roster";
import { api, saveFile } from "./api";
import { buildPreview, resolvePath } from "./preview";
import { useSubmissionAssets } from "./submission-assets";

export default function Review({
  submission,
  state,
  onClose,
  onSaved,
  onNavigate,
}: {
  submission: Submission;
  state: AppState;
  onClose: () => void;
  onSaved: (message?: string) => Promise<void>;
  onNavigate?: (submission: Submission) => void;
}) {
  const lab = state.labs.find((l) => l.id === submission.labId)!;
  const task = lab.tasks.find((t) => t.id === submission.taskId)!;
  const student =
    state.students.find((s) => s.id === submission.studentId) || state.user!;
  const teacher = state.user?.role === "teacher";
  const [tab, setTab] = useState("preview");
  const [file, setFile] = useState(
    submission.files.find((f) => /\.html?$/i.test(f.path))?.path ||
      submission.files[0]?.path ||
      "",
  );
  const [entry, setEntry] = useState(
    submission.files.find((f) => /\.html?$/i.test(f.path))?.path || "",
  );
  const [analysisResult, setAnalysisResult] = useState<{ fingerprint: string; value: AnalysisResult } | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const { assets, assetError } = useSubmissionAssets(submission);
  const [marks, setMarks] = useState(String(submission.grade?.marks ?? ""));
  const [feedback, setFeedback] = useState(submission.grade?.feedback || "");
  const [publish, setPublish] = useState(submission.grade?.published ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [peer, setPeer] = useState<
    AnalysisResult["similarities"][number] | null
  >(null);
  const analysisFingerprint = JSON.stringify([
    submission.id,
    task.description,
    task.requirements,
    state.submissions
      .filter((item) => item.labId === lab.id && item.taskId === task.id)
      .map((item) => `${item.id}:${item.revision}`)
      .sort(),
  ]);
  const analysis = analysisResult?.fingerprint === analysisFingerprint ? analysisResult.value : null;
  const highestMatch = analysis?.similarities.find((match) => match.comparable);
  const highestPeerStudent = highestMatch
    ? state.students.find((s) => s.id === highestMatch.studentId)
    : null;
  useEffect(() => {
    if (state.user?.role !== "teacher") return;
    let active = true;
    const controller = new AbortController();
    setAnalysisResult(null);
    setAnalysisError("");
    setPeer(null);
    api<AnalysisResult>(`/submissions/${submission.id}/analysis`, {
      signal: controller.signal,
    })
      .then((a) => {
        if (active) setAnalysisResult({ fingerprint: analysisFingerprint, value: a });
      })
      .catch((e) => {
        if (active) setAnalysisError(e.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [submission.id, submission.revision, analysisFingerprint, state.user?.role]);
  const preview = useMemo(
    () => buildPreview(submission, entry, assets),
    [submission, entry, assets],
  );
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const frame = document.getElementById(
        "submission-preview",
      ) as HTMLIFrameElement | null;
      if (
        event.source !== frame?.contentWindow ||
        event.data?.type !== "labtrack:navigate" ||
        typeof event.data.href !== "string"
      )
        return;
      const next = resolvePath(entry, event.data.href);
      if (
        next &&
        submission.files.some((f) => f.path === next && /\.html?$/i.test(next))
      )
        setEntry(next);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [entry, submission.files]);

  const allTaskSubmissions = useMemo(() => {
    const studentMap = new Map(state.students.map((s) => [s.id, s]));
    return state.submissions
      .filter(
        (s) => s.labId === submission.labId && s.taskId === submission.taskId,
      )
      .sort((a, b) => {
        const studentA = studentMap.get(a.studentId);
        const studentB = studentMap.get(b.studentId);
        if (studentA && studentB) return byRollNumber(studentA, studentB);
        return 0;
      });
  }, [state.submissions, state.students, submission.labId, submission.taskId]);

  const pendingSubmissions = useMemo(
    () => allTaskSubmissions.filter((s) => !s.grade),
    [allTaskSubmissions],
  );

  const remainingCount = pendingSubmissions.length;
  const totalCount = allTaskSubmissions.length;
  const gradedCount = totalCount - remainingCount;

  // Default to pending mode if there are pending submissions
  const [queueMode, setQueueMode] = useState<"pending" | "all">(() =>
    remainingCount > 0 ? "pending" : "all",
  );

  const activeQueue = useMemo(() => {
    if (queueMode === "all") return allTaskSubmissions;
    return allTaskSubmissions.filter(
      (s) => !s.grade || s.id === submission.id,
    );
  }, [allTaskSubmissions, queueMode, submission.id]);

  const currentQueueIndex = activeQueue.findIndex((s) => s.id === submission.id);
  const currentPosition = currentQueueIndex >= 0 ? currentQueueIndex + 1 : 1;

  const nextSubmission = useMemo(() => {
    const currentAllIndex = allTaskSubmissions.findIndex(
      (s) => s.id === submission.id,
    );
    if (queueMode === "pending") {
      if (currentAllIndex >= 0) {
        // Next ungraded after current
        const after = allTaskSubmissions
          .slice(currentAllIndex + 1)
          .find((s) => !s.grade && s.id !== submission.id);
        if (after) return after;
        // Wrap around if teacher started grading in the middle
        const before = allTaskSubmissions
          .slice(0, currentAllIndex)
          .find((s) => !s.grade && s.id !== submission.id);
        if (before) return before;
      }
      return null;
    }
    return currentAllIndex >= 0 && currentAllIndex < allTaskSubmissions.length - 1
      ? allTaskSubmissions[currentAllIndex + 1]
      : null;
  }, [allTaskSubmissions, queueMode, submission.id]);

  const prevSubmission = useMemo(() => {
    const currentAllIndex = allTaskSubmissions.findIndex(
      (s) => s.id === submission.id,
    );
    if (queueMode === "pending") {
      if (currentAllIndex > 0) {
        const before = allTaskSubmissions
          .slice(0, currentAllIndex)
          .reverse()
          .find((s) => !s.grade && s.id !== submission.id);
        if (before) return before;
      }
      return null;
    }
    return currentAllIndex > 0 ? allTaskSubmissions[currentAllIndex - 1] : null;
  }, [allTaskSubmissions, queueMode, submission.id]);

  const nextStudent = nextSubmission
    ? state.students.find((s) => s.id === nextSubmission.studentId)
    : null;

  const isMarksValid =
    marks !== "" &&
    Number.isFinite(Number(marks)) &&
    Number(marks) >= 0 &&
    Number(marks) <= task.maxMarks;

  const canSave = !busy && isMarksValid;


  async function grade(advance = false) {
    if (!canSave) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api(`/submissions/${submission.id}/grade`, {
        method: "PATCH",
        body: JSON.stringify({
          marks: Number(marks),
          feedback,
          published: publish,
          revision: submission.revision,
        }),
      });

      const nextTarget = advance ? nextSubmission : null;
      const statusText = publish ? "Grade published" : "Draft saved";
      const rollText = student.rollNumber ? `Roll ${student.rollNumber}` : (student.name || "student");
      const wasLastPending = queueMode === "pending" && !nextTarget;

      try {
        await onSaved(
          nextTarget
            ? `${statusText} for ${rollText}. Loading next remaining student…`
            : wasLastPending
              ? `🎉 All submissions for ${task.title} have been graded!`
              : (publish ? "Grade published to the student." : "Grade saved as a draft.")
        );
      } catch (cause) {
        setError(`The grade was saved, but the workspace could not refresh. ${cause instanceof Error ? cause.message : "Refresh before grading again."}`);
      }

      if (advance) {
        if (nextTarget && onNavigate) {
          onNavigate(nextTarget);
        } else {
          setNotice(
            queueMode === "pending"
              ? `🎉 All submissions for ${task.title} are now graded! (${totalCount}/${totalCount} complete)`
              : "Grade saved! You have reached the last student submission for this task."
          );
        }
      } else {
        setNotice(
          publish ? "Grade published to the student." : "Grade saved as a draft.",
        );
      }
    } catch (e) {
      if ((e as Error & { status?: number }).status === 409) {
        setError("The submission changed. Review the latest revision before grading.");
        try {
          await onSaved(
            "The submission changed. Review the latest revision before grading.",
          );
        } catch (cause) {
          setError(`The submission changed, and the latest revision could not load. ${cause instanceof Error ? cause.message : "Refresh the workspace before grading again."}`);
        }
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!teacher) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (canSave) {
          e.preventDefault();
          grade(Boolean(nextSubmission));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [teacher, canSave, nextSubmission, marks, feedback, publish]);
  const reviewHeader = (
    <header className="modal-head">
      <div className="review-head-main">
        <div className="eyebrow">
          {state.user?.role === "teacher"
            ? "SUBMISSION REVIEW"
            : "YOUR SUBMISSION"}{" "}
          <span className="muted">/ REVISION {submission.revision}</span>
        </div>
        <h2>
          {state.user?.role === "teacher" ? (
            <>
              Roll no. {student.rollNumber} ·{" "}
              {student.name || "Name not provided"}{" "}
              <span className="dot-separator">·</span>{" "}
              <span className="review-head-task-title">{task.title}</span>
            </>
          ) : (
            task.title
          )}
        </h2>
        <p>
          {lab.title} <span className="dot-separator">·</span>{" "}
          {state.user?.role === "teacher" && (
            <>
              Task {lab.tasks.findIndex((item) => item.id === task.id) + 1}{" "}
              <span className="dot-separator">·</span>{" "}
            </>
          )}
          {new Date(submission.submittedAt).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}
        </p>
      </div>
      {teacher && (
        <div className="review-top-facts" aria-label="Submission summary">
          {allTaskSubmissions.length > 1 && (
            <div className="review-queue-nav-group">
              <div
                className="review-queue-mode-toggle"
                role="group"
                aria-label="Queue filter mode"
              >
                <button
                  type="button"
                  className={`review-mode-btn ${queueMode === "pending" ? "active" : ""}`}
                  onClick={() => setQueueMode("pending")}
                  title="Skip checked students and only view remaining unchecked work"
                >
                  <span
                    className={`review-mode-dot ${remainingCount > 0 ? "has-pending" : "all-done"}`}
                  />
                  <span>
                    <strong>{remainingCount}</strong> remaining
                  </span>
                </button>
                <button
                  type="button"
                  className={`review-mode-btn ${queueMode === "all" ? "active" : ""}`}
                  onClick={() => setQueueMode("all")}
                  title="View all submissions in roll order"
                >
                  <span>All ({totalCount})</span>
                </button>
              </div>

              <div className="review-queue-pill">
                <button
                  type="button"
                  className="review-queue-arrow"
                  disabled={!prevSubmission || busy}
                  onClick={() => prevSubmission && onNavigate?.(prevSubmission)}
                  title={
                    prevSubmission
                      ? `Previous ${queueMode === "pending" ? "remaining" : "student"}: Roll ${state.students.find((s) => s.id === prevSubmission.studentId)?.rollNumber || ""}`
                      : "First in queue"
                  }
                  aria-label="Previous student"
                >
                  <CaretLeft size={14} weight="bold" />
                </button>
                <span className="review-queue-label">
                  {queueMode === "pending" ? (
                    <>
                      Remaining <strong>{currentPosition}</strong> of{" "}
                      <strong>{activeQueue.length}</strong>
                    </>
                  ) : (
                    <>
                      Student <strong>{currentPosition}</strong> of{" "}
                      <strong>{activeQueue.length}</strong>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  className="review-queue-arrow"
                  disabled={!nextSubmission || busy}
                  onClick={() => nextSubmission && onNavigate?.(nextSubmission)}
                  title={
                    nextSubmission
                      ? `Next ${queueMode === "pending" ? "remaining" : "student"}: Roll ${nextStudent?.rollNumber || ""}`
                      : "Last in queue"
                  }
                  aria-label="Next student"
                >
                  <CaretRight size={14} weight="bold" />
                </button>
              </div>
            </div>
          )}

          <div
            className="review-top-fact"
            title={`${gradedCount} of ${totalCount} submissions graded`}
          >
            <span className="fact-label">Graded</span>
            <strong>
              {gradedCount} / {totalCount}
            </strong>
          </div>

          <div className="review-top-fact">
            <span className="fact-label">
              <Clock size={13} aria-hidden="true" /> Submitted
            </span>
            <strong
              className={
                submission.late
                  ? "review-status-warning"
                  : "review-status-success"
              }
            >
              {submission.late ? "Late" : "On time"}
            </strong>
          </div>
        </div>
      )}
      <button
        className={`icon-btn${teacher ? " review-mobile-close" : ""}`}
        aria-label="Close review"
        onClick={onClose}
      >
        <X size={22} />
      </button>
    </header>
  );
  return (
    <div
      className={`modal-overlay${teacher ? " review-overlay" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal review-modal${teacher ? " teacher-review-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={
          state.user?.role === "teacher"
            ? "Review submission"
            : "Your submission"
        }
      >
        {!teacher && reviewHeader}
        <div className="review-layout">
          <div className="review-workspace">
            {teacher && reviewHeader}
            <div className="tabs">
              {[
                ["preview", Eye, "Live preview"],
                ["code", Code, "Source code"],
              ].map(([id, Icon, label]) => {
                const I = Icon as typeof Eye;
                return (
                  <button
                    key={id as string}
                    className={tab === id ? "active" : ""}
                    aria-pressed={tab === id}
                    onClick={() => setTab(id as string)}
                  >
                    <I size={18} />
                    {label as string}
                  </button>
                );
              })}
            </div>
            {tab === "preview" && (
              <>
                <div className="file-bar">
                  <FileCode size={17} />
                  <select
                    aria-label="Preview HTML entrypoint"
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                  >
                    {submission.files
                      .filter((f) => /\.html?$/i.test(f.path))
                      .map((f) => (
                        <option key={f.path}>{f.path}</option>
                      ))}
                  </select>
                </div>
                {entry ? (
                  <div className={teacher ? "review-browser" : "review-preview"}>
                    {teacher && (
                      <div className="review-browser-bar" aria-hidden="true">
                        <span className="review-browser-dots"><i /><i /><i /></span>
                        <span className="review-browser-address"><Globe size={14} />{entry}</span>
                        <ShieldCheck size={16} />
                      </div>
                    )}
                  <iframe
                    id="submission-preview"
                    title="Student project preview"
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    srcDoc={preview}
                  />
                  </div>
                ) : (
                  <div className="empty-state">
                    <FileCode size={40} />
                    <h3>No HTML file uploaded</h3>
                    <p>
                      Link submissions can be reviewed in a separate browser
                      tab.
                    </p>
                    {submission.link && (
                      <a
                        className="btn"
                        href={submission.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open project <ArrowSquareOut size={17} />
                      </a>
                    )}
                  </div>
                )}
                {!teacher && (
                  <p className="preview-note">
                    External resources are blocked in this preview.
                  </p>
                )}
                {assetError && <p className="error" role="alert">{assetError}</p>}
              </>
            )}
            {tab === "code" && (
              <div className="code-view">
                <aside>
                  {submission.files.map((f) => (
                    <button
                      key={f.path}
                      className={file === f.path ? "active" : ""}
                      aria-pressed={file === f.path}
                      onClick={() => setFile(f.path)}
                    >
                      <FileCode size={16} />
                      {f.path}
                    </button>
                  ))}
                  {submission.link && (
                    <a
                      href={submission.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Project link <ArrowSquareOut size={14} />
                    </a>
                  )}
                </aside>
                <div className="source">
                  <div className="file-bar">
                    <span>{file || "No source files"}</span>
                    {file && (
                      <button
                        className="icon-btn"
                        aria-label="Download source file"
                        onClick={() =>
                          saveFile(
                            file.split("/").pop()!,
                            submission.files.find((f) => f.path === file)
                              ?.content || "",
                          )
                        }
                      >
                        <DownloadSimple size={18} />
                      </button>
                    )}
                  </div>
                  <pre>
                    {(
                      submission.files.find((f) => f.path === file)?.content ??
                      "Only a project link was submitted. Source analysis requires uploaded files."
                    )
                      .split("\n")
                      .map((line, i) => (
                        <div key={i}>
                          <span className="line-number">{i + 1}</span>
                          <code>{line || " "}</code>
                        </div>
                      ))}
                  </pre>
                </div>
              </div>
            )}
            {tab === "analysis" && (
              <div className="analysis-body">
                {!analysis ? (
                  <div className="empty-state">
                    <ShieldCheck size={36} />
                    <p role={analysisError ? "alert" : "status"}>
                      {analysisError || "Checking requirements and comparing code…"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="analysis-metrics">
                      <div>
                        <span className="muted">Requirements met</span>
                        <strong>
                          {analysis.met}
                          <small> / {analysis.total}</small>
                        </strong>
                      </div>
                      <div>
                        <span className="muted">Highest similarity</span>
                        <strong>
                          {analysis.similarities.find(
                            (match) => match.comparable,
                          )?.percentage ?? "—"}
                          {analysis.similarities.some((match) => match.comparable) && <small>%</small>}
                        </strong>
                      </div>
                    </div>
                    <h3>Lab requirements</h3>
                    <div className="requirement-list">
                      {analysis.requirements.map((r) => (
                        <div key={r.id}>
                          {r.passed ? (
                            <CheckCircle
                              size={20}
                              weight="fill"
                              className="green"
                            />
                          ) : (
                            <WarningCircle size={20} className="amber" />
                          )}
                          <div>
                            <strong>{r.label}</strong>
                            <p>{r.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <h3>Code comparison</h3>
                    <p className="muted">
                      Similarity is a review signal. Shared lab instructions can
                      produce similar code; these results never change marks.
                    </p>
                    {analysis.similarities.length ? (
                      analysis.similarities.slice(0, 5).map((s) => (
                        <button
                          key={s.submissionId}
                          className="similarity-row"
                          onClick={() =>
                            setPeer(
                              peer?.submissionId === s.submissionId ? null : s,
                            )
                          }
                        >
                          <span className="avatar small">
                            {state.students
                              .find((u) => u.id === s.studentId)
                              ?.name.split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                          <span>
                            {state.students.find((u) => u.id === s.studentId)
                              ?.name || "Peer submission"}
                          </span>
                          <span className="similarity-track">
                            <i
                              style={{
                                width: `${s.comparable ? s.percentage : 0}%`,
                              }}
                            />
                          </span>
                          <strong>
                            {s.comparable
                              ? `${s.percentage}%`
                              : "Incomplete analysis"}
                          </strong>
                          <CaretRight size={15} />
                        </button>
                      ))
                    ) : (
                      <p className="muted">
                        No comparable peer code was found for this task.
                      </p>
                    )}
                    {peer && (
                      <div className="matching-evidence">
                        <h4>Matching evidence</h4>
                        {peer.matchingBlocks.length ? (
                          peer.matchingBlocks.map((b, i) => (
                            <div className="fields-2" key={i}>
                              <pre>{b.source}</pre>
                              <pre>{b.peer}</pre>
                            </div>
                          ))
                        ) : (
                          <p className="muted">
                            Comparison based on normalized structure; no long
                            matching source block.
                          </p>
                        )}
                      </div>
                    )}
                    <h3>Quality observations</h3>
                    {analysis.quality.map((q, i) => (
                      <div className="quality-item" key={i}>
                        <WarningCircle size={19} />
                        <div>
                          <strong>{q.title}</strong>
                          <p>{q.detail}</p>
                        </div>
                      </div>
                    ))}
                    {!analysis.quality.length && (
                      <p className="muted">
                        No configured quality issues found.
                      </p>
                    )}
                    <p className="analysis-summary">{analysis.summary}</p>
                  </>
                )}
              </div>
            )}
          </div>
          <aside className={teacher ? "review-sidebar" : "grading-panel"}>
            {state.user?.role === "teacher" && (
              <section className="review-card review-analysis-card" aria-label="Code analysis">
                <div className="review-card-topline">
                  <div className="eyebrow"><Code size={15} aria-hidden="true" /> CODE ANALYSIS</div>
                  <button className="icon-btn review-desktop-close" aria-label="Close review" onClick={onClose}><X size={17} /></button>
                </div>
                <div className="review-analysis-scroll">
                  {analysis ? (
                    <>
                      <div className="review-analysis-metrics" aria-label="Analysis summary">
                        <div className={`metric-tile ${analysis.total && analysis.met === analysis.total ? "metric-success" : "metric-warn"}`} title="Requirements fulfilled">
                          <span className="metric-val">{analysis.total ? `${analysis.met} / ${analysis.total}` : "—"}</span>
                          <span className="metric-label">Requirements</span>
                        </div>
                        <div
                          className={`metric-tile ${
                            highestMatch && highestMatch.percentage >= 70
                              ? "metric-danger"
                              : highestMatch && highestMatch.percentage >= 50
                              ? "metric-warn"
                              : "metric-clean"
                          }`}
                          title={highestMatch ? `Highest peer similarity: ${highestMatch.percentage}%` : "No peer match"}
                        >
                          <span className="metric-val">{highestMatch ? `${highestMatch.percentage}%` : "Clean"}</span>
                          <span className="metric-label">Similarity</span>
                        </div>
                        <div className={`metric-tile ${analysis.quality.length === 0 ? "metric-clean" : "metric-info"}`} title="Automated code quality observations">
                          <span className="metric-val">{analysis.quality.length === 0 ? "0 issues" : `${analysis.quality.length} issue${analysis.quality.length > 1 ? "s" : ""}`}</span>
                          <span className="metric-label">Quality</span>
                        </div>
                      </div>

                      {analysis.requirements.length > 0 && (
                        <div className="review-checklist-block">
                          <div className="review-section-subtitle">Requirements checklist</div>
                          <div className="review-sidebar-checklist" aria-label="Requirements checklist">
                            {analysis.requirements.map((r) => (
                              <div key={r.id} className={`review-sidebar-req ${r.passed ? "passed" : "failed"}`} title={r.detail}>
                                {r.passed ? (
                                  <CheckCircle size={15} weight="fill" className="green" aria-hidden="true" />
                                ) : (
                                  <WarningCircle size={15} weight="fill" className="amber" aria-hidden="true" />
                                )}
                                <span className="req-label">{r.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.quality.length > 0 && (
                        <div className="review-sidebar-quality-block">
                          <div className="review-section-subtitle">Quality observations</div>
                          <div className="review-sidebar-quality-list">
                            {analysis.quality.map((q, i) => (
                              <div key={i} className="review-sidebar-quality-item" title={q.detail}>
                                <WarningCircle size={13} className="amber" aria-hidden="true" />
                                <span>{q.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {highestMatch && highestMatch.percentage >= 50 && (
                        <div className={`review-sidebar-similarity-alert ${highestMatch.percentage >= 70 ? "high" : "moderate"}`}>
                          <span>
                            {highestMatch.percentage >= 70 ? "🚨" : "⚠️"} {highestMatch.percentage}% similarity with {highestPeerStudent ? `Roll ${highestPeerStudent.rollNumber}` : "peer"}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        className="review-analysis-link"
                        aria-pressed={tab === "analysis"}
                        onClick={() => setTab("analysis")}
                      >
                        <span>View full analysis tab</span> <CaretRight size={14} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <p className="review-analysis-status" role={analysisError ? "alert" : "status"}>
                      {analysisError || "Checking requirements and comparing code…"}
                    </p>
                  )}
                </div>
              </section>
            )}
            <div className={teacher ? "grading-panel review-card review-grade-card" : "review-result"}>
              {state.user?.role === "teacher" ? (
                <>

                  <div className="review-grade-controls">
                    <label className="field review-marks-field">
                      <span>Marks</span>
                      <div className="marks-input">
                        <input
                          disabled={busy}
                          type="number"
                          min="0"
                          max={task.maxMarks}
                          step="0.5"
                          value={marks}
                          onChange={(e) => setMarks(e.target.value)}
                          placeholder="0"
                        />
                        <span>/ {task.maxMarks}</span>
                      </div>
                    </label>
                    <label className="check-field review-publish-field" title="Publish grade to student">
                      <input
                        disabled={busy}
                        type="checkbox"
                        checked={publish}
                        onChange={(e) => setPublish(e.target.checked)}
                      />{" "}
                      <span>Publish</span>
                    </label>
                  </div>

                  <label className="field review-feedback-field">
                    <span>Feedback <small className="muted">(optional)</small></span>
                    <textarea
                      disabled={busy}
                      rows={2}
                      maxLength={4000}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Remarks (optional)…"
                    />
                  </label>

                  <div className="review-remaining-banner">
                    <span className="review-remaining-count">
                      {remainingCount === 0 ? (
                        <span className="review-status-success">
                          🎉 All submissions graded
                        </span>
                      ) : queueMode === "pending" ? (
                        <>
                          <span><strong>{remainingCount}</strong> remaining</span>
                          {nextStudent && (
                            <small className="review-next-peek">
                              Next: Roll {nextStudent.rollNumber}
                            </small>
                          )}
                        </>
                      ) : (
                        <>
                          <span><strong>{remainingCount}</strong> of {totalCount} remaining</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="review-save-actions">
                    <button
                      type="button"
                      className="btn btn-primary full review-save-next-btn"
                      onClick={() => grade(true)}
                      disabled={!canSave}
                      title={
                        nextSubmission
                          ? `Save and skip to next remaining student (Roll ${nextStudent?.rollNumber || ""}) [Ctrl+Enter]`
                          : queueMode === "pending"
                            ? "Save grade for the final remaining student"
                            : "Save grade (last student in this task)"
                      }
                    >
                      <ArrowRight size={17} weight="bold" />
                      {busy ? (
                        "Saving…"
                      ) : nextSubmission ? (
                        <>
                          Save & Next{" "}
                          {nextStudent ? `(Roll ${nextStudent.rollNumber})` : ""}
                          <span className="kbd-hint">Ctrl ↵</span>
                        </>
                      ) : queueMode === "pending" ? (
                        <>
                          Save & Complete <span className="kbd-hint">Ctrl ↵</span>
                        </>
                      ) : (
                        "Save (Last student)"
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn full review-save-only-btn"
                      onClick={() => grade(false)}
                      disabled={!canSave}
                      title="Save grade without moving to the next student"
                    >
                      <FloppyDisk size={14} />
                      {busy ? "Saving…" : "Save grade only"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Your result</h3>
                  {submission.grade?.published ? (
                    <>
                      <div className="student-score">
                        {submission.grade.marks}
                        <small> / {task.maxMarks}</small>
                      </div>
                      <p>
                        {submission.grade.feedback || "No feedback provided."}
                      </p>
                    </>
                  ) : (
                    <p className="muted">Awaiting your teacher's grade.</p>
                  )}
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="success" role="status">
                  {notice}
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
