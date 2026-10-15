# Deployment: Vercel and Supabase

The documented production site is [labtrack-lilac.vercel.app](https://labtrack-lilac.vercel.app). Vercel hosts the React bundle and Express handler; Supabase stores the classroom. Existing notes record the Vercel `labtrack` project with Node 24 and GitHub `main` integration. This documentation review did not change deployment settings or publish a release.

## Configuration in the repository

[vercel.mjs](../vercel.mjs) exports the deployment config:

- Build: `npm run build`; frontend output: `dist`; framework: Vite.
- Function: `api/index.ts`, maximum duration 60 seconds, region `bom1` (Mumbai).
- `/api/:path*` rewrites to `/api/index` before the SPA fallback to `/index.html`.
- API caching is disabled. Global headers include nosniff, frame denial, same-origin referrer policy and restricted camera/microphone/geolocation permissions.

[api/index.ts](../api/index.ts) disables platform body parsing so Express/Multer receive raw requests. Required server settings are `SUPABASE_URL` and sensitive `SUPABASE_SECRET_KEY`. The handler explicitly enables production/serverless behavior and disables demo mode. `.env.production.example` records variable names, not secrets. Admin variables are needed only to initialize an empty non-demo database; they do not reset existing passwords.

The frontend uses relative `/api` requests and same-origin cookies. There is no separate publicly exposed backend URL or browser Supabase secret. [Configuration](configuration.md) covers environment loading and cookies.

## Release sequence

1. Review changes and affected tests locally. Run `npm ci` when dependencies need installation, `npm test` and `npm run build`.
2. Review SQL history if database contracts changed. Apply only required new migrations and verify grants/RLS before releasing a backend that calls new RPCs. The initial filename now matches hosted history. The compatible payload/scoped-write migration is already applied to the existing project; inspect [supabase.md](supabase.md) before any push.
3. Confirm the intended Vercel project, runtime, build output, API rewrite and server environment. Exclude private data/environment/credentials via `.vercelignore`; do not upload private backup files.
4. Deploy through the configured project's normal release process. The earlier CLI fallback `vercel deploy --prod --yes --archive=tgz` is an actual production release, not a dry run; inspect the installed CLI help and project selection before use.
5. Verify health and anonymous state, then normal role-filtered sign-in/out without modifying real submissions. Exercise upload/grading with isolated staging data for a full smoke check. Review failures and request duration.

The prepared `.github/workflows/verify.yml` runs Node 24 tests/build on Linux and Windows, browser checks on Linux and a high/critical runtime audit. It becomes active when published. The separately published daily backup workflow is tracked in [reliability progress](reliability-progress.md). A successful build is not proof that production environment variables or migrations exist.

## Serverless behavior

Each authenticated invocation owns its app/store and current database revision. A private warm-instance cache can reuse unchanged records after a revision check. Health, unsigned state and unsigned protected requests avoid record reads after checking configuration. Failed database connections do not use stale data.

Writes lock global metadata, compare touched records and user/lab dependencies when the revision changed, save a diff and advance it. Unrelated writes can proceed without a conflict. Conflicts reload and rerun current validation for at most eight attempts. Lab edits reject changed labs; grades reject resubmitted revisions. SQL uses `PT409` for conflicts; do not restore the legacy `40001` retry behavior.

JSON responses are streamed in 64 KiB chunks. Application budgets remain 60 project files, 1 MiB per source file, 4 MiB combined extracted project content, and 3 MiB decoded instruction attachments. Platform request/duration/usage limits are independent; verify current provider limits before increasing budgets.

## Persistent-server alternative

`npm run build` then `npm start` serves frontend/API in one Node process. Set `NODE_ENV=production`, `HOST=0.0.0.0`, demo false, a durable provider and HTTPS at the serving proxy. Supabase, transactional MongoDB or explicitly persistent JSON are supported in this mode. Supabase checks revision before protected requests/login; JSON/MongoDB still require one persistent working snapshot. This differs from Vercel's request-owned lifecycle.

[render.yaml](../render.yaml) is a retained optional web-service template; Render is not the documented active host. Deploying it is a separate choice, and reverse-proxy/cookie behavior needs verification in that environment. Do not assume local JSON survives an ephemeral service filesystem.

## Verification and rollback scope

Earlier deployment notes recorded production health/state, teacher/student login/logout, Secure HttpOnly cookies, roster privacy, foreign-origin rejection and disabled demo access. Automated tests cover rewrite ordering, request-owned stores, bounded concurrent writes and an isolated upload/grading flow. This documentation task checked source/tests and read-only Supabase metadata; it did not re-run live credential workflows or deploy.

For a faulty release, select the known-good application deployment through the hosting project's rollback process. App rollback does not undo SQL or restore data. Preserve a backup and maintain compatible database contracts for rollback; plan a controlled data/schema recovery separately if necessary. See [operations](operations.md).

The [free-tier audit](free-tier-audit.md) contains dated measurements and safeguards. Provider allowances/log billing can change; use current dashboards/docs, rather than assuming the historical counter will decrease or the current architecture has unlimited capacity.
