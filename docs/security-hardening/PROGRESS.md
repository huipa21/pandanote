# Security hardening — progress

## Current state

| Sub-task | Title                                           | State                                                                                                 |
| -------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SH1.1    | Verify staged lockout fix, add MFA-path test    | done (verified; gate and e2e auth green; see session 2)                                               |
| SH1.2    | Re-issue device token after security changes    | done (gate and e2e auth green; see session 3)                                                         |
| SH1.3    | Issue 1 docs and reset-password message         | done (gate green; PTY reset test Linux-only, not run)                                                 |
| SH2.1    | Setup code: server, log line, integration tests | done (server; standard gate green; e2e auth expected to fail until SH2.2; see session 5)              |
| SH2.2    | Setup page field and e2e harness                | done for setup flows (session 6); full e2e has 9 non-setup failures, not all baselined                |
| SH2.3    | Setup code docs and Linux release harness       | **partial**: docs and harness done; Linux release drill **blocked** (no Linux Docker host; session 7) |
| SH3.1    | Rate-limiter failure-count primitives           | done (standard gate green; see session 8)                                                             |
| SH3.2    | MFA per-challenge cap, lower limit, daily cap   | done (standard gate and e2e auth green; see session 9)                                                |
| SH3.3    | Sign-in page MFA messages                       | done (standard gate, build and e2e auth 6/6 green; see session 10)                                    |
| SH3.4    | Optional owner notice of failed second factors  | done (user-approved; gates green incl. e2e auth 6/6 and backups/smoke; see session 11)                |
| SH4.1    | `TRUSTED_PROXIES` configuration                 | not started                                                                                           |
| SH4.2    | IPv6 /64 rate-limit bucketing                   | not started                                                                                           |
| SH4.3    | Issue 4 docs                                    | not started                                                                                           |

**Next task:** SH4.1 (`TRUSTED_PROXIES`, Issue 4; read [PLAN.md](PLAN.md) SH4.1 and `src/lib/server/auth/policy.ts`). Linux release tests (SH2.3) stay blocked until a Linux Docker host is available.

## Session log

### Session 1 — security review and planning (docs only)

- A code review found four issues (see [README.md](README.md)). The user approved
  bringing back a setup secret (Decision 2) and asked for a plan that small agents
  can implement one sub-task at a time.
- Found staged, uncommitted work from another session that already implements the
  issue 1 trusted-device fix (`device-trust.ts`, limiter/service/route changes,
  tests, ARCHITECTURE bullet). Recorded it as SH1.1 "in progress"; its files were
  not modified.
- Created this folder (README, PLAN, ACCEPTANCE_TESTS, PROGRESS) and pointer notes
  in `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ACCEPTANCE_TESTS.md`,
  `docs/simplify-setup/README.md` and `docs/PROGRESS.md`.
