# Local application with hosted Supabase

This guide connects the local React/Express app to the existing [LabTrack project](https://supabase.com/dashboard/project/akudfcgksdjlipxxwfdu). The frontend runs at [http://127.0.0.1:5173](http://127.0.0.1:5173) and proxies `/api` to Node on 3001. The database is hosted; this is not a local Docker Supabase setup.

For an isolated demo or a new database, use [getting started](getting-started.md). For schema, functions and history, use [Supabase](supabase.md).

## Connect a checkout

Preserve an existing root `.env`. Otherwise create one using `.env.supabase.example` as a template, then enter the server-only key privately:

```dotenv
HOST=127.0.0.1
PORT=3001
CLIENT_ORIGIN=http://127.0.0.1:5173
LABTRACK_DEMO=false
SUPABASE_URL=https://akudfcgksdjlipxxwfdu.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET
```

Use an `sb_secret_...` key from the project's API key settings; the adapter also supports a legacy service-role JWT. Never use a publishable key, put this secret in a `VITE_` variable, commit it or paste it into a prompt. See [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

Omit MongoDB settings. Existing accounts require their existing passwords; `ADMIN_*` is only for initializing an empty database. A new checkout does not include the ignored credentials CSV. Request the existing private sheet through the owner's normal secure process; do not regenerate credentials to recover it.

```powershell
npm ci
npm run dev
```

Sign in manually as the existing teacher or a student using roll number/email. The application uses its own accounts and cookies, so an empty Supabase Auth Users page is expected.

## Development behavior

Saving `.env` restarts Node automatically. If the URL is present and the key is missing, a development-only HTTP 503 explains the missing setting. Save the correct key then use Try again. Empty proxy gateway errors briefly retry reads during restarts; writes and JSON API errors are not replayed.

Persistent startup retries its initial Supabase read up to three times for connection/timeout failures or HTTP 502/503/504, within one 45-second deadline. Each request still has a 15-second timeout; retries wait roughly 0.5 then 1 second, plus up to 0.25 seconds of jitter. Terminal warnings show only a safe error category. The API starts when that read succeeds, without requiring a file edit. If the attempts/deadline are exhausted, restore connectivity and restart `npm run dev` (or the persistent API); the browser's Try again button cannot restart a failed process. Invalid configuration, denied credentials, missing migrations and malformed data fail immediately. These retries do not apply to writes, conflict reloads or Vercel requests.

The persistent Node API holds a working snapshot. Restart after manual/external database changes; its Supabase mode does not refresh before every request. Changes are atomic and revision-checked. A conflict reloads and returns 409; refresh the UI and review before saving again.

Demo `.data/labtrack.json` is separate and never copied into Supabase. It is retained on disk if it already exists. Do not enable demo mode against the real project. Uploads and attachments consume database space; [analysis](analysis.md) documents limits and preview behavior.

## Schema and class setup status

Read-only checks on **13 October 2026** confirmed all five hosted migrations, RLS on the three tables, denied browser reads/function execution and permitted server access. `labtrack_records` stores collection documents, `labtrack_meta` stores global revision and `labtrack_login_limits` stores serverless login budgets. All persistence/limiter functions are security invoker and server-restricted.

The initial class bootstrap created one teacher, 41 roll-number students and two draft labs with three tasks each and original attachments, without demo submissions/grades. That is a historical setup description: the class now has saved work, and records continue to change. Do not overwrite it with a seed. Consult aggregate SQL in [supabase.md](supabase.md) for current metadata without exposing documents.

`npm run prepare:class` reuses credentials if their private JSON exists, regenerates the CSV and writes teacher admin settings to `.env`. If the JSON is missing it creates new credentials. `npm run provision:class` also prepares files before checking/adding missing hosted accounts, refusing conflicting existing passwords. These commands have side effects and are unnecessary for routine startup. Keep both credential files protected.

## Connection verification

In normal read-only work check login/logout and expected role-filtered state. For persistence/upload/grading tests use an isolated environment rather than real classroom records. Verify source/images, sandbox preview, draft privacy, stale grade handling and CSV/print as described in [operations](operations.md).

Earlier project notes recorded successful local Supabase-backed teacher/student sign-in and visibility of the 41-student roster/two labs. The documentation review rechecked schema permissions/history, not real account sign-in or mutation workflows. The [deployment guide](launch.md) records production configuration separately.
