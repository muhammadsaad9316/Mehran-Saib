# HTTP API reference

All routes are implemented in [server/app.ts](../server/app.ts), with production entry behavior in [api/index.ts](../api/index.ts). The browser helper in [src/api.ts](../src/api.ts) uses a same-origin `/api` base. Public TypeScript contracts are in [shared/types.ts](../shared/types.ts).

JSON requests use `Content-Type: application/json`; uploads use multipart. Authentication is the `labtrack_session` cookie, not a bearer token or Supabase JWT. Keep browser calls same-origin. `CLIENT_ORIGIN` is an origin allowlist setting, not a CORS/cross-site-cookie implementation.

## Route inventory

| Method and path | Access | Request | Success |
| --- | --- | --- | --- |
| `GET /api/health` | Public | None | 200 `{ "ok": true }` |
| `GET /api/ready` | Teacher, or Vercel monitor with configured private token | Optional `X-Readiness-Token` for monitor | 200 `{ "ok": true }` after database probe; safe 503 on failure |
| `GET /api/state` | Public, filtered by session | None | 200 `AppState` |
| `POST /api/auth/login` | Public | `{ email, password }` | 200 `User` + session cookie |
| `POST /api/auth/password` | Signed-in student awaiting first setup | `{ newPassword }`, nonblank 6–256 characters; no composition rule | 200 `User`, setup completed and session rotated |
| `POST /api/auth/demo` | Loopback demo only | `{ role: "teacher" \| "student" }` | 200 `User` + cookie; production 403 |
| `POST /api/auth/logout` | Persistent server accepts without session; Vercel requires shaped cookie | No body required | 200 `{ "ok": true }`, session removed/cookie cleared |
| `POST /api/students` | Teacher | `{ name, email, rollNumber, password }` | 201 `User` |
| `POST /api/labs` | Teacher | Full editable lab body | 201 `Lab` |
| `PATCH /api/labs/:id` | Teacher | Partial lab fields; `tasks` replaces the array | 200 `Lab` |
| `POST /api/instructions/analyze` | Teacher | `{ instructionFile: { name, content, contentType } }` | 200 `{ tasks, notice, text }` draft; not persisted |
| `POST /api/submissions` | Student | Multipart `labId`, `taskId`, optional `link`, `expectedRevision`, repeated `files` | 201 `Submission`, including resubmission |
| `PATCH /api/submissions/:id/grade` | Teacher | `{ marks, feedback, published, revision, expectedGradeAt? }` | 200 `Submission` |
| `GET /api/labs/:id/analysis?taskId=...` | Teacher | Required task ID | 200 `TaskAnalysis` |
| `GET /api/submissions/:id/analysis?peerId=...` | Teacher or owning student in a published lab | Optional targeted peer ID | 200 `AnalysisResult`; students receive no peers |
| `GET /api/submissions/:id/source?revision=N` | Teacher or owning student in a published lab | Required current revision | 200 authorized source; 409 if revision changed |
| `GET /api/submissions/:id/files/*filename` | Teacher or owning student in a published lab | Encoded relative file path | 200 attachment bytes |
| `GET /api/reports.csv?labId=...` | Teacher | Optional lab ID; first lab by default | 200 CSV attachment |
| `GET /api/reports.xlsx?labId=...` | Teacher | Optional lab ID; first lab by default | 200 styled Excel workbook attachment |
| `GET /api/reports/print?labId=...` | Teacher | Repeat `labId` to include multiple labs; no IDs or `select=1` opens the lab picker | 200 selection page or printable HTML |

There are no delete, registration, forgotten-password recovery, student-update or separate lab/submission-list endpoints. First-login password creation is restricted to signed-in pending accounts. Lists come from `/state`. Unknown `/api` paths normally return 404; unsigned Vercel protected requests can be rejected with 401 before Express routing.

## State visibility

