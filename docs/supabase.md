# Supabase database guide

Supabase hosts Postgres for private LabTrack records. The server uses `fetch` to `https://<project>.supabase.co/rest/v1/rpc/`; React never connects to the database. LabTrack sessions and users are application records, not Supabase Auth users. There are no Storage buckets, Realtime subscriptions or Edge Functions in the application code.

The existing project's public identifier is `akudfcgksdjlipxxwfdu`; its [dashboard](https://supabase.com/dashboard/project/akudfcgksdjlipxxwfdu) requires authorized access. The identifier/URL is not a credential. Keep its secret exclusively in backend environment settings.

## Schema

| Table | Columns and constraints | Purpose |
| --- | --- | --- |
| `public.labtrack_records` | `collection text`, `id text`, `document jsonb`, `position integer`; PK `(collection,id)` | All classroom/session records |
| `public.labtrack_meta` | `id smallint` constrained to 1, `revision bigint >= 0`; PK `id` | Single global optimistic-write revision |
| `public.labtrack_login_limits` | `key text` PK, `attempts integer`, `reset_at timestamptz` | Shared Vercel login attempt budgets |

`collection` is one of `users`, `labs`, `submissions`, `activity`, `sessions`. `document` must be an object with a string `id` matching the row's `id`. `position >= 0` preserves array order when rebuilding the snapshot. Email/roll uniqueness, role membership, task references and grade bounds are application invariants, not independent SQL constraints or foreign keys.

| Collection | Document contents |
| --- | --- |
| `users` | Public user fields plus salted `passwordHash` |
| `labs` | Tasks, requirements and optional base64 instruction attachment |
| `submissions` | Current source text, private raster base64, revision and optional grade |
| `activity` | Recent workflow events, capped to 100 by the app |
| `sessions` | Opaque session token as ID, user ID, numeric expiry |

Uploads consume **database** bytes, including base64 overhead. A zero Supabase Storage usage figure does not mean project uploads use no storage.

## Permissions

All three tables have RLS enabled. Table privileges are revoked from `PUBLIC`, `anon` and `authenticated`; `service_role` has the required server privileges. All four RPCs are `SECURITY INVOKER`, use an empty `search_path` and explicitly restrict execution to `service_role`. There are no browser RLS policies because browser database access is intentionally denied.

Supabase secret keys resolve to an elevated server role that bypasses RLS. Express's session, role and ownership checks therefore enforce classroom authorization. Never fix an API error by disabling RLS, granting browser access or adding `SECURITY DEFINER`. See [API key guidance](https://supabase.com/docs/guides/getting-started/api-keys) and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security). The informational [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) notice fits this server-only design.

## RPC contracts

| Function | Input | Return and behavior |
| --- | --- | --- |
| `labtrack_read()` | `{}` | `{ revision, data: { users, labs, submissions, activity, sessions } }`, arrays ordered by position/ID |
| `labtrack_read_if_changed(known_revision bigint default -1)` | `{ known_revision }` | Same full result when changed; `{ revision, data: null }` when unchanged |
| `labtrack_write(expected_revision bigint, upserts jsonb, deletions jsonb)` | Expected global revision and document diff | Next revision, or `-1` for storage safeguard; `PT409` on conflict |
| `labtrack_login_attempt(attempt_key text, clear_attempts boolean default false)` | 64-character hex key, optional clear flag | Boolean allow/deny, eight attempts per 15-minute bucket; expired rows cleaned |

Each upsert is `{ collection, id, document, position }`; each deletion is `{ collection, id }`. The server diffs both document content and array position. No-op mutations avoid the write RPC.

The write function locks metadata row 1, checks `expected_revision`, applies deletes/upserts and increments the revision in the same transaction. Stale writes raise custom SQLSTATE `PT409`. Do not change it to `40001`: the prior deployment incident involved PostgREST repeatedly retrying that serialization code. The server retains compatibility handling for `40001`, but the committed SQL uses `PT409`.

The latest storage guard checks `pg_database_size(current_database()) + incoming_lab_and_submission_bytes * 2 >= 400000000`. Rejection returns `-1` normally before any record changes; the adapter maps it to HTTP 507. Users/sessions retain headroom. This is an application threshold, not a precise disk forecast or a provider quota guarantee.

