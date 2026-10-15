# AI coding-tool handoff

Give a new AI tool this repository and direct it to [AGENTS.md](../AGENTS.md), [the documentation index](README.md) and [architecture](architecture.md). Provide the specific requested change and target environment; do not include `.env`, credentials, session cookies, private backups or student source in a general prompt.

## Compact project context

```text
Project: LabTrack, a single-class Web Engineering lab app.
Frontend: React 19 + TypeScript + Vite 7, Tailwind 4/custom CSS.
Backend: Express 5 TypeScript executed with tsx; no compiled server build.
Contracts: shared/types.ts; private Database types in server/store.ts.
Auth: app-owned users, scrypt hashes, opaque HttpOnly session cookie.
Persistence: server-only Supabase REST RPCs; local JSON/MongoDB alternatives.
Production: documented Vercel site, API entry api/index.ts and vercel.mjs.
Supabase: compact JSONB metadata + private payloads; global revision/scoped guards; no browser DB/Auth client.
Writes: Store.mutate, atomic diff, replay validation on bounded conflicts.
Grading: explicit teacher action; draft privacy; current submission revision.
Uploads: static source/raster projects; private bytes; opaque iframe preview.
Analysis: parser checks/similarity evidence only, no AI detection or marks.
Limits: rolls 1–41; no multi-class tenancy, password reset or old revisions.
Checks: npm test, npm run build, npm run test:browser; isolated data for all mutations.
```

## Read by task

| Task | Read first |
| --- | --- |
| Screen/layout | `src/App.tsx`, affected portal/dialog, imported CSS, [frontend](frontend.md) |
| API change | `shared/types.ts`, `server/app.ts`, all frontend callers, [API](api.md) |
| Auth/privacy | `server/auth.ts`, public projections/actor/ownership in app, serverless entry, app tests |
| Data write/concurrency | `server/store.ts`, `server/supabase.ts`, relevant route mutation and Supabase tests |
| Supabase SQL | Every migration in order, remote history/grants when accessible, [Supabase](supabase.md) |
| Upload/preview | Upload parser/route, preview builder, both review components, asset hook and tests |
| Grading/report | Grade route, both forms, student progress, marks-sheet module/tests |
| Analysis | Analysis module/types, checks/comparison UI, original requirements and analysis tests |
| Provisioning | Class setup/seed/fixtures, private-file side effects and provisioning tests |
| Deploy | `api/index.ts`, `vercel.mjs`, ignores/env templates, [launch](launch.md) |

Search every caller before changing shared types/helpers. Backend `.js` import suffixes are intentional in TypeScript ESM. Keep neighboring import conventions. Do not add framework/SDK/state-library replacements just to follow a generic template.

## Common mistakes to prevent

- Adding a browser Supabase client or switching authentication to Supabase Auth without a deliberate migration. Existing records, cookies and authorization depend on app-owned accounts.
- Returning `store.data` and exposing hashes, sessions or private bytes. Use public/role-filtered projections.
- Mutating `store.data` directly, writing old snapshots on conflict, or adding infinite retries. Use replay-safe `Store.mutate` callbacks and recheck current constraints inside them.
- Confusing the global database revision with the submission revision used for grading.
- Recreating task IDs on lab edits, removing submitted tasks or lowering maxima below marks.
- Keeping a grade after resubmission or showing private drafts to students.
- Grading from parser/similarity percentages, adding AI detection or treating matching excerpts as a verdict.
- Running uploaded code on the server or adding `allow-same-origin` to its preview.
- Assuming `prepare:class` is read-only or `provision:class` supports arbitrary projects. Read the actual side effects and hard-coded target check.
- Treating the retained Render template as the active deployment, or replaying the reconciled initial migration against the existing database.
- Treating demo or historical audit data as the current live class state.

## Safe change workflow

1. Read Git status and applicable repository instructions. Identify source, callers, validation, tests and documentation affected by the requested behavior.
2. Choose isolated data for experiments. Read-only production metadata can establish schema; modifying live accounts/submissions is a separate operational action.
3. Make the smallest complete change in existing modules. Preserve trust boundaries and domain invariants.
4. Update the relevant tests for changed behavior and run appropriate checks. Run the full suite/build for cross-layer changes; browser-check UI changes when possible.
5. Update API/config/architecture notes if their contracts changed. State which checks passed and which environmental checks were unavailable.

Schema changes need a new tracked migration and remote-history review. The initial migration has an identifier mismatch documented in [supabase.md](supabase.md); never reset/reapply the existing database blindly.

## Suggested handoff prompt

```text
Read AGENTS.md, docs/README.md and docs/architecture.md first.
Implement: [specific behavior and acceptance criteria].
Use: [isolated local JSON / independent hosted project / approved existing setup].
Inspect actual implementation and all callers before changing contracts.
Preserve app-owned auth, role filtering, task IDs, revision-safe writes,
draft-grade privacy, grade clearing on resubmission and sandbox restrictions.
Do not use real classroom records for mutation tests.
Update affected docs and report the verification performed and its limits.
```

The guides capture the current design and known gaps. They do not authorize adding absent features or inventing live verification. When prose and code disagree, inspect code/tests and correct the documentation with the actual behavior.
