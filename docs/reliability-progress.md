# Reliability implementation and verification — 15 October 2026

Current status of the [original audit](reliability-audit-2026-10-15.md): the application fixes are published and deployed, the compatible database migration is live, and owner-approved daily GitHub backups are verified. The checks and remaining limits are recorded below.

| Finding | State |
| --- | --- |
| 1. Startup recovery | Three transient initial-read attempts within 45 seconds; seven failure/recovery regressions. Exhausted outages still require a restart. |
| 2. Uncertain writes | Read-only reconciliation after lost acknowledgements; no automatic transport-failed write replay. Confirmed writes stay acknowledged if reload fails; subsequent access requires an authoritative reload. |
| 3. Save vs refresh | Close acknowledged lab/upload dialogs before refreshing; separate refresh errors. Browser test verifies a closed dialog and one POST when the following state GET fails. |
| 4. Stale editors | Lab revision, expected upload revision and expected grade timestamp checks. Stable creation operation keys prevent duplicate labs after uncertain responses. |
| 5. Review evidence | Exact-revision source/assets and task/submission evidence fingerprints; stale results rejected or hidden. |
| 6. Classroom contention | Scoped comparisons allow independent writes despite changed global revision. Eight attempts maximum with increasing jitter and a shared 45-second budget. SQL/API and delayed transport fixtures exercise 41 writers. |
| 7. Recovery | AES-256-GCM encrypted backups, sessions excluded, authenticated validation and fresh-directory restore. Actual classroom backup and isolated restore/API visibility drill passed; owner approved daily GitHub copies. |
| 8. Payload transfer | Private source/binary payload table; metadata-only state, selected source reads and individual file reads. Legacy full reads retained for backups/old deployments. |
| 9. Image requests | Four downloads per project, progressive display, cancellation/deadlines. Browser checks verify request bound and rendered image dimensions. |
| 10. Storage pressure | SQL ceiling applies to positive content growth; metadata grading/publication and shrinking work remain available. Actual independent SQL regression covers both. |
| 11. Comparison drafts | Both panes track drafts/saving, with navigation/refresh/logout and unload guards. Browser checks cover discard refusal and blocked navigation during save. |
| 12. Request deadlines | 20-second reads, 50-second writes, response-body consumption and caller cancellation. Timed-out writes explain uncertainty and are not replayed. |
| 13. Diagnostics | Generated request IDs, safe error categories, separate liveness and teacher database readiness. Optional serverless monitor token supported. |
| 14. Release checks | Node 24 suite, independent PostgreSQL engine tests, desktop/mobile browser checks and CI prepared. Initial migration name reconciled with hosted history. Existing Linux lock metadata repaired during first backup activation. Published CI passed on Linux and Windows. |
| 15. Mongo ordering | Persisted positions and legacy activity migration; mocked restart test. Live MongoDB connectivity remains unverified. |

Constraints: app-owned auth, server-only Supabase, finite retries, stable IDs, current-revision grading, no live classroom mutation tests. Do not reset migrations. All applied migration versions must match committed history deliberately. No secrets or raw private snapshots in logs/artifacts.

## Verification

- **98/98 tests passed on Node 24.22.0**, including SQL/API, concurrency, save recovery, authorization, grading and exports.
- **6/6 final browser checks passed** using installed Edge headless at desktop 1440×900 and mobile 390×844; fake isolated classroom only. Final TypeScript/Vite production build passed. Isolated clean-install dry run passed without changing installed dependencies.
- All six migrations executed in PGlite 0.5.10 / PostgreSQL 18.6. Hosted database uses PostgreSQL 17.11; PGlite's single connection does not prove physical multi-connection load capacity.
- Hosted migration `20261015122901_reliability_payloads` applied after backup and isolated checks. Full before/after document checksums matched across all five collections: 42 users, 2 labs, 6 submissions, 25 activity entries and 5 sessions. No live classroom mutation tests.
- After migration: revision 109, six private payload rows and zero browser table grants. PostgreSQL JSONB sizes: full read 241,548 bytes; compact read 230,136 bytes for this small classroom. These are server-side sizes, not network benchmarks. Savings grow with project bytes; lab instruction attachments remain in metadata.
- No performance advisor notices. Four informational RLS-without-policy notices are expected for private server-only tables; [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Dependency audit: no high/critical issues; one moderate `sprintf-js` advisory affects three transitive packages through Mammoth's CLI dependency. The app uses Mammoth's extraction API; no safe upstream fix available at inspection. No forced breaking upgrade.

## Backup activation and remaining release work

Owner approved the existing GitHub repository for daily encrypted copies. Published only the backup tool/schedule in `a10487a` and isolated existing-lock metadata repair in `467d561`. Three private repository secrets hold configuration; values were never committed or logged. Schedule: **01:15 Pakistan time daily**, 30-day encrypted artifact retention. GitHub schedules are best effort and require Actions to remain enabled.

The first job failed at dependency installation, before exporting classroom data. The repaired [backup run 38741952690](https://github.com/muhammadsaad9316/Mehran-Saib/actions/runs/38741952690) **succeeded**. Its encrypted artifact was downloaded into ignored private storage and authenticated/decrypted using the retained local key: 42 accounts, 2 labs, 6 submissions and no sessions. Off-site creation and retrieval are verified; the earlier isolated restore/API drill also passed.

Application release `74c7e844f962f2e39242fa01976e5c1e9bb06867` passed [GitHub Verify 38744512767](https://github.com/muhammadsaad9316/Mehran-Saib/actions/runs/38744512767): clean installs, all 98 tests and builds on Linux/Windows with Node 24; all six Chromium browser checks on Linux; no high/critical runtime audit findings. The exact checked commit was promoted to main. Production deployment `dpl_AiPnoYeYVtj1LVnzbPMF1puYHEJw` is READY and aliased to [LabTrack](https://labtrack-lilac.vercel.app). Its production build passed; the upload manifest contained no private files (only empty ignored-directory entries).

Eight live HTTP checks passed: health, anonymous state, a shaped invalid-session state request that exercises database loading, unsigned report rejection, disabled demo rejection, foreign-origin login rejection, homepage and the deployed main bundle. Every API response had a request ID. Both public state responses contained no user/classroom arrays and no-store headers. The live database-backed state request took 1,242 ms in this single observation; this is not a percentile or load benchmark. The verified deployed bundle was `/assets/index-CRaum4xi.js`. Full collection checksums/counts after deployment and checks still match the pre-migration baseline. No real credential login/upload/grading test was performed against production; those flows were exercised on isolated data. Keep `.data/backup-key` separately in protected owner custody: losing it and the GitHub secret loses recovery access. Marks CSV is not a restore source. Daily backups can lose changes since the last successful run; 30-day artifacts are not indefinite retention.

Live Edge browser checks also passed at 1440×900 and 390×844: login controls visible, email-to-password Tab navigation works, no horizontal overflow and zero page errors. These checks did not sign in or submit classroom writes. Database revision remained **109** after verification.

Existing user edits were preserved. No classroom reset, password reset, browser database grant or paid provider upgrade. Identified code paths have regression coverage; no test suite can promise zero future errors.
