# LabTrack on Vercel + Supabase

The production site is https://labtrack-lilac.vercel.app. Vercel hosts the React frontend and the Express API in one project. Supabase stores the existing classroom records. Render is not required; no Render service was created.

## Deployment

Use the existing Vercel `labtrack` project with Node 24. Its production settings contain `SUPABASE_URL` and the sensitive, server-only `SUPABASE_SECRET_KEY`. Never prefix the key with `VITE_`, commit it, or place it in client code. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only needed when initializing an empty database; the current class already has accounts.

`vercel.mjs` builds `dist`, routes `/api/*` to `api/index.ts` before the SPA fallback, disables API caching, and places the function in Mumbai near the database. The GitHub repository is connected for future deployments from `main`. If a CLI upload encounters network errors, use `vercel deploy --prod --yes --archive=tgz`.

Apply the committed Supabase migrations before deploying a new database. Keep RLS enabled and the RPC functions restricted to `service_role`. Login attempts are limited in the database across server instances. Browser roles intentionally have no access to these tables or functions.

## Serverless persistence

Each request loads its own current database snapshot, including when Vercel reuses a warm instance. Saves use an atomic revision check. A conflict reloads current records and re-runs the mutation and its validation, with at most eight attempts. Lab edits reject a changed lab, and grades reject a resubmitted revision. There is no unbounded retry loop.

JSON responses are streamed in chunks. Student project uploads allow 60 files, 1 MB per source file, and 4 MB total uploaded/extracted content. Instruction documents allow 3 MB so base64 JSON fits Vercel's request limit. Larger courses will need separate object storage and more selective database reads to stay within free usage quotas.

## Verification

Production health and anonymous state return uncached JSON. Teacher and student sign-in/out, secure HttpOnly cookies, private roster access, foreign-origin rejection, and disabled demo access are verified against the public site. The request handler also has an isolated automated upload, grading and persistence test; concurrent-save and bounded-retry tests protect against lost writes. Real classroom submissions and grades are not modified for deployment tests.

The log-storm repair uses SQLSTATE `PT409` for stale revisions instead of `40001`, which caused PostgREST to retry indefinitely. It is applied to the hosted database and retained in the migration history.

Vercel Hobby and Supabase Free still have usage limits. No paid upgrade or Render billing setup was used. Check provider usage before expanding beyond the current class.
