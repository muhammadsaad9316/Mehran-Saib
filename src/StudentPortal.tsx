import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  BookOpen,
  CalendarBlank,
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  SignOut,
  Tray,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import type { AppState, Lab, Submission } from "../shared/types";
import { studentProgress } from "./student-progress";
import BrandLogo from "./BrandLogo";
import QuordixLogo from "./QuordixLogo";

interface Props {
  state: AppState;
  onSubmit: (lab: Lab, taskId: string) => void;
  onReview: (submission: Submission) => void;
  onSwitchRole: () => void;
  onLogout: () => void;
  onRefresh: () => Promise<unknown>;
  error: string;
  onDismissError: () => void;
}

const date = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Karachi",
  });
const deadline = (lab: Lab) =>
  lab.dueDate ? `Due ${date(lab.dueDate)}` : "No deadline";
const status = (work?: Submission) =>
  work?.grade?.published ? "Graded" : work ? "Submitted" : "To submit";

function downloadInstructions(lab: Lab) {
  if (!lab.instructionFile) return;
  const bytes = Uint8Array.from(
    atob(lab.instructionFile.content),
    (character) => character.charCodeAt(0),
  );
  const url = URL.createObjectURL(
    new Blob([bytes], { type: lab.instructionFile.contentType }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = lab.instructionFile.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StudentPortal({
  state,
  onSubmit,
  onReview,
  onSwitchRole,
  onLogout,
  onRefresh,
  error,
  onDismissError,
}: Props) {
  const [page, setPage] = useState<"labs" | "submissions">("labs");
  const [selectedLab, setSelectedLab] = useState("");
  const [filter, setFilter] = useState("all");
  const [submissionLab, setSubmissionLab] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  useEffect(() => {
    document.getElementById("student-content")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [page, selectedLab]);
  const labs = state.labs.filter((lab) => lab.published);
  const progress = labs.map((lab) => ({
    lab,
    ...studentProgress(lab, state.submissions, state.user!.id),
  }));
  const current = progress.find((item) => item.lab.id === selectedLab);
  const submitted = progress.reduce((sum, item) => sum + item.submitted, 0);
  const total = labs.reduce((sum, lab) => sum + lab.tasks.length, 0);
  const graded = progress.reduce((sum, item) => sum + item.graded, 0);
  const marks = progress.reduce((sum, item) => sum + item.marks, 0);
  const gradedMaximum = progress.reduce(
    (sum, item) => sum + item.gradedMaximum,
    0,
  );
  const work = progress
    .flatMap((item) => item.work)
    .filter((item) => submissionLab === "all" || item.labId === submissionLab)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  const visibleLabs = progress.filter(
    (item) =>
      filter === "all" ||
      (filter === "remaining" ? item.remaining > 0 : item.remaining === 0),
  );
  function navigate(next: "labs" | "submissions") {
    setPage(next);
    setSelectedLab("");
    setFilter("all");
    setSubmissionLab("all");
  }
  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    try {
      await onRefresh();
    } catch (error) {
      setRefreshError((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="main-shell teacher-shell student-shell">
      <a className="teacher-skip-link" href="#student-content">
        Skip to content
      </a>
      <aside className="teacher-rail" aria-label="Student workspace">
        <a
          href="#labs"
          className="teacher-rail-logo"
          aria-label="LabTrack student labs"
          onClick={(event) => {
            event.preventDefault();
            navigate("labs");
          }}
        >
          <BrandLogo />
        </a>
        <span className="teacher-rail-label">Workspace</span>
        <nav aria-label="Student navigation">
          {(
            [
              ["labs", "My labs", BookOpen],
              ["submissions", "My submissions", Tray],
            ] as const
          ).map(([item, label, Icon]) => (
            <button
              key={item}
              className={page === item ? "active" : ""}
              aria-current={page === item ? "page" : undefined}
              onClick={() => navigate(item)}
            >
              <Icon size={23} weight={page === item ? "fill" : "regular"} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="student-rail-footer">
          <a
            href="https://quordix.com"
            target="_blank"
            rel="noopener noreferrer"
            className="student-quordix-credit"
            title="Built by Quordix"
          >
            <span className="credit-label">Built By</span>
            <QuordixLogo className="quordix-logo-svg" />
          </a>
        </div>
      </aside>
      <div className="teacher-workspace">
        <header className="teacher-header">
          <a
            href="#labs"
            className="teacher-brand"
            onClick={(event) => {
              event.preventDefault();
              navigate("labs");
            }}
          >
            <span className="teacher-header-mobile-brand"><BrandLogo /></span>
            <span className="teacher-breadcrumb"><BookOpen size={17} /> Learning <CaretRight size={12} /><strong>{page === "labs" ? "My labs" : "My submissions"}</strong></span>
          </a>
          <div className="teacher-account">
            {state.demo && (
              <button
                className="teacher-text-button teacher-demo-button"
                onClick={onSwitchRole}
              >
                Teacher demo
              </button>
            )}
            <span className="teacher-identity student-identity">
              <span
                className="teacher-avatar"
                title={state.user?.name || `Roll ${state.user?.rollNumber}`}
              >
                {state.user?.rollNumber}
              </span>
              <span>
                <strong>
                  {state.user?.name || `Roll ${state.user?.rollNumber}`}
                </strong>
                <small>Roll no. {state.user?.rollNumber}</small>
              </span>
            </span>
            <button
              className="icon-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={onLogout}
            >
              <SignOut size={21} />
            </button>
          </div>
        </header>
        <main className="teacher-main" id="student-content" tabIndex={-1}>
          {current && page === "labs" && (
            <button className="student-back" onClick={() => setSelectedLab("")}>
              <ArrowLeft size={17} /> My labs
            </button>
          )}
          <div className="teacher-title student-title">
            <div className="teacher-title-copy">
              {!current && (
                <span className="teacher-eyebrow">
                  <span className="teacher-course-dot" /> Your learning workspace
                </span>
              )}
              {current && page === "labs" && (
                <span className="student-kicker">
                  Lab {String(labs.indexOf(current.lab) + 1).padStart(2, "0")} ·{" "}
                  {current.lab.tasks.length} tasks · {current.lab.totalMarks}{" "}
                  marks
                </span>
              )}
              <h1>
                {page === "submissions"
                  ? "My submissions"
                  : current
                    ? current.lab.title
                    : "Web Engineering"}
              </h1>
              {!current && (
                <p>
                  {page === "submissions"
                    ? "Your submitted work, published marks, and feedback in one place."
                    : "A clear path from each assignment to your next submission."}
                </p>
              )}
            </div>
            <div className="student-heading-actions">
              <span className="teacher-course-meta">
                <CalendarBlank size={16} />{" "}
                {current && page === "labs"
                  ? deadline(current.lab)
                  : "Fall 2026"}
              </span>
              <button
                className="teacher-text-button"
                onClick={refresh}
                disabled={refreshing}
              >
                <ArrowClockwise size={16} />{" "}
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          {(error || refreshError) && (
            <div className="teacher-error" role="alert">
              <span>{error || refreshError}</span>
              <button
                aria-label="Dismiss error"
                onClick={() => {
                  onDismissError();
                  setRefreshError("");
                }}
              >
                <X size={18} />
              </button>
            </div>
          )}

          {!current && (
            <section className="student-overview" aria-label="Your task progress">
              <div className="student-overview-heading">
                <span className="student-kicker">COURSE PROGRESS</span>
                <strong>
                  {total
                    ? submitted === total
                      ? "All tasks submitted"
                      : `${total - submitted} ${total - submitted === 1 ? "task" : "tasks"} left to submit`
                    : "Your coursework starts here"}
                </strong>
                <progress value={submitted} max={total || 1} aria-label="Tasks submitted" />
              </div>
              <dl className={`student-progress-strip${page === "submissions" ? " student-progress-with-marks" : ""}`}>
                <div>
                  <dt>Tasks submitted</dt>
                  <dd>
                    {submitted}
                    <small>/{total}</small>
                  </dd>
                </div>
                <div>
                  <dt>Awaiting grade</dt>
                  <dd>{submitted - graded}</dd>
                </div>
                <div>
                  <dt>Graded</dt>
                  <dd>{graded}</dd>
                </div>
                {page === "submissions" && (
                  <div>
                    <dt>Published marks</dt>
                    <dd>
                      {graded ? marks : "—"}
                      {graded > 0 && <small>/{gradedMaximum}</small>}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {page === "labs" && !current && (
            <section className="student-sheet" aria-label="Your labs">
              <div className="student-section-heading">
                <div>
                  <h2>
                    My labs <span>{labs.length}</span>
                  </h2>
                  <p>Select a task to submit or resubmit work. Open a lab for its instructions.</p>
                </div>
              </div>
              {labs.length > 0 && (
                <div
                  className="teacher-lab-filters"
                  role="group"
                  aria-label="Filter your labs"
                >
                  {(
                    [
                      ["all", "All labs"],
                      ["remaining", "To submit"],
                      ["complete", "Submitted"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={filter === value ? "active" : ""}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {visibleLabs.map(
                ({ lab, work, submitted, graded, remaining }) => (
                  <article className="student-lab" key={lab.id}>
                    <div className="student-lab-info">
                      <span className="student-kicker student-lab-kicker">
                        <BookOpen size={16} />
                        Lab {String(labs.indexOf(lab) + 1).padStart(2, "0")}
                      </span>
                      <h3>
                        <button onClick={() => setSelectedLab(lab.id)}>
                          {lab.title}
                        </button>
                      </h3>
                      <p className="student-meta">
                        <span>{lab.tasks.length} tasks</span>
                        <span>{lab.totalMarks} marks</span>
                        <span>{deadline(lab)}</span>
                      </p>
                    </div>
                    <div className="student-lab-progress">
                      <div
                        className="student-task-track"
                        role="group"
                        aria-label={`${submitted} of ${lab.tasks.length} tasks submitted`}
                      >
                        {lab.tasks.map((task, index) => {
                          const item = work.find(
                            (item) => item.taskId === task.id,
                          );
                          return (
                            <button
                              key={task.id}
                              type="button"
                              className={
                                item?.grade?.published
                                  ? "graded"
                                  : item
                                    ? "submitted"
                                    : "to-submit"
                              }
                              title={`${task.title} · ${item ? "Resubmit this task" : "Submit this task"}`}
                              aria-label={`Task ${index + 1}: ${task.title}. ${status(item)}. ${item ? "Resubmit task" : "Submit task"}`}
                              onClick={() => onSubmit(lab, task.id)}
                            >
                              <span className="student-track-title">
                                {item?.grade?.published ? (
                                  <CheckCircle size={18} weight="fill" />
                                ) : item ? (
                                  <Clock size={18} />
                                ) : (
                                  <UploadSimple size={18} />
                                )}
                                <span>Task {index + 1}</span>
                              </span>
                              <small>{status(item)}</small>
                            </button>
                          );
                        })}
                      </div>
                      <p>
                        {submitted}/{lab.tasks.length} submitted <span>·</span>{" "}
                        {graded}/{lab.tasks.length} graded
                      </p>
                    </div>
                    <button
                      className={
                        remaining
                          ? "teacher-primary-button"
                          : "student-outline-button"
                      }
                      aria-label={`Open Lab ${labs.indexOf(lab) + 1}: ${lab.title}`}
                      onClick={() => setSelectedLab(lab.id)}
                    >
                      Open lab <ArrowRight size={17} />
                    </button>
                  </article>
                ),
              )}
              {!visibleLabs.length && (
                <div className="teacher-empty">
                  <BookOpen size={28} />
                  <h3>
                    {!labs.length
                      ? "No labs published yet"
                      : "No labs in this filter"}
                  </h3>
                  {!labs.length && <p>Your teacher's published labs will appear here.</p>}
                  {labs.length > 0 && (
                    <button
                      className="teacher-text-button"
                      onClick={() => setFilter("all")}
                    >
                      Show all labs
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {page === "labs" && current && (
            <section
              className="student-sheet student-lab-detail"
              aria-label="Lab tasks"
            >
              <div className="student-detail-heading">
                <div>
                  <span className="student-kicker">YOUR ASSIGNMENT</span>
                  <h2>Task checklist</h2>
                </div>
                <span className="student-detail-completion">
                  <CheckCircle size={18} />
                  {current.submitted}/{current.lab.tasks.length} submitted
                </span>
              </div>
              {(current.lab.description || current.lab.instructionFile) && (
                <div className="student-lab-intro">
                  {current.lab.description && <p>{current.lab.description}</p>}
                  {current.lab.instructionFile && (
                    <button
                      className="teacher-text-button"
                      onClick={() => downloadInstructions(current.lab)}
                    >
                      <DownloadSimple size={16} /> Download instructions
                    </button>
                  )}
                </div>
              )}
              {current.lab.tasks.map((task, index) => {
                const item = current.work.find(
                  (item) => item.taskId === task.id,
                );
                return (
                  <details
                    className="student-task"
                    key={task.id}
                    open={
                      index ===
                        current.lab.tasks.findIndex(
                          (task) =>
                            !current.work.some(
                              (item) => item.taskId === task.id,
                            ),
                        ) ||
                      (current.remaining === 0 && index === 0)
                    }
                  >
                    <summary>
                      <span className="student-task-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="student-task-label">
                        <strong>{task.title}</strong>
                        <small>{task.maxMarks} marks</small>
                      </span>
                      <span
                        className={`student-status ${status(item).toLowerCase().replaceAll(" ", "-")}`}
                      >
                        {status(item)}
                      </span>
                      <CaretDown size={18} className="student-task-caret" />
                    </summary>
                    <div className="student-task-body">
                      <p className="student-instructions">
                        {task.description ||
                          "Follow the lab instructions for this task."}
                      </p>
                      {task.requirements.length > 0 && (
                        <div className="student-requirements">
                          <h4>Requirements</h4>
                          <ul>
                            {task.requirements.map((requirement) => (
                              <li key={requirement.id}>{requirement.label}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {item?.grade?.published && (
                        <div className="student-feedback">
                          <span className="student-kicker">PUBLISHED RESULT</span>
                          <strong>
                            {item.grade.marks}/{task.maxMarks} marks
                          </strong>
                          {item.grade.feedback && <p>{item.grade.feedback}</p>}
                        </div>
                      )}
                      <div className="student-task-actions">
                        <button
                          className={
                            item
                              ? "student-outline-button"
                              : "teacher-primary-button"
                          }
                          onClick={() => onSubmit(current.lab, task.id)}
                        >
                          <UploadSimple size={17} />{" "}
                          {item ? "Resubmit task" : "Submit task"}
                        </button>
                        {item && (
                          <button
                            className="teacher-text-button"
                            onClick={() => onReview(item)}
                          >
                            View submission <ArrowRight size={17} />
                          </button>
                        )}
                        {item && (
                          <span className="student-meta">
                            Submitted {date(item.submittedAt)}
                            {item.late ? " · Late" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </section>
          )}

          {page === "submissions" && (
            <section
              className="student-sheet"
              aria-label="Your submissions and grades"
            >
              <div className="student-section-heading">
                <div>
                  <h2>
                    Submitted tasks <span>{work.length}</span>
                  </h2>
                  <p>Latest submissions first. Select a task to view your work.</p>
                </div>
                <label className="student-lab-select">
                  <span className="sr-only">Filter submissions by lab</span>
                  <select
                    value={submissionLab}
                    onChange={(event) => setSubmissionLab(event.target.value)}
                  >
                    <option value="all">All labs</option>
                    {labs.map((lab, index) => (
                      <option key={lab.id} value={lab.id}>
                        Lab {index + 1} · {lab.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {work.map((item) => {
                const lab = labs.find((lab) => lab.id === item.labId)!;
                const task = lab.tasks.find((task) => task.id === item.taskId)!;
                return (
                  <article className="student-submission" key={item.id}>
                    <div className="student-submission-info">
                      <span className="student-kicker">
                        Lab {String(labs.indexOf(lab) + 1).padStart(2, "0")} ·
                        Task {lab.tasks.indexOf(task) + 1}
                      </span>
                      <h3>{task.title}</h3>
                      <p className="student-meta">
                        Submitted {date(item.submittedAt)} · Revision{" "}
                        {item.revision}
                        {item.late ? " · Late" : ""}
                      </p>
                    </div>
                    <div className="student-result">
                      {item.grade?.published ? (
                        <>
                          <strong>
                            {item.grade.marks}
                            <small>/{task.maxMarks}</small>
                          </strong>
                          <span className="student-status graded">Graded</span>
                        </>
                      ) : (
                        <>
                          <Clock size={20} />
                          <span className="student-status submitted">
                            Awaiting grade
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      className="student-outline-button"
                      aria-label={`View ${task.title} submission`}
                      onClick={() => onReview(item)}
                    >
                      View work <ArrowRight size={17} />
                    </button>
                    {item.grade?.published && item.grade.feedback && (
                      <p className="student-submission-feedback">
                        <span>Feedback</span>
                        {item.grade.feedback}
                      </p>
                    )}
                  </article>
                );
              })}
              {!work.length && (
                <div className="teacher-empty">
                  <Tray size={28} />
                  <h3>{submissionLab === "all" ? "No submissions yet" : "No submissions for this lab"}</h3>
                  <p>Submit a task from your labs to track its results here.</p>
                  <button
                    className="teacher-text-button"
                    onClick={() => navigate("labs")}
                  >
                    Open my labs <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </section>
          )}
          {state.demo && <p className="student-demo-note">Demo workspace <span>·</span> Sample coursework</p>}
          <a
            className="quordix-mobile-credit student-mobile-credit"
            href="https://quordix.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Built by Quordix (opens in a new tab)"
          >
            <span>Built by</span>
            <QuordixLogo />
          </a>
        </main>
      </div>
    </div>
  );
}
