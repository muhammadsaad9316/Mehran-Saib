# LabTrack

A working Web Engineering lab submission and grading app. React + TypeScript and Tailwind power the interface; an Express API handles sessions, task submissions, grading, analysis and reports. Supabase is the selected hosted database, with a private local JSON store so you can run the project immediately. The teacher portal uses a teaching studio layout with warm paper surfaces, graphite navigation, orange actions, a per-student submission matrix, published/draft filters and a review desk.

## Run locally

Use Node.js 22 or newer.

The selected setup runs the application locally and stores its data in the existing LabTrack Supabase project. Its schema and SQL functions are applied and verified. Follow [the local Supabase setup](docs/supabase-local.md) and fill in the private `.env` values before starting. No application has been uploaded or deployed to Vercel.

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. For an isolated demo, use `.env.example` with Supabase settings omitted. The demo opens a minimal teacher workspace with roll numbers 1–41 and names transcribed from the supplied marks-sheet image. Rolls 16, 26, 27, 30, 34, 37 and 39 have no name in that image; their export cells stay blank. Use **Student demo** in the top bar to try submitting work. Existing sample names and legacy roll numbers are migrated while account IDs, email aliases, passwords, submissions and grades remain intact. Demo records persist across restarts in `.data/labtrack.json` and are not copied into the hosted database.

To sign in manually, use `teacher@labtrack.edu` or student roll number `1` with `LabTrack2026!`. Students may also use their email address. These credentials are for local demo data only.

```powershell
npm test
npm run build
npm start
```

`npm start` serves the built frontend and API together at http://127.0.0.1:3001. Copy `.env.example` to `.env` when configuring a different port, private data directory or MongoDB. The server reads `.env` with Node's built-in loader.

## Included workflows

To try the analyzer with sample data, run `npm run demo:analysis` after building and open **http://127.0.0.1:3012**. Choose **Check tasks → Lab 1 or Lab 2 → Task 1**. Rolls 1, 2 and 3 match; roll 4 shares only a small part of a larger project, roll 5 is missing, and roll 6 has a syntax error needing manual review. This demo keeps edits in `.data/analysis-demo` and never uses hosted databases or loads `.env`.

- Teachers enter task instructions and marks directly, edit one task at a time, and save or publish. Automatic checks and the lab overview are optional, collapsed sections. Existing tasks retain their IDs when edited so submissions stay linked; saved instruction attachments remain available to students.
- Students upload individual files, project folders, ZIPs, and/or HTTP(S) project links. Paths survive uploads. Each task has its own submission and revision.
- Teachers preview local HTML/CSS/JS and raster assets in an opaque sandbox, inspect source files and select HTML entrypoints. Local page links work within the viewer.
- Parser-based checks inspect actual HTML elements, attributes, visible text and files. HTML/CSS/JavaScript comparisons provide similarity evidence and quality observations.
- **Check tasks** gives teachers a lab/task queue with requirement scores, quality observations, missing work, grades and similarity matches. Flags default to over 70% matching coverage in **both** tasks; teachers can switch to over 50%. All matched students are flagged, including groups of three or more. Compare opens complete projects side by side, with linked-page previews, source files, highlighted sample matching blocks and independent grading forms. Analysis never changes marks.
- Teachers assign task-level marks and feedback, save private draft grades or publish results. Resubmission clears the old grade and requires another review. Stale review grading is rejected.
- The teacher dashboard shows submitted/missing counts and a submission matrix for published labs, with one block per student in roll-number order. Graphite blocks indicate graded submissions, orange indicates work awaiting review, and neutral blocks indicate no submission. Clicking a published lab title opens its expanded details in Labs; clicking a count opens the filtered roll-number roster. Drafts show an edit action until published. The review desk opens the next ungraded task and lists three tasks in the queue. Teacher navigation contains Dashboard, Labs, Students and Check tasks.
- Students can sign out from the labeled button in the top bar on desktop and mobile, returning to the sign-in screen.
- Each lab exports a four-column marks sheet: R. No, Name, Marks in Figure and Marks in Words. The heading uses the college from the supplied reference, Lab N Marks Sheet (Fall 2026), BS Computer Science, Semester 7th and Web Engineering. A total appears only when all tasks have saved grades; incomplete totals remain blank. Teacher exports include saved draft grades. A printable A4 view matches the reference's page layout.
- Student profiles show submission history across every lab and task.

The original two supplied assignments are included with their three tasks. Lab 1 uses its exact filenames. Only student names were imported from the marks-sheet image; its exam marks were not imported. The third lab, account email aliases, submissions, dates and grades are illustrative. Original assignment content and parser limitations are recorded in [docs/lab-requirements.md](docs/lab-requirements.md).

## System design

```text
React teacher/student portal
          │ same-origin JSON + multipart requests
          ▼
Express API — role authorization + sessions + validation
          ├── bounded project import / safe downloads
          ├── HTML, CSS and JavaScript analysis
          ├── per-task grading / CSV export
          └── persistence: Supabase (selected), local JSON or MongoDB
```

`shared/types.ts` defines the browser/API contract. A `Lab` contains `Task` records and requirement rules. A `Submission` is unique per student, lab and task and includes files, a revision and an optional grade. Published grades are visible to the corresponding student. Session tokens and password hashes stay on the server. Activity records describe teacher workflow events.

## Deployment and practical limits

Current scope is a local React/Node application with the private Supabase database. Follow [the local guide](docs/supabase-local.md). Optional separate-backend hosting templates remain in the repository, but public deployment is deferred. Vercel-only hosting will need a separate adaptation and hosted verification.

For a real class, use a **fresh database**, disable demo mode, configure a unique initial teacher password and serve the app over HTTPS. Production refuses the seeded demo database. MongoDB writes require an Atlas cluster or replica set for transactions. This version runs in one server process; it does not synchronize in-memory reads across multiple application instances.

Uploaded code runs only inside the isolated preview. Its asset loads and fetch requests are restricted by CSP; JavaScript execution is allowed within that sandbox. External libraries, module imports and remote project links are not fetched or executed by the server. Similarity is heuristic evidence for human review. It neither proves copying nor assigns marks, and the app contains no AI authorship detection.

The preview follows the opaque iframe approach described in [MDN's srcdoc security guidance](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/srcdoc). The session cookie configuration follows [Express's session security guidance](https://expressjs.com/en/resources/middleware/session/).

Supabase schema, role grants, real SQL read/write execution, and local teacher/student sign-in are verified. The teacher sees all 41 students and both draft labs through the Supabase-backed API. Public hosting is not deployed or verified. [Backend configuration and limits](docs/backend.md) has the API and storage details. Existing MongoDB support remains available for older configurations.
