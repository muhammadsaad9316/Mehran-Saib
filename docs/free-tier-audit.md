# Free-tier database audit — 13 October 2026

Project: LabTrack (`akudfcgksdjlipxxwfdu`). The deployed application is https://labtrack-lilac.vercel.app.

## Measured baseline

- Live database size: 11,531,955 bytes, approximately 11.5 MB.
- Public application tables including their indexes/TOAST: 630,784 bytes.
- Classroom records: 42 accounts, 2 labs, 1 submission, 4 activity entries and 2 sessions.
- Complete JSON snapshot: 223,679 bytes. An unchanged conditional read: 30 bytes.
- No active queries older than 30 seconds and no lock waiters at audit time.
- Supabase Performance Advisor: no findings.
- 08:35–09:06 Pakistan time: six normal Postgres log events, zero database errors.
- From the original retry repair through 09:06: two bounded PT409 conflicts, zero legacy 40001 retry errors. There is no continuing retry storm in that audited window.

The screenshot's 5.196 GB is cumulative log ingestion during the usage period. Repairing the cause does not remove already-metered logs. Organization usage can aggregate multiple projects and refresh later than the live database measurements. The two other projects in this organization are inactive; they were not modified.

## Improvements

Health checks now report application liveness without reading classroom records. Anonymous state and unsigned protected requests also avoid database reads. A signed-in request still validates current data; it never uses stale cached data when the database cannot be reached.

Each warm Vercel instance keeps at most one private snapshot, capped at 16 MiB. The backend verifies the database revision on each authenticated load. When unchanged, Supabase returns only the revision; the backend clones its private snapshot for that request. Changed revisions reload data, and concurrent saves retain their atomic version checks. The cache is separated by project and server credential. Above the memory cap, full reads remain available; cache effectiveness depends on warm-instance reuse and how often records change.

The write RPC rejects incoming lab/submission content when current database size plus twice the incoming document bytes would reach 400,000,000 bytes. This is a conservative application safeguard below the 500 MB plan allowance, not an exact prediction of PostgreSQL disk allocation or other platform quotas. Existing records remain readable. Account/session writes retain reserved headroom so teachers can sign in and export records. A quota rejection is returned normally rather than raising a Postgres error with an upload payload in its log.

Unregistered login identities share one limiter bucket, preventing arbitrary email addresses from creating unbounded limiter rows. Registered accounts retain their own limits. Expired limiter entries are cleaned by the existing login function.

Existing primary-key indexes already support record and session-budget lookups. With only 51 classroom records, extra speculative indexes would add storage/write costs; none were needed. Existing low-verbosity logging and error/security visibility were retained.

## Verification and recovery

All 64 automated checks and the production build pass. Tests cover cached reads, external updates, cache isolation, failed connections, concurrent saves, unsigned requests, quota rejection and the full isolated submission/grading flow. Live SQL verified identical conditional-read data, backend writes in a rolled-back transaction, and denied browser execution rights. Core record fingerprints match before/after the schema changes.

A private classroom recovery copy is saved under `.data/backups/classroom-2026-10-13-before-optimization.json`; session tokens are excluded. This directory is ignored by Git and deployment uploads. It is a record recovery copy, not an automated database-backup schedule.

The Security Advisor's three informational “RLS Enabled No Policy” notices are intentional for these backend-only tables. Browser roles cannot read them or execute the private functions. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## What still needs attention

- Check the daily log-ingestion trend after 24–48 hours rather than expecting the cumulative counter to decrease.
- Review database size and egress weekly. No optimization guarantees unlimited traffic within a free quota.
- Uploads currently live in the database; “Storage Size: 0” does not mean uploaded work consumes no space.
- File-heavy or larger classes need separate object storage and selective/paginated reads before reaching the safeguard. Keep regular off-site backups.

Supabase's current log-ingestion page marks this billing feature as not yet billed and lists Free overages as not billed: https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest. This is a current provider policy, not a permanent pricing guarantee.
