# LabTrack reliability and optimization audit

Reviewed **15 October 2026**, with live metadata checks around **16:05–16:09 Pakistan time (UTC+05:00)**. This is a dated audit of the current working tree, including existing uncommitted changes.

**What this repo does:** LabTrack lets a teacher publish programming labs, collect student projects, review checks/comparisons and save grades. React calls an Express API; the API owns accounts and sessions and stores private classroom documents in Supabase. The load assumed here is **41 students and one teacher**, including simultaneous classroom sign-ins and submissions.

**Assessment:** The database is currently reachable and its access controls match the intended private design. The most valuable work is application recovery and save correctness, followed by smaller database transfers and verified backups. Passing tests and a healthy database do not make all failure paths safe. A realistic reliability goal is to contain failures, preserve confirmed work, explain uncertain saves and recover predictably.

The original audit generated a report without changing application behavior or live data. The implementation follow-up below records subsequent authorized work. Findings and source line numbers describe the audit baseline unless explicitly updated.

## Implementation follow-up, 15 October 2026

All 15 findings have implementation work recorded in the [current verification and release checklist](reliability-progress.md). It records the deployed application, live compatible database migration, verified GitHub backup and the limits of each check. The remaining sections preserve the original audit evidence and findings.

The hosted migration separates private project bytes, adds scoped conflict checks and retains legacy RPC compatibility. Full document checksums matched across every collection before/after migration. No real submissions or marks were changed as a test. The Node 24 suite passed 98 tests and six desktop/mobile browser checks passed. These reduce identified risks without promising zero future errors.

## Verified audit baseline, before implementation

| Check | Result | Meaning and limit |
| --- | --- | --- |
| Connected project | LabTrack, `akudfcgksdjlipxxwfdu`, `ACTIVE_HEALTHY`, `ap-south-1` | Status at inspection, not an uptime guarantee |
| Postgres | `17.11.0.003` | No version upgrade was performed |
| Local backend configuration | Expected project URL, server secret present, demo disabled, API port 3001 | Values were checked without printing the secret |
| Local authenticated metadata read | HTTP 200, **3,628 ms**, revision **108** | One read through Node and the configured key; not a latency percentile |
| Local API and Vite proxy | `/api/health` returned 200 through ports **3001 and 5173** | Confirms current listeners/proxy, not database readiness monitoring |
| Database size | **11,703,987 bytes**, approximately **11.7 MB / 11.16 MiB** | Far below the application's 400,000,000-byte content safeguard |
| Records | 42 users, 2 labs, 6 submissions, 25 activity entries, 5 sessions | Aggregate counts only; records can change |
| Document JSON text | Approximately **240 KB** across the five collections | Sum of document JSON lengths; not a measured RPC response or browser payload |
| Hosted migrations | All **five** expected migrations present | Initial local/hosted identifier mismatch still needs care before future migration tooling |
| Table permissions | RLS enabled on all three application tables; browser roles have no SELECT/INSERT/UPDATE/DELETE privileges; server role has required access | No grants or policies were changed |
| RPC permissions | All four application RPCs are security invoker, have an empty search path and deny browser execution | Express remains responsible for user authorization |
| Performance advisor | No notices returned | Does not cover application concurrency, transfer size or every failure path |
| Security advisor | Three informational “RLS Enabled No Policy” notices | Expected for this server-only design; do not add browser policies to silence them |
| Integrity aggregates | Zero duplicate emails, duplicate submission slots, orphan sessions, malformed document IDs, missing submission student/lab/task references or out-of-bounds saved grades | Targeted structural checks, not a complete validation of every field |
| Recent Supabase edge logs | Returned groups contained 95 HTTP 200s and 3 HTTP 409s in the connector's preceding 24-hour window | Aggregate snapshot, including audit reads; not all application traffic and not proof of the screenshot's cause |

