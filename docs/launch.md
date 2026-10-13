# LabTrack launch: Vercel + Node + Supabase

Current scope is **a local application with the hosted Supabase database**. Follow [the local Supabase guide](supabase-local.md). The LabTrack Supabase project exists and its private schema is applied and SQL-verified. An empty Vercel project is reserved; no application has been uploaded or publicly deployed. The remaining sections describe an optional separate-backend deployment, not the selected local setup. A future Vercel-only backend will need an adaptation and end-to-end verification.

## 1. Create the Supabase project

The dedicated **LabTrack** project is `akudfcgksdjlipxxwfdu` in the chosen organization. `supabase/migrations/001_labtrack.sql` has been applied through the connected migration tool. The two tables have RLS enabled with no browser access. Only the backend's secret key can call the read/write functions. Writes apply changed records atomically and reject stale revisions.

Copy the project URL and a server-only secret key into the Node hosting provider's secret settings as `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. A legacy `service_role` key is also accepted. Never put a database secret in Vercel's frontend variables, a `VITE_` variable, source control or chat. LabTrack keeps its existing roll-number login and server sessions; this integration uses Supabase as the database, not Supabase Auth. See [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys) and [database functions](https://supabase.com/docs/guides/database/functions).

## 2. Configure the Node service

Use a persistent Node web service with one instance. `render.yaml` defines a Render service named `labtrack-api`, binds to `0.0.0.0`, uses the platform's `PORT`, and checks `/api/health`. Review the hosting plan and its availability before activating it. The blueprint selects the free plan; it does not create a paid service.

Build command: `npm ci --include=dev && npm run build && npm prune --omit=dev`

Start command: `npm start`

Enter the backend settings from `.env.production.example`. `CLIENT_ORIGIN` must equal the final Vercel site origin, including `https://` and without a trailing slash. Set a real `ADMIN_EMAIL`, `ADMIN_NAME` and a unique `ADMIN_PASSWORD` of 12–256 characters. Initial teacher creation only happens in a fresh database. Demo access is disabled, and production refuses the existing demonstration database. Production also rejects an absent hosted database unless you explicitly configure a persistent local data directory. The `tsx` runtime is included in production dependencies. Shutdown waits for active HTTP requests and pending writes.

Do not import sample submission grades as real marks. After teacher setup, create real student accounts and publish the required labs using the attached original instructions. The image's name mapping is in `server/seed.ts`; blank names remain blank in exports. Supabase stores the same private records and uploaded file contents as the existing application. Large file-heavy courses will need a separate object-storage integration; this release is scoped to one class with 41 students.

The service configuration follows [Render's web-service requirements](https://render.com/docs/web-services) and [Node version settings](https://render.com/docs/node-version).

## 3. Configure Vercel

Set the Vercel build environment variable `LABTRACK_API_ORIGIN` to the Node service's HTTPS origin, for example `https://your-labtrack-api.onrender.com`. `vercel.mjs` refuses deployment when this value is missing, insecure, or contains credentials, paths or query parameters.

Vercel builds the Vite frontend into `dist`. `/api/*` is forwarded to the Node service before the SPA fallback; browser API calls remain relative to the frontend origin. API responses are not cached. Supabase secrets and administrator passwords belong only on the Node service. Configure the production frontend URL as `CLIENT_ORIGIN` on that service before signing in. Preview deployments with different origins require a separate backend configuration if you want to test authentication there.

This uses [Vercel programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts) and [external rewrites](https://vercel.com/docs/routing/rewrites).

## 4. Verify the actual deployment

Before distributing the public URL, verify `/api/health` through the Vercel origin, teacher sign-in/out, student roll-number login, a task upload and sandbox preview, saved and published grades, resubmission, and the CSV/print sheet. Confirm that anonymous requests cannot see the roster or submissions and that records survive a backend restart. Check Supabase's Security Advisor after applying the migration.

Local verification covers the API, file limits, parser checks, production cookies, Vercel route configuration and the Supabase adapter protocol. Real Supabase SQL execution, class account creation and local teacher/student authentication are verified. The local API uses the key supplied in the private `.env`; the teacher sees all 41 students and both draft labs. Teacher/student credentials are prepared in private local files. Public hosted end-to-end behavior has not been verified. The application keeps an in-memory snapshot; use one backend instance and restart/review the store when changing database records manually.

The dependency review upgraded `adm-zip` to 0.6.1. npm still reports moderate advisories in Mammoth's command-line `argparse`/`sprintf-js` dependency chain. The API calls Mammoth's extraction library directly and never runs that CLI. Do not run the Mammoth CLI on untrusted arguments; follow its upstream fixes before enabling CLI use.
