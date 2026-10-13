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
} from "@phosphor-icons/react";
import type { AppState, AnalysisResult, Submission } from "../shared/types";
import { api, saveFile } from "./api";
import { buildPreview, resolvePath } from "./preview";

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
  const [tab, setTab] = useState("preview");
  const [file, setFile] = useState(
    submission.files.find((f) => /\.html?$/i.test(f.path))?.path ||
      submission.files[0]?.path ||
      "",
  );
  const [entry, setEntry] = useState(
    submission.files.find((f) => /\.html?$/i.test(f.path))?.path || "",
  );
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState(String(submission.grade?.marks ?? ""));
  const [feedback, setFeedback] = useState(submission.grade?.feedback || "");
  const [publish, setPublish] = useState(submission.grade?.published ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [peer, setPeer] = useState<
    AnalysisResult["similarities"][number] | null
  >(null);
  useEffect(() => {
    if (state.user?.role !== "teacher") return;
    let active = true;
    api<AnalysisResult>(`/submissions/${submission.id}/analysis`)
      .then((a) => {
        if (active) setAnalysis(a);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [submission.id, state.user?.role]);
  useEffect(() => {
    let active = true;
    Promise.all(
      (submission.assets || []).map(async (asset) => {
        const response = await fetch(
          `/api/submissions/${submission.id}/files/${asset.path.split("/").map(encodeURIComponent).join("/")}`,
        );
        if (!response.ok) return [asset.path, ""];
        const blob = await response.blob();
        return [
          asset.path,
          await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(blob);
          }),
        ];
      }),
    ).then((entries) => {
      if (active) setAssets(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [submission]);
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
      await onSaved();
      setNotice(
        publish ? "Grade published to the student." : "Grade saved as a draft.",
      );
    } catch (e) {
      if ((e as Error & { status?: number }).status === 409) {
        await onSaved(
          "The submission changed. Review the latest revision before grading.",
        );
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal review-modal"
        role="dialog"
        aria-modal="true"
        aria-label={
          state.user?.role === "teacher"
            ? "Review submission"
            : "Your submission"
        }
      >
        <header className="modal-head">
          <div>
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
                  <span className="muted">· {task.title}</span>
                </>
              ) : (
                task.title
              )}
            </h2>
            <p>
              {lab.title} <span className="dot-separator">·</span>{" "}
              {state.user?.role === "teacher" && (
                <>
                  {student.rollNumber}{" "}
                  <span className="dot-separator">·</span>{" "}
                </>
              )}
              {new Date(submission.submittedAt).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}
            </p>
          </div>
          <button
            className="icon-btn"
            aria-label="Close review"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="review-layout">
          <div className="review-workspace">
            <div className="tabs">
              {[
                ["preview", Eye, "Live preview"],
                ["code", Code, "Source code"],
                ["analysis", ShieldCheck, "Code analysis"],
              ]
                .filter(
                  ([id]) => state.user?.role === "teacher" || id !== "analysis",
                )
                .map(([id, Icon, label]) => {
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
                  {state.user?.role === "teacher" && (
                    <span className="preview-security">
                      <ShieldCheck size={14} /> Isolated preview
                    </span>
                  )}
                </div>
                {entry ? (
                  <iframe
                    id="submission-preview"
                    title="Student project preview"
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    srcDoc={preview}
                  />
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
                <p className="preview-note">
                  {state.user?.role === "teacher"
                    ? "Local CSS, scripts, images and page links are supported. External resources and fetch requests are restricted. Preview is isolated from this workspace."
                    : "External resources are blocked in this preview."}
                </p>
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
                      submission.files.find((f) => f.path === file)?.content ||
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
                    <p>
                      {error || "Checking requirements and comparing code…"}
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
          <aside className="grading-panel">
            {state.user?.role === "teacher" && (
              <>
                <div className="eyebrow">TASK DETAILS</div>
                <h3>{task.title}</h3>
                <p>{task.description}</p>
                <div className="submission-facts">
                  <div>
                    <span>Submitted</span>
                    <strong>{submission.late ? "Late" : "On time"}</strong>
                  </div>
                  <div>
                    <span>Files</span>
                    <strong>
                      {submission.files.length +
                        (submission.assets?.length || 0)}
                    </strong>
                  </div>
                  <div>
                    <span>Maximum marks</span>
                    <strong>{task.maxMarks}</strong>
                  </div>
                </div>
              </>
            )}
            {state.user?.role === "teacher" ? (
              <>
                <h3>Grade & feedback</h3>
                <label className="field">
                  Marks
                  <div className="marks-input">
                    <input
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
                <label className="field">
                  Feedback
                  <textarea
                    rows={5}
                    maxLength={4000}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Share what worked and what to improve…"
                  />
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={publish}
                    onChange={(e) => setPublish(e.target.checked)}
                  />{" "}
                  Publish grade to student
                </label>
                <button
                  className="btn btn-primary full"
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
                  Grades are assigned by you. Analysis does not award or deduct
                  marks.
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
          </aside>
        </div>
      </section>
    </div>
  );
}
