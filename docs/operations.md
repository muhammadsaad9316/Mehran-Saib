# Operations and maintenance

Use isolated data for development checks. Real classroom credentials, uploaded work and backups are private. [configuration](configuration.md) describes runtime modes; [launch](launch.md) covers production releases.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Install lockfile dependencies |
| `npm run dev` | Watch Node server/shared/.env and run Vite |
| `npm test` | Node test runner through `tsx`, all `server/*.test.ts` and `src/*.test.ts` |
| `npm run build` | `tsc --noEmit` then Vite production bundle |
| `npm start` | Run persistent API and serve existing `dist/` |
| `npm run demo:analysis` | Separate local matching demo on 3012; build required |
| `npm run prepare:class` | Prepare private credentials and update `.env`; see side effects in onboarding |
| `npm run provision:class` | Provision the fixed hosted classroom; not a test command |
| `npm run prepare:student-logins` | Prepare private temporary codes for rolls 1–41; no account changes |
| `npm run apply:student-logins` | Owner-authorized atomic student password reset and mandatory first setup; not a test command |
| `node --import tsx server/lab-three.ts check` | Read-only lab inventory and consistency check for the configured classroom |
| `node --import tsx server/lab-three.ts apply` | Explicitly append the approved Lab 3 draft with its original document; never reset or replace existing records |
| `node --import tsx server/lab-three.ts upgrade-checks` | After deploying the semantic checker, upgrade only the existing Lab 3 checklists/revision; retain its publication, deadline, tasks, maxima, work and grades |
| `node --import tsx server/lab-four.ts check` | Read-only Lab 4 inventory and existing-record consistency check for the configured classroom |
| `node --import tsx server/lab-four.ts publish` | Explicitly append the owner-approved published Lab 4, two tasks / 20 marks / no deadline; refuses duplicates and never replaces saved records |

Additional commands: `npm run test:browser`, `npm run backup -- [output]`, `npm run backup:verify -- <encrypted-file>` and `npm run backup:restore -- <encrypted-file> <new-directory>`. There is no npm lint or database-reset script. The backend is executed as TypeScript with `tsx`; keep runtime dependencies installed when deploying a persistent server.

Build before `npm run test:browser`: the fixture serves `dist/`. Playwright's global setup starts an isolated JSON classroom on port 3127 in the runner process and returns its teardown. Teardown closes active connections, the listener/store and its checked temporary directory, avoiding Windows child-process shutdown hangs. A failed fixture bind is an error; existing servers are never reused.

## Test map

| Suite | Coverage |
| --- | --- |
| `server/app.test.ts` | Authorization/state, origins, deadlines, students, drafts, lab edits, resubmission, stale grades, downloads/exports, startup/demo boundaries |
| `server/supabase.test.ts` | Diffs, conditional cache, isolation/failures, storage guard, rollback of failed writes, bounded retries and concurrent saves |
| `server/startup.test.ts` | Transient startup-read recovery, finite retry/deadline behavior, fail-fast errors and no extra serverless/write retries |
| `server/serverless.test.ts` | Request-owned stores, sessions, upload/grade persistence and read-free fast paths |
| `server/deployment.test.ts` | Vercel API rewrite order, SPA fallback, cache headers and function duration |
| `server/uploads.test.ts` | Paths, ZIP extraction, encoding, duplicates, count/size and asset separation |
| `server/analysis.test.ts` | Requirements, exclusions, similarity, malformed code, group matches and scan completeness |
| `server/instructions.test.ts` | DOCX/PDF/text extraction and candidate-rule/document bounds |
| `server/lab-instructions.test.ts` | Metadata-only state, protected handout downloads, attachment-preserving edits, scoped SQL conflicts and private grants in both namespaces |
| `e2e/audit-fixes.spec.ts`, `e2e/logout.spec.ts` | Draft grade conflicts, lab dismissal/save guards, deferred downloads, on-demand handouts, sign-out feedback and session-state clearing on desktop/mobile |
| `server/marks-sheet.test.ts` | Roll migration/order, complete totals, zero/blank/fractional marks and words |
| `server/class-setup.test.ts` | Isolated provisioning, hashed accounts, work retention and refusal to reset passwords |
| `server/lab-three.test.ts` | Lab 3 append-only behavior, repeat/conflict protection, original attachment integrity, advisory checks and draft privacy |
| `server/lab-three-analysis.test.ts` | Each semantic check's negative case, complete solutions, exact missing-item reporting, CSS cascade, valid alternatives, review states and same-page evidence |
| `server/lab-four.test.ts` | Append-only published Lab 4, duplicate/concurrent preparation, compact-metadata repeat safety, unchanged previous work/grades, exact handout download, ordinary validation and advisory checks |
| `server/login-security.test.ts`, `server/serverless-login-limit.test.ts` | Parallel login limits, shared account aliases, cooldown timing, successful reset and unavailable limiter rejection |
| `src/api.test.ts` | Read retries and no write replay |
| `src/preview.test.ts` | Path resolution and CSP restrictions |
| `src/student-progress.test.ts` | Student/task scoping and published-grade totals |