- No application code changed. No tests run (documentation only).
- Review evidence (same session, before planning): `npm audit --omit=dev` → 2 low
  (katex via mermaid 12.1.0, GHSA-238p-pmpm-9mq7); `ops/runtime` audit → 0. Other
  review notes not planned here (lower priority): no HSTS header, no `__Host-`
  cookie prefix, backup archives are unencrypted, public auth JSON reads have no
  body timeout, and this Windows shell had `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Session 2 — SH1.1 (verify staged lockout fix, add MFA-path and HTTP tests)

- Reviewed the staged diff against README Decision 1. No real defect found in the
  staged code; no application code changed in this session. Doubtful points (not
  changed, for the owners of later sub-tasks):
  - A verified device gets its own bucket (30/15 min) and skips the account bucket.
    A stolen device cookie therefore allows 30 password guesses per 15 min per device.
    This matches Decision 1 but is not cut by the account cap.
  - `confirmEnrollment` does not return a device token yet (SH1.2 scope).
  - The `mfa` account limit is still 30 until SH3.2 lowers it to 10.
  - Device-token lookup in `login`/`completeMfa` reads the account row outside the
    write transaction. The revision check is still correct because `verify` compares
    against the row read in the same call.
- Tests added:
  - `tests/integration/auth-mfa.test.ts` "MFA honors the trusted device…" (SEC-LOCK-4):
    flood of the `mfa` account bucket; no-device and forged-device completions are
    rate-limited without consuming the challenge; the real device token completes MFA
    and keeps the device id. The test needed `f.advance()` after the sign-in because the
    same TOTP step is rejected as a replay.
  - `tests/integration/setup-server.test.ts` (real server): `pandanote_device` on the
    setup response has `Path=/api/auth`, `HttpOnly`, `SameSite=Strict`, `Secure`, and
    `Expires` ≤ 180 days; the cookie alone gets 401 from `GET /api/auth/security`; the
    device token is not in server output.
- Docs hygiene fix (needed for the integration gate): `release-hygiene.test.ts` forbids
  the retired variable names outside PROGRESS history. The security-hardening
  README and PLAN named `TRUSTED_PROXY_IPS` and `SETUP_TOKEN`. They now say
  `TRUSTED_PROXY_*` / `SETUP_*`. The exact names remain in the PLAN's SH4.1 and in
  `ignoreLegacyEnvironment`.
- Acceptance: SEC-LOCK-1 to -4, -6, -7 now have covering tests (table updated).
  SEC-LOCK-5 stays for SH1.2.
- Commands and results (Windows, this session):
  - `npm run check`: 0 errors, 1 pre-existing warning. Passed.
  - `npm run lint`: fails only on the pre-existing `NoteEditor.svelte:64`. Touched files pass
    `npx eslint` and `npx prettier --check`.
  - `npm run test:unit`: 31 files, 159 passed.
  - `npm run test:integration`: passed on the last run (39 files, 229 passed, 7 skipped).
    Two earlier full runs failed with Windows worker crashes (exit `3221226505`) in
    `runtime-server.test.ts` and `startup.test.ts`. Both files passed when run alone, and
    the third full run passed. Flaky worker crash, not a code failure. Not fixed.
  - `npm run build`: passed.
  - `npx playwright test tests/e2e/auth.test.ts`: 4 passed (47.5 s).
  - Release-hygiene test: first failed on the docs names above, then passed after the fix.
- Not done / left for later: Linux image validation (not run; no Linux host). Changes
  are unstaged in the working tree, not committed (per README rules).
- Next: SH1.2 (see the "Next task" above).

### Session 3 — SH1.2 (re-issue the device token after security changes)

- `service.ts`: `rotateSecurity(tx, owner, keepCurrent = true, deviceToken?)` verifies the token against the owner **before** the revision bump (`devices.verify`), then returns the session credential plus `device: devices.issue(owner.id, newRevision, now, existingId)`. No/invalid token → a new device id (caller is freshly authenticated). `keepCurrent = false` (`revokeAll`, `resetPassword`) returns null and issues nothing.
- Optional trailing `deviceToken` added to `confirmEnrollment`, `disableMfa`, `regenerateRecoveryCodes`, `changePassword`, `changeSessionLifetime`. `routes/api/auth/security/+server.ts` reads `cookies.get(DEVICE_COOKIE)` and passes it; `setSessionCookie` already writes `credential.device`. The verification lives inside `rotateSecurity` (one place) instead of in each caller; behavior is the same as the plan.
- Test: `tests/integration/auth-mfa.test.ts` "every security change re-issues the same trusted device…" (SEC-LOCK-5): with the login account bucket flooded, each of MFA enable, recovery regeneration, lifetime change, MFA disable and password change returns a device token with the same id and the new revision; the old token is rate-limited, the new one signs in; a call without a device token gets a new id; `revokeAll` returns nothing and the previous token stops working.
- Commands (Windows): `npm run check` 0 errors, 1 pre-existing warning; `npm run lint` fails only on pre-existing `NoteEditor.svelte:64`, `npx eslint` and `npx prettier --check` pass on touched files; `npm run test:unit` 31 files, 159 passed; `npm run test:integration` 39 files, 230 passed, 7 skipped; `npm run build` passed; `npx playwright test tests/e2e/auth.test.ts` 4 passed. Linux image not run. Nothing committed or restaged by this session.
- Remaining/doubtful: a request that arrives without a valid device cookie (e.g. cookie expired) gets a new device id after a security change; this is intended per PLAN. Cookie path is `/api/auth`, which covers `/api/auth/security`.
- Next: SH1.3.

### Session 4 — SH1.3 (issue 1 docs and reset-password message)

- `scripts/reset-password.ts` success line now reads "Password reset. MFA/recovery codes removed; all sessions revoked; sign-in limits cleared." The code already clears limits (`resetPassword` deletes every `auth_rate_limits` row; the security-revision bump invalidates device tokens); the message now reports it.
- Docs: `docs/PRODUCT_SPEC.md` §13 (limit windows, `pandanote_device` behavior, reset clears limits); `ops/DEPLOYMENT.md` §7 and §11 troubleshooting row "Too many attempts. Try again in 15 minutes." (wait, sign in from a browser used before, or reset as last resort with its MFA/session side effects); `README.md` reset section. `docs/ACCEPTANCE_TESTS.md` already had the security-hardening pointer; unchanged. No SEC case is added for SH1.3.
- Test: `tests/integration/reset-password.test.ts` PTY success test asserts `sign-in limits cleared`. The file is Linux-only (`it.skipIf(!linux)`), so it is skipped on this Windows host.
- Commands (Windows): `npx prettier --check` on touched docs/scripts/tests: pass; `npx eslint` on touched scripts/tests: pass; `npm run check`: 0 errors, 1 pre-existing warning; `npm run lint`: fails only on pre-existing `NoteEditor.svelte:64`; `npm run test:unit`: 31 files, 159 passed; `npm run test:integration`: 39 files, 230 passed, 7 skipped (the PTY reset cases are among the skips); `npm run build`: passed.
- Not run: Linux PTY reset test (no Linux runtime; WSL Ubuntu exists but is stopped and has no project dependencies). Run `npx vitest run --config vitest.integration.config.ts tests/integration/reset-password.test.ts` on Linux before release.
- Pre-existing: `docs/PROGRESS.md` fails `prettier --check` (not reformatted, to avoid touching other sessions' work).
- Next: SH2.1.

### Session 5 — SH2.1 (setup code: server, log line, integration tests)

- Implemented the server half of Decision 2 per PLAN SH2.1. `src/lib/shared/auth.ts`: `normalizeSetupCode`, `setupCodeSchema` (trim/uppercase/strip spaces and hyphens; regex over the 31-symbol alphabet; message "Enter the setup code from the server log."), `setupAccountSchema.setupCode`. `src/lib/server/auth/setup-code.ts` (new, server-only): `newSetupCode()` (`randomInt(31)`, display `XXXXX-XXXXX-XXXXX-XXXXX`), `formatSetupCode`, `setupCodeDigest` (`tokenHash('setup', …)`), `setupCodeMatches` (`timingSafeEqual`; missing digest fails closed), `SetupCodeError` (field `setupCode`, no code value), `SETUP_CODE_BUCKET = 'setup-code'`.
- `AuthService` (`service.ts`): `setupCode()` generates lazily while the state is `new`, stable per instance, `null` (and clears memory) once an account exists. `createAccount` order: `assertSetupOpen()` → code check → wrong/missing: `attempt('setup', ip)` then `SetupCodeError`; correct: `attempt('setup', ip, now, 'setup-code')` → schema parse → unchanged create path.
- Route `api/setup/account/+server.ts`: `SetupCodeError` → 400 `validation` with `fields.setupCode` (same shape as other field errors, `cache-control: no-store`).
- `runtime.ts`: after the runtime is ready, logs `PandaNote setup code: … (valid for 60 minutes while no account exists)` and `PandaNote setup link: ${policy.origin}/setup#code=…` via `console.info` only when `setupCode()` is non-null. This is the one documented exception to "never log tokens".
- Test updates for in-process callers: `tests/helpers/auth.ts`, `scripts/backups-benchmark.ts` (`setupCode: auth.setupCode()`); `tests/integration/auth.test.ts` (`withCode(auth)` per instance; three new `setup code:` cases); `tests/unit/setup.test.ts`, `tests/unit/auth-policy.test.ts` (fixtures carry a valid code); new `tests/unit/setup-code.test.ts`; new `tests/helpers/setup-code.ts` (`setupCodesIn`, `waitForSetupCode(read, count)` parsing the log line). `tests/integration/setup-server.test.ts` (real server: one code and one link line; wrong/missing code 400 field error; restart prints a new code and the old one fails; window closed with a correct code → 403; no line after an account exists; flood/rate limits with codes) and `tests/integration/runtime-server.test.ts` (loopback posts the logged code).
- Touched: `src/lib/shared/auth.ts`, `src/lib/server/auth/setup-code.ts` (new), `src/lib/server/auth/service.ts`, `src/lib/server/runtime.ts`, `src/routes/api/setup/account/+server.ts`, `scripts/backups-benchmark.ts`, the tests above, this file, `ACCEPTANCE_TESTS.md`.
- Acceptance covered: SEC-SETUP-1, -2, -3, -4, -5, -6, -7, -9, -10 (see table). SEC-SETUP-8 (no leakage to SQLite/files/responses) and -11/-12 are SH2.2; -13 is SH2.3.
- Commands and real results (Windows): `npx prettier --check` on touched files: pass. `npx eslint` on touched files: pass. `npm run check`: 0 errors, 1 pre-existing warning (AppShell.svelte). `npm run lint`: fails only on the pre-existing `NoteEditor.svelte:64`. `npm run test:unit`: 32 files, 162 passed (was 159). `npx vitest run … auth.test.ts auth-mfa.test.ts auth-http.test.ts reset-password.test.ts`: 4 files, 34 passed, 4 skipped (Linux-only PTY). `npx vitest run … setup-server.test.ts runtime-server.test.ts`: 2 files, 3 passed. `npm run test:integration`: 39 files, 233 passed, 7 skipped (was 230). `npm run build`: passed. `npx playwright test tests/e2e/auth.test.ts`: **4 failed, expected**: the setup form has no code field yet (SH2.2), so the setup posts return 400 `setupCode` and the browser flows stop at the first setup step. Not a pass; SH2.2 must fix it.
- Not run: Linux image/release tests (SH2.3 territory; no Linux host). Not committed; my edits are unstaged on top of the earlier staged work.
- Decisions reflected: the setup code is checked before the setup-account rate-limit charge; a correct code is charged to `setup:device:setup-code` plus the IP bucket (as the plan says), so a wrong-code flood cannot close the owner's setup allowance. A malformed or missing code counts as a wrong guess. The window check still comes first, so an expired window returns `setup_closed` even for a correct code.
- Next: SH2.2 (see the "Next task" above).

