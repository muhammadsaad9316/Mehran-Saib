# Configuration reference

The persistent entrypoint [server/index.ts](../server/index.ts) loads the root `.env` with `process.loadEnvFile`. It does not load `.env.local` as backend configuration. Vite separately handles its frontend environment conventions; there are no required browser `VITE_*` settings. Vercel supplies server variables through project settings.

Never prefix a Supabase secret with `VITE_`, embed it in React, commit private environment files or include them in source archives. A server secret has elevated database access; see [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

## Variables

| Variable | Default / purpose | Required when |
| --- | --- | --- |
| `NODE_ENV` | Non-production unless exactly `production`; controls demo defaults and Secure cookies | Production persistent server |
| `HOST` | `127.0.0.1`; listener binding | Set `0.0.0.0` for an externally hosted persistent server |
| `PORT` | `3001` | Change only with dev proxy alignment |
| `LABTRACK_DEMO` | Enabled in development unless exactly `false`; disabled by production | Set `false` for all real data |
| `LABTRACK_DATA_DIR` | Root `.data`; private JSON directory | Production JSON requires an explicitly persistent path |
| `MONGODB_URI` | Absent; MongoDB adapter | MongoDB, with transactions/replica set |
| `SUPABASE_URL` | Absent; HTTPS project origin without path/query/credentials | Supabase and Vercel |
| `SUPABASE_SECRET_KEY` | Absent; server `sb_secret_...`, or supported legacy service-role JWT | Supabase and Vercel |
| `LABTRACK_BACKUP_KEY` | Optional base64-encoded 32-byte AES key; otherwise backup CLI retains `.data/backup-key` | Required in GitHub backup secrets; retain separately for recovery |
| `LABTRACK_READINESS_TOKEN` | Optional private random token, at least 32 characters | Vercel monitor access to `/api/ready` with `X-Readiness-Token`; teacher-session access otherwise |
| `CLIENT_ORIGIN` | Absent; extra trusted mutation origin | Only if required by a deliberately configured frontend setup |
| `ADMIN_EMAIL` | None | First startup with empty, non-demo database |
| `ADMIN_PASSWORD` | None; 12–256 characters | First startup with empty, non-demo database |
| `ADMIN_NAME` | `Teacher` in app bootstrap | Optional initial teacher label |

`ADMIN_*` only initializes an empty database. Changing these values does not reset existing credentials. `prepare:class` has its own credential-file behavior and default name/email; see [getting started](getting-started.md).

## Templates and modes

| File/mode | Notes |
| --- | --- |
| [.env.example](../.env.example) | Local JSON demo defaults; commented provider/production options |
| [.env.supabase.example](../.env.supabase.example) | Local API with the fixed hosted project and demo disabled |
| [.env.production.example](../.env.production.example) | Vercel server URL/key placeholders; demo disabled |
| Local Supabase | Non-production HTTP; real data and `LABTRACK_DEMO=false` |
| Persistent production | `NODE_ENV=production`, demo false, one durable provider, HTTPS |
| Vercel | Handler explicitly passes production=true, demo=false, serverless=true; requires Supabase |

Do not configure MongoDB and Supabase simultaneously. Both Supabase settings must exist together. A configured URL with no key gives a development-only setup response; other mismatches fail startup. A fresh real store needs initial admin settings. Production refuses the known seeded demo teacher identity.

`CLIENT_ORIGIN` does not add CORS headers or change SameSite=Strict cookies. The supported browser arrangement uses the same origin through the development proxy or production rewrites.

## `createApp` options

Tests and entrypoints may pass `AppOptions` instead of environment values: `dataDir`, `mongoUri`, `supabaseUrl`, `supabaseKey`, `demo`, `production`, `clientOrigin`, `adminEmail`, `adminPassword`, `adminName`, `sessionCookieName`, `serverless`. Most settings use explicit options before environment fallback; inspect `server/app.ts` for each expression rather than assuming every blank string behaves the same.

`serverless=true` enables trust-proxy mode, streamed JSON, database login limiting and at most eight write attempts in 45 seconds. Both persistent and serverless Supabase use a bounded private metadata cache and revision checks before protected requests. It is used with Supabase by `api/index.ts`. The analysis demo explicitly disables both hosted adapters and selects `labtrack_analysis_demo` as its cookie name.

## Tooling settings

`vite.config.ts` binds development to port 5173 with `strictPort=true` and always proxies to `http://127.0.0.1:3001`. Its filesystem deny list protects private environment/data paths. `tsconfig.json` checks `src`, `server`, `shared`, `api` and Vite config with strict typing, ES2022 and bundler resolution. Backend TypeScript runs through `tsx`; the build does not produce a compiled server directory.

`.gitignore` and `.vercelignore` exclude local credentials/data and generated files. Check both when packaging. There is no committed `supabase/config.toml` or complete local Docker Supabase setup; the documented Supabase developer path is a local API with a hosted database.