Focused example: `node --import tsx --test server/uploads.test.ts`. After contract, auth, persistence, upload or grading changes, run the relevant suites plus the full `npm test` and build. For documentation-only changes, check links/claims and avoid adding tests that merely duplicate prose.

Most tests use temporary data or mocked RPCs. `migrations.test.ts` and `reliability.test.ts` execute all SQL in PGlite with synthetic data (PostgreSQL 18, single connection; hosted PostgreSQL is 17). `mongo-order.test.ts` mocks the driver; it does not prove live MongoDB connectivity. `backup.test.ts` covers authenticated recovery. Playwright runs an isolated classroom and real preview in desktop/mobile browsers; `PLAYWRIGHT_CHANNEL=msedge` selects installed Edge locally, or install Chromium with `npx playwright install chromium`. Verify CI is published and passed on Node 24 on Linux/Windows; see [release evidence](reliability-progress.md). Local success should be recorded with the runtime used and any warnings.

## Browser smoke check

In an isolated environment:

1. Sign in/out as teacher and student on desktop and a small viewport. Confirm student state cannot expose another student's work or draft marks.
2. Save a draft lab, publish it and verify student visibility. Exercise no deadline and a Pakistan-time deadline.
3. Upload nested HTML/CSS/JS plus a raster image or ZIP; preview linked pages and inspect source. Confirm remote dependencies stay blocked.
4. Save draft feedback, publish it, resubmit and verify the old grade disappears. Try grading an old revision and verify 409 plus refreshed review.
5. Check missing work and a known comparison, including multiple matching students. Verify analysis does not alter marks.
6. Export Excel/CSV/print: numeric roll order, zero marks retained, incomplete totals blank. In Excel check wide columns, wrapped names, frozen headers, filters and repeated print headings. Test keyboard dialogs/focus and mobile sign-out.
7. Restart the persistent server or request a fresh serverless instance and verify stored work remains.

## Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| Vite proxy error / empty gateway | Is API on 3001? Persistent Supabase startup retries transient reads up to three times within 45 seconds; watch the safe terminal warnings. If startup exhausts that budget, restore connectivity and restart the API/dev command, then retry the browser read. `.env` edits also restart it. If `PORT` changed, align Vite proxy. |
| Explicit local 503 key message | Enter `SUPABASE_SECRET_KEY` privately in root `.env`, save, then use Try again. |
| Vercel 503 | Confirm server URL/key settings, reachable Supabase, all RPC migrations and startup requirements. Health does not test the database. |
| `PGRST202` / missing function | Compare migrations/function signatures with [supabase](supabase.md); do not blindly replay already applied SQL. |
| Login 401 | Correct email/roll/password and existing account; env admin values do not reset passwords. Confirm production HTTPS cookie. |
| Login 429 | Wait one minute after the fifth attempt; blocked requests do not extend the cooldown. Email/roll aliases share a budget, and unknown identities share one bucket. Do not disable limits to work around repeated failures. |
| Mutation 403 | Role, Origin and `Sec-Fetch-Site`; use same-origin proxy/rewrite. `CLIENT_ORIGIN` alone does not enable cross-site cookies/CORS. |
| Save 409 | Refresh and review current lab/submission; retry only with current input. Persistent Supabase has one attempt, serverless at most eight. |
| Upload 400/413 | Paths/types/encoding, 60 files, 1 MiB/source, 4 MiB extracted/request budget and ZIP expansion. Remove hidden/dependency directories. |
| Save 507 | Content storage safeguard. Preserve records, let teacher sign in/export, assess storage; do not remove protection or delete student work blindly. |
| Preview misses remote assets | Expected CSP boundary; submit allowed local assets or review the project link externally. |
| Grade absent for student | Publication, lab visibility and latest revision; resubmission clears prior grades. |
| Export total blank | Every current task needs a saved grade; blank is not zero. |
| Manual DB edits absent locally | All external Supabase writes must advance global revision; protected requests check it. JSON/MongoDB require a restart and one writer. |
| MongoDB transaction failure | Atlas/replica set required; bare standalone MongoDB is unsupported for writes. |