### Session 6 — SH2.2 (setup page field and e2e harness)

- Setup page (`src/routes/setup/+page.svelte`): "Setup code" field first (`#setup-code`, `name="setupCode"`, `autocomplete="off"`, `autocapitalize="characters"`, `spellcheck="false"`), help text with `docker compose logs pandanote`, field error from `fields.setupCode`, and `setupCode` in the client-validated payload. On mount it reads `#code=…` from the fragment, prefills the field and removes the fragment with `history.replaceState`. i18n: `setup.code`, `setup.codeHelp` (en, zh-CN). `setup.intro` in both catalogs no longer says the first visitor owns the notebook; it asks for the code. This wording change was not in the plan.
- Harness (`scripts/e2e-server.mjs`, test only): child stdout/stderr are piped and forwarded; the setup code is taken from the log line and written to `.e2e-data/setup-code` (security: `.e2e-data/security/setup-code`), mode 0600, removed at start and in cleanup.
- Test helper: `readSetupCode(baseURL)` in `tests/helpers/setup-code.ts` (polls up to 10 s; port 4175 maps to the security file). Used by `tests/helpers/browser-session.ts` and every setup post in `tests/e2e/auth.test.ts`.
- E2E: new first test "setup rejects a wrong setup code…" (field error, no account, login still 409). The first setup test now starts from `/setup#code=…` and checks the prefill and the empty `hash`.
- Integration: new "setup code: SEC-SETUP-8…" case in `tests/integration/auth.test.ts` scans every file under DATA_DIR and the service results for the code.
- Touched: `src/routes/setup/+page.svelte`, `src/lib/shared/i18n/{en,zh-CN}.ts`, `scripts/e2e-server.mjs`, `tests/helpers/{setup-code,browser-session}.ts`, `tests/e2e/auth.test.ts`, `tests/integration/auth.test.ts`, `ACCEPTANCE_TESTS.md`, this file.
- Commands and real results (Windows): prettier and eslint on touched files: pass. `npm run check`: 0 errors, 1 pre-existing warning (AppShell.svelte). `npm run test:unit`: 32 files, 162 passed. `npm run test:integration`: 39 files, 234 passed, 7 skipped (includes SEC-SETUP-8). `npm run build`: passed. `npm run lint`: fails only on the pre-existing `NoteEditor.svelte:64`. `npx prettier --check .` lists 19 files; none are touched by this session.
- `npx playwright test tests/e2e/auth.test.ts tests/e2e/smoke.test.ts tests/e2e/zzzaccessibility.test.ts`: auth 6/6 pass (new wrong-code and prefill tests included), smoke 2/2 pass, accessibility 13 pass and 2 fail. The 2 failures are the known "Choose year, …" month-picker timeout in the light and dark axe loops (240 s each).
- Full `npm run test:e2e` (one run, vite build + playwright): **82 passed, 9 failed, exit 1**. Failures: the 2 axe "Choose year" loops; `calendar.test.ts` "posting from the composer…" (naturalWidth 400); `language.test.ts` "language and site title…" (zh-CN sidebar link missing); `shell.test.ts` "appearance…" and "real private shell viewport…" (screenshots); `detail.test.ts` "card date is a short link…"; `tag-management.test.ts` "tag management rewrites notes…"; `timeline.test.ts` "older loading is confined…" ("Active filters" region). Earlier entries in `docs/PROGRESS.md` record the calendar, language, shell and axe failures as failing on a clean stash. The detail, tag-management and timeline failures are **not** baselined. The same non-screenshot specs were re-run alone and failed the same way (14 passed). No setup-related test failed.
- Not run: Linux image and release tests (no Linux host). SH2.3 owns `tests/release/*`, which still post setup without a code.
- Gate status: SH2.2 setup-specific e2e cases pass; the full e2e run is not green, so SH2.2 is recorded as done for setup flows only.
- Next: SH2.3 (see the "Next task" above).