```json
{
  "user": null,
  "students": [],
  "labs": [],
  "submissions": [],
  "activity": [],
  "demo": false
}
```

- Unsigned state contains empty arrays and no user. Local demo state can report `demo=true`.
- A signed-in user with `mustChangePassword=true` receives only their public user and empty classroom arrays. All other classroom routes return 403 until password setup completes.
- Teachers receive the roster, all labs, all submissions and activity.
- Students receive only themselves in `students`, published labs and their own submissions for those labs. Draft grades are removed and their status appears `submitted`.
- Password hashes, session records and binary asset base64 never appear in state. State includes instruction base64 and file paths with empty content plus `sourceOmitted=true`. Source is loaded on demand through the protected source endpoint. Asset metadata is `{ path, mimeType }`; fetch bytes through the protected file route.

## Login and student creation

```json
{ "email": "1", "password": "YOUR_PRIVATE_PASSWORD" }
```

The `email` field accepts a roll number or email. Rolls are canonicalized (e.g. `"01"` → `"1"`). Login identity length is at most 254; password length is 1–256 to retain existing credentials. Incorrect credentials return a generic 401. Five attempts share one account budget across email/roll aliases. The fifth starts a one-minute cooldown; further attempts return 429 with `Retry-After: 60` and a one-minute retry message. Blocked requests do not extend the cooldown; a successful admitted login clears it. See [backend](backend.md).

Student creation requires a nonblank name up to 100 characters, valid unique email up to 254, unique roll 1–41 and password 12–256. Both string and number roll inputs can canonicalize, although public records use strings. Duplicate identity returns 409. The response excludes the password/hash.

Newly created students must replace that initial password on first login. The public `User.mustChangePassword` flag selects the setup screen. Temporary logins use a 15-minute `setup_`-prefixed opaque cookie; successful setup rotates to a normal seven-day cookie, invalidates previous sessions and rejects the temporary code thereafter. Password hashes and credential versions stay private. See [student logins](student-logins.md) for the owner-authorized 41-student reset and private credential sheet.

## Lab payload

Example for a new lab:

```json
{
  "title": "HTML practice",
  "description": "Complete and submit each task separately.",
  "dueDate": "2026-10-20T12:00:00+05:00",
  "published": false,
  "tasks": [{
    "id": "stable-task-id",
    "title": "Build a page",
    "description": "Include a main heading.",
    "maxMarks": 10,
    "requirements": [{
      "id": "stable-rule-id",
      "label": "Main heading present",
      "type": "tag",
      "value": "body h1"
    }]
  }]
}
```

An optional UUID `Idempotency-Key` header scopes creation to this teacher/operation: identical replay returns the same lab; different content returns 409. Backend generates the lab ID, generates missing task/rule IDs, validates uniqueness within the lab/task and computes `totalMarks`. Keep supplied IDs stable on edits. `dueDate` may be empty; otherwise it must parse and is normalized to ISO. `published` must be a boolean.

Optional `instructionFile` is `{ name, content, contentType }`; `content` is raw base64, without a data-URL prefix. Accepted filenames: PDF, DOC, DOCX, TXT, MD. Decoded size is at most 3 MiB. PATCH merges omitted fields from the old lab; a supplied task array replaces the whole array. Setting `instructionFile` to null removes it. Tasks with submissions cannot be removed; existing grade marks cannot exceed a reduced maximum. Full task edits send the loaded lab `revision` (legacy labs use 0); saved revisions increment. Stale revisions or changes during a save return 409. Partial scalar updates remain supported.

| Field | Bound |
| --- | --- |
| Lab/task title | 1–120 characters |
| Lab/task description | 0–8,000 |
| Tasks per lab | 1–20 |
| Task maximum | Finite number 0.5–1,000 |
| Requirements per task | 0–80 |
| Task/requirement ID | 1–100 when supplied |
| Requirement label/value | 1–200 / 1–500 |
| Attribute name | 1–100 for `attribute` rules |
| Instruction filename | Up to 160, no path/control characters |