Do not log full upload/RPC bodies while diagnosing a failure. Supabase snapshots include hashes and session tokens. Check counts, revision, grants and sanitized error codes first.

## Backup and recovery

The encrypted backup/verify/restore commands now support JSON and Supabase. They export the full legacy read, exclude sessions, validate references/source/assets/grades and refuse overwriting existing outputs or restore directories. Backup rejects incomplete or conflicting provider settings before reading a source or creating keys/output; it never falls back to JSON after partial Supabase configuration. Verify/restore do not require source-provider configuration. MongoDB still requires provider snapshots. The owner-approved GitHub schedule runs daily at 01:15 Pakistan time, retaining encrypted artifacts for 30 days; see [activation evidence](reliability-progress.md). The historical [free-tier audit](free-tier-audit.md) records a private `.data/backups/classroom-2026-10-13-before-optimization.json` recovery copy with sessions excluded; that ignored file is not guaranteed to exist in a clone and is not a complete database backup.

Run `npm run backup` to create an ignored `.data/backups/*.enc.json`; verify with `npm run backup:verify -- <file>`. Restore into a new directory using `npm run backup:restore -- <file> <new-directory>`. The CLI retains a random `.data/backup-key` unless `LABTRACK_BACKUP_KEY` supplies the same 32-byte key as base64. Keep this key separately in protected owner custody; neither an encrypted artifact nor a CSV can restore data without it. For JSON, stop the writer cleanly before exporting. For Supabase/MongoDB, use an owner-approved provider/database backup process and verify what the plan includes. Preserve schema/migrations, users/password hashes, labs/attachments, submissions/asset bytes and ordering. Marks CSV is a report, not a restore source. Credential CSV contains plaintext passwords and needs separate restricted custody.

Recovery sequence:

1. Stop affected writes and retain a copy of the damaged/current state and the candidate backup.
2. Restore into an independent environment first. Apply the schema, validate document IDs, user/task references, hashes, source/assets and counts. Exclude/revoke old sessions deliberately.
3. Test sign-in, previews, totals, drafts and persistence using the restored environment without modifying the original class.
4. Perform the approved recovery during maintenance. Ensure global revision/cache state is coherent and restart persistent processes. Direct SQL inserts without revision advancement are insufficient.
5. Verify through the role-filtered API and record which backup/time was used. Keep the old state until recovery is accepted.

The app has no archived submission revisions or immutable event ledger to reconstruct lost work. Activity is capped at 100. Define actual backup frequency and retention with the class owner rather than assuming the historical copy is enough.

## Resource monitoring

Monitor provider database size, egress, logs, request duration and rate-limit failures. Cached reads reduce transfers only with warm-instance reuse; changed data still reloads the snapshot. Upload bytes/base64 live in Postgres. The 400,000,000-byte guard protects positive lab/submission content growth, not every consumer/provider limit. Metadata grading/publication and content reduction remain possible. Source/binary payloads are separate from routine metadata reads. Instruction attachments remain in private labs but `read_workspace` projects only their metadata; bytes load through `instructions` on demand.

For growth beyond the fixed class, evaluate object storage, selective/paginated reads, task analysis cost and tenancy together. Historical measurements/free-plan notes in the audit are dated; verify current provider limits before relying on them.
