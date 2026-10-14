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
  Clock,
  Globe,
  ChartBar,
} from "@phosphor-icons/react";
import type { AppState, AnalysisResult, Submission } from "../shared/types";
import { api, saveFile } from "./api";
import { buildPreview, resolvePath } from "./preview";
import { useSubmissionAssets } from "./submission-assets";

export default function Review({
  submission,
  state,
  onClose,
  onSaved,
}: {
  submission: Submission;
  state: AppState;
  onClose: () => void;
  onSaved: (message?: string) => Promise<void>;
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
  async function grade() {
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
      setNotice(
        publish ? "Grade published to the student." : "Grade saved as a draft.",
      );
      try {
        await onSaved();
      } catch (cause) {
        setError(`The grade was saved, but the workspace could not refresh. ${cause instanceof Error ? cause.message : "Refresh before grading again."}`);
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
          <div className="review-top-fact">
            <span className="fact-label"><Clock size={13} aria-hidden="true" /> Submitted</span>
            <strong className={submission.late ? "review-status-warning" : "review-status-success"}>
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
                  <button className="icon-btn review-desktop-close" aria-label="Close review" onClick={onClose}><X size={19} /></button>
                </div>
                {analysis ? (
                  <>
                    <dl className="review-analysis-facts">
                      <div><dt>Requirements met</dt><dd className={analysis.total && analysis.met === analysis.total ? "review-status-success" : "review-status-warning"}>{analysis.total ? `${analysis.met} / ${analysis.total}` : "No checks set"}</dd></div>
                      <div><dt>Quality observations</dt><dd>{analysis.quality.length}</dd></div>
                      <div><dt>Highest similarity</dt><dd>{highestMatch ? `${highestMatch.percentage}%` : "Not comparable"}</dd></div>
                    </dl>
                    {analysis.requirements.length > 0 && (
                      <div className="review-sidebar-checklist" aria-label="Requirements checklist">
                        {analysis.requirements.map((r) => (
                          <div key={r.id} className={`review-sidebar-req ${r.passed ? "passed" : "failed"}`} title={r.detail}>
                            {r.passed ? (
                              <CheckCircle size={14} weight="fill" className="green" aria-hidden="true" />
                            ) : (
                              <WarningCircle size={14} className="amber" aria-hidden="true" />
                            )}
                            <span>{r.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="review-analysis-link" aria-pressed={tab === "analysis"} onClick={() => setTab("analysis")}>View full analysis <CaretRight size={15} /></button>
                  </>
                ) : <p className="review-analysis-status" role={analysisError ? "alert" : "status"}>{analysisError || "Checking requirements and comparing code…"}</p>}
              </section>
            )}
            <div className={teacher ? "grading-panel review-card review-grade-card" : "review-result"}>
              {state.user?.role === "teacher" ? (
                <>
                  <h3 className="review-grade-heading"><ChartBar size={16} aria-hidden="true" />Grade & feedback</h3>
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
                    <span>Feedback</span>
                    <textarea
                      disabled={busy}
                      rows={teacher ? 2 : 5}
                      maxLength={4000}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Share what worked and what to improve…"
                    />
                  </label>
                  <button
                    className="btn btn-primary full review-save-btn"
                    onClick={grade}
                    disabled={
                      busy ||
                      marks === "" ||
                      !Number.isFinite(Number(marks)) ||
                      Number(marks) < 0 ||
                      Number(marks) > task.maxMarks
                    }
                  >
                    <FloppyDisk size={18} />
                    {busy ? "Saving…" : "Save grade"}
                  </button>
                  <p className="muted small-text">
                    Analysis is advisory. You assign the grade.
                  </p>
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
