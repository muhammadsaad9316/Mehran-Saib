import { useEffect, useState } from "react";
import {
  PencilSimple,
  Plus,
  SignOut,
  ArrowLeft,
  DownloadSimple,
  Printer,
  MagnifyingGlass,
  ArrowUpRight,
  Flask,
  CalendarBlank,
  ArrowRight,
  SquaresFour,
  UsersThree,
  BookOpen,
  CaretRight,
  Clock,
  ShieldCheck,
  CheckCircle,
} from "@phosphor-icons/react";
import type { AppState, Lab, Submission, User } from "../shared/types";
import { byRollNumber } from "../shared/roster";
import CheckTasks from "./CheckTasks";
import BrandLogo from "./BrandLogo";
import { allowNavigation } from "./navigation-guard";

interface Props {
  state: AppState;
  onReview: (submission: Submission) => void;
  onEdit: (lab?: Lab) => void;
  onStudent: (user: User) => void;
  onAddStudent: () => void;
  onSwitchRole: () => void;
  onLogout: () => void;
  onRefresh: () => Promise<unknown>;
  error: string;
  onDismissError: () => void;
}
type Page = "dashboard" | "labs" | "students" | "checks";
const dueDate = (value: string) =>
  value
    ? `Due ${new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Karachi",
      })}`
    : "No deadline";
