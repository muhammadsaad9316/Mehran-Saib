# Public demo on the existing website

The public demo uses the normal login page on [labtrack-lilac.vercel.app](https://labtrack-lilac.vercel.app). It shares the existing Supabase project but has independent private tables, RPCs, accounts, sessions, login limits and revision counters. No classroom accounts, names, assignments or files are copied into it.

| Role | Email identifier | Fixed public password |
| --- | --- | --- |
| Teacher | `teacher@demo.labtrack.app` | `LabTrackTeacher2026!` |
| Student | `student@demo.labtrack.app` | `LabTrackStudent2026!` |

These email identifiers are demo usernames, not provisioned email inboxes. Demo students sign in with the full email. Roll-number login continues to select the normal classroom. Existing classroom credentials and mandatory personal-password setup retain their behavior.

The demo student uploads to the demo teacher's workspace. The classroom teacher cannot see those submissions. The demo teacher cannot see classroom students, labs, source, images, analysis, grades or exports. A shared banner identifies the public workspace. Everyone using these public credentials shares the same demo work, so upload sample files only.

## Request routing and authorization

The login form adds `X-Labtrack-Workspace: demo` only for the two public email identifiers; other logins use `classroom`. API clients must supply that header for public demo login. The header selects a database for authentication; it never authenticates a caller. Every successful login still verifies a server-side password hash.

Demo sessions use `demo_` followed by 64 random hexadecimal characters in the existing HttpOnly, SameSite=Strict `labtrack_session` cookie. Subsequent requests select demo storage from that prefix and must find a valid session there. Changing a cookie prefix cannot turn a classroom session into a demo session, or vice versa. Login chooses the workspace afresh so people can sign out or switch from a shared demo account to their normal account.

[server/app.ts](../server/app.ts) runs the existing role, ownership, publication and revision checks against one selected store. [server/supabase.ts](../server/supabase.ts) binds every demo RPC, project read, asset read, readiness probe and metadata-cache key to the demo namespace. No route uses a browser-supplied student ID or UI filter as the isolation boundary.

Both [api/index.ts](../api/index.ts) and the persistent server support routing. Local JSON uses a `public-demo/` child directory. Public demo MongoDB is deliberately unsupported. The loopback development shortcut `/api/auth/demo` remains disabled in production.

## Storage and fixed accounts

Apply [20261019093050_public_demo_isolation.sql](../supabase/migrations/20261019093050_public_demo_isolation.sql) before releasing the application. It creates `labtrack_demo_records`, `labtrack_demo_payloads`, `labtrack_demo_meta`, `labtrack_demo_login_limits` and nine `labtrack_demo_*` RPCs. The migration only copies table definitions; it does not copy or update classroom rows. All demo tables use RLS and deny browser-role access. All RPCs are security invoker with an empty search path and execute access restricted to the server role.

The first demo login initializes two synthetic accounts, one published lab and one sample submission through `Store.mutate`. Concurrent initialization never overwrites existing demo work. Password hashes are salted, and demo account creation, profile changes and password changes are rejected on the server. The normal classroom never loads these accounts.

The public workspace allows at most three labs and eight tasks. Demo project/assignment payloads are capped at 20 MB; growing uploads are also refused when the shared database approaches 350 MB. Existing per-project upload bounds and bounded session/activity lists still apply. The project still shares Supabase compute/storage allowances with the classroom; data isolation does not provide independent provider capacity.

Demo uploads persist in Supabase; this implementation does not schedule resets. Private classroom backups intentionally cover classroom tables only. Future persistence RPC changes must review both namespaces and retain the isolation tests.

## Verification

[server/public-demo.test.ts](../server/public-demo.test.ts) applies the migration to a populated isolated PostgreSQL fixture, exercises the actual API handler against those SQL functions, verifies access denial in both directions, checks fixed accounts, cookie spoofing, private grants and unchanged classroom records/revisions. It also checks local JSON routing and restarts. [e2e/public-demo.spec.ts](../e2e/public-demo.spec.ts) exercises login, keyboard use, uploads and teacher access on desktop and mobile with synthetic data.

On 19 October 2026, all 121 unit/integration tests, the production build and all 18 desktop/mobile browser tests passed. Hosted schema checks after applying the additive migration confirmed that classroom record counts and revision were unchanged, all four demo tables had RLS with browser privileges denied, and all nine demo functions were security invoker with empty search paths and browser execution denied. The local migration filename matches hosted version `20261019093050`.
