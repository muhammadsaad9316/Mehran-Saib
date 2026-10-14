# Getting started

Use Node.js 22 or newer and npm. Deployment notes select Node 24. Commands below run from the repository root in PowerShell.

```powershell
npm ci
```

This installs the lockfile versions for both frontend and backend. Preserve an existing `.env`; it may point at the real classroom. Do not print it into logs or paste it into an AI prompt.

## Choose an environment

| Mode | Use | Data |
| --- | --- | --- |
| Local JSON demo | Learn without hosted credentials | `.data/labtrack.json` or another `LABTRACK_DATA_DIR` |
| Local API + hosted Supabase | Work with a configured class | Project in `.env` |
| Fresh real database | Independent class environment | Empty hosted database or persistent directory |
| Analysis demo | Explore matching examples | `.data/analysis-demo`, isolated from hosted providers |

## A. Isolated demo

Create `.env` only when it does not exist:

```powershell
if (!(Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

Check privately that `LABTRACK_DEMO=true` and Supabase settings/`MONGODB_URI` are absent. Shell environment variables also affect startup, so remove hosted settings there for an isolated demo. Select a different private `LABTRACK_DATA_DIR` if you need to preserve an existing local store.

```powershell
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite serves the frontend and proxies the API to Node on port 3001. An empty demo store gets a teacher, 41 students, labs and illustrative submissions. The frontend automatically enters the teacher demo; use the demo switch for students.

Sample login: `teacher@labtrack.edu`, or student roll `1`, with `LabTrack2026!`. Demo shortcuts require loopback development. The seeded database is rejected in production.

## B. Existing hosted classroom

Follow [supabase-local.md](supabase-local.md). For a new checkout use `.env.supabase.example` as a template, supply the server key privately and set `LABTRACK_DEMO=false`. Preserve an existing `.env`. `ADMIN_*` does not reset existing accounts.

Obtain login details from the project owner. `.data/class-credentials.csv` is local and ignored; cloning does not provide it. Do not regenerate credentials to replace a missing sheet.

Run `npm run dev` and sign in manually. Saving `.env` restarts the API. A missing local Supabase key produces HTTP 503 with a setup message. This mode can modify real class data; use an isolated environment for experiments.

## C. Fresh real environment

1. Select a fresh persistent destination. For Supabase use an independent project and apply **all** SQL files in the order in [supabase.md](supabase.md).
2. Set `LABTRACK_DEMO=false` and configure one provider: Supabase URL/key, MongoDB URI, or a private JSON data directory.
3. Set `ADMIN_EMAIL`, optional `ADMIN_NAME`, and a unique `ADMIN_PASSWORD` of 12–256 characters before first startup.
4. Run `npm run dev`. An empty database gets one teacher, without demo labs, students or submissions. Add students and labs through the UI.
5. Review marks, rules and deadlines before publishing.

Leave `NODE_ENV` in development for local HTTP cookies. Production uses `NODE_ENV=production` and HTTPS for Secure cookies.

The class CLI in `server/class-setup.ts` only permits provisioning against `https://akudfcgksdjlipxxwfdu.supabase.co`; it is not a generic bootstrap for a new project. Use the UI for a new project, or deliberately adapt and test the CLI if a full-roster bootstrap is required.

## Class credential commands

| Command | Side effects |
| --- | --- |
| `npm run prepare:class` | Creates/reuses `.data/class-credentials.json`, rewrites its CSV, and writes teacher `ADMIN_EMAIL`/`ADMIN_PASSWORD` into `.env`; no database write |
| `npm run provision:class` | Prepares credentials, then adds missing accounts to the fixed Supabase project; adds two draft labs only if the database has no labs |

Preparation generates passwords only when the credential JSON is missing. Provisioning verifies existing credentials and refuses conflicts. Keep the matching JSON and CSV; deleting the JSON can generate incompatible passwords. These commands are not needed for normal startup and import no demo submissions or marks.

## Built app and analysis demo

```powershell
npm run build
npm start
```

Open [http://127.0.0.1:3001](http://127.0.0.1:3001). `npm start` does not build first; frontend source changes require another build.

After building, run `npm run demo:analysis` and open [http://127.0.0.1:3012](http://127.0.0.1:3012). Check tasks → Lab 1/Lab 2 → Task 1 shows matching rolls 1/2/3, a larger independent project for roll 4, missing roll 5 and broken syntax for roll 6. This command explicitly disables hosted adapters, uses a separate cookie and does not load `.env`.

## First verification

Run `npm test` and `npm run build`. In an isolated environment check login/logout, draft/published labs, upload, preview/source, draft/published feedback, resubmission and exports. Resubmission must clear its grade; records must survive restart. See [operations](operations.md) for test coverage and troubleshooting.
