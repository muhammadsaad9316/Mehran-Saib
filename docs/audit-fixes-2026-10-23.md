# Web app audit fixes — 23 October 2026

All six findings were rechecked against the working tree. Sign-out clearing and feedback were already fixed by the preceding work and were verified again; the other five findings were reproduced or confirmed in source and addressed here. Existing unrelated working-tree changes were preserved.

| Finding | Resolution | Verification |
| --- | --- | --- |
| Newer grades overwritten by an older draft | Individual review and both comparison panes retain the grade timestamp belonging to the original draft. Only their own acknowledged save advances it. Conflicts require reopening the latest grade. | Another teacher save, another pane's refresh, repeated stale-save attempts and consecutive acknowledged saves on desktop/mobile. |
| Classroom data remains after sign-out | Successful logout immediately clears all authenticated state. Older state requests cannot restore it. A busy screen announces progress and prevents duplicate sign-outs; failed logout allows retry. | Teacher, student and setup sessions; failed subsequent state request, delayed old refresh and rejected logout on both viewports. |
| Accidental loss of lab edits | Changed drafts confirm on Escape, backdrop, Close, Cancel and workspace navigation; page exit warns. Saving blocks dismissal/navigation. | Every dismissal path, keep/discard, clean close, unload guard and delayed save on desktop/mobile. |
| Handouts inflate refreshes | Public state and lab-save responses expose only attachment name/type/SHA-256. Protected revision-checked downloads fetch bytes on demand. Supabase workspace reads project metadata before transfer; scoped writes preserve existing bytes. | Two 3 MiB handouts keep synthetic student state below 200,000 bytes. Exact downloads, hidden/stale access, attachment retention, idempotency and both SQL namespaces tested. Browser download contents verified. |
| Browser cleanup hangs | Playwright global setup owns the fixture server in its own process and returns explicit connection/listener/store/temp-directory teardown. | Normal full 52-case run exits successfully; immediate second normal run starts and exits successfully. |
| Initial downloads too large | Review and LabEditor load only when opened. Review's stylesheet loads with Review; current-dialog focus and source-ready preview rendering remain functional. | Production build measurements, login asset requests and complete desktop/mobile preview, keyboard and grading flows. |

## Measurements and checks

- `npm test`: **137 passed**, no skipped or failed tests.
- `npm run build`: TypeScript and Vite passed.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:browser`: **52 passed**, normal cleanup/exit in 2.1 minutes.
- Immediate repeat of the deferred-asset browser checks: **2 passed**, normal exit in 3.3 seconds.
- Initial entry JavaScript + CSS: **137,551 → 117,766 bytes gzip**, a **14.4% reduction**, excluding fonts and later role/dialog chunks. Current raw entry assets are 283,229 bytes JS and 151,590 bytes CSS.
- Runtime: local Windows, Node 26.3.0, installed Edge; desktop 1440×900 and mobile/touch 390×844. SQL runs use isolated PGlite with synthetic records; this does not establish live MongoDB connectivity or Node 24/CI behavior.

## Hosted migration and release

[20261024105836_compact_lab_instructions.sql](../supabase/migrations/20261024105836_compact_lab_instructions.sql) is required before deploying the updated app. It adds private workspace/instruction reads for classroom and demo, retains legacy reads/full backups, preserves attachment bytes during metadata edits, and invalidates metadata caches by advancing workspace revisions. Existing hosted scoped-write definitions matched the locally tested baseline. Isolated SQL tests verified preservation, conflicts, invoker security and denied browser execution.

Automatic approval review rejected applying this migration to the hosted project because production schema/revision changes need explicit authorization. The migration remains local and ready; no hosted schema or classroom records were changed. Application code was not deployed. Approve the hosted migration before releasing code that calls the new RPCs.

## Authorized release update — 24 October 2026

The owner authorized pushing the verified updates while preserving classroom data. This supersedes the pending-migration status above. After a verified encrypted backup, the compact-instructions migration and [checksum-reuse migration](../supabase/migrations/20261024105858_reuse_handout_checksums.sql) were applied with transactional data-preservation guards. Local filenames now match the actual hosted versions. All 13 before/after record, payload and login-limit fingerprints matched, including every saved classroom submission, grade and private project payload. Account and session records were unchanged. No real submission or grade was used as a mutation test.

The release also fixes unavailable/incomparable similarity labels, defers portal CSS until sign-in and reuses validated handout checksums with legacy fallback. Initial CSS decreased from 151.6 kB to 72.6 kB; computed styles matched across 12 desktop/mobile screen states. Compatible runtime patches update body-parser to 2.4.0, Multer to 2.5.0 and Undici to 7.30.1. The full 138-test suite, production build and all 58 desktop/mobile Edge browser checks passed on Node 24.22.0. The production dependency audit reported zero vulnerabilities. Private environment files, encrypted backups and generated video output are excluded from the release.