export default function TeacherPortal({
  state,
  onReview,
  onEdit,
  onStudent,
  onAddStudent,
  onSwitchRole,
  onLogout,
  onRefresh,
  error,
  onDismissError,
}: Props) {
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedLab, setSelectedLab] = useState(state.labs[0]?.id || "");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("");
  const [labFilter, setLabFilter] = useState("all");
  useEffect(() => {
    document.getElementById("teacher-content")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [page]);
  const students = [...state.students].sort(byRollNumber);
  const publishedLabs = state.labs.filter((lab) => lab.published);
  const pendingReviews = state.submissions.filter(
    (submission) =>
      !submission.grade &&
      students.some((student) => student.id === submission.studentId) &&
      publishedLabs.some(
        (lab) =>
          lab.id === submission.labId &&
          lab.tasks.some((task) => task.id === submission.taskId),
      ),
  );
  const visibleLabs = state.labs.filter(
    (lab) =>
      labFilter === "all" || lab.published === (labFilter === "published"),
  );
  const currentLab =
    state.labs.find((lab) => lab.id === selectedLab) || state.labs[0];
  const currentIndex =
    state.labs.findIndex((lab) => lab.id === currentLab?.id) + 1;
  const counts = (lab: Lab) => {
    const submitted = new Set(
      state.submissions
        .filter(
          (sub) =>
            sub.labId === lab.id &&
            students.some((student) => student.id === sub.studentId),
        )
        .map((sub) => sub.studentId),
    );
    return {
      submitted: submitted.size,
      missing: students.length - submitted.size,
    };
  };
  function navigate(next: Page) {
    if (!allowNavigation()) return;
    setPage(next);
    setFilter("all");
    setQuery("");
  }
  function openLab(lab: Lab) {
    setExpanded(lab.id);
    navigate("labs");
  }
  function openLabStudents(lab: Lab, selectedFilter = "all") {
    if (!allowNavigation()) return;
    setSelectedLab(lab.id);
    setFilter(selectedFilter);
    setQuery("");
    setPage("students");
  }
  const rows = students.filter((student) => {
    const hasWork = state.submissions.some(
      (sub) => sub.studentId === student.id && sub.labId === currentLab?.id,
    );
    const search = query.trim();
    const matches = /^\d+$/.test(search)
      ? student.rollNumber === String(Number(search))
      : `${student.name} ${student.rollNumber}`
          .toLowerCase()
          .includes(search.toLowerCase());
    return (
      matches &&
      (filter === "all" || (filter === "submitted" ? hasWork : !hasWork))
    );
  });
  return (
    <div className="main-shell teacher-shell">
      <a className="teacher-skip-link" href="#teacher-content">
        Skip to content
      </a>
      <aside className="teacher-rail" aria-label="Teaching workspace">
        <a
          href="#dashboard"
          className="teacher-rail-logo"
          aria-label="LabTrack dashboard"
          onClick={(event) => {
            event.preventDefault();
            navigate("dashboard");
          }}
        >
          <BrandLogo />
        </a>
        <span className="teacher-rail-label">Workspace</span>
        <nav aria-label="Teacher navigation">
          {(
            [
              ["dashboard", "Dashboard", SquaresFour],
              ["checks", "Check tasks", ShieldCheck],
              ["labs", "Labs", BookOpen],
              ["students", "Students", UsersThree],
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
              {item === "checks" && pendingReviews.length > 0 && (
                <span className="teacher-nav-count">{pendingReviews.length}</span>
              )}
            </button>
          ))}
        </nav>
      </aside>
      <div className="teacher-workspace">
        <header className="teacher-header">
          <a
            href="#dashboard"
            className="teacher-brand"
            onClick={(event) => {
              event.preventDefault();
              navigate("dashboard");
            }}
          >
            <span className="teacher-header-mobile-brand"><BrandLogo /></span>
            <span className="teacher-breadcrumb"><SquaresFour size={17} /> Workspace <CaretRight size={12} /><strong>{page === "dashboard" ? "Overview" : page === "labs" ? "Labs" : page === "checks" ? "Check tasks" : "Students"}</strong></span>
          </a>
          <div className="teacher-account">
            {state.demo && (
              <button
                className="teacher-text-button teacher-demo-button"
                onClick={onSwitchRole}
              >
                Student demo
              </button>
            )}
            <span className="teacher-identity">
              <span className="teacher-avatar">
                {state.user?.name
                  .split(" ")
                  .map((name) => name[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{state.user?.name}</strong>
                <small>Teacher</small>
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
        <main
          className={`teacher-main${page === "checks" ? " teacher-main-checks" : ""}`}
          id="teacher-content"
          tabIndex={-1}
          key={page}
        >
          <div className="teacher-title">
            <div className="teacher-title-copy">
              <span className="teacher-eyebrow"><span className="teacher-course-dot" />{page === "dashboard" ? "Your teaching workspace" : "Web Engineering · Fall 2026"}</span>
              <h1>
                {page === "dashboard"
                  ? "Web Engineering"
                  : page === "labs"
                    ? "Lab library"
                    : page === "checks" ? "Check tasks" : "Class register"}
              </h1>
              {page !== "checks" && <p>{page === "dashboard" ? "Your labs, your class, and a clear view of what’s next." : page === "labs" ? "Prepare assignments, publish tasks, and keep everything in one place." : "Every student, every task, and every mark in one register."}</p>}
            </div>
            <div className="teacher-title-aside">
              <span className="teacher-course-meta">
                <CalendarBlank size={16} /> Fall 2026 <span>Semester 07</span>
              </span>
              {page === "checks" ? null : page !== "students" ? (
                <button
                  className="teacher-primary-button"
                  onClick={() => onEdit()}
                >
                  <Plus size={18} weight="bold" /> Create a lab
                </button>
              ) : (
                <button
                  className="teacher-primary-button"
                  disabled={students.length >= 41}
                  title={
                    students.length >= 41
                      ? "All 41 roll numbers are assigned"
                      : undefined
                  }
                  onClick={onAddStudent}
                >
                  <Plus size={18} weight="bold" /> Add student
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="teacher-error" role="alert">
              {error}
              <button onClick={onDismissError}>Dismiss</button>
            </div>
          )}
          {page === "checks" && <CheckTasks state={state} onReview={onReview} onRefresh={onRefresh} />}
          {page === "dashboard" && (
            <>
              <section
                className="teacher-course-strip"
                aria-label="Course overview"
              >
                <dl>
                  <div>
                    <dt>Students</dt>
                    <dd>{String(students.length).padStart(2, "0")}</dd>
                  </div>
                  <div>
                    <dt>Published labs</dt>
                    <dd>{String(publishedLabs.length).padStart(2, "0")}</dd>
                  </div>
                  <div>
                    <dt>In draft</dt>
                    <dd>{String(state.labs.length - publishedLabs.length).padStart(2, "0")}</dd>
                  </div>
                </dl>
                <span className="teacher-course-school">
                  <BookOpen size={22} weight="duotone" />
                  <span><strong>BS Computer Science</strong><small>Govt. Degree College Lundkhwar</small></span>
                </span>
              </section>
              <div className="teacher-studio-grid">
                <section
                  className="teacher-lab-section"
                  aria-label="Lab progress"
                >
                  <div className="teacher-section-heading">
                    <div>
                      <h2>
                        Lab overview{" "}
                        <span>
                          {String(state.labs.length).padStart(2, "0")}
                        </span>
                      </h2>
                      <p>Track submissions, from first upload to final marks.</p>
                    </div>
                    <button
                      className="teacher-text-button"
                      onClick={() => navigate("labs")}
                      aria-label="Open lab library"
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </div>
                  <div
                    className="teacher-lab-filters"
                    role="group"
                    aria-label="Filter labs"
                  >
                    {(
                      [
                        ["all", "All labs", state.labs.length],
                        ["published", "Published", publishedLabs.length],
                        [
                          "draft",
                          "Drafts",
                          state.labs.length - publishedLabs.length,
                        ],
                      ] as const
                    ).map(([value, label, count]) => (
                      <button
                        key={value}
                        className={labFilter === value ? "active" : ""}
                        aria-pressed={labFilter === value}
                        onClick={() => setLabFilter(value)}
                      >
                        {label}
                        <span>{count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="teacher-progress-list">
                    {visibleLabs.map((lab) => {
                      const index = state.labs.findIndex(
                        (item) => item.id === lab.id,
                      );
                      const count = counts(lab);
                      const progress = students.length
                        ? Math.round((count.submitted / students.length) * 100)
                        : 0;
                      return (
                        <article
                          className={`teacher-progress-row${!lab.published ? " draft" : ""}`}
                          key={lab.id}
                        >
                          <div className="teacher-lab-topline">
                            <span className="teacher-lab-number">
                              Lab {String(index + 1).padStart(2, "0")}
                            </span>
                            <span
                              className={`teacher-lab-state${lab.published ? " published" : ""}`}
                            >
                              <i />
                              {lab.published ? "Published" : "Draft"}
                            </span>
                            <button
                              className="icon-btn teacher-row-edit"
                              aria-label={`Edit Lab ${index + 1}`}
                              title="Edit lab"
                              onClick={() => onEdit(lab)}
                            >
                              <PencilSimple size={18} />
                            </button>
                          </div>
                          <div className="teacher-lab-info">
                            <h3>
                              <button
                                onClick={() =>
                                  lab.published ? openLab(lab) : onEdit(lab)
                                }
                                aria-label={
                                  lab.published
                                    ? `View Lab ${index + 1} details`
                                    : `Edit Lab ${index + 1}: ${lab.title}`
                                }
                              >
                                {lab.title}
                              </button>
                            </h3>
                            <p className="teacher-lab-meta">
                              <span>{lab.tasks.length} tasks</span>
                              <span>{lab.totalMarks} marks</span>
                              <span>{dueDate(lab.dueDate)}</span>
                            </p>
                          </div>
                          {lab.published ? (
                            <div className="teacher-row-progress">
                              <div className="teacher-count-heading">
                                <button
                                  className="submitted-count"
                                  aria-label={`Lab ${index + 1}: ${count.submitted} submitted`}
                                  onClick={() => openLabStudents(lab, "submitted")}
                                >
                                  <strong>
                                    {String(count.submitted).padStart(2, "0")}
                                    <small>/{students.length}</small>
                                  </strong>
                                  <span>students submitted</span>
                                </button>
                                <button
                                  className="missing-count"
                                  aria-label={`Lab ${index + 1}: ${count.missing} missing`}
                                  onClick={() => openLabStudents(lab, "missing")}
                                >
                                  <span>
                                    {String(count.missing).padStart(2, "0")}{" "}
                                    missing
                                  </span>
                                  <ArrowUpRight size={16} />
                                </button>
                              </div>
                              <div
                                className="teacher-submission-matrix"
                                role="img"
                                aria-label={`${lab.title}: ${count.submitted} of ${students.length} students submitted, ${count.missing} missing. Each block represents one student in roll-number order.`}
                              >
                                {students.map((student) => {
                                  const work = state.submissions.filter(
                                    (submission) =>
                                      submission.labId === lab.id &&
                                      submission.studentId === student.id,
                                  );
                                  const status = !work.length
                                    ? "missing"
                                    : work.some(
                                          (submission) => !submission.grade,
                                        )
                                      ? "review"
                                      : "graded";
                                  return (
                                    <span
                                      key={student.id}
                                      className={`teacher-matrix-cell ${status}`}
                                      title={`Roll no. ${student.rollNumber}: ${status === "review" ? "Awaiting review" : status === "graded" ? "Graded submissions" : "No submission"}`}
                                    />
                                  );
                                })}
                              </div>
                              <div className="teacher-matrix-caption">
                                <span>Each block is one student</span>
                                <span>{progress}% submitted</span>
                              </div>
                            </div>
                          ) : (
                            <div className="teacher-draft-panel">
                              <span>
                                <Flask size={20} /> Students can submit after
                                you publish.
                              </span>
                              <button
                                className="teacher-draft-button"
                                onClick={() => onEdit(lab)}
                              >
                                Edit draft <PencilSimple size={15} />
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    {!visibleLabs.length && state.labs.length > 0 && (
                      <div className="teacher-empty">
                        <p>
                          No {labFilter === "draft" ? "draft" : "published"}{" "}
                          labs yet.
                        </p>
                        <button
                          className="teacher-text-button"
                          onClick={() => setLabFilter("all")}
                        >
                          Show all labs
                        </button>
                      </div>
                    )}
                    {!state.labs.length && (
                      <div className="teacher-empty">
                        <Flask size={32} />
                        <h3>No labs yet</h3>
                        <button
                          className="teacher-primary-button"
                          onClick={() => onEdit()}
                        >
                          <Plus size={17} /> Create a lab
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    className="teacher-matrix-legend"
                    aria-label="Submission matrix legend"
                  >
                    <span>
                      <i className="graded" />
                      Graded work
                    </span>
                    <span>
                      <i className="review" />
                      To review
                    </span>
                    <span>
                      <i className="missing" />
                      No submission
                    </span>
                  </div>
                </section>
                <aside
                  className="teacher-review-desk"
                  aria-label="Teaching tools"
                >
                  <section className="teacher-review-focus">
                    <div className="teacher-review-focus-title">
                      <span>Review desk</span><span className="teacher-review-symbol"><PencilSimple size={20} /></span>
                    </div>
                    <div className="teacher-review-total">
                      {String(pendingReviews.length).padStart(2, "0")}
                      <span>tasks to review</span>
                    </div>
                    <p>{pendingReviews.length ? "A little feedback goes a long way. Your next review is ready." : "You’re all caught up. New submissions will appear here."}</p>
                    {pendingReviews[0] && (
                      <button
                        className="teacher-review-next"
                        onClick={() => onReview(pendingReviews[0])}
                      >
                        Start reviewing <ArrowUpRight size={17} />
                      </button>
                    )}
                    {!pendingReviews.length && (
                      <span className="teacher-caught-up"><CheckCircle size={18} weight="fill" /> No outstanding reviews</span>
                    )}
                  </section>
                  <section className="teacher-review-queue">
                    <div className="teacher-aside-heading">
                      <h2>Pending reviews</h2>
                      <Clock size={16} />
                    </div>
                    {pendingReviews.slice(0, 3).map((submission) => {
                      const lab = state.labs.find(
                        (item) => item.id === submission.labId,
                      )!;
                      const task = lab.tasks.find(
                        (item) => item.id === submission.taskId,
                      )!;
                      const student = students.find(
                        (item) => item.id === submission.studentId,
                      )!;
                      return (
                        <button
                          key={submission.id}
                          onClick={() => onReview(submission)}
                          aria-label={`Review roll ${student.rollNumber}, ${task.title}`}
                        >
                          <span className="teacher-queue-roll">
                            {student.rollNumber}
                          </span>
                          <span>
                            <strong>{task.title}</strong>
                            <small>
                              Roll {student.rollNumber} · Lab{" "}
                              {String(state.labs.indexOf(lab) + 1).padStart(
                                2,
                                "0",
                              )}
                            </small>
                          </span>
                          <CaretRight size={16} />
                        </button>
                      );
                    })}
                    {!pendingReviews.length && (
                      <div className="teacher-queue-empty"><span><CheckCircle size={24} weight="light" /></span><strong>A clear review queue</strong><p>Submitted tasks will be listed here when they’re ready for your feedback.</p></div>
                    )}
                  </section>
                  <section className="teacher-class-note">
                    <button
                      className="teacher-class-link"
                      onClick={() => navigate("students")}
                      aria-label="Open class register"
                    >
                      <UsersThree size={24} />
                      <span>
                        <strong>Class register</strong>
                        <small>{students.length} students · Semester 07</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}

          {page === "labs" && (
            <div className="minimal-lab-list">
              {state.labs.map((lab, index) => (
                <section key={lab.id} className="minimal-lab">
                  <div className="minimal-lab-row">
                    <button
                      className="minimal-lab-title"
                      aria-expanded={expanded === lab.id}
                      aria-controls={`lab-details-${lab.id}`}
                      onClick={() =>
                        setExpanded(expanded === lab.id ? "" : lab.id)
                      }
                    >
                      <strong>Lab {String(index + 1).padStart(2, "0")}</strong>
                      <span>{lab.title}<small>{lab.tasks.length} tasks · {lab.totalMarks} marks · {dueDate(lab.dueDate)}</small></span>
                      <CaretRight className="minimal-lab-caret" size={18} />
                    </button>
                    <span className={`teacher-lab-state${lab.published ? " published" : ""}`}>
                      <i />{lab.published ? "Published" : "Draft"}
                    </span>
                    <button
                      className="icon-btn"
                      aria-label={`Edit Lab ${index + 1}`}
                      title="Edit lab"
                      onClick={() => onEdit(lab)}
                    >
                      <PencilSimple size={18} weight="light" />
                    </button>
                  </div>
                  {expanded === lab.id && (
                    <div className="minimal-lab-details" id={`lab-details-${lab.id}`}>
                      <p>{lab.description}</p>
                      {lab.tasks.map((task, i) => (
                        <details key={task.id}>
                          <summary>
                            <span>
                              {i + 1}. {task.title}
                            </span>
                            <small>{task.maxMarks} marks</small>
                          </summary>
                          <p>{task.description}</p>
                          <ul>
                            {task.requirements.map((rule) => (
                              <li key={rule.id}>{rule.label}</li>
                            ))}
                          </ul>
                        </details>
                      ))}
                      <div className="minimal-lab-actions">
                        <button
                          className="teacher-text-button"
                          onClick={() => openLabStudents(lab)}
                        >
                          View students
                        </button>
                        <a
                          className="teacher-text-button"
                          href={`/api/reports.xlsx?labId=${encodeURIComponent(lab.id)}`}
                          download
                        >
                          <DownloadSimple size={15} weight="light" /> Excel marks sheet
                        </a>
                        <a
                          className="teacher-text-button"
                          href={`/api/reports.csv?labId=${encodeURIComponent(lab.id)}`}
                          download
                        >
                          <DownloadSimple size={15} weight="light" /> CSV marks
                          sheet
                        </a>
                        <a
                          className="teacher-text-button"
                          href={`/api/reports/print?select=1&labId=${encodeURIComponent(lab.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Printer size={15} weight="light" /> Print marks sheet
                        </a>
                        {lab.instructionFile && (
                          <button
                            className="teacher-text-button"
                            onClick={() => {
                              const bytes = Uint8Array.from(
                                atob(lab.instructionFile!.content),
                                (char) => char.charCodeAt(0),
                              );
                              const url = URL.createObjectURL(
                                new Blob([bytes], {
                                  type: lab.instructionFile!.contentType,
                                }),
                              );
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = lab.instructionFile!.name;
                              link.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }}
                          >
                            Instructions
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
          {page === "students" && (
            <>
              <div className="teacher-roster-toolbar">
                <div className="teacher-roster-filters">
                  <select
                    aria-label="Select lab"
                    value={currentLab?.id || ""}
                    onChange={(e) => {
                      setSelectedLab(e.target.value);
                      setFilter("all");
                    }}
                  >
                    {state.labs.map((lab, index) => (
                      <option key={lab.id} value={lab.id}>
                        Lab {String(index + 1).padStart(2, "0")} · {lab.title}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Submission status"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All students</option>
                    <option value="submitted">Submitted</option>
                    <option value="missing">Missing</option>
                  </select>
                </div>
                <div className="teacher-search">
                  <MagnifyingGlass size={18} weight="light" />
                  <input
                    aria-label="Find roll number or name"
                    placeholder="Roll no. or name"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              {currentLab && (
                <div className="teacher-sheet-links">
                  <span>
                    Lab {String(currentIndex).padStart(2, "0")} · {rows.length}{" "}
                    {rows.length === 1 ? "student" : "students"}
                  </span>
                  <div>
                    <a
                      href={`/api/reports.xlsx?labId=${encodeURIComponent(currentLab.id)}`}
                      download
                    >
                      <DownloadSimple size={16} weight="light" /> Excel
                    </a>
                    <a
                      href={`/api/reports.csv?labId=${encodeURIComponent(currentLab.id)}`}
                      download
                    >
                      <DownloadSimple size={16} weight="light" /> CSV
                    </a>
                    <a
                      href={`/api/reports/print?select=1&labId=${encodeURIComponent(currentLab.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Printer size={16} weight="light" /> Print marks sheet
                    </a>
                  </div>
                </div>
              )}
              <div className="teacher-table-scroll">
                <table className="teacher-roster-table">
                  <thead>
                    <tr>
                      <th>Roll no.</th>
                      <th>Name</th>
                      {currentLab?.tasks.map((task, index) => (
                        <th key={task.id} title={task.title}>
                          Task {index + 1}
                        </th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((student) => {
                      const subs = state.submissions.filter(
                        (sub) =>
                          sub.studentId === student.id &&
                          sub.labId === currentLab?.id,
                      );
                      const complete = Boolean(
                        currentLab?.tasks.length &&
                          currentLab.tasks.every((task) =>
                            subs.some(
                              (sub) => sub.taskId === task.id && sub.grade,
                            ),
                          ),
                      );
                      const total = subs.reduce(
                        (sum, sub) => sum + (sub.grade?.marks || 0),
                        0,
                      );
                      return (
                        <tr key={student.id}>
                          <td>
                            <button
                              className="roll-number"
                              aria-label={`Open roll number ${student.rollNumber}`}
                              onClick={() => onStudent(student)}
                            >
                              {student.rollNumber}
                            </button>
                          </td>
                          <td>{student.name || "Name not provided"}</td>
                          {currentLab?.tasks.map((task) => {
                            const sub = subs.find(
                              (sub) => sub.taskId === task.id,
                            );
                            return (
                              <td key={task.id}>
                                {sub ? (
                                  <button
                                    className={
                                      sub.grade ? "task-grade" : "task-awaiting"
                                    }
                                    aria-label={`Review roll ${student.rollNumber}, ${task.title}`}
                                    onClick={() => onReview(sub)}
                                  >
                                    {sub.grade
                                      ? `${sub.grade.marks}/${task.maxMarks}`
                                      : "Review"}
                                  </button>
                                ) : (
                                  <span
                                    className="task-missing"
                                    title="Missing submission"
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td>
                            {complete ? (
                              <strong>
                                {Number(total.toFixed(2))}
                                <small>/{currentLab?.totalMarks}</small>
                              </strong>
                            ) : (
                              <span className="total-pending">
                                {subs.length ? "Pending" : "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="teacher-empty">
                    No students match this roll number or filter.
                  </p>
                )}
              </div>
              <button
                className="teacher-back"
                onClick={() => navigate("dashboard")}
              >
                <ArrowLeft size={15} weight="light" /> Dashboard
              </button>
            </>
          )}
          {!state.labs.length && page === "labs" && (
            <div className="teacher-empty">
              <p>No labs yet.</p>
              <button className="teacher-text-button" onClick={() => onEdit()}>
                Add your first lab
              </button>
            </div>
          )}
          <footer className="teacher-footer"><span>LabTrack <i /> A little structure. Better learning.</span><span>Web Engineering · Fall 2026</span></footer>
        </main>
      </div>
    </div>
  );
}