### Session 7 — SH2.3 (setup-code docs and Linux release harness)

- Starting state: `git status` was clean; earlier sub-tasks are committed in `1c37a8b`. Nothing to preserve or revert.
- Docs (setup code, Decision 2): `docs/PRODUCT_SPEC.md` §13 bullet replaced ("Approved first-visitor ownership" → setup-code rule, supersedes "no setup secret"). `docs/ARCHITECTURE.md` §12.1 paragraph and new §12.6 setup-code bullet (generation, storage, verification order, log-line exception, `#code=` fragment never sent). `README.md` setup section (`docker compose logs pandanote | grep "setup"`, restart prints a new code, log access is sensitive). `ops/DEPLOYMENT.md` §2 setup steps, §8 start-over, §11 rows "Setup code is incorrect" and "Setup timed out" (updated). `ops/RESTORE_RUNBOOK.md` temporary setup needs the code. `docs/ACCEPTANCE_TESTS.md` AUTH-01 now points to SEC-SETUP-1…13. `docs/simplify-setup/SPEC.md` one "superseded in part" note. `docs/simplify-setup/README.md` already had its note, unchanged.
- Release harness (test only): new `tests/release/setup-code.ts` (contract regex, newest line wins, polls the container stdout, no logging of logs or codes). `support.ts` `setup()` takes a `setupCode` and fills `#setup-code` by label. `drill.test.ts` reads A's code from compose project `pna` and B's from `pnb`. `image.test.ts` reads the code from `docker logs <app>` and posts it. `deployment.test.ts` and `benchmark.test.ts` also post setup in the browser, so they read the code too (not named in PLAN, but they would fail without it). `tests/release/README.md` note.
- Test contract fix: `tests/integration/release-hygiene.test.ts` pinned the removed sentence "First visitor owns an empty instance" in DEPLOYMENT.md. It now pins `docker compose logs pandanote | grep "setup"` and "Setup code".
- Commands and real results (Windows host, this session):
  - `npx eslint` on all touched TS files: pass. `npx prettier --check` on touched docs/ops/tests/README: pass (only `tests/release/content.test.ts` and `restart.test.ts` warn; both untouched, pre-existing). Ran `prettier --write` on touched files only.
  - `npx tsc --noEmit -p tsconfig.json` (includes `tests/`): exit 0.
  - `npm run check`: 0 errors, 1 pre-existing warning (AppShell.svelte).
  - `npm run lint`: fails only on pre-existing `NoteEditor.svelte:64`.
  - `npm run test:unit`: 32 files, 162 passed.
  - `npm run test:integration`: first run had 1 failure (`release-hygiene` DEPLOYMENT wording, fixed above); final run 39 files, 234 passed, 7 skipped (Linux-only PTY cases).
  - `npm run build`: passed.
  - Not run: e2e (SH2.3 is not user-facing; no UI changed).
