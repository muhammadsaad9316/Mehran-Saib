# Student first-login passwords

Students sign in with their roll number and an individual temporary eight-digit code. Their first login opens **Create your password**. They enter and confirm a nonblank personal password of 6–256 characters, then enter the student workspace. The server and form enforce the six-character minimum; there is no character-composition rule. This minimum applies to new password setup; existing personal passwords remain unchanged. Both entries are visible while typing by default, with a Hide/Show passwords button. Subsequent logins use the same roll number and their personal password. Temporary codes stop working after setup.

Pending accounts can only read their own minimal login state, set a password, sign out or sign in again. Classroom state, source, downloads and mutations remain blocked on the server until setup completes. Setup sessions expire after 15 minutes; ordinary sessions last seven days. Password changes rotate the session and credential version, invalidating previous sessions on the next request. Temporary hashes and setup cookies use distinct formats so older Vercel handlers cannot treat them as ordinary credentials/sessions. Legacy accounts without a credential version remain compatible until explicitly reset.

## Prepare the existing 41-student classroom

This is an account-changing operation, not a verification command. An owner must explicitly authorize replacing existing student passwords. It preserves account IDs, names, roll numbers, teacher credentials, labs, submissions and marks. Do not use the older class-provisioning script to reset accounts.

1. Deploy the first-login-capable app and take an encrypted backup.
2. Run `npm run prepare:student-logins`. It reads the configured JSON/Supabase roster and creates a private plan plus `.data/student-temporary-passwords.csv`. No accounts change. Each roll 1–41 receives a different random eight-digit code; codes are not derived from rolls.
3. Run `npm run apply:student-logins` after reviewing the intended environment. One `Store.mutate` transaction applies all 41 hashes and setup flags and revokes their existing sessions. Teacher sessions/credentials are retained. The script refuses a changed roster, incomplete provider configuration, an invalid sheet/hash plan, or a password changed since preparation. Reapplying an already-applied pending plan is a no-op; it never overwrites a student's newly chosen password.
4. Verify aggregate setup counts and unchanged classroom/teacher checksums without printing passwords, hashes, tokens or source. First-login and password mutations are tested with isolated users, never real classroom test accounts.
5. Give each student only their own row from the private sheet. Keep the plan and sheet out of Git, chat logs, deployment exports and public storage. The plan contains plaintext temporary codes and old/new hashes; handle it as a credential file.

The script uses root `.env`, without editing it. It supports the existing JSON/Supabase classroom and requires exactly one student per roll 1–41. MongoDB needs a separately reviewed operational reset process. There is no forgotten-password or self-registration feature in this change; an owner must explicitly authorize future recovery/reset work.

## Implementation and verification

`server/auth.ts` verifies scrypt hashes; `server/app.ts` enforces setup and versions; `api/index.ts` recognizes limited setup sessions; `src/PasswordSetup.tsx` owns the form. Credential mutations scope user dependencies to the account being changed, while still guarding every touched document. This permits students to create passwords independently without treating a classmate's password change as a conflict.

`server/first-login.test.ts` exercises credential generation/application, rejection of one-to-five-character and blank passwords, acceptance of exactly six characters, privacy gates, session revocation, changed-password rejection, teacher/work preservation and 41 independent saves against an actual isolated PostgreSQL engine. Browser tests cover desktop/mobile setup, short-password prevention, mismatch feedback, temporary-code rejection after setup and login with the chosen password.

## Activation record — 15 October 2026

Release `68f3321` passed 100 tests on Node 24 and ten desktop/mobile browser checks, followed by successful Linux/Windows [GitHub verification](https://github.com/muhammadsaad9316/Mehran-Saib/actions/runs/38770755257). Production deployment `dpl_6qikUD5jinyKH6YhdEMsjtp8ZZnG` was READY before account activation. An encrypted pre-change backup was created and verified; the private sheet was generated without account changes, then applied in one authorized operation.

Post-activation revision: **111**, with 41 student accounts, 41 distinct temporary credentials, 41 pending setup flags and zero retained student sessions. Teacher document and session fingerprints matched the pre-change values. Full lab, submission and activity checksums also matched (2 labs, 6 submissions, 25 activity entries). The sheet contains exactly rolls 1–41 and unique eight-digit codes. No credentials, hashes, tokens or classroom source were printed. Live checks verified the new bundle, health and denial of unauthenticated password changes; real student logins were not used as mutation tests. The fresh encrypted [GitHub backup after activation](https://github.com/muhammadsaad9316/Mehran-Saib/actions/runs/38771420786) succeeded.

The older class-credentials files no longer contain the current student passwords. Use the private `student-temporary-passwords.csv` only until students create personal passwords; it never contains their chosen passwords.
