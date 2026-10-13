import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { analyzeTaskSubmissions } from "./analysis.js";
import type { Store, StoredSubmission } from "./store.js";

export async function startAnalysisDemo() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (!existsSync(path.join(root, "dist/index.html"))) throw new Error("Run npm run build before starting the analysis demo.");
  // This demo always uses its own local store, even if hosted credentials exist in the environment.
  const app = await createApp({ dataDir: path.join(root, ".data/analysis-demo"), sessionCookieName: "labtrack_analysis_demo", demo: true, production: false, mongoUri: "", supabaseUrl: "", supabaseKey: "" });
  const store = app.locals.store as Store;
  if (!store.data.submissions.some((submission: StoredSubmission) => submission.id.startsWith("analysis-demo-"))) {
    await store.mutate((data: typeof store.data) => {
      for (const lab of data.labs.slice(0, 2)) {
        lab.dueDate = "";
        const task = lab.tasks[0];
        data.submissions = data.submissions.filter((submission: StoredSubmission) => !(submission.labId === lab.id && submission.taskId === task.id && ["student-01", "student-02", "student-03", "student-04", "student-05", "student-06"].includes(submission.studentId)));
        const filename = lab.id === "lab1" ? "lab1.html" : "article.html";
        const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="author" content="Student"><meta name="description" content="Community project"><title>Community research</title><link rel="stylesheet" href="style.css"></head><body bgcolor="lightgray" text="navy"><h1>Welcome to Web Engineering</h1><main><section class="project"><h2>Emerging Technologies in Computer Science</h2><p title="Project details">Our community connects researchers through weekly discussions about practical systems, experiments, methods, results, resources, and shared goals. Members build applications that improve local access to educational opportunities and contribute original project reports for everyone to explore.</p><p><b>Artificial intelligence</b> helps local teams investigate practical challenges.<br><strong>Cloud computing</strong> provides shared resources for their experiments. <i>Software engineering</i> makes these systems maintainable. <em>Careful testing</em> validates the results. <mark>Documentation</mark> replaces <del>assumptions</del> with <ins>evidence</ins>.</p><hr><pre>Research project\n  Experiment → results → report</pre><ul><li>Weekly project meetings and technical presentations</li><li>Research proposals and independent experiment reports</li><li>Open documentation for community contributors and learners</li></ul><a href="contact.html">Contact the project team</a></section></main><script src="app.js"></script></body></html>';
        const common = 'function calculate(values){let result=0;for(const value of values){if(value>0){result+=value*1.05;}}return Math.round(result*100)/100;}';
        const examples: StoredSubmission[] = [1, 2, 3, 4, 6].map((roll) => ({
          id: `analysis-demo-${lab.id}-${roll}`, studentId: `student-${String(roll).padStart(2, "0")}`, labId: lab.id, taskId: task.id,
          files: [
            { path: filename, content: html },
            { path: "contact.html", content: `<!doctype html><html><body><h1>Contact the research team</h1><a href="${filename}">Back to project</a></body></html>` },
            { path: "style.css", content: 'body{margin:0;font-family:Arial;color:#183c36;background:#f6f4ed;}main{max-width:760px;margin:40px auto;padding:24px;border:1px solid #cad4cf;border-radius:12px;}h1{padding:24px;font-size:30px;font-weight:700;line-height:1.2;}p{line-height:1.7;font-size:16px;margin:16px 0;}ul{padding:24px;background:#fff;border-radius:8px;color:#405b52;}' },
            { path: "app.js", content: common.replaceAll("calculate", `calculate${roll}`).replaceAll("result", `result${roll}`) },
          ], link: null, submittedAt: new Date().toISOString(), status: "submitted", revision: 1, late: false,
        }));
        examples.find((submission) => submission.studentId === "student-04")!.files.push({ path: "original.js", content: Array.from({ length: 80 }, (_, index) => `export const record${index} = {title: "independent research entry ${index}", score: ${index + 23}, active: true};`).join("\n") });
        examples.find((submission) => submission.studentId === "student-06")!.files.push({ path: "broken.js", content: "function broken(" });
        const result = analyzeTaskSubmissions(examples, task);
        const copies = new Set(examples.slice(0, 3).map((submission) => submission.id));
        const flags = result.pairs.filter((pair) => pair.comparable && pair.percentage > 70);
        assert.equal(flags.length, 3, "The sample should flag only the three matching students.");
        assert.ok(flags.every((pair) => copies.has(pair.leftId) && copies.has(pair.rightId)));
        assert.ok(!result.pairs.some((pair) => pair.comparable && pair.percentage > 50 && (pair.leftId.endsWith("-4") || pair.rightId.endsWith("-4"))), "A shared fragment should not flag the much larger sample.");
        data.submissions.push(...examples);
      }
    });
  }
  const server = app.listen(3012, "127.0.0.1", () => console.log("Analysis demo ready: http://127.0.0.1:3012 — Check tasks → Lab 1 or 2 → Task 1. Matching samples: rolls 1, 2, 3."));
  server.on("error", (error) => { console.error(error.message); void store.close(); process.exitCode = 1; });
  const shutdown = () => server.close(async () => { await store.close(); process.exit(0); });
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startAnalysisDemo().catch((error) => { console.error(error.message); process.exitCode = 1; });
