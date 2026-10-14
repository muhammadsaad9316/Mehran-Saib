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

There is no npm lint, database-reset, backup/restore or E2E/browser-test script. Do not claim those checks ran. The backend is executed as TypeScript with `tsx`; keep runtime dependencies installed when deploying a persistent server.

## Test map

| Suite | Coverage |
| --- | --- |
| `server/app.test.ts` | Authorization/state, origins, deadlines, students, drafts, lab edits, resubmission, stale grades, downloads/exports, startup/demo boundaries |
| `server/supabase.test.ts` | Diffs, conditional cache, isolation/failures, storage guard, rollback of failed writes, bounded retries and concurrent saves |
| `server/serverless.test.ts` | Request-owned stores, sessions, upload/grade persistence and read-free fast paths |
| `server/deployment.test.ts` | Vercel API rewrite order, SPA fallback, cache headers and function duration |
| `server/uploads.test.ts` | Paths, ZIP extraction, encoding, duplicates, count/size and asset separation |
| `server/analysis.test.ts` | Requirements, exclusions, similarity, malformed code, group matches and scan completeness |
| `server/instructions.test.ts` | DOCX/PDF/text extraction and candidate-rule/document bounds |
| `server/marks-sheet.test.ts` | Roll migration/order, complete totals, zero/blank/fractional marks and words |
| `server/class-setup.test.ts` | Isolated provisioning, hashed accounts, work retention and refusal to reset passwords |
| `src/api.test.ts` | Read retries and no write replay |
| `src/preview.test.ts` | Path resolution and CSP restrictions |
| `src/student-progress.test.ts` | Student/task scoping and published-grade totals |

Focused example: `node --import tsx --test server/uploads.test.ts`. After contract, auth, persistence, upload or grading changes, run the relevant suites plus the full `npm test` and build. For documentation-only changes, check links/claims and avoid adding tests that merely duplicate prose.

Tests use temporary local data and mocked RPCs; they do not validate a live MongoDB deployment or execute the preview in a real browser. No current CI workflow is committed. Local success should be recorded with the runtime used and any warnings.

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
| Vite proxy error / empty gateway | Is API on 3001? `.env` edits briefly restart it; wait, then retry a read. If `PORT` changed, align Vite proxy. |
| Explicit local 503 key message | Enter `SUPABASE_SECRET_KEY` privately in root `.env`, save, then use Try again. |
| Vercel 503 | Confirm server URL/key settings, reachable Supabase, all RPC migrations and startup requirements. Health does not test the database. |
| `PGRST202` / missing function | Compare migrations/function signatures with [supabase](supabase.md); do not blindly replay already applied SQL. |
| Login 401 | Correct email/roll/password and existing account; env admin values do not reset passwords. Confirm production HTTPS cookie. |
| Login 429 | Wait for the 15-minute budget; unknown identities share a serverless bucket. Do not disable limits to work around repeated failures. |
| Mutation 403 | Role, Origin and `Sec-Fetch-Site`; use same-origin proxy/rewrite. `CLIENT_ORIGIN` alone does not enable cross-site cookies/CORS. |
| Save 409 | Refresh and review current lab/submission; retry only with current input. Persistent Supabase has one attempt, serverless at most eight. |
| Upload 400/413 | Paths/types/encoding, 60 files, 1 MiB/source, 4 MiB extracted/request budget and ZIP expansion. Remove hidden/dependency directories. |
| Save 507 | Content storage safeguard. Preserve records, let teacher sign in/export, assess storage; do not remove protection or delete student work blindly. |
| Preview misses remote assets | Expected CSP boundary; submit allowed local assets or review the project link externally. |
| Grade absent for student | Publication, lab visibility and latest revision; resubmission clears prior grades. |
| Export total blank | Every current task needs a saved grade; blank is not zero. |
| Manual DB edits absent locally | Restart persistent Node; all external writes must also advance global revision to invalidate serverless cache. |
| MongoDB transaction failure | Atlas/replica set required; bare standalone MongoDB is unsupported for writes. |

Do not log full upload/RPC bodies while diagnosing a failure. Supabase snapshots include hashes and session tokens. Check counts, revision, grants and sanitized error codes first.

## Backup and recovery

There is no automated backup schedule or restore command in this repo. The historical [free-tier audit](free-tier-audit.md) records a private `.data/backups/classroom-2026-10-13-before-optimization.json` recovery copy with sessions excluded; that ignored file is not guaranteed to exist in a clone and is not a complete database backup.

For JSON, stop the writer cleanly, then copy the private `labtrack.json` to protected off-site storage. For Supabase/MongoDB, use an owner-approved provider/database backup process and verify what the plan includes. Preserve schema/migrations, users/password hashes, labs/attachments, submissions/asset bytes and ordering. Marks CSV is a report, not a restore source. Credential CSV contains plaintext passwords and needs separate restricted custody.

Recovery sequence:

1. Stop affected writes and retain a copy of the damaged/current state and the candidate backup.
2. Restore into an independent environment first. Apply the schema, validate document IDs, user/task references, hashes, source/assets and counts. Exclude/revoke old sessions deliberately.
3. Test sign-in, previews, totals, drafts and persistence using the restored environment without modifying the original class.
4. Perform the approved recovery during maintenance. Ensure global revision/cache state is coherent and restart persistent processes. Direct SQL inserts without revision advancement are insufficient.
5. Verify through the role-filtered API and record which backup/time was used. Keep the old state until recovery is accepted.

The app has no archived submission revisions or immutable event ledger to reconstruct lost work. Activity is capped at 100. Define actual backup frequency and retention with the class owner rather than assuming the historical copy is enough.

## Resource monitoring

Monitor provider database size, egress, logs, request duration and rate-limit failures. Cached reads reduce transfers only with warm-instance reuse; changed data still reloads the snapshot. Upload bytes/base64 live in Postgres. The 400,000,000-byte guard protects lab/submission writes, not every database consumer or platform limit.

For growth beyond the fixed class, evaluate object storage, selective/paginated reads, task analysis cost and tenancy together. Historical measurements/free-plan notes in the audit are dated; verify current provider limits before relying on them.
