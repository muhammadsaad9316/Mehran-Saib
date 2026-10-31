import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import type { AppState, Lab, Submission, User } from "../shared/types";
import { api } from "./api";
import type { ReviewQueueMode } from "./review-queue";
import BrandLogo from "./BrandLogo";
import QuordixLogo from "./QuordixLogo";
import { allowNavigation } from "./navigation-guard";
import PasswordSetup from "./PasswordSetup";
import { isPublicDemoEmail } from "../shared/demo";
import { deadlineRemaining, useDeadlineClock } from "./student-deadline";
import { mergeProjectFiles, uploadSize } from "./upload-selection";
const TeacherPortal = lazy(() => import("./TeacherPortal"));
const StudentPortal = lazy(() => import("./StudentPortal"));
const Review = lazy(() => import("./Review"));
const LabEditor = lazy(() => import("./LabEditor"));
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
  const [signingOut, setSigningOut] = useState(false);
  const initialized = useRef(false);
  const labOperation = useRef("");
  const sessionGeneration = useRef(0);
  function openReview(submission: Submission) {
    setReviewQueueMode(state?.submissions.some((item) =>
      item.labId === submission.labId && item.taskId === submission.taskId && !item.grade,
    ) ? "pending" : "all");
    setReview(submission);
  }
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = sessionGeneration.current;
    const next = await api<AppState>("/state", { signal });
    if (!signal?.aborted && generation === sessionGeneration.current) setState(next);
    return next;
  }, []);
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
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = 'button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],summary,iframe,[tabindex]:not([tabindex="-1"])';
    const controls = () => Array.from(dialog()?.querySelectorAll<HTMLElement>(focusable) || [])
      .filter((el) => el.getClientRects().length && !el.closest("[hidden],[inert]"));
    if (!managedByEditor) {
      const initialInput = dialog()?.querySelector<HTMLInputElement>("input[data-initial-focus]");
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
    if (signingOut || !allowNavigation()) return;
    setSigningOut(true);
    setStudentDetail(null);

    setReview(null);
    setEditor(null);
    setUpload(null);
    setStudentForm(false);

    try {
      await api("/auth/logout", { method: "POST" });
      // Older refreshes must not restore classroom data after sign-out succeeds.
      sessionGeneration.current++;
      setState(current => ({
        user: null, demo: current?.demo ?? false,
        students: [], labs: [], submissions: [], activity: [],
      }));
      setError("");
      setToast("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSigningOut(false);
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
  if (signingOut) return (
    <main className="loading-screen" aria-label="Signing out" aria-busy="true">
      <div className="loading-brand"><BrandLogo /></div>
      <div className="loading-content" role="status">
        <span className="signout-spinner" aria-hidden="true" />
        <h1>Signing out…</h1>
        <p>Closing your session. Please wait.</p>
      </div>
    </main>
  );
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
      {state.publicDemo && <div className="public-demo-notice" role="note">Public demo · Shared sample workspace. Use sample files only. Accounts and passwords are fixed.</div>}
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
      <Suspense fallback={<div className="modal-overlay"><section className="modal" role="dialog" aria-modal="true" aria-label="Opening workspace dialog"><p role="status">Opening your workspace…</p><button className="btn" onClick={() => { setReview(null); setEditor(null); }}>Cancel</button></section></div>}>
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
      </Suspense>
      {upload && (
        <Upload
          lab={upload}
          initialTaskId={uploadTaskId}
          state={state}
          onClose={() => setUpload(null)}
          onRefresh={refresh}
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
              {!state.publicDemo && <StudentNameForm
                key={studentDetail.id}
                student={studentDetail}
                onSaved={async (updated) => {
                  setStudentDetail((current) => current?.id === updated.id ? updated : current);
                  setState((current) => current && ({ ...current, students: current.students.map((student) => student.id === updated.id ? updated : student) }));
                  setToast("Student name saved.");
                  try { await refresh(); }
                  catch (cause) { setError(`The name was saved, but the workspace could not refresh. ${(cause as Error).message}`); }
                }}
              />}
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(role?: string) {
    setBusy(true);
    setError("");
    try {
      await api(role ? "/auth/demo" : "/auth/login", {
        method: "POST",
        headers: role ? undefined : { "X-Labtrack-Workspace": isPublicDemoEmail(email) ? "demo" : "classroom" },
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
        <div className="field">
          <label htmlFor="sign-in-password">Password</label>
          <div className="password-input">
            <input
              id="sign-in-password"
              type={passwordVisible ? "text" : "password"}
              required
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="password-toggle" type="button" disabled={busy}
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              aria-controls="sign-in-password" aria-pressed={passwordVisible}
              onClick={() => setPasswordVisible(visible => !visible)}>
              {passwordVisible ? <EyeSlash size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
              <span>{passwordVisible ? "Hide" : "Show"}</span>
            </button>
          </div>
        </div>
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
      <a
        className="login-whatsapp-help"
        href={`https://wa.me/491630278010?text=${encodeURIComponent("Hi, I’m having trouble logging in to LabTrack. Can you help?")}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Need help logging in? Message us on WhatsApp (opens in a new tab)"
      >
        <img src="/whatsapp-logo-white.svg" width={28} height={28} alt="" aria-hidden="true" />
        <span>Need help logging in?<small>Message us on WhatsApp.</small></span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
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
  onRefresh,
}: {
  lab: Lab;
  initialTaskId: string;
  state: AppState;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const [taskId, setTaskId] = useState(initialTaskId || lab.tasks[0]?.id || "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<"close" | "replace" | { taskId: string } | null>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const leaveOrigin = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const now = useDeadlineClock();
  const existing = state.submissions.find(
    (s) =>
      s.labId === lab.id &&
      s.taskId === taskId &&
      s.studentId === state.user?.id,
  );
  const locked = Boolean(existing?.resubmissionLocked || existing?.grade);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const overLimit = files.length > 60 || totalBytes > 4 * 1024 * 1024;
  const limitError = overLimit ? "Choose at most 60 files with a combined size no larger than 4 MB." : "";
  function leave(target: "close" | "replace" | { taskId: string }) {
    if (target === "close") { onClose(); return; }
    setFiles([]);
    setError("");
    setSelectionNotice("");
    setShowAllFiles(false);
    setLeaveTarget(null);
    if (target === "replace") requestAnimationFrame(() => fileInput.current?.focus());
    else setTaskId(target.taskId);
  }
  function requestLeave(target: "close" | "replace" | { taskId: string } = "close") {
    if (busy) return;
    if (!files.length) { leave(target); return; }
    leaveOrigin.current = document.activeElement as HTMLElement | null;
    setLeaveTarget(target);
  }
  function keepEditing() {
    setLeaveTarget(null);
    requestAnimationFrame(() => leaveOrigin.current?.focus());
  }
  useEffect(() => { if (leaveTarget) stayButton.current?.focus(); }, [leaveTarget]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy) return;
      if (leaveTarget) keepEditing(); else requestLeave();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (files.length || busy) { event.preventDefault(); event.returnValue = ""; }
    };
    const navigate = (event: Event) => {
      if (busy || (files.length && !window.confirm("Discard selected project files and leave?"))) event.preventDefault();
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("labtrack:before-navigate", navigate);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("labtrack:before-navigate", navigate);
    };
  }, [files.length, busy, leaveTarget, onClose]);
  function selectFiles(selected: File[]) {
    if (!selected.length || busy || leaveTarget) return;
    if (selected.some(file => /\.zip$/i.test(file.name))) {
      setError(`Extract compressed folders first, then choose your project files or folder.${files.length ? " Your current selection was kept." : ""}`);
      return;
    }
    setError("");
    const merged = mergeProjectFiles(files, selected);
    setFiles(merged.files);
    setSelectionNotice(merged.replaced ? `${merged.replaced} existing ${merged.replaced === 1 ? "file was" : "files were"} replaced by the newly selected version.` : "Files added to your selection.");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || locked || leaveTarget || !files.length) return;
    setBusy(true);
    setError("");
    if (overLimit) {
      setBusy(false);
      return;
    }
    const data = new FormData();
    data.append("labId", lab.id);
    data.append("taskId", taskId);
    data.append("expectedRevision", String(existing?.revision || 0));
    for (const file of files)
      data.append("files", file, file.webkitRelativePath || file.name);
    try {
      await api("/submissions", { method: "POST", body: data });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 409) {
        try { await onRefresh(); } catch { /* Keep the upload error visible if refresh also fails. */ }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          requestLeave();
        }
      }}
    >
      <form
        className="modal upload-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Submit lab work"
        aria-busy={busy}
        onSubmit={submit}
      >
        <div className="modal-head">
          <div>
            <h2>Submit work</h2>
            <p>
              {lab.title} · {deadlineRemaining(lab.dueDate, now)}
            </p>
          </div>
          <button
            className="icon-btn"
            type="button"
            onClick={() => requestLeave()}
            disabled={busy || !!leaveTarget}
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
              disabled={busy || !!leaveTarget}
              onChange={(e) => requestLeave({ taskId: e.target.value })}
            >
              {lab.tasks.map((t) => (
                <option key={t.id} value={t.id} disabled={state.submissions.some(item => item.labId === lab.id && item.taskId === t.id && item.studentId === state.user?.id && (item.resubmissionLocked || item.grade))}>
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
          {locked && <p className="warning-note" role="status">This task has been graded and is locked. You can still view your submitted work and published result.</p>}
          {existing && !locked && (
            <p className="warning-note">
              <ArrowCounterClockwise size={17} /> Resubmitting replaces your
              current task files. You can resubmit only until your teacher grades this task.
            </p>
          )}
          {!locked && <div
            className={`upload-zone ${drag ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) selectFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <UploadSimple size={32} />
            <strong><span className="upload-desktop-copy">Drop your project here</span><span className="upload-mobile-copy">Add your project files</span></strong>
            <p>Choose individual files or your whole project folder. Up to 60 files · 4 MB total.</p>
            <p>Each choice adds to your selection. Selecting the same file path again replaces that file.</p>
            <div className="upload-buttons">
              <label className="btn btn-small">
                <span><strong>Choose files</strong><small id="choose-files-help">Select one or more project files.</small></span>
                <input
                  type="file"
                  ref={fileInput}
                  multiple
                  accept=".html,.htm,.css,.js,.json,.txt,.png,.jpg,.jpeg,.gif,.webp,.ico"
                  aria-label="Choose project files"
                  aria-describedby="choose-files-help"
                  disabled={busy || !!leaveTarget}
                  onChange={(e) => { selectFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
                />
              </label>
              <label className="btn btn-small">
                <span><strong>Choose folder</strong><small id="choose-folder-help">Include a project folder and its subfolders.</small></span>
                <input
                  type="file"
                  multiple
                  {...({ webkitdirectory: "" } as Record<string, string>)}
                  aria-label="Choose project folder"
                  aria-describedby="choose-folder-help"
                  disabled={busy || !!leaveTarget}
                  onChange={(e) => { selectFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
                />
              </label>
            </div>
          </div>}
          {files.length > 0 && (
            <section className="upload-selection" aria-label="Selected project files">
              <div className="upload-selection-heading"><strong>{files.length} of 60 files · {uploadSize(totalBytes)} / 4 MB</strong><button className="teacher-text-button" type="button" disabled={busy || !!leaveTarget} onClick={() => requestLeave("replace")}>Replace selection</button></div>
              <div className="selected-files" id="selected-project-files">
              {(showAllFiles ? files : files.slice(0, 10)).map((f, i) => (
                <div key={i}>
                  <FileCode size={17} />
                  <span>{f.webkitRelativePath || f.name}</span>
                  <small>{uploadSize(f.size)}</small>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    disabled={busy || !!leaveTarget}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              </div>
              {files.length > 10 && <button className="teacher-text-button" type="button" aria-expanded={showAllFiles} aria-controls="selected-project-files" onClick={() => setShowAllFiles(value => !value)}>{showAllFiles ? "Show first 10 files" : `Show all ${files.length} files`}</button>}
            </section>
          )}
          {selectionNotice && <p className="upload-selection-notice" role="status">{selectionNotice}</p>}
          {(error || limitError) && (
            <p className="error" role="alert">
              {error || limitError}
            </p>
          )}
        </div>
        {leaveTarget ? <div className="modal-foot upload-discard" role="alert">
          <p>Your selected files have not been submitted. Discard this selection?</p>
          <div><button className="btn" type="button" ref={stayButton} onClick={keepEditing}>Keep editing</button><button className="btn" type="button" onClick={() => leave(leaveTarget)}>Discard & {leaveTarget === "close" ? "close" : leaveTarget === "replace" ? "choose again" : "switch task"}</button></div>
        </div> : <div className="modal-foot">
          <button className="btn" type="button" disabled={busy} onClick={() => requestLeave()}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || locked || overLimit || !files.length || !taskId}
          >
            <UploadSimple size={17} />
            {busy ? "Submitting…" : existing ? "Resubmit task" : "Submit task"}
          </button>
        </div>}
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
  const [passwordVisible, setPasswordVisible] = useState(false);
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
          <div className="field">
            <label htmlFor="initial-student-password">Initial password</label>
            <div className="password-input">
              <input
                id="initial-student-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                minLength={12}
                required
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button className="password-toggle" type="button" disabled={busy}
                aria-label={passwordVisible ? "Hide initial password" : "Show initial password"}
                aria-controls="initial-student-password" aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible(visible => !visible)}>
                {passwordVisible ? <EyeSlash size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                <span>{passwordVisible ? "Hide" : "Show"}</span>
              </button>
            </div>
          </div>
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