The [Supabase RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is informational here because browser database access is deliberately denied. Keep that boundary. The application does not use Supabase Auth; migrating its account system is not necessary to address this incident.

Database statistics showed a large historical rollback counter, **20,921,838**, but it remained unchanged across subsequent audit samples. No current rollback storm was demonstrated. The prior conflict-code incident is documented in [the Supabase guide](supabase.md); retain the `PT409` fix and do not infer a new outage from a cumulative counter alone.

## What the screenshot establishes

The screenshot records this sequence:

```text
Initial Supabase read fails
    -> createApp cannot finish
    -> API never starts listening on 127.0.0.1:3001
    -> Vite /api/state proxy gets ECONNREFUSED
    -> Node watch waits for a file change
```

Evidence: [server/index.ts](../server/index.ts), lines 10–13 and 30–32; [server/app.ts](../server/app.ts), lines 337–347; [server/supabase.ts](../server/supabase.ts), lines 71–88; [package.json](../package.json), `dev` script.

The proxy error is downstream of failed API startup. The adapter discards the underlying transport cause, so the screenshot cannot distinguish a DNS failure, timeout, TLS/network interruption or a provider interruption. Current metadata and connectivity checks succeeded; they do not establish which condition caused that earlier failure. Missing RPC migrations normally produce a different message, and current migrations are present.

For this exact local symptom, verify hosted connectivity and then restart the failed API/dev process. The browser's Try again action cannot restart a backend that stopped during initialization. Restart is immediate recovery, not the permanent fix described below.

## Must fix for dependable classroom use

### 1. Recover from a temporary startup connection failure

- **What this is:** The API loads Supabase before opening its HTTP listener. [server/index.ts](../server/index.ts), lines 10–13 and 30–32; [server/app.ts](../server/app.ts), line 347.
- **Problem:** One failed initial read leaves the API unavailable even after the network recovers. In development, Node watch waits for a file change, matching the screenshot.
- **Fix:** Add bounded retries with increasing delay and jitter for transient startup **reads**, preserving a total deadline and safe diagnostics. After exhaustion, provide a clear restart/retry path or supervised restart; test failure followed by recovery without editing a file.
- **If we skip it:** Brief network problems can become prolonged local outages requiring manual intervention.

### 2. Treat lost write acknowledgements as uncertain saves

- **What this is:** The write RPC can commit before its response reaches the API. [server/supabase.ts](../server/supabase.ts), lines 71–88 and 175–188; [server/store.ts](../server/store.ts), lines 108–112.
- **Problem:** A lost response is reported as failure while persistent Node keeps its old snapshot. An isolated fetch simulation committed one synthetic session remotely, then threw: the remote had one session, the local store had zero and the caller saw an error.
- **Fix:** Mark the outcome uncertain and reconcile authoritative state before further use. Add an operation ID recorded atomically with its result, scoped to the authorized action with bounded retention, to make retrying the same action safe; test commit-then-response-loss and response-body failures.
- **If we skip it:** Retrying can create duplicate labs/events or unexpectedly replace a submission, increment its revision and clear its grade. Do not solve this with blind automatic write retries.

### 3. Separate a successful save from a failed refresh

- **What this is:** Lab saves, uploads and student creation await the write and then state refresh within the same failure path. [src/App.tsx](../src/App.tsx), lines 200–205, 307–311, 611–616 and 802–810.
- **Problem:** If the write succeeds but `/state` fails, the UI presents the overall operation as failed and permits another submission/save. An isolated server check confirmed that repeating an upload after grading changes revision 1 to 2 and removes the grade, as an intentional resubmission normally should.
- **Fix:** Keep the acknowledged save result, show “saved; refresh failed” and offer a read-only refresh action. Follow the existing distinction in [src/TaskComparison.tsx](../src/TaskComparison.tsx), lines 74–80, and add a POST-success/GET-failure browser regression.
- **If we skip it:** Users can accidentally repeat already completed work, with duplicated labs or unnecessary submission replacement.

### 4. Reject stale lab drafts from another tab

- **What this is:** The editor clones a lab and later sends the complete draft without the version it originally opened. [src/LabEditor.tsx](../src/LabEditor.tsx), lines 27–29 and 163–172; [server/app.ts](../server/app.ts), lines 709–716.
- **Problem:** The existing comparison detects a change during a request, but not a browser draft already stale before the request. In an isolated two-editor reproduction, tab A saved a new title, then tab B saved a description from its old draft; both returned 200 and B restored the original title.
- **Fix:** Include an expected lab revision or original-version token and validate it inside `Store.mutate`. Reject stale drafts with 409 while preserving editable input; update the shared contract, callers and tests together.
- **If we skip it:** One teacher using two tabs can silently overwrite a saved title, task or requirement edit.

### 5. Match review images and analysis to the reviewed revision

- **What this is:** Protected file and analysis reads use the stable submission ID without an expected submission revision. [src/submission-assets.ts](../src/submission-assets.ts), line 12; [src/Review.tsx](../src/Review.tsx), lines 107–111; [server/app.ts](../server/app.ts), lines 903–936.
- **Problem:** After a concurrent resubmission, old displayed source can be combined with new images or new analysis. An isolated reproduction retained revision 1 source containing `<p>`, resubmitted revision 2 with `<h1>` and another image, then fetched the newer image/heading result through the old review's ID.
- **Fix:** Send and check expected revisions on resources; return analysis revision/rule fingerprints, including compared peers. Reject mismatches and refresh the review; add concurrent-resubmission regressions.
- **If we skip it:** A teacher can assess mixed versions of a project. The current grade revision check correctly rejects a stale grade, but does not prevent misleading evidence before saving.

### 6. Make the write conflict policy survive a classroom burst

- **What this is:** All mutations share one global database revision and metadata-row lock. [server/store.ts](../server/store.ts), lines 104–119; [write RPC](../supabase/migrations/20261013041643_reserve_auth_capacity.sql), lines 5–8.
- **Problem:** Independent students contend even when updating different records. In an isolated simulation of **41 independent stores**, **60 ms synthetic RPC latency** and eight attempts, **10 writes succeeded, 31 returned 409 and 287 conflicts occurred**; this is a stress scenario, not measured production capacity.
- **Fix:** First add increasing bounded backoff with wider jitter and a total operation deadline. Then move independent operations to scoped, atomic database writes/revisions while retaining all ownership, grade and uniqueness checks; test 41-client bursts on isolated data.
- **If we skip it:** Simultaneous sign-ins or deadline submissions can produce many retryable failures despite preserving database integrity. Eight write/reload pairs with 15-second RPC timeouts can also exceed the configured [60-second function duration](../vercel.mjs).

### 7. Establish and test actual recovery from lost classroom data

- **What this is:** The repository has no automated backup/restore script, and resubmission replaces previous work. [docs/operations.md](operations.md), “Backup and recovery”; [server/app.ts](../server/app.ts), lines 808–831.
- **Problem:** A marks export cannot restore source, images, account hashes or lab attachments. A historical ignored recovery file and a capped 100-event activity list do not establish current recoverability; provider backup settings were not independently verified.
- **Fix:** Verify the plan's available backups, define acceptable data loss and recovery time, maintain protected off-site copies and restore one into an independent environment. Preserve ordering/schema/assets and deliberately revoke or exclude old sessions; record the drill result and backup age.
- **If we skip it:** Accidental replacement or operator error can leave no verified path to restore the affected classroom state. Supabase recommends regular off-site exports for Free projects; managed backup availability depends on plan. [Official backup documentation](https://supabase.com/docs/guides/platform/backups).

## Should fix for performance and operational reliability

### 8. Stop loading all project bytes for every authenticated request

- **What this is:** Supabase reads reconstruct the whole classroom, including private binary data; a warm-instance snapshot is retained only up to 16 MiB. [server/supabase.ts](../server/supabase.ts), lines 108–138; [initial read RPC](../supabase/migrations/20261012094828_labtrack_private_persistence.sql), lines 22–28.
- **Problem:** Three nearly 4 MiB image-heavy projects can push the snapshot beyond that cap after base64 overhead. Then even a single protected image request downloads the full classroom; below the cap, session/content revisions still invalidate the snapshot. Teacher `/state` also includes all authorized source text, and JSON streaming first allocates the entire serialized buffer ([server/app.ts](../server/app.ts), lines 436–445 and 544–575).
- **Fix:** Fetch binary payloads only when authorized downloads need them, and make common reads return metadata plus selected source. Introduce pagination/scoped reads where needed; private object storage is an option after designing authorization, consistency and backup handling.
- **If we skip it:** Bandwidth, cloning, serialization and memory grow with the entire class rather than the requested task. Raising the cache cap alone does not remove that work; the current approximately 240 KB document set is healthy but does not represent a full classroom of large uploads.

### 9. Limit simultaneous protected image downloads

- **What this is:** The asset hook starts a request for every image at once. [src/submission-assets.ts](../src/submission-assets.ts), lines 11–12; [api/index.ts](../api/index.ts), lines 35–37.
- **Problem:** One project can fan out to almost 60 image requests, and every authenticated Vercel invocation creates a request-owned app/store. This multiplies the snapshot work in finding 8; the hook also waits for all asset promises before displaying the resolved asset map.
- **Fix:** Use a small bounded download queue and prioritize the selected page's assets. Preserve cancellation and authorization; measure a 60-file project on a slow connection and avoid making one slow asset delay all useful preview output.
- **If we skip it:** Opening a large project or two comparison panes can create avoidable connection bursts and slow previews.

### 10. Preserve grading availability near the storage safeguard

- **What this is:** The guard budgets entire incoming lab/submission documents, rather than only added file content. [latest write RPC](../supabase/migrations/20261013041643_reserve_auth_capacity.sql), lines 9–15; [server/app.ts](../server/app.ts), lines 879–885.
- **Problem:** Near the threshold, grading, publishing feedback, changing lab visibility or shrinking an attachment can still return 507 because the update rewrites a large document. Authentication headroom is deliberately reserved, but classroom metadata operations are not separated from project payloads.
- **Fix:** Separate frequently changed grade/publication metadata from large payloads, then retain a conservative content-growth safeguard. Verify boundary behavior against actual SQL in an isolated database; simply bypassing the guard can still consume disk through large JSONB rewrites.
- **If we skip it:** Low storage can stop teachers finishing grades precisely when they need to recover/export. This is a current policy limitation, not an active space incident: the observed database is approximately 11.7 MB.

### 11. Protect unsaved marks in side-by-side comparison

- **What this is:** Comparison grading stores editable fields locally but has no equivalent of the individual review's dirty/busy navigation guard. [src/TaskComparison.tsx](../src/TaskComparison.tsx), lines 32, 54–58 and 72–88; [src/Review.tsx](../src/Review.tsx), lines 170–203.
- **Problem:** Back to tasks, changing the selected task/page or leaving the page can discard entered feedback or close the pane during a save. Source review confirms the unguarded paths; this was not exercised in a real browser.
- **Fix:** Apply equivalent unsaved-edit confirmation and save-time navigation protection to both comparison panes and surrounding controls. Verify keyboard, mobile and browser-exit behavior with edited and saving forms.
- **If we skip it:** Teachers can lose unsaved feedback and become unsure whether a pending save completed.

### 12. Bound browser requests and explain uncertain outcomes

- **What this is:** `api()` and protected asset fetches have no application elapsed-time deadline. [src/api.ts](../src/api.ts), line 16; [src/submission-assets.ts](../src/submission-assets.ts), line 12.
- **Problem:** A stalled connection or response body can keep login, save or upload controls busy. Existing cancellation during replacement/unmount is useful but does not bound time while the same screen remains open.
- **Fix:** Add endpoint-appropriate deadlines covering response reading, preserve any caller cancellation and offer clear recovery. Coordinate write timeouts with operation IDs/reconciliation from finding 2; cancellation does not prove the database rolled back.
- **If we skip it:** Some network failures leave indefinite waiting and encourage refresh/replay with unclear save status.

### 13. Add useful diagnostics and database readiness monitoring

- **What this is:** Transport failures lose their cause, the Vercel initialization catch emits no diagnostic, and `/api/health` deliberately avoids a database call. [server/supabase.ts](../server/supabase.ts), lines 83–88; [api/index.ts](../api/index.ts), lines 17–19 and 43–45.
- **Problem:** A configured but unreachable database can coexist with a green liveness response. Generic 503s do not distinguish DNS/timeout, HTTP authorization, missing migration or a conflict without safe server-side evidence.
- **Fix:** Keep cheap liveness; add a bounded readiness check using only database revision metadata, with rate limiting/access controls suitable for its exposure. Log request IDs, operation category, sanitized error code and duration; monitor readiness failures, 409/507 rates, storage, backup age and latency.
- **If we skip it:** An outage can remain unnoticed or take much longer to diagnose. Never log secrets, session cookies, upload bodies or complete database snapshots.

### 14. Add release gates for the risks the current tests do not cover

- **What this is:** Existing tests use isolated files/mocked RPCs; no CI or browser E2E script is committed. [docs/operations.md](operations.md), “Test map”; [package.json](../package.json), scripts.
- **Problem:** Mocked RPCs do not establish live Postgres locking, grants, quota behavior, Node 24 behavior or a real deployed streaming response. The current tests miss the commit-loss, stale-editor and class-burst scenarios above.
- **Fix:** Run tests/build in CI on the documented Node 24 runtime; add the targeted regressions above plus isolated SQL grant/migration tests and a compact desktop/mobile/keyboard browser smoke suite. Before migration automation, reconcile local `001_labtrack.sql` with hosted `20261012094828` without resetting or blindly replaying the classroom schema.
- **If we skip it:** Passing local tests can still ship regressions or leave migration tooling unsafe to use. Verify large responses on a staging deployment: this code already chunks JSON, and [Vercel documents streaming as a response-size workaround](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions), so a 4.5 MB teacher-state failure was **not** established here.

### 15. Preserve array ordering in the supported MongoDB adapter

- **What this is:** MongoDB loads with unsorted `find({})` and does not persist application array positions. [server/store.ts](../server/store.ts), lines 74–79 and 127–140.
- **Problem:** After restart, newest-first activity can return in a different order. The next `slice(0, 100)` can retain older entries while discarding newer ones ([server/app.ts](../server/app.ts), lines 151–157).
- **Fix:** Persist and explicitly sort stable array positions, matching the Supabase adapter. Add an isolated restart/order integration test before relying on MongoDB; no live MongoDB connection was tested in this audit.
- **If we skip it:** The alternative adapter can show or retain the wrong recent activity. This does not explain the selected Supabase incident.

## Recommended implementation order

| Stage | Work | Acceptance evidence |
| --- | --- | --- |
| Recovery and honest save status | Findings 1–3 and 13 | Startup survives a transient read failure; committed writes are reconciled; refresh failure never prompts repeating an acknowledged write |
| Review and edit integrity | Findings 4–5 and 11 | Two stale editors cannot overwrite each other; source/assets/analysis match; comparison feedback survives guarded navigation |
| Classroom load | Findings 6, 8–10 and 12 | 41-client isolated burst preserves all intended operations within a bounded deadline; large uploads/previews have measured memory/transfer limits; grading remains possible under the designed storage policy |
| Recovery and release proof | Findings 7 and 14 | Documented restore succeeds independently; CI uses Node 24; SQL and staging/browser checks pass |
| Alternative adapter | Finding 15 | MongoDB restart preserves ordering before that adapter is used |

For the current class, fixing recovery and correctness is more valuable than purchasing more compute or adding general JSON indexes. The application currently loads broad snapshots rather than filtering JSON fields in SQL; an indiscriminate GIN index would add write/storage cost without solving that access pattern. The existing primary keys cover the application's record and metadata lookups. Evaluate new indexes against the scoped queries introduced by an actual redesign.

Keep current safeguards during optimization: server-side authorization, private server keys, opaque iframe/CSP isolation, upload/path budgets, finite conflict retries, stable IDs, atomic writes, grade revision/max checks and zero-mark/export semantics. Selective reads or new RPCs must preserve those rules.

## Dependency advisory triage

`npm audit --omit=dev --json` completed with exit 1 because it found **three moderate package entries, zero high and zero critical entries**. These are one underlying advisory propagated through **`mammoth@1.13.0 -> argparse@1.0.10 -> sprintf-js@1.0.3`**, not three independent vulnerabilities. npm reported no available fix.

The [sprintf-js advisory, GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), concerns an exception caused by attacker-controlled formatting precision. Installed-source tracing found `argparse` used by Mammoth's command-line executable, with no `argparse`/`sprintf` references in Mammoth's library directory. LabTrack calls the library's `extractRawText` from [server/instructions.ts](../server/instructions.ts), rather than invoking the CLI. This supports **no demonstrated reachable route through the audited instruction-import path**; it is not a claim of exhaustive exploit analysis.

Track the upstream fix, keep the lockfile and rerun the audit in CI. Do not force an unrelated upgrade or suppress the advisory without documenting this reachability assessment. No packages or lockfile contents were changed by this audit.

## Verification record and material limits

- `npm test`: **82 passed, 0 failed, 0 skipped**, approximately **15.1 seconds**, using the installed dependencies on **Node 26.3.0 / npm 11.16.0**. Node 24 was not independently tested.
- `npm run build`: **passed** TypeScript and Vite 7.3.7; Vite completed in **15.87 seconds**. The initial sandbox attempt failed on parent-directory read permissions; the permitted retry outside that sandbox completed successfully.
- Build output: initial JavaScript **329.73 KB / 98.37 KB gzip**, CSS **162.32 KB / 31.84 KB gzip**, with separate teacher/student portal chunks. These are output-file sizes, not measured page-load timings.
- Runtime dependency audit: **three moderate package entries from one advisory chain**, no high/critical entries; reachability triage is above. Development dependencies were excluded from this advisory check.
- Read-only Supabase project status, migration history, security/performance advisors, grants/RLS/RPC settings, sizes/counts, targeted integrity aggregates and grouped logs were inspected.
- One local authenticated metadata request and health requests through both local ports succeeded. No real teacher/student credentials were used and no live submission/grade mutation was attempted.
- Ad hoc isolated probes reproduced lost write acknowledgement, stale lab overwrite, mixed-revision review resources, repeat-upload grade clearing and the synthetic 41-writer conflict burst. These probes are evidence for regressions to add, not a committed load-test suite or a live capacity result.
- Documentation/source review covered startup, Vercel, persistence/migrations, authorization/public projections, uploads, grading, review/analysis resources and frontend request handling. Detailed CSS/accessibility auditing, exhaustive parser fuzzing, provider billing/backup settings, all external network failure modes and live MongoDB were outside this verification.
- The current Supabase changelog and relevant Postgres 17.11 release notes were reviewed. No application use of the cited ltree, legacy PGP-cipher, float GiST or custom-operator features was found; the three public application indexes are ordinary primary-key B-trees. No extension/reindex change was warranted by this audit. [Release notes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- No database `EXPLAIN ANALYZE` was run on a data-returning classroom RPC, and no classroom source, passwords, cookies, binary payloads or backup contents were printed. No hosted schema or classroom data was changed.

**Verdict:** Current Supabase health and permissions are sound. Fix startup recovery and save-outcome handling first, then stale edit/review checks, classroom contention and verified restore capability. Zero errors cannot be guaranteed; safe outcomes and demonstrable recovery can be engineered and tested.
