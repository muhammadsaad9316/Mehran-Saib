# Backend guide

The Express 5 API in [server/app.ts](../server/app.ts) owns authentication, authorization, validation and all classroom writes. Public browser shapes live in [shared/types.ts](../shared/types.ts); private persisted shapes live in [server/store.ts](../server/store.ts). See [API reference](api.md) for every route and payload.

## Startup and lifecycle

`createApp(options)` is asynchronous and does not listen. It selects the provider, opens a store, initializes an empty database if necessary, applies roster compatibility logic, installs middleware/routes and returns Express. `app.locals.store` exposes the opened store; callers must close it when finished.

- [server/index.ts](../server/index.ts) loads root `.env`, listens on `HOST`/`PORT`, and closes the listener/store on SIGINT/SIGTERM. It uses one persistent snapshot and serves `dist/` when built.
- [api/index.ts](../api/index.ts) is Vercel's handler. It disables the platform body parser, requires Supabase variables, handles inexpensive early responses, then creates a production app/store for the request and closes it on finish/close.
- [server/analysis-demo.ts](../server/analysis-demo.ts) uses an explicitly separate local store/cookie and ignores hosted providers.

Production refuses demo access, a known seeded demo database, incomplete provider settings and implicit ephemeral JSON persistence. Empty non-demo databases require valid initial admin credentials. Bootstrap rechecks emptiness inside the retried mutation so concurrent first requests create one administrator. It is not a password-reset mechanism. Legacy roll numbers may be canonicalized on startup; demo-only name migration preserves later custom names.

Vercel health and anonymous-state responses avoid reads only after verifying that required environment variables exist. Signed request handling always loads/validates current database state, including session lookup. A 200 health response is liveness, not proof that Supabase is reachable.

## Middleware and trust boundaries

Middleware disables the Express signature, adds `nosniff`, `X-Frame-Options: DENY`, same-origin referrer policy and API `no-store`, parses JSON up to 8 MiB and reads cookies. Mutating API requests reject `Sec-Fetch-Site: cross-site` and foreign Origin values. The serving origin, explicitly trusted `CLIENT_ORIGIN` and loopback Vite development origin are the supported checks. Origin validation is separate from session/role authorization.

`actor(res, role?)` requires an active user and optionally the requested role. `accessibleSubmission` requires teacher access or student ownership in a currently published lab; hidden/foreign records appear as 404, including file and analysis URLs. Protect a new route on the server even when its button is teacher-only.

Unexpected errors get a generic 500; expected `HttpError` messages are returned as `{ error }`. Multer/JSON/body failures are mapped separately. Vercel startup/load failures produce generic 503. Never log request bodies, session cookies, database snapshots or secrets when diagnosing failures.

## Authentication

[server/auth.ts](../server/auth.ts) hashes passwords using scrypt with a random 16-byte salt and 64-byte derived key, stored as `salt:hexHash`. Verification uses a timing-safe comparison. No plaintext password is stored in user records. Private provisioning files do contain generated plaintext credentials and must remain ignored.

Login accepts email or canonical roll number. A successful login issues a random 32-byte hex token stored in the server session collection and a `labtrack_session` cookie with HttpOnly, SameSite=Strict, path `/`, seven-day lifetime and Secure in production. Tokens are opaque, not JWTs. Up to ten unexpired sessions per user are retained. Logout deletes the matching session and clears its cookie; it does not revoke every device.

Persistent servers limit failed attempts in a bounded in-memory map keyed by IP/identity: eight failures per 15 minutes. Vercel also invokes the Supabase limiter across instances: a SHA-256 bucket per registered user, with one shared bucket for unregistered identities. The database counts attempts before verification and clears the bucket on success. Do not claim persistent servers have shared distributed limiting.

There is no Supabase Auth, self-registration, email verification, password-reset UI or account deletion route. The teacher creates students; new passwords must be 12–256 characters. See [configuration](configuration.md) and [operations](operations.md) before changing credential workflows.

## Public/private projections

