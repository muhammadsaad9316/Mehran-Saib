# LabTrack documentation

This documentation describes this repository, reviewed on **13 October 2026**. Source files and tests remain authoritative when changing behavior; historical audit numbers are observations, not application constants.

## Reading order

For a new developer:

1. [Getting started](getting-started.md): choose a data environment and run the app.
2. [Architecture](architecture.md): understand layers, records and workflows.
3. [Frontend](frontend.md) and [backend](backend.md): locate implementation code.
4. [API](api.md), [Supabase](supabase.md) and [configuration](configuration.md): learn contracts and settings.
5. [Operations](operations.md): verify, diagnose and maintain the app.

For an AI coding tool, read [../AGENTS.md](../AGENTS.md), [AI development](ai-development.md) and architecture before editing. Then read the requested feature's implementation and tests.

## Find a topic

| Topic | Guide |
| --- | --- |
| Local app with existing hosted classroom | [supabase-local.md](supabase-local.md) |
| Demo or fresh environment | [getting-started.md](getting-started.md) |
| File responsibilities and data flow | [architecture.md](architecture.md) |
| Screens, styling and preview | [frontend.md](frontend.md) |
| Accounts, roles and mutations | [backend.md](backend.md) |
| Endpoints and payloads | [api.md](api.md) |
| SQL schema, migrations and concurrency | [supabase.md](supabase.md) |
| Environment variables | [configuration.md](configuration.md) |
| Parser checks, similarity and uploads | [analysis.md](analysis.md) |
| Tests, incidents and recovery | [operations.md](operations.md) |
| Production release | [launch.md](launch.md) |
| Original assignment content | [lab-requirements.md](lab-requirements.md) |
| Historical resource measurements | [free-tier-audit.md](free-tier-audit.md) |
| Optimization and polish verification | [optimization-review.md](optimization-review.md) |
| Reliability and optimization audit, 15 October 2026 | [reliability-audit-2026-10-15.md](reliability-audit-2026-10-15.md) |
| Current reliability implementation and verification | [reliability-progress.md](reliability-progress.md) |

## Terminology

| Term | Meaning here |
| --- | --- |
| Lab | Assignment containing ordered tasks, publication flag and optional deadline/attachment |
| Task | Independently submitted and graded unit inside a lab |
| Requirement | Teacher-approved parser rule: `tag`, `attribute`, `text` or `file` |
| Submission | Current project for one student/lab/task, with optional grade |
| Submission revision | Starts at 1 and increases on resubmission; required to save a grade |
| Database revision | Global counter in `labtrack_meta` guarding persistence writes |
| Draft lab | Visible to teachers, hidden from students |
| Draft grade | Saved/exportable by teachers, hidden from students |
| Session | Server token in an HttpOnly cookie; not a Supabase Auth session |
| Snapshot | Arrays of users, labs, submissions, activity and sessions loaded by the server |
| RPC | Database function called through Supabase REST by the server |
| Comparable pair | Enough matching code and a complete parser scan; eligible for UI flags |

## Evidence and limits

**15 October implementation:** see [reliability progress](reliability-progress.md) for the current 98-test Node 24 run, browser checks, compatible hosted migration, encrypted recovery drill and release/backup status. These supersede the dated observations below where behavior changed.

The guides cover all HTTP routes, runtime entrypoints, persistence adapters and frontend modules. Read-only checks on 13 October 2026 confirmed hosted migration history, RLS on all three LabTrack tables, denied browser `SELECT`/RPC execution and allowed server access. These checks did not read passwords, session tokens or submitted source.

Older deployment observations are historical. This documentation task did not deploy, change database records, provision accounts or exercise real classroom uploads. Tests use isolated stores or mocked Supabase responses; they do not establish a live MongoDB connection, browser rendering or provider billing behavior.

Repository verification on 13 October 2026: `npm test` passed all **64 tests** and `npm run build` passed TypeScript and Vite bundling, using the available Node `26.3.0` / npm `11.16.0` runtime. The documented production runtime is Node 24; this run did not independently test that runtime. Local Markdown links and code fences were also checked.

Update source types, callers, validation, relevant tests and guides together when changing a contract. Keep credentials and recovery copies in ignored private storage.