- **Blocked, not passed:** `tests/release/*` (drill, image, deployment, benchmark, restart) and SEC-SETUP-13. No Docker/Podman on this host and no Linux host. Required before release: `bash ops/release-drill.sh` and `IMAGE_UNDER_TEST=… npx playwright test --config playwright.release.config.ts tests/release/image.test.ts` on Linux. Those runs should also confirm the code-reading path (`docker logs`) with a real container.
- Known gaps: `docs/simplify-setup/ACCEPTANCE_TESTS.md` (SET-01, SET-05) still describes "no token". The PLAN named only SPEC/README for the note, so I left it. `docs/simplify-setup/PROGRESS.md` and root `docs/PROGRESS.md` history are untouched on purpose.
- Next: SH3.1 (rate-limiter failure-count primitives; see PLAN).

### Session 8 — SH3.1 (rate-limiter failure-count primitives)

- `src/lib/server/auth/rate-limits.ts`: new `AuthRateLimiter.countFailure(tx, name, windowMs, now)` and `isBlocked(db, name, limit, now)`. Buckets are keyed by `digest(name)` in the existing `auth_rate_limits` table. A window starts at its first failure, ends at `windowStartedAt + windowMs`, and is never extended. Expired rows are purged and count as absent. `countFailure` runs inside the caller's transaction and does not throw.
- Eviction: the HMAC helper (`digest`) and eviction (`makeRoom`) are shared private methods used by `attempt()` and `countFailure`. `attempt()` behavior is unchanged. Protected account names now include `DAILY_MFA_FAILURES` = `mfa-failures-day:account` (for SH3.2). Per-challenge names are not protected.
- Deviation from PLAN: `countFailure` has no `limit` argument. The plan listed one, but nothing used it; the limit is passed to `isBlocked`.
- Known limitation: if eviction cannot free space (only if nearly every row is protected), `countFailure` still records the failure and the table exceeds `MAX_RATE_BUCKETS` by one row. Documented in the code.
- Test: new `tests/integration/rate-limit-counters.test.ts` (4 cases): fixed windows and non-extension; expiry and restart; persistence across a reopened `Persistence`; eviction keeps the protected daily bucket and evicts an unprotected row; a counted failure rolls back when an outer transaction throws. SEC-MFA-6 covered.
- Commands and real results (Windows): prettier and eslint on touched files: pass. `npm run check`: 0 errors, 1 pre-existing warning (AppShell.svelte). `npm run lint`: fails only on the pre-existing `NoteEditor.svelte:64`. `npm run test:unit`: 32 files, 162 passed. `npm run test:integration`: 40 files, 238 passed, 7 skipped (Linux-only PTY). `npm run build`: passed. E2E not run (no UI change).
- Not committed (per README rules). Next: SH3.2.