`publicUser` removes `passwordHash`. `publicSubmission` removes `binaryAssets`; for students it removes unpublished grades and reports the status as submitted. `/state` also restricts students to their own work and published labs; only teachers receive activity.

Source file text and instruction-file base64 are intentionally present in authorized state. Binary images are private in storage and downloaded through the ownership-checked file route. Do not return `store.data` directly from a new endpoint.

## Mutation discipline

`Store.mutate(change)` queues writes within a store, clones current records and runs the synchronous callback. It persists before publishing the clone as `store.data`. A failed write never commits its proposed in-memory state; the queue remains usable.

| Adapter | Reads | Writes / limits |
| --- | --- | --- |
| Supabase | RPC snapshot; conditional revision reads/cache in serverless mode | Changed documents/deletions in one versioned transaction |
| JSON | Private `labtrack.json` at startup | Temporary file then atomic rename; one process |
| MongoDB | Five collections at startup, `_id` mapped to application `id` | Changed/deleted records in a session transaction; Atlas/replica set needed; one process |

Only one hosted provider may be configured. No adapter performs automatic local-demo-to-hosted migration.

Supabase persistent stores use one write attempt. A stale global revision reloads the store and returns 409. Vercel stores use at most eight attempts: reload, clone and rerun validation with a short jittered wait. Make mutation callbacks replay-safe: no network calls, file writes, email, payments or other external side effects inside them. Generate needed hashes or immutable input outside the callback, and recheck mutable database constraints inside it.

Lab PATCH checks that the old lab still matches before replacing it. Uploads recheck publication/task existence and current submission inside the mutation. Grades recheck submission revision and current task maximum. Preserve those checks when refactoring. `SupabaseStorageLimitError` becomes HTTP 507; it is not retried.

The conditional cache is private and keyed by project plus a hash of its credential. It stores one snapshot up to 16 MiB and clones for each caller. It is a transfer optimization, not an alternative to the database revision check. Local/persistent snapshots require restart after out-of-process edits; local/MongoDB are not suitable for multiple independent writers.

## Domain rules

- Lab totals equal summed task maximums. Labs need 1–20 tasks; tasks can have up to 80 requirement rules.
- IDs must stay stable. Submitted tasks cannot be removed; maxima cannot drop below saved grades.
- Only students submit, and only to published tasks. Each student/task has one current project. New work replaces previous work and clears its grade.
- A grade includes the reviewed revision; stale work returns 409. Zero is valid; incomplete report totals remain blank.
- Activity is newest-first and capped at 100. It is a workflow feed, not an immutable audit log.
- Parser checks and comparisons are read-only and never change marks.

## Supporting modules

[uploads.ts](../server/uploads.ts) validates paths, ZIP expansion, formats and encoding. [analysis.ts](../server/analysis.ts) performs bounded HTML/CSS/JS parsing and comparisons. [instructions.ts](../server/instructions.ts) extracts instruction text and candidate rules without publishing. [marks-sheet.ts](../server/marks-sheet.ts) derives totals and escapes exports. [seed.ts](../server/seed.ts) provides sample data; [class-setup.ts](../server/class-setup.ts) is explicit provisioning, not normal startup.

Read [analysis](analysis.md) for parser budgets and [Supabase](supabase.md) for the database contract. JSONB provides structural constraints but email/roll uniqueness and domain relationships are validated by application code, so manual writes must respect them too.

## Verification

Integration tests create isolated apps/stores and close them through `app.locals.store.close()`. `app.test.ts` covers access boundaries, state filtering, lab validation, resubmission, revision grading, exports and persistence. `supabase.test.ts` covers diffs/cache/conflicts/failures; `serverless.test.ts` covers request-owned stores and early responses. Upload, analysis, instruction, report and provisioning suites cover their own boundaries.

Run `npm test` and `npm run build`. MongoDB connectivity, HTTPS proxies and live provider deployment require their own environment checks; mocked RPC tests do not verify them. See [operations](operations.md).
