import type { IncomingMessage } from "node:http";
import { publicDemoLogins } from "../shared/demo.js";
import { hashPassword } from "./auth.js";
import { emptyDatabase, type Database } from "./store.js";

export function publicDemoRequest(req: Pick<IncomingMessage, "url" | "headers">) {
  const pathname = new URL(req.url || "/", "https://labtrack.invalid").pathname;
  // Login chooses a workspace afresh; an old demo cookie must not trap a real user.
  if (pathname === "/api/auth/login") return req.headers["x-labtrack-workspace"] === "demo";
  return /(?:^|;\s*)labtrack_session=demo_[a-f0-9]{64}(?:;|$)/.test(req.headers.cookie || "");
}

export function assertPublicDemoDatabase(data: Database) {
  const expected = [
    { id: "public-demo-teacher", role: "teacher", email: publicDemoLogins.teacher.email },
    { id: "public-demo-student", role: "student", email: publicDemoLogins.student.email },
  ];
  if (!data.users.length && Object.values(data).every(rows => !rows.length)) return;
  if (data.users.length !== expected.length || expected.some(account => !data.users.some(user =>
    user.id === account.id && user.role === account.role && user.email === account.email && !user.mustChangePassword)))
    throw new Error("Public demo refuses a database containing classroom accounts.");
}

export async function publicDemoDatabase(): Promise<Database> {
  const data = emptyDatabase();
  const [teacherHash, studentHash] = await Promise.all([
    hashPassword(publicDemoLogins.teacher.password), hashPassword(publicDemoLogins.student.password),
  ]);
  data.users = [
    { id: "public-demo-teacher", name: "Demo Teacher", role: "teacher", email: publicDemoLogins.teacher.email, passwordHash: teacherHash },
    { id: "public-demo-student", name: "Demo Student", role: "student", rollNumber: "1", email: publicDemoLogins.student.email, passwordHash: studentHash },
  ];
  data.labs = [{
    id: "public-demo-lab", revision: 1, title: "Build your first web page",
    description: "A sample lab for exploring submissions, live previews and teacher feedback. Use sample files only.",
    dueDate: "", totalMarks: 20, published: true,
    tasks: [
      { id: "public-demo-html", title: "Create an HTML page", description: "Upload an HTML file with a page title, a heading and a paragraph.", maxMarks: 10,
        requirements: [{ id: "demo-heading", label: "A main heading", type: "tag", value: "h1" }, { id: "demo-paragraph", label: "A paragraph", type: "tag", value: "p" }] },
      { id: "public-demo-css", title: "Style your page", description: "Add CSS to your project, then upload the HTML and CSS files together.", maxMarks: 10,
        requirements: [{ id: "demo-stylesheet", label: "CSS file included", type: "file", value: "style.css" }] },
    ],
  }];
  data.submissions = [{
    id: "public-demo-sample", studentId: "public-demo-student", labId: "public-demo-lab", taskId: "public-demo-html",
    files: [{ path: "index.html", content: "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>My first lab</title><style>body{font:18px system-ui;background:#f4f8f5;color:#183c29;margin:0;padding:48px}main{max-width:680px;margin:auto;background:white;padding:40px;border-radius:20px}h1{font-size:42px;line-height:1.1}</style></head><body><main><p>LABTRACK / SAMPLE PROJECT</p><h1>A better way to submit labs.</h1><p>Upload your project, preview your work and get feedback from your teacher in one place.</p></main></body></html>" }],
    link: null, submittedAt: new Date().toISOString(), status: "submitted", revision: 1, late: false,
  }];
  return data;
}
