# LabTrack repository guide for coding agents

## Context and navigation

Read `docs/README.md` and `docs/architecture.md` first, then the relevant guide and implementation. `docs/ai-development.md` contains a compact handoff and change map. These instructions apply throughout the repository; explicit user instructions determine task scope.

This is a React/TypeScript/Vite SPA with an Express API and private Supabase persistence. It uses app-owned accounts/sessions, not Supabase Auth. Browser calls go through `/api`; no Supabase key belongs in frontend code. JSON and MongoDB adapters remain supported. The documented production host is Vercel; `render.yaml` is an optional retained template.

## Source map

- `shared/types.ts`: public browser/API contract; `shared/roster.ts`: rolls 1–41 and ordering.
- `src/App.tsx`: state/auth/dialogs. Teacher/student portals and editor/review/checks/comparison contain UI workflows.
- `src/api.ts`: same-origin requests; `src/preview.ts`: submitted-code CSP/path transforms.
- `server/app.ts`: routes, validation, startup, roles/ownership and public projections.
- `server/auth.ts`: hashes/tokens; `server/store.ts`: private types and mutation queue.
- `server/supabase.ts`: RPCs, diffs, revision/cache/error handling.
- `server/uploads.ts`, `analysis.ts`, `instructions.ts`, `marks-sheet.ts`: domain services.
- `api/index.ts`: request-owned Vercel apps and inexpensive early responses.
- `supabase/migrations/`: committed SQL; read all versions before a schema change.

## Preserve these invariants

1. Authenticate and authorize on the server; UI role checks are insufficient. Students only access their own work/published labs and published grades.
2. Never expose password hashes, session records, server credentials or private binary base64 through public state. Source text/attachments are intentionally in authorized state.
3. Write through `Store.mutate`, not directly to its data. Callbacks can rerun on conflict: keep external side effects outside and mutable-record validation inside.
4. Keep lab/task/user IDs stable. Do not remove submitted tasks or lower maxima below saved marks.
5. Resubmission replaces current work, increments its revision and clears the grade. Saving marks requires that current revision and current maximum. Zero marks remain valid; incomplete export totals stay blank.
6. Similarity/requirements are advisory and never grade or detect AI authorship. Flags are strictly over the selected threshold and require comparable evidence in both projects.
7. Keep uploads bounded and paths safe. Submitted HTML runs only in opaque sandboxed iframes with existing CSP; do not add same-origin access or server execution.
8. Keep Supabase tables/RPCs private to the server role. No browser grants, disabled RLS, SECURITY DEFINER workaround or unbounded conflict retry.

## Runtime and schema details

`npm run dev` runs Vite on 5173 and Node on 3001. The dev proxy hard-codes API port 3001. `server/index.ts` loads root `.env`; the API does not load `.env.local`. `npm start` serves the existing `dist/`; build first.

Persistent Supabase servers refresh revisions before protected requests; JSON/MongoDB use one working snapshot. Vercel requires Supabase, checks revisions per request, has a private bounded metadata cache and retries mutations at most eight times within 45 seconds. Scoped SQL checks allow independent writes. Persistent conflicts reload and return 409 after one attempt. Backend `.js` import suffixes in TypeScript ESM are intentional.

The initial filename is reconciled as `20261012094828_labtrack_private_persistence.sql`; inspect hosted history before applying migrations. `20261015122901_reliability_payloads.sql` separates private project bytes and retains legacy RPCs. Use a new migration for new schema behavior. Never reset the classroom to resolve migration history.

## Data and tooling

Preserve user changes; inspect Git status before editing. Keep changes within the requested scope and existing design. Read every caller when changing shared contracts and update affected validation, UI, fixtures, tests and docs together.

Do not read/print private `.env`, credential sheets, backup contents, cookies or classroom records unless needed for the user's authorized task. Keep them out of code, chat logs and deployment archives. Test mutations on isolated data. `prepare:class` writes credentials and `.env`; `provision:class` targets the fixed live project and is not a verification command.

Use the installed lockfile/dependencies. There is no lint script. `npm run test:browser` uses isolated fake data; never target real records. Backup commands produce private files; never commit snapshots or keys. Do not add speculative abstractions, unrelated dependencies or absent features without task need.

## Verification and reporting

For behavior changes, run relevant existing tests and `npm run build`; run full `npm test` for cross-layer or security/persistence/grading changes. UI changes also need desktop/mobile and keyboard/browser checks when available. Documentation changes need working local links and source-backed claims.

Report actual checks and material limits. Mocked RPC tests do not prove live deployment/MongoDB connectivity. Historical audit and hosting observations must remain dated. Update the appropriate guide when routes, environment variables, persistence or workflows change.