### Session 9 — SH3.2 (per-challenge cap, lower MFA limit, daily failure cap)

- Limits: `rate-limits.ts` has a per-action table (`actionLimits`); `mfa` account bucket is 10 per 15 min (device 30 and IP 10 unchanged; other actions unchanged). Constants `MFA_CHALLENGE_FAILURES` (5 wrong codes, 5 min) and `MFA_DAILY_FAILURES` (30, 24 h). `blockedUntil()` added; `isBlocked()` wraps it.
- `completeMfa`: the write transaction returns an outcome (`ok` / `wrong` / `restart` / `limited`); errors are thrown after commit. A wrong code counts `mfa-challenge:<challenge hash>`; the 5th deletes the challenge. Untrusted callers (no verified device) also count `mfa-failures-day:account` and are refused before the code check while that count is at 30. Unknown, expired, consumed or non-MFA challenges return `mfa_restart` (new `ErrorCode`, HTTP 401, "Enter your password again.").
- `freshAuth`: a wrong TOTP/recovery code counts the daily cap, committed before the `unauthorized` error. It does not check the cap before the code (decision: fresh auth needs an active session, and blocking it would stop the owner's own sensitive actions for a day).
- Retry-After: new `RateLimitError` (`rate-limited` with `retryAfterSeconds`). The 15-minute `attempt()` limit still sends 900; the daily cap sends the remaining seconds. `authErrorResponse` reads it.
- Test updates: `tests/integration/auth-mfa.test.ts` flood test loops 9 times instead of 29 (the limit is 10 now). New cases: 5th wrong code → challenge deleted, next valid code → `mfa_restart`, with the count surviving a new `AuthService` (SEC-MFA-1, -2, -5); 11th untrusted MFA in 15 min → rate-limited (retry 900), window reopens after 15 min (SEC-MFA-3); 30 wrong codes → daily block, trusted device completes, block survives a new instance (SEC-MFA-4, -5); fresh-auth wrong code counts toward the cap (SEC-MFA-7); recovery code once and TOTP replay rejected (SEC-MFA-8); `mfa_restart` → 401 and `Retry-After` from `RateLimitError` (SEC-MFA-2).
- Docs: `docs/PRODUCT_SPEC.md` §13 sign-in limits paragraph (MFA limits); `docs/ARCHITECTURE.md` anti-lockout section (MFA bullet); `docs/security-hardening/ACCEPTANCE_TESTS.md` "Covered by" for SEC-MFA-1…5, -7, -8.
- Touched: `src/lib/server/auth/{rate-limits,service,http}.ts`, `src/lib/shared/domain.ts`, `tests/integration/auth-mfa.test.ts`, the docs above, this file, `docs/PROGRESS.md`.
- Commands and real results (Windows): `npx prettier --check` and `npx eslint` on touched TS: pass. `npm run check`: 0 errors, 1 pre-existing warning (AppShell.svelte). `npm run lint`: fails only on the pre-existing `NoteEditor.svelte:64`. `npm run test:unit`: 32 files, 162 passed. `npm run test:integration`: 40 files, 244 passed, 7 skipped (Linux-only PTY). `npm run build`: passed. `npx playwright test tests/e2e/auth.test.ts`: 5 passed.
- Not run: full e2e suite (this sub-task only changes the server and the MFA response for `mfa_restart`); Linux image.
- Known gaps / for SH3.3: the 5th wrong code still returns `unauthorized` (per the plan), and the 6th returns `mfa_restart`. The current sign-in form does not handle `mfa_restart` yet (generic error until SH3.3). SEC-MFA-9 and -10 stay open for SH3.3.
- Not committed (per README rules). Next: SH3.3.

### Session 10 — SH3.3 (sign-in page MFA messages)

- Sign-in form (`src/lib/components/AuthForm.svelte`): on the code step, `unauthorized` shows `auth.mfaInvalid` ("Incorrect code. Try again."); the password step keeps `auth.invalid`. `mfa_restart` clears the challenge and the code, returns to the password step (username kept, password cleared) and shows `auth.mfaRestart`. `rate-limited` keeps the server message. Keys added in `en.ts` and `zh-CN.ts`.
- Deviation from PLAN SH3.3 step E2E ("5 wrong codes → restart"): the server (SH3.2, SEC-MFA-1) deletes the challenge on the 5th wrong code but still answers that request with `unauthorized`; the next submission (the 6th) gets `mfa_restart`. The form follows the server, so the restart message appears on the 6th submission. The e2e test asserts exactly that. Spec wording in ACCEPTANCE SEC-MFA-10 was updated to match.
- E2E test "MFA sign-in messages…" (`tests/e2e/auth.test.ts`, runs before the security test): enrolls MFA through the API, confirms it (the device cookie then makes the context trusted), checks 5 × `Incorrect code`, the 6th submission's restart message and cleared password field, then a new sign-in with a not-yet-used TOTP step, and finally disables MFA with a recovery code so the next test starts with MFA off. The existing security test's code-step expectation changed to `Incorrect code. Try again.`.
- Test-harness change (test only): `scripts/e2e-server.mjs` rewrote every request on the security port (4175) to `X-Forwarded-For: 192.0.2.44`, so all security-server tests shared one IP bucket (10 MFA attempts per 15 min). The harness now honors `x-e2e-client-address` only when it is a 192.0.2.0/24 address; everything else still uses 192.0.2.44. Production code is unchanged. The new test uses 192.0.2.243 for its API calls and for browser requests to `/api/auth/**` (via `page.route`).
- Found while debugging (not a product defect): `context.browser.newContext({ extraHTTPHeaders })` XFF did not isolate the page's form posts; the route rewrite is what works. Debug logging in `rate-limits.ts` was added and removed again; `git diff` for that file is empty.
- Commands and real results (Windows): `npx prettier --check` and `npx eslint` on touched files (`AuthForm.svelte`, i18n, `tests/e2e/auth.test.ts`, `scripts/e2e-server.mjs`): pass. `npm run check`: 0 errors, 1 pre-existing warning (AppShell.svelte). `npm run lint`: fails only on the pre-existing `NoteEditor.svelte:64`. `npm run test:unit`: 32 files, 162 passed. `npm run test:integration`: first run hit a Windows worker crash (exit 3221226505) in `runtime-server.test.ts`; a second run crashed in `startup.test.ts`; a third run: 40 files, 244 passed, 7 skipped. `npm run build`: passed. `npx playwright test tests/e2e/auth.test.ts`: 6 passed (run on the rebuilt output after the debug log was removed).
- Also ran `npx playwright test tests/e2e/smoke.test.ts`: 2 passed. `tests/e2e/language.test.ts` "language and site title…" fails at the zh-CN sidebar link (`全部笔记` in `侧边栏`). This is the pre-existing failure listed in the top-level PROGRESS history; I did not re-baseline it against HEAD in this session.
- Not run: full `npm run test:e2e`; Linux image. Not committed (per README rules).
- Known limits: the 5th wrong code still shows "Incorrect code" and the form keeps the challenge until the next submission; that is the server contract (SEC-MFA-1). Recovery-code entry uses the same message.
- Next: SH4.1 (`TRUSTED_PROXIES`). SH3.4 needs user approval.

### Session 11 — SH3.4 (owner notice of failed second-factor attempts; user-approved)

- Approval: the user approved SH3.4 in this session (new visible UI in Settings → Security).
- Server: `rate-limits.ts` adds `FAILURES_SINCE_SUCCESS = 'mfa-failures-since-success:account'` (fixed 30-day window from its first failure, protected from eviction), `failureCount()` (live count, 0 when absent/expired) and `reset()`. `service.ts`: a wrong code in `completeMfa` (trusted or not) and in `freshAuth` counts (committed before the error, like the daily cap); a correct MFA code and a password-only `login` (MFA off) clear it; `resetPassword` already clears all limiter rows. `securityStatus()` returns `failedSecondFactorAttempts`; the DTO is `SecurityStatusDto` in `src/lib/shared/auth.ts`.
- UI: `SecuritySettings.svelte` shows the notice when the count is above 0 (`data-testid="second-factor-failures"`). en: `security.failedOne` / `security.failedMany`; zh-CN: same two keys with Chinese text (no plural forms in Chinese). Text follows the approved proposal.
- Decisions (documented in PLAN SH3.4 and ARCHITECTURE/PRODUCT_SPEC): counts sign-in and fresh-auth codes, on both device paths; fresh-auth success does not clear it (it is not a sign-in); the window is fixed from the first failure (30 days), so a quiet owner sees the notice expire after 30 days; the notice never blocks anything.
- Known limitation: an owner sign-in clears the count, including failures from an attacker who signed in with the password before the owner did. This follows the approved "since your last sign-in" rule. The count is a notice, not an audit log.
- Tests: `tests/integration/auth-mfa.test.ts`: exact `securityStatus` keys updated; new SEC-MFA-11 (both paths, persistence across instances, clear on success) and SEC-MFA-12 (fresh-auth counts; 30-day window via `failureCount`). `tests/e2e/auth.test.ts` security-UI test: no notice after a sign-in; a wrong fresh-auth code (`lifetime` action) shows "Invalid username or password." and the notice "1 incorrect second-factor code…" after reload. The fresh-auth request is routed to 192.0.2.245 because that test already uses the shared per-address fresh-auth budget of 10 per 15 minutes; without the route the 11th attempt is rate-limited (found while testing).
- Docs: `docs/PRODUCT_SPEC.md` §13 (notice bullet), `docs/ARCHITECTURE.md` anti-lockout list (SH3.4 bullet), `docs/security-hardening/{PLAN,README,ACCEPTANCE_TESTS}.md` (SEC-MFA-11/-12 rows, SH3.4 marked done).
- Touched: `src/lib/server/auth/{rate-limits,service}.ts`, `src/lib/shared/auth.ts`, `src/lib/shared/i18n/{en,zh-CN}.ts`, `src/lib/components/SecuritySettings.svelte`, `tests/integration/auth-mfa.test.ts`, `tests/e2e/auth.test.ts`, the docs above, this file, `docs/PROGRESS.md`.
- Commands and real results (Windows):
  - `npx prettier --check` on all touched files: pass. `npx eslint` on touched TS/test files: pass.
  - `npm run check`: 0 errors, 1 pre-existing warning (AppShell.svelte).
  - `npm run lint`: fails only on the pre-existing `NoteEditor.svelte:64` (`_value`); prettier step not reached because eslint fails first.
  - `npm run test:unit`: 32 files, 162 passed.
  - `npm run test:integration`: 40 files, 246 passed, 7 skipped (Linux-only PTY). Auth MFA file alone: 23 passed. Log included a pre-upgrade free-space message from an existing test (not a failure).
  - `npm run build`: passed.
  - `npx playwright test tests/e2e/auth.test.ts`: 6 passed (final run). Earlier runs failed on my own selector (two `role=alert` elements) and on the shared rate-limit budget; both fixed in the test, not the product.
  - `npx playwright test tests/e2e/smoke.test.ts tests/e2e/backups.test.ts`: 5 passed.
- Not run: full `npm run test:e2e` (not a milestone gate for this sub-task); Linux image (no Linux host; SH3.4 has no Linux-specific behavior).
- Not committed (per README rules).
- Next: SH4.1 (`TRUSTED_PROXIES`).