## Upload a task

Browser example using the existing request helper:

```ts
const body = new FormData();
body.append("labId", lab.id);
body.append("taskId", task.id);
body.append("expectedRevision", String(currentSubmission?.revision || 0));
body.append("files", file, "project/index.html");
await api<Submission>("/submissions", { method: "POST", body });
```

Upload filenames preserve relative project paths. At least one source file or an HTTP(S) link is required; images alone without a link do not satisfy that condition. Links cannot embed credentials. A remote link is stored, never fetched/analyzed by the server.

The selected lab/task must be published. New work starts at revision 1. The UI sends `expectedRevision`: 0 for new work, otherwise the displayed current revision; a mismatch returns 409. Replacement keeps the submission ID, increments revision, sets the new timestamp/late flag and removes the old grade. This does not preserve old files or earlier versions. Accepted types and budgets are in [analysis.md](analysis.md).

## Save a grade

```json
{ "marks": 8.5, "feedback": "Review the document title.", "published": false, "revision": 1 }
```

Marks must be finite and within `0..task.maxMarks`; zero is a valid grade. Feedback is optional/empty or up to 4,000 characters. Publication is a required boolean. Revision is a required safe positive integer matching current work. The UI also sends `expectedGradeAt` (the displayed `gradedAt` or an empty string); changed grades return 409. Successful saves set `status="graded"` and add `gradedAt`; drafts remain private. Stale revisions return 409 and must be reviewed again, not blindly retried.

## Analysis and exports

`TaskAnalysis` contains task ID, per-submission revision/requirements/quality summary, sorted pairs with both coverage percentages and `comparable`, and scan notices. `AnalysisResult` contains detailed requirement results, `met`/`total`, quality, summary and similarities with up to three sample matching blocks. Both analysis contracts return `evidenceVersion`, derived from current task requirements and submission IDs/revisions; the client must match its displayed fingerprint. Individual review can supply a `revision` query. A returned positive pair is not necessarily eligible for a UI flag. See [analysis](analysis.md).

File downloads accept a current `revision` query and reject mismatches. Downloads check ownership, encode path segments, set attachment disposition and `nosniff`. Reports use roll-number order and four columns. A lab total is blank until every task has a saved grade; draft grades count for teacher reports. HTML is escaped and CSV formula prefixes are protected. Excel exports store names as literal text and marks as numbers, with merged titles, wide wrapped columns, orange table headings, alternating rows, frozen headings and filters. A4 printing fits the columns to the page width, repeats the headings and allows multiple pages to keep text legible. Report headings are currently fixed to Fall 2026, BS Computer Science, Semester 7th, Web Engineering and the reference college.

## Error contract

```json
{ "error": "Human-readable explanation." }
```

| Status | Typical meaning |
| --- | --- |
| 400 | Invalid fields/JSON/rules/file types; some multipart limits |
| 401 | Missing/expired session or incorrect login |
| 403 | Wrong role, foreign mutation origin, disabled demo |
| 404 | Missing record, unpublished task, another student's submission or route |
| 409 | Duplicate student, stale grade/lab, task-removal conflict or persistence revision conflict |
| 413 | Body, extracted content or text file too large |
| 429 | Login attempt budget exhausted |
| 500 | Unexpected Express error, returned with a generic message |
| 503 | Missing configuration, unavailable persistence/readiness, or unconfirmed write outcome; refresh before repeating an uncertain mutation |
| 507 | Supabase classroom-content storage safeguard rejected a save |

API responses have `Cache-Control: no-store` and generated `X-Request-Id`; unexpected errors include a safe request ID. Logs contain categories, never database bodies. Health is liveness, not a database-integrity/readiness guarantee. Origin validation rejects cross-site mutations; it does not authorize access. Do not retry mutation errors automatically.
