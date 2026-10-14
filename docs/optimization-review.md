# Optimization and polish review — 13 October 2026

Reviewed the application for the current 41-student classroom, including concurrent Vercel requests. Changes retain the existing visual design, parser scores, human grading and server-only Supabase access.

## Improvements

| Change | Result |
| --- | --- |
| Request-local fingerprint summaries | Reuses merged maps/totals across pair comparisons instead of rebuilding for each pair |
| Lazy teacher/student portals | Login downloads neither role's portal; loading and failed-module recovery use existing styles |
| Remove unreferenced chart/Recharts | Removes dead component and 39 installed dependency packages |
| Published-lab ownership check | Students cannot retain file/analysis access after unpublishing; teachers retain access |
| Bootstrap check inside mutation | Concurrent first requests/retries create one initial administrator |
| ZIP central-directory error handling | Malformed archives return readable HTTP 400 instead of 500 |
| Shared asset loader | Individual review gains cancellation and visible failed-image feedback |
| Analysis/evidence fingerprints | Requirements edits and resubmissions cannot show old evidence |
| Grade/refresh states | Inputs lock while saving; saved-but-refresh-failed and stale-work errors stay distinct |
| Empty source handling | Valid empty files are no longer described as missing source |

## Measurements

A synthetic batch of 41 identical 44,641-character projects, within the 2M aggregate scan budget, creates 820 pairs. Three warmed iterations averaged **2,193 ms before** and **732 ms after**, about **67% less elapsed time**. All complete response hashes matched before/after. This is a local synthetic benchmark, not a production latency guarantee; larger batches still have quadratic pair counts.

The production build's initial JavaScript decreased from **395.45 kB / 112.23 kB gzip** to **316.02 kB / 94.55 kB gzip**: about 20% raw or 16% compressed reduction. Teacher/student modules load afterward when needed; total application code is split, not eliminated. Recharts was already unreferenced and not part of the original frontend bundle, so its removal saves dependency footprint rather than runtime bundle bytes.

## Verification

- Full `npm test`: **68 passed**, including new unpublished-work, concurrent-bootstrap, 41-student comparison and damaged-ZIP regressions.
- `npm run build`: strict TypeScript and Vite production build passed.
- Headless Chrome against an isolated local store: teacher desktop/mobile, student mobile and login mobile had no page-width overflow. Verified upload, sandbox preview, empty source, visible image-load error, disabled grading fields, saved grade with failed refresh, sign-out, deferred portal requests and failed-module reload recovery.
- No unexpected browser page errors during normal/error-state flows. Intentional module-fetch failure was handled by the recovery boundary.
- Independent code review traced changed UI/authorization/concurrency paths.
- Read-only Supabase Performance Advisor returned no findings. Security Advisor returned only the three intentional informational RLS-without-browser-policy notices, documented in [Supabase](supabase.md).

No production records, database schema, keys or deployment were changed. Live production credential workflows and MongoDB connectivity were not exercised.

## Remaining dependency advisory

`npm audit --omit=dev` reports three moderate package flags from one chain: Mammoth → argparse → sprintf-js. The [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) lists no patched version. The affected formatting module is used by Mammoth's CLI; loading the library used for DOCX extraction loads neither argparse nor sprintf-js. This bounds the observed application exposure but does not erase the dependency advisory.

No forced downgrade was applied: npm's proposed Mammoth downgrade would replace the working document-extraction API with an obsolete release. Recheck the dependency advisory when the maintainer publishes a compatible fix. Existing document parsing bounds and tests remain in place.
