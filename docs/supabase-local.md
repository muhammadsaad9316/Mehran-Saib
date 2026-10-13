# Local LabTrack with Supabase

The application runs at `http://127.0.0.1:5173`; its Node API runs on localhost port 3001. The private database is the existing [LabTrack Supabase project](https://supabase.com/dashboard/project/akudfcgksdjlipxxwfdu). The public site is https://labtrack-lilac.vercel.app; this guide covers local development.

## Database setup completed

The `labtrack_private_persistence` migration has been applied to the hosted project. In Supabase's Table Editor, choose the `public` schema:

- `labtrack_records` stores users, labs, submissions, activity and sessions. The `collection` column identifies the record type; `document` contains its private data.
- `labtrack_meta` stores the current revision.
- `labtrack_read` and `labtrack_write` read records and save changed records in an atomic transaction. Stale writes are rejected instead of overwriting someone else's change.

Both tables have RLS enabled. Anonymous and Supabase-authenticated browser roles have no table or function access; only the Node server's secret key can use them. The Security Advisor reports informational “RLS Enabled No Policy” notices because this access model intentionally denies browser clients. [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Real SQL verification checked the read/write functions using `service_role`, revision advancement, stale-write rejection, and role grants. The write test ran in a transaction that was rolled back; no test records or grades remain.

Class setup is also completed: **1 teacher, 41 students with roll numbers 1–41, and Lab 1/Lab 2 as drafts**, each with three tasks and its original instruction document. Names come from the supplied marks-sheet image; unnamed rows remain blank. No sample submissions or grades were imported. All 42 accounts store salted scrypt password hashes; plaintext passwords are absent from the database.

LabTrack uses its own teacher/student accounts and secure server sessions. The Supabase Auth Users page remains empty because this application does not use Supabase Auth.

## Connect the local application

The ignored `.env` file contains the correct project URL, `LABTRACK_DEMO=false`, the generated teacher login, and the locally supplied secret key. **The local application connection is verified:** admin/student login succeeded through the Vite API proxy, and the teacher account sees all 41 students and both labs. For a fresh setup, enter a server-only key locally:

```dotenv
SUPABASE_SECRET_KEY=your-server-only-secret-key
```

Get the secret key from the project's API Keys settings. A legacy `service_role` key is also accepted. Never use a publishable key here, put the secret in a `VITE_` variable, commit `.env`, or paste credentials into chat. [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

Run `npm run dev` after saving the file. Teacher credentials and each student's unique password are in the private, ignored `.data/class-credentials.csv`; students sign in using their roll number. Review the draft lab deadlines and marks before publishing. The local `.data/labtrack.json` demo file is preserved and is not copied into the hosted database. The image's name mapping remains available in `server/seed.ts`.

During development, saving `.env` automatically restarts the API. If the secret key is blank, the API stays available and returns a clear setup message with HTTP 503 instead of leaving Vite to report a generic proxy 500. Read requests retry briefly if the proxy returns an empty gateway error during a restart; writes and real API errors are not replayed. Fill in the key, save, then use **Try again** in the browser. This setup response is development-only; production continues to reject incomplete database settings.

`npm run prepare:class` reopens the existing local credentials without generating new passwords. `npm run provision:class` can check/provision the class once the key is configured; it refuses to reset conflicting existing credentials and preserves saved work. The private JSON/CSV credential files are excluded from source archives and deployment uploads.

The backend is one local Node process. Records persist in Supabase across restarts. Restart it after manual database changes, since it holds a working snapshot in memory. File upload limits are 60 files, 1 MB per source file and 4 MB total uploaded/extracted project content. Original instruction documents may be up to 3 MB.

## Final connection check

After entering the local settings, verify teacher sign-in/out, create a real lab or student, restart the Node process, and confirm that the record remains in both the portal and `labtrack_records`. Check task upload, sandboxed preview, grading and the per-lab CSV/print sheet before using it for the class.

The Vercel serverless deployment is implemented and live. See [deployment details](launch.md) for its verified behavior, secret settings and usage limits.