## Concurrency and cache

`Store` owns its loaded revision through `SupabasePersistence`. Persistent Node loads once, uses one write attempt and reloads/returns 409 on conflict. Vercel creates a store per request and reruns mutation validation against fresh records for up to eight write attempts.

A serverless warm-instance cache stores at most one private snapshot capped at 16 MiB and separated by project/credential hash. Every load checks the database revision; unchanged reads return only metadata. Clones isolate requests. A failed connection never authorizes a stale cached snapshot. There is no browser cache or realtime stream of this state.

Manual database edits must go through an equivalent versioned transaction that advances metadata; changing only `labtrack_records` can evade cache invalidation. Restart persistent Node after external changes. Use controlled maintenance and a backup before direct data repairs.

## Migration order and existing history

Apply these files in order to a **fresh** project before connecting the app:

| Repository file | Hosted history version/name observed on 13 October 2026 |
| --- | --- |
| [001_labtrack.sql](../supabase/migrations/001_labtrack.sql) | `20261012094828` / `labtrack_private_persistence` |
| [20261013022154_fix_labtrack_conflict_retry_loop.sql](../supabase/migrations/20261013022154_fix_labtrack_conflict_retry_loop.sql) | `20261013022154` / `fix_labtrack_conflict_retry_loop` |
| [20261013032620_serverless_login_rate_limit.sql](../supabase/migrations/20261013032620_serverless_login_rate_limit.sql) | `20261013032620` / `serverless_login_rate_limit` |
| [20261013041432_optimize_free_tier_reads.sql](../supabase/migrations/20261013041432_optimize_free_tier_reads.sql) | `20261013041432` / `optimize_free_tier_reads` |
| [20261013041643_reserve_auth_capacity.sql](../supabase/migrations/20261013041643_reserve_auth_capacity.sql) | `20261013041643` / `reserve_auth_capacity` |

The initial local filename does not match hosted migration history. **Do not run a blind migration push against the existing classroom.** Inspect remote history and function definitions first and reconcile the initial identifier as a deliberate maintenance task. Later migrations include non-idempotent `CREATE TABLE/FUNCTION` statements and are not scripts to replay on every startup.

There is no committed Supabase CLI `config.toml` or fully configured local stack. For a fresh hosted project, an owner can run each reviewed SQL file once through the SQL Editor in the order above; record that manual setup. For tracked deployment through MCP, apply each missing migration with its descriptive name to the selected project. SQL Editor execution itself does not create Supabase CLI migration-history entries.

For future changes, create a new migration rather than silently modifying old applied files. If using the CLI, inspect the installed version and command help, create the migration with `supabase migration new <name>`, and reconcile the initial history before any push. Test on an independent database, review grants/RLS/function security, then compare remote migration history after applying. Never reset the real classroom to make history match.

After all migrations, configure server URL/secret with demo false. A fresh app database needs initial admin credentials; the app then creates the teacher. The fixed-class provisioning script is restricted to the existing project; see [getting started](getting-started.md).

## Read-only inspection

In an authorized SQL Editor/MCP session, this summary avoids student content and credentials:

```sql
select collection, count(*) as records
from public.labtrack_records
group by collection order by collection;

select revision from public.labtrack_meta where id = 1;

select c.relname, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('labtrack_records', 'labtrack_meta', 'labtrack_login_limits');

select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'labtrack_%';
```

Expect RLS true, browser privileges false and `security_definer=false`. Avoid `select document` or `labtrack_read()` in public logs: they include password hashes, sessions and source files.

The documentation review confirmed those access properties and all five hosted migrations. Aggregate counts at review were 42 users, 2 labs, 1 submission, 4 activity records and 3 sessions; these are a dated observation and will change. Earlier class-bootstrap notes describe the initial empty-submission setup, not today's contents. No records or grants were changed during documentation.

## Adapter failures

The transport uses a 15-second timeout and rejects redirects. New `sb_secret_` keys are sent in `apikey`; supported legacy service-role JWTs also use `Authorization: Bearer`. Publishable/anonymous keys are rejected by configuration validation. `PGRST202` prompts applying missing migrations; conflicts use dedicated errors; other failures produce sanitized diagnostics without credential values. Review [operations](operations.md) and current provider docs for environmental errors.
