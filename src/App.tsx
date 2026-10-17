import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  CheckCircle,
  X,
  UploadSimple,
  FileCode,
  ArrowCounterClockwise,
  GraduationCap,
  ChalkboardTeacher,
  LockKey,
} from "@phosphor-icons/react";
import type { AppState, Lab, Submission, User } from "../shared/types";
import { api } from "./api";
import Review from "./Review";
import type { ReviewQueueMode } from "./review-queue";
import LabEditor from "./LabEditor";
import BrandLogo from "./BrandLogo";
import QuordixLogo from "./QuordixLogo";
import { allowNavigation } from "./navigation-guard";
import PasswordSetup from "./PasswordSetup";
const TeacherPortal = lazy(() => import("./TeacherPortal"));
const StudentPortal = lazy(() => import("./StudentPortal"));
const date = (
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) =>
  new Date(value).toLocaleDateString("en-GB", {
    ...options,
    timeZone: "Asia/Karachi",
  });
const deadline = (lab: Lab, options?: Intl.DateTimeFormatOptions) =>
  lab.dueDate ? `Due ${date(lab.dueDate, options)}` : "No deadline";
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase().replaceAll(" ", "-")}`}>
      <span />
      {status}
    </span>
  );
}
export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [review, setReview] = useState<Submission | null>(null);
  const [reviewQueueMode, setReviewQueueMode] = useState<ReviewQueueMode>("pending");
  const [editor, setEditor] = useState<Lab | true | null>(null);
  const [upload, setUpload] = useState<Lab | null>(null);
  const [uploadTaskId, setUploadTaskId] = useState("");
  const [studentForm, setStudentForm] = useState(false);
  const [studentDetail, setStudentDetail] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const initialized = useRef(false);
  const labOperation = useRef("");
  function openReview(submission: Submission) {
    setReviewQueueMode(state?.submissions.some((item) =>
      item.labId === submission.labId && item.taskId === submission.taskId && !item.grade,
    ) ? "pending" : "all");
    setReview(submission);
  }
  async function refresh() {
    const next = await api<AppState>("/state");
    setState(next);
    return next;
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        let next = await refresh();
        if (!next.user && next.demo) {
          await api("/auth/demo", {
            method: "POST",
            body: JSON.stringify({ role: "teacher" }),
          });
          next = await refresh();
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const dialogKey = review
    ? review.id +
      (state?.submissions.find((s) => s.id === review.id)?.revision ||
        review.revision)
    : upload?.id || studentDetail?.id || (studentForm ? "student-form" : editor ? "lab-editor" : "");
  const dialogOpen = Boolean(dialogKey);
  useEffect(() => {
    if (!dialogOpen) return;
    const managedByEditor = Boolean(editor);
    const previous = managedByEditor ? null : document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (!managedByEditor) document.body.style.overflow = "hidden";
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(".sidebar,.main-shell,.teacher-shell"),
    ).map((el) => ({ el, inert: el.inert }));
    background.forEach(({ el }) => {
      el.inert = true;
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = 'button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],summary,iframe,[tabindex]:not([tabindex="-1"])';
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusable) || [])
      .filter((el) => el.getClientRects().length && !el.closest("[hidden],[inert]"));
    if (!managedByEditor) {
      const initialInput = dialog?.querySelector<HTMLInputElement>("input[data-initial-focus]");
      (initialInput ?? controls()[0])?.focus({ preventScroll: true });
      initialInput?.select();
    }
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || managedByEditor) return;
      const items = controls();
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (!managedByEditor) document.body.style.overflow = overflow;
      background.forEach(({ el, inert }) => {
        el.inert = inert;
      });
      previous?.focus();
    };
  }, [dialogKey]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "k" &&
        (e.ctrlKey || e.metaKey) &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>(
            ".search input,.teacher-search input",
          )
          ?.focus();
      }
      if (e.key === "Escape") {
        setReview(null);
        setStudentDetail(null);
        setUpload(null);
        setStudentForm(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  async function switchRole() {
    if (!allowNavigation()) return;
    setStudentDetail(null);
    setReview(null);
    setEditor(null);
    setUpload(null);
    setStudentForm(false);

    try {
      await api("/auth/demo", {
        method: "POST",
        body: JSON.stringify({
          role: state?.user?.role === "teacher" ? "student" : "teacher",
        }),
      });
      await refresh();

      setToast("Switched demo portal.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function logout() {
    if (!allowNavigation()) return;
    setStudentDetail(null);

    setReview(null);
    setEditor(null);
    setUpload(null);
    setStudentForm(false);

    try {
      await api("/auth/logout", { method: "POST" });
      await refresh();
      setError("");
      setToast("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveLab(lab: Lab) {
    await api(lab.id ? `/labs/${lab.id}` : "/labs", {
      method: lab.id ? "PATCH" : "POST",
      body: JSON.stringify(lab),
      headers: lab.id ? undefined : { "Idempotency-Key": labOperation.current ||= crypto.randomUUID() },
    });
    setEditor(null);
    setToast(lab.id ? "Lab updated." : "Lab created.");
    try { await refresh(); }
    catch (cause) { setError(`The lab was saved, but the workspace could not refresh. ${(cause as Error).message}`); }
  }
  if (!state)
    return (
      <main className="loading-screen">
        <div className="loading-brand">
          <BrandLogo />
        </div>
        <div className="loading-content" role={error ? "alert" : "status"}>
          <div className="eyebrow">WEB ENGINEERING WORKSPACE</div>
          <h1>{error ? "Let’s try that again." : "A little focus. A lot of possibility."}</h1>
          <p>{error || "Opening your labs, submissions and feedback…"}</p>
          {!error && <span className="loading-progress" aria-hidden="true"><span /></span>}
        </div>
        {error && (
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Try again <ArrowRight size={17} />
          </button>
        )}
        <span className="loading-caption">A focused space for your best work.</span>
      </main>
    );
  if (!state.user)
    return (
      <Login
        demo={state.demo}
        onLogin={async () => {
          await refresh();
        }}
      />
    );
  if (state.user.mustChangePassword) return <PasswordSetup user={state.user} error={error} onLogout={logout} onSaved={async user => {
    setState(current => current ? { ...current, user } : current);
    setToast("Password saved. Use your new password next time.");
    setError("");
    try { await refresh(); }
    catch (cause) { setError(`Your password was saved, but the workspace could not refresh. ${(cause as Error).message}`); }
  }} />;
  const teacher = state.user.role === "teacher";
  return (
    <div
      className={`app-shell teacher-minimal${teacher ? "" : " student-portal"}`}
    >
      <Suspense fallback={<main className="loading-screen" role="status"><BrandLogo /><p>Opening your workspace…</p></main>}>
      {teacher ? (
        <TeacherPortal
          state={state}
          onReview={openReview}
          onEdit={(lab) => { labOperation.current = crypto.randomUUID(); setEditor(lab || true); }}
          onStudent={setStudentDetail}
          onAddStudent={() => setStudentForm(true)}
          onSwitchRole={switchRole}
          onLogout={logout}
          onRefresh={refresh}
          error={error}
          onDismissError={() => setError("")}
        />
      ) : (
        <StudentPortal
          state={state}
          onSubmit={(lab, taskId) => {
            setUploadTaskId(taskId);
            setUpload(lab);
          }}
          onReview={openReview}
          onSwitchRole={switchRole}
          onLogout={logout}
          onRefresh={refresh}
          error={error}
          onDismissError={() => setError("")}
        />
      )}
      </Suspense>
      {review && (
        <Review
          key={
            review.id +
            (state.submissions.find((s) => s.id === review.id)?.revision ||
              review.revision)
          }
          submission={
            state.submissions.find((s) => s.id === review.id) || review
          }
          state={state}
          queueMode={reviewQueueMode}
          onQueueModeChange={setReviewQueueMode}
          onClose={() => setReview(null)}
          onNavigate={(next) => setReview(next)}
          onSaved={async (message) => {
            await refresh();
            if (message) setToast(message);
          }}
        />
      )}
      {editor && (
        <LabEditor
          lab={editor === true ? undefined : editor}
          onClose={() => setEditor(null)}
          onSave={saveLab}
        />
      )}
      {upload && (
        <Upload
          lab={upload}
          initialTaskId={uploadTaskId}
          state={state}
          onClose={() => setUpload(null)}
          onSaved={async () => {
            setUpload(null);
            setToast("Your work has been submitted.");
            try { await refresh(); }
            catch (cause) { setError(`Your work was submitted, but the workspace could not refresh. ${(cause as Error).message}`); }
          }}
        />
      )}
      {studentForm && (
        <StudentForm
          onClose={() => setStudentForm(false)}
          onSaved={async () => {
            setStudentForm(false);
            setToast("Student added.");
            try { await refresh(); }
            catch (cause) { setError(`The student was added, but the workspace could not refresh. ${(cause as Error).message}`); }
          }}
        />
      )}
      {studentDetail && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setStudentDetail(null);
          }}
        >
          <section
            className="modal student-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Student profile"
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">STUDENT PROFILE</div>
                <h2>
                  Roll no. {studentDetail.rollNumber} ·{" "}
                  {studentDetail.name || "Name not provided"}
                </h2>
                <p>
                  {studentDetail.rollNumber} · {studentDetail.email}
                </p>
              </div>
              <button
                className="icon-btn"
                aria-label="Close student profile"
                onClick={() => setStudentDetail(null)}
              >
                <X size={22} />
              </button>
            </div>
            <div className="modal-body">
              <StudentNameForm
                key={studentDetail.id}
                student={studentDetail}
                onSaved={async (updated) => {
                  setStudentDetail((current) => current?.id === updated.id ? updated : current);
                  setState((current) => current && ({ ...current, students: current.students.map((student) => student.id === updated.id ? updated : student) }));
                  setToast("Student name saved.");
                  try { await refresh(); }
                  catch (cause) { setError(`The name was saved, but the workspace could not refresh. ${(cause as Error).message}`); }
                }}
              />
              {state.labs.map((lab) => (
                <section className="student-history" key={lab.id}>
                  <div>
                    <h3>{lab.title}</h3>
                    <p>
                      {lab.totalMarks} maximum marks · {deadline(lab)}
                    </p>
                  </div>
                  {lab.tasks.map((task) => {
                    const sub = state.submissions.find(
                      (s) =>
                        s.studentId === studentDetail.id &&
                        s.labId === lab.id &&
                        s.taskId === task.id,
                    );
                    return (
                      <div className="history-row" key={task.id}>
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            {sub
                              ? `Submitted ${date(sub.submittedAt)} · Revision ${sub.revision}`
                              : "No work submitted"}
                          </small>
                        </div>
                        <Badge
                          status={
                            sub
                              ? sub.grade
                                ? "Graded"
                                : "Submitted"
                              : "Missing"
                          }
                        />
                        <span>
                          {sub?.grade
                            ? `${sub.grade.marks}/${task.maxMarks}`
                            : "—"}
                        </span>
                        <button
                          className="btn btn-small"
                          disabled={!sub}
                          onClick={() => {
                            setStudentDetail(null);
                            openReview(sub!);
                          }}
                        >
                          Review <ArrowUpRight size={14} />
                        </button>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={20} weight="fill" />
          {toast}
        </div>
      )}
    </div>
  );
}

function StudentNameForm({ student, onSaved }: { student: User; onSaved: (student: User) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="student-name-form" onSubmit={async (event) => {
      event.preventDefault();
      if (busy) return;
      const name = new FormData(event.currentTarget).get("name");
      setBusy(true);
      setError("");
      try {
        const updated = await api<User>(`/students/${student.id}`, {
          method: "PATCH", body: JSON.stringify({ name, previousName: student.name }),
        });
        await onSaved(updated);
      } catch (cause) { setError((cause as Error).message); }
      finally { setBusy(false); }
    }}>
      <label className="field">
        Full name
        <input name="name" required maxLength={100} autoComplete="name" disabled={busy}
          defaultValue={student.name === `Roll ${student.rollNumber}` ? "" : student.name} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save name"}</button>
    </form>
  );
}

function Login({
  demo,
  onLogin,
}: {
  demo: boolean;
  onLogin: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(role?: string) {
    setBusy(true);
    setError("");
    try {
      await api(role ? "/auth/demo" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(role ? { role } : { email, password }),
      });
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-brand" aria-label="LabTrack course workspace">
        <div className="brand">
          <BrandLogo />
        </div>
        <div className="login-brand-content">
          <div className="eyebrow">FALL 2026 · SEMESTER 07</div>
          <h1>
            Web
            <br />
            Engineering.
          </h1>
          <p>Make something worth submitting. A focused space for your lab work, feedback and progress.</p>
          <div className="login-specimen" aria-hidden="true">
            <div className="login-specimen-header"><span>THE LAB WORKSPACE</span><span>01 / BUILD</span></div>
            <div className="login-code-line"><span>01</span><code>&lt;<em>html</em> lang="en"&gt;</code></div>
            <div className="login-code-line"><span>02</span><code>&nbsp;&nbsp;&lt;<em>body</em>&gt;</code></div>
            <div className="login-code-line"><span>03</span><code>&nbsp;&nbsp;&nbsp;&nbsp;Your ideas start here<span className="login-code-cursor">_</span></code></div>
            <div className="login-code-line"><span>04</span><code>&nbsp;&nbsp;&lt;/<em>body</em>&gt;</code></div>
            <div className="login-code-line"><span>05</span><code>&lt;/<em>html</em>&gt;</code></div>
          </div>
        </div>
        <div className="login-brand-footer"><span>Govt. Degree College Lundkhwar<br />Mardan, Pakistan</span><span>LEARN. BUILD. REFINE.</span></div>
      </section>
      <div className="login-access">
      <form
        className="login-form"
        aria-label="Sign in to LabTrack"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          login();
        }}
      >
        <div className="eyebrow">YOUR WORKSPACE, READY</div>
        <h2>Welcome back.</h2>
        <p>Sign in to pick up where you left off.</p>
        <label className="field">
          Email or student roll number
          <input
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Teacher email or student roll no."
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn-primary full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
          <span className="login-submit-icon">
            <ArrowRight size={17} weight="light" />
          </span>
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {demo && (
          <div className="demo-login">
            <span>Take a look around</span>
            <p>Explore the workspace with illustrative class data.</p>
            <button
              className="btn full"
              type="button"
              disabled={busy}
              onClick={() => login("teacher")}
            >
              <ChalkboardTeacher size={20} /><span>Teacher workspace<small>Review work and guide your class</small></span><ArrowUpRight size={17} />
            </button>
            <button
              className="btn full"
              type="button"
              disabled={busy}
              onClick={() => login("student")}
            >
              <GraduationCap size={20} /><span>Student workspace<small>Submit projects and follow your progress</small></span><ArrowUpRight size={17} />
            </button>
          </div>
        )}
      </form>
      <div className="login-access-note"><LockKey size={14} aria-hidden="true" /><span>Your class. Your work. One place.</span></div>
      <a
        className="quordix-mobile-credit login-mobile-credit auth-quordix-credit"
        href="https://quordix.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Built by Quordix (opens in a new tab)"
      >
        <span>Built by</span>
        <QuordixLogo />
      </a>
      </div>
    </main>
  );
}

function Upload({
  lab,
  initialTaskId,
  state,
  onClose,
  onSaved,
}: {
  lab: Lab;
  initialTaskId: string;
  state: AppState;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [taskId, setTaskId] = useState(initialTaskId || lab.tasks[0]?.id || "");
  const [files, setFiles] = useState<File[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const existing = state.submissions.find(
    (s) =>
      s.labId === lab.id &&
      s.taskId === taskId &&
      s.studentId === state.user?.id,
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (
      files.length > 60 ||
      files.reduce((total, file) => total + file.size, 0) > 4 * 1024 * 1024
    ) {
      setError(
        "Choose at most 60 files with a combined size no larger than 4 MB.",
      );
      setBusy(false);
      return;
    }
    const data = new FormData();
    data.append("labId", lab.id);
    data.append("taskId", taskId);
    data.append("expectedRevision", String(existing?.revision || 0));
    if (link) data.append("link", link);
    for (const file of files)
      data.append("files", file, file.webkitRelativePath || file.name);
    try {
      await api("/submissions", { method: "POST", body: data });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
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
      <form
        className="modal upload-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Submit lab work"
        onSubmit={submit}
      >
        <div className="modal-head">
          <div>
            <h2>Submit work</h2>
            <p>
              {lab.title} · {deadline(lab)}
            </p>
          </div>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label="Close submission form"
          >
            <X size={22} />
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            Choose a task
            <select
              value={taskId}
              onChange={(e) => {
                setTaskId(e.target.value);
                setFiles([]);
                setLink("");
                setError("");
              }}
            >
              {lab.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.maxMarks} marks
                </option>
              ))}
            </select>
          </label>
          <details className="optional-link">
            <summary>Task instructions</summary>
            <p className="task-description">
              {lab.tasks.find((t) => t.id === taskId)?.description}
            </p>
          </details>
          {existing && (
            <p className="warning-note">
              <ArrowCounterClockwise size={17} /> Resubmitting replaces your
              current task files and resets its grade.
            </p>
          )}
          <div
            className={`upload-zone ${drag ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              setFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <UploadSimple size={32} />
            <strong><span className="upload-desktop-copy">Drop your project here</span><span className="upload-mobile-copy">Add your project files</span></strong>
            <p>HTML, CSS, JavaScript, images or a ZIP · 4 MB total</p>
            <div className="upload-buttons">
              <label className="btn btn-small">
                Choose files
                <input
                  type="file"
                  multiple
                  accept=".html,.htm,.css,.js,.json,.txt,.zip,.png,.jpg,.jpeg,.gif,.webp,.ico"
                  aria-label="Choose project files"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </label>
              <label className="btn btn-small">
                Choose folder
                <input
                  type="file"
                  multiple
                  {...({ webkitdirectory: "" } as Record<string, string>)}
                  aria-label="Choose project folder"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </label>
            </div>
          </div>
          {files.length > 0 && (
            <div className="selected-files">
              {files.slice(0, 10).map((f, i) => (
                <div key={i}>
                  <FileCode size={17} />
                  <span>{f.webkitRelativePath || f.name}</span>
                  <small>{Math.ceil(f.size / 1024)} KB</small>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {files.length > 10 && (
                <p className="muted">and {files.length - 10} more files</p>
              )}
            </div>
          )}
          <details className="optional-link">
            <summary>Add a project link (optional)</summary>
            <label className="field">
              Project link
              <input
                type="url"
                placeholder="https://github.com/your-name/your-lab"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </label>
            <p className="muted small-text">
              Include source files for a preview. Your teacher can review the
              link separately.
            </p>
          </details>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || (!files.length && !link) || !taskId}
          >
            <UploadSimple size={17} />
            {busy ? "Submitting…" : existing ? "Resubmit task" : "Submit task"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StudentForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="modal-overlay">
      <form
        className="modal student-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add student"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await api("/students", {
              method: "POST",
              body: JSON.stringify(data),
            });
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-head">
          <div>
            <h2>Add a student</h2>
          </div>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label="Close student form"
          >
            <X size={22} />
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            Full name
            <input name="name" required maxLength={80} />
          </label>
          <label className="field">
            Roll number
            <input
              name="rollNumber"
              type="number"
              min="1"
              max="41"
              step="1"
              required
              placeholder="1–41"
            />
          </label>
          <label className="field">
            Email address
            <input name="email" type="email" required />
          </label>
          <label className="field">
            Initial password
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </label>
          <p className="muted">
            Share these sign-in details with the student through your normal
            course channel.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            <Plus size={17} />
            {busy ? "Adding…" : "Add student"}
          </button>
        </div>
      </form>
    </div>
  );
}
