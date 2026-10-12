# Security hardening — implementation plan

Read [README.md](README.md) first (issues, decisions, agent rules).

**One sub-task per session**, in this order unless the user names another:
SH1.1 → SH1.2 → SH1.3 → SH2.1 → SH2.2 → SH2.3 → SH3.1 → SH3.2 → SH3.3 → SH4.1 →
SH4.2 → SH4.3. (SH3.4 was approved and is done.) Several sub-tasks edit
`rate-limits.ts`/`service.ts`; doing them in order avoids conflicts.

## Approved review follow-up (2026-10-12)

The user approved fixing all review findings and the recommended bucket isolation,
superseding historical shared-IP wording below:

1. Publish validated portable keys with each successful `Persistence` reopen,
   including rollback. Device trust uses a key provider and the limiter reads the
   open DB's immutable key snapshot; no process-lifetime stale key or per-HMAC I/O.
2. For a verified device, use 30/15 min per device plus 10/15 min per device/IP.
   For a verified setup code, use 30/15 min per code plus 10/15 min per code/IP.
   Anonymous account/IP caps remain; same NAT or IPv6 /64 cannot spend trusted/code
   allowance. Forged/expired cookies are anonymous, password/MFA checks remain,
   and per-device aggregate caps still prevent IP rotation from bypassing limits.
3. Cover shared IPv4, mapped IPv4 and IPv6 /64 password/MFA/setup floods, retained
   limits and fixed expiry; actual independent-key archive restore, subsequent
   failure counts/device sign-in, restart and rollback after reopen/commit faults.
4. Finish SH4.3 guidance and SEC-XFF-8 docs guards, without changing minimal Compose
   or the compatibility default. Run common/affected browser/actual Linux gates;
   record unpassed full/release gates, never claim general DoS prevention.

Tests: `tests/integration/auth-isolation.test.ts` (SEC-LOCK-8/-9, SEC-SETUP-14/-15),
`auth-restore.test.ts` (SEC-RESTORE-AUTH-1/-2), unit device-key provider, and the
release-hygiene documentation guard. Existing acceptance/history remains below.

## Standard gate (every sub-task)

```sh
npm run check
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

- The review follow-up fixes the historical NoteEditor unused action parameter
  and existing formatting; `npm run lint` now passes. Keep both ESLint and
  repository formatting green; prior failures remain recorded in PROGRESS.
- User-facing sub-tasks also run the listed Playwright specs. `npm run test:e2e`
  runs `vite build && playwright test`; for single specs run `npm run build` then
  `npx playwright test <spec>`. On Windows, `openssl` must be on `PATH` (the
  security web server makes a test certificate).
- A missing browser/native dependency is a **blocker**, not a pass. Record exact
  commands and real results in [PROGRESS.md](PROGRESS.md).
- Add each new acceptance case you cover to the "Covered by" column in
  [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md).

---

## Issue 1 — Login lockout

### Current state (from the staged work of an earlier session)

Implemented, staged, **not committed**, e2e **not** run:

- `src/lib/server/auth/device-trust.ts` (new): `DeviceTrust.issue()/verify()`.
  Token `v1.<id>.<expiresAt>.<revision>.<hmac>`; HMAC-SHA256 with the key from
  `readKeys().totpEncryptionKey` over
  `device-trust-v1\0accountId\0id\0expiresAt\0revision`; 180 days.
- `rate-limits.ts`: `attempt(action, ip, now, deviceId = null)`; with a verified
  `deviceId` the bucket `${action}:device:${id}` (30) replaces `${action}:account`.
  The IP bucket (10) is now scoped to the verified device; anonymous traffic
  cannot spend it (approved review follow-up above).
- `service.ts`: `createAccount`, `login`, `completeMfa` return `credential.device`;
  `login`/`completeMfa` accept `deviceToken`; `resetPassword` deletes every
  `auth_rate_limits` row.
- `http.ts`: `setSessionCookie` also sets `pandanote_device` (HttpOnly,
  SameSite=Strict, `path=/api/auth`, `secure` in production).
- Routes `api/auth/login` and `api/auth/mfa` read the cookie.
- Tests: `tests/unit/device-trust.test.ts`, one new case in
  `tests/integration/auth.test.ts`. ARCHITECTURE anti-lockout bullet added.

Known gaps: no MFA-stage test with the cookie; device token is not re-issued after
security changes (SH1.2); no e2e run; main docs/acceptance not updated (SH1.3).

### SH1.1 — Verify the staged implementation and add the MFA-path test

Read first: `src/lib/server/auth/{device-trust,rate-limits,service,http}.ts`,
`src/routes/api/auth/{login,mfa}/+server.ts`, `tests/integration/auth.test.ts`
(last case), `tests/integration/auth-mfa.test.ts`, `git diff --cached`.

Steps:

1. Review the staged diff against README Decision 1. Fix only real defects; list
   anything doubtful in PROGRESS instead of redesigning.
2. Add to `tests/integration/auth-mfa.test.ts` (or `auth.test.ts`) an MFA case:
   enable TOTP for the fixture, keep the `device` token from the last full sign-in,
   fill the `mfa:account` bucket with 30 `limiter.attempt('mfa', <rotating ips>, now)`
   calls, then:
   - `completeMfa(challenge, validCode, ip)` with **no** device token → rate-limited;
   - with a forged token (last segment replaced) → rate-limited;
   - with the real device token → session created and `credential.device` keeps the
     same device id (`token.split('.')[1]`).
     Use the existing TOTP helpers in that file for valid codes.
3. Add an HTTP-level check if one fits an existing real-server test
   (`tests/integration/auth-http.test.ts`): after setup, the response sets
   `pandanote_device` with `Path=/api/auth; HttpOnly; SameSite=Strict`, and the
   cookie is **not** accepted as a session (a GET to `/api/auth/security` with only
   `pandanote_device` returns 401).

Gate: standard gate + `npx playwright test tests/e2e/auth.test.ts`.
Covers: SEC-LOCK-1, -2, -3, -4, -6, -7.

### SH1.2 — Re-issue the device token after security changes

Problem: `rotateSecurity` increments `securityRevision`, which invalidates the
owner's own device token. After enabling/disabling MFA, regenerating recovery codes,
changing password or session lifetime, the current device is no longer trusted
until the next full sign-in.

Read first: `src/lib/server/auth/service.ts` (`rotateSecurity` and its callers),
`src/routes/api/auth/security/+server.ts`, `src/lib/server/auth/http.ts`.

Steps:

1. In `rotateSecurity(tx, owner, keepCurrent = true)`: when it creates the new
   session credential, also return
   `device: this.devices.issue(owner.id, revision, now, existingDeviceId)`.
   `existingDeviceId` is optional; get it by verifying the request's device cookie
   **against the owner before rotation** (`this.devices.verify(token, owner, now)`)
   in each caller, and pass it through. If none/invalid, a new id is issued — the
   caller is fully signed in and freshly authenticated, so trusting this device is
   intended.
2. Thread an optional `deviceToken?: string` parameter through `confirmEnrollment`,
   `disableMfa`, `regenerateRecoveryCodes`, `changePassword`,
   `changeSessionLifetime`. In `security/+server.ts` read
   `cookies.get(DEVICE_COOKIE)` and pass it. `setSessionCookie` already writes
   `credential.device`.
3. `revokeAll` (`keepCurrent = false`) and `resetPassword` must **not** issue a
   device token.

Tests (integration, `auth.test.ts` or `auth-mfa.test.ts`): for password change and
MFA enable, the returned `credential.device` verifies at the new revision, keeps the
old device id when the old token was passed, and a login with it succeeds while the
account bucket is flooded. `revokeAll` returns no device token.

Gate: standard gate + `npx playwright test tests/e2e/auth.test.ts`.
Covers: SEC-LOCK-5.

### SH1.3 — Documentation and operator recovery text for issue 1

Files: `docs/PRODUCT_SPEC.md` §13 (one bullet: trusted devices, flood behavior,
reset-password clears limits), `docs/ACCEPTANCE_TESTS.md` (pointer only if not
already present), `ops/DEPLOYMENT.md` troubleshooting table (row: "Too many
attempts. Try again in 15 minutes." on a new device during an attack → wait, sign
in from a device used before, or run the documented
`docker compose run --rm pandanote reset-password` (DEPLOYMENT §reset), which also
clears sign-in limits), `README.md` reset section if it describes reset effects,
`scripts/reset-password.ts` success
message mentions that sign-in limits were cleared (no secrets in output).

Gate: `npx prettier --check docs ops scripts/reset-password.ts` + standard gate
(`tests/integration/reset-password.test.ts` may assert the message; update it).

---

## Issue 2 — Setup code (user approved)

### Contract (all SH2 sub-tasks)

- **Format:** 20 characters from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  (no `I L O 0 1`; 31 symbols, ≈ 99 bits), each from `crypto.randomInt(31)`.
  Displayed as `XXXXX-XXXXX-XXXXX-XXXXX`.
- **Normalization (client and server):** remove spaces and `-`, uppercase. Valid
  iff `/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{20}$/` after normalization.
- **Storage:** plaintext only in the `AuthService` instance (needed once for the
  log line) plus `tokenHash('setup', normalized)`. Never written to SQLite, files
  or env. Compare digests with `crypto.timingSafeEqual`.
- **Lifetime:** generated lazily by `AuthService.setupCode()` the first time it is
  called while `setupState() === 'new'`; stable for that instance; `setupCode()`
  returns `null` when an account exists. A new process ⇒ a new code. The 60-minute
  window (`setupWindowOpen`) still applies.
- **Fail closed:** if no code was generated for this instance, every setup attempt
  is rejected as an invalid code.
- **Log line** (exact prefix; tests parse it), printed once by `runtime.ts` after
  the runtime is ready and only when `setupCode()` is non-null:

  ```text
  PandaNote setup code: ABCDE-FGHJK-MNPQR-STUVW (valid for 60 minutes while no account exists)
  PandaNote setup link: https://notes.example.com/setup#code=ABCDE-FGHJK-MNPQR-STUVW
  ```

  Use `console.info`. Regex for harnesses:
  `/PandaNote setup code: ([A-Z2-9]{5}(?:-[A-Z2-9]{5}){3})/`.

- **Request:** `POST /api/setup/account` body gains `setupCode` (string). The
  shared `setupAccountSchema` gets `setupCode: setupCodeSchema` (trim → normalize →
  regex; message "Enter the setup code from the server log.").
- **Order in `createAccount(value, ip)`:**
  1. `assertSetupOpen()` (unchanged).
  2. Read `value.setupCode` if `value` is an object with a string `setupCode`;
     normalize; compare with the stored digest (cheap, constant time).
  3. Wrong/missing code: `limiter.attempt('setup', ip, now)` (account + IP buckets;
     may throw `rate-limited`), then throw `SetupCodeError`.
  4. Correct code: `limiter.attempt('setup', ip, now, 'setup-code')` — reuses the
     per-key bucket from SH1 so an attacker flooding wrong codes cannot exhaust the
     owner's setup allowance. Review follow-up: its IP bucket is also separate
     from wrong-code traffic, using `setup:device-ip:setup-code:<normalized-ip>`.
  5. Continue as today: `setupAccountSchema.parse`, serialization, hashing, insert.
- **Wrong-code response:** HTTP 400, same shape as `fieldValidationResponse`:

  ```json
  {
    "ok": false,
    "error": {
      "code": "validation",
      "message": "Check the highlighted fields.",
      "fields": {
        "setupCode": "Setup code is incorrect. Use the newest code from the server log."
      }
    }
  }
  ```

  Implement as a small exported class `SetupCodeError` (server-only) mapped in
  `src/routes/api/setup/account/+server.ts`. Do not add a new `ErrorCode`.

- The setup **page** prefills the field from `location.hash` `#code=…`, then
  removes the fragment with `history.replaceState(null, '', '/setup')`. The
  fragment is never sent to the server or in `Referer`.

### SH2.1 — Server: generate, log and verify the setup code

Read first: `src/lib/server/auth/service.ts` (`setupState`, `assertSetupOpen`,
`createAccount`), `src/lib/server/auth/tokens.ts`, `src/lib/shared/auth.ts`,
`src/routes/api/setup/account/+server.ts`, `src/lib/server/auth/validation.ts`,
`src/lib/server/runtime.ts`, `tests/helpers/auth.ts`,
`tests/integration/{auth,setup-server,runtime-server}.test.ts`,
`scripts/backups-benchmark.ts`.

Steps:

1. New `src/lib/server/auth/setup-code.ts`: `newSetupCode()`, `formatSetupCode()`,
   `normalizeSetupCode()`, `setupCodeMatches(digest, input)`. Put the shared
   normalization/regex in `src/lib/shared/auth.ts` (`setupCodeSchema`) so the page
   can reuse it.
2. `AuthService`: private `setupCodePlain?: string`, `setupCodeDigest?: string`;
   `setupCode(): string | null` per the contract; verification + limiter order in
   `createAccount` per the contract.
3. `runtime.ts`: after `current = {...}` print the two log lines when
   `auth.setupCode()` returns a code (use `policy.origin` for the link).
4. Route: catch `SetupCodeError` → 400 field response (before `authErrorResponse`).
5. Update callers/tests that create accounts in-process: `tests/helpers/auth.ts`
   (`setupCode: auth.setupCode()`), `tests/integration/auth.test.ts` (`details`
   builders), `scripts/backups-benchmark.ts`. Where two `AuthService` instances race,
   each uses its own `setupCode()`.
6. Update HTTP tests that spawn `build/index.js` and already capture stdout
   (`tests/integration/setup-server.test.ts`, `runtime-server.test.ts`): parse the
   code with the regex above (wait for the line after `/health` is ok) and send it.
   Re-check the existing abuse-limit assertions: wrong/missing codes count toward
   the account bucket; a correct code must still succeed after 30 wrong-code
   attempts from other IPs.
7. New tests (integration `auth.test.ts` + unit `tests/unit/setup.test.ts` or a new
   `tests/unit/setup-code.test.ts`): format/normalization (lowercase, spaces,
   hyphens accepted; ambiguous characters rejected); `setupCode()` is stable per
   instance, `null` after an account exists, different for a new instance; missing,
   wrong and a code from **another** instance are rejected with no account created;
   correct code succeeds; flood of wrong codes does not block the correct code;
   window expiry still returns `setup_closed` even with a correct code; log line is
   printed exactly once and not printed when an account exists (HTTP test
   stdout).

Gate: standard gate. Playwright e2e will fail until SH2.2; note it in PROGRESS.
Covers: SEC-SETUP-1…7, -9, -10.

### SH2.2 — Setup page field and e2e harness

Read first: `src/routes/setup/+page.svelte`, `src/routes/setup/+page.server.ts`,
`src/lib/shared/i18n/{en,zh-CN}.ts` (`setup.*` keys), `scripts/e2e-server.mjs`,
`playwright.config.ts`, `tests/helpers/browser-session.ts`,
`tests/e2e/auth.test.ts`; find every other e2e setup post with
`grep -rn "setup/account" tests/e2e tests/helpers`.

Steps:

1. Page: add a "Setup code" text input first in the form (`id="setup-code"`,
   `name="setupCode"`, `autocomplete="off"`, `autocapitalize="characters"`,
   `spellcheck="false"`), with help text: "Find it in the server log:
   `docker compose logs pandanote`". Prefill from `#code=` on mount and strip the
   fragment. Include `setupCode` in the posted value; show `fields.setupCode` like
   other field errors. Add `setup.code`, `setup.codeHelp` keys in `en.ts` and
   `zh-CN.ts` (Chinese text required; follow the file's style).
2. `scripts/e2e-server.mjs`: spawn the server with `stdio: ['inherit','pipe','pipe']`,
   forward both streams to the parent's stdout/stderr, parse the code with the
   contract regex and write it to `<parent>/setup-code` (mode `0o600`), where
   `<parent>` is the existing `.e2e-data` or `.e2e-data/security` folder. Delete the
   file in `cleanup`. This is test harness only.
3. Test helpers: add `readSetupCode(baseURL)` in `tests/helpers/` that maps the
   base URL to the right file; use it in `browser-session.ts`, every
   `tests/e2e/auth.test.ts` setup post, and any browser test that fills the setup
   form (it must fill `#setup-code`).
4. E2E cases in `tests/e2e/auth.test.ts`: the link `/setup#code=…` prefills the field
   and the URL no longer has a fragment; a wrong code shows the field error and no
   account is created; the correct code reaches `/setup/preferences`.

Gate: standard gate + `npm run build` then
`npx playwright test tests/e2e/auth.test.ts tests/e2e/smoke.test.ts tests/e2e/zzzaccessibility.test.ts`
(record the known pre-existing "Choose year" axe failure separately if it appears),
then the full `npm run test:e2e` once.
Covers: SEC-SETUP-8, -11, -12.

### SH2.3 — Documentation and release harness

Files:

- `docs/PRODUCT_SPEC.md` §13: replace the "Approved first-visitor ownership" bullet
  with the setup-code rule; keep the approved-change note at the top consistent.
- `docs/simplify-setup/SPEC.md` (Setup window paragraph) and `README.md`: one
  "superseded by security-hardening Decision 2" note; do not rewrite history.
- `docs/ARCHITECTURE.md` setup bullets (~line 1352): code generation, storage,
  verification order, log-line exception.
- `ops/DEPLOYMENT.md`: setup steps now include
  `docker compose logs pandanote | grep "setup"` and opening the printed link;
  troubleshooting rows "Setup code is incorrect" (use the newest log line; a
  restart makes a new code) and "Setup timed out" (restart prints a new code).
- `README.md` setup section (~line 64: "first visitor owns", "There is no setup
  secret") — rewrite for the setup code.
- `docs/ACCEPTANCE_TESTS.md`: replace any first-visitor acceptance wording with a
  pointer to SEC-SETUP-\*.
- Release harness (Linux only): `tests/release/drill.test.ts`,
  `tests/release/image.test.ts` read the code from `docker logs <container>` with
  the contract regex before posting setup. Run per `tests/release/README.md` if a
  Linux Docker host is available; otherwise record **blocked**, not passed.

Gate: `npx prettier --check docs ops README.md tests/release`; standard gate;
release tests on Linux or recorded as blocked.
Covers: SEC-SETUP-13.

---

## Issue 3 — TOTP guessing

### SH3.1 — Rate-limiter primitives (no schema change)

Read first: `src/lib/server/auth/rate-limits.ts`, `src/lib/server/db/schema.ts`
(`authRateLimits`), `tests/integration/auth.test.ts` (limit cases).

Steps:

1. Keep `attempt()` behavior. Add `countFailure(tx, name, limit, windowMs, now):
number` that increments (or creates) the bucket `digest(name)` **inside the
   caller's transaction** and returns the new count, and
   `isBlocked(tx | db, name, limit, now): boolean`. Rows use the existing table:
   `expiresAt = windowStart + windowMs` (fixed window), never extended.
2. Eviction (`MAX_RATE_BUCKETS`): the protected-key list must also include the new
   account-wide names from SH3.2 (`mfa-failures-day:account`). Per-challenge
   buckets are not protected.
3. Do not throw inside the transaction in a way that rolls back a counted
   failure; callers will commit and throw afterwards (see SH3.2).

Tests (integration): fixed window and expiry, count persistence across instances,
eviction keeps protected keys, `countFailure` inside a rolled-back outer
transaction is rolled back (document that callers must commit).

Gate: standard gate. Covers: SEC-MFA-6.

### SH3.2 — Server: per-challenge cap, lower MFA limit, daily failure cap

Read first: `src/lib/server/auth/service.ts` (`completeMfa`, `consumeFactor`,
`freshAuth`, `createChallenge`), `src/lib/server/auth/rate-limits.ts`,
`src/lib/server/auth/http.ts` (`authErrorResponse`), `src/lib/shared/domain.ts`
(`ErrorCode`), `tests/integration/auth-mfa.test.ts`.

Steps:

1. Limits: for action `'mfa'` the account bucket is **10** per 15 minutes (device
   and IP buckets unchanged: 30 and 10). Make limits a per-action table in
   `rate-limits.ts`, not scattered literals.
2. Restructure `completeMfa` so failures are **committed**: the write transaction
   returns `{ kind: 'ok', credential } | { kind: 'wrong' } | { kind: 'restart' }`,
   and the method throws after the transaction. Never throw inside the transaction
   after counting.
3. On a wrong code (TOTP or recovery):
   - `countFailure(tx, 'mfa-challenge:' + challenge.tokenHash, 5, 5 min)`; at 5
     delete the challenge and return `restart`.
   - If the caller has **no** verified device id:
     `countFailure(tx, 'mfa-failures-day:account', 30, 24 h)`.
4. Before checking a code, if the caller has no verified device id and
   `isBlocked('mfa-failures-day:account', 30)`, throw `rate-limited` with message
   "Too many incorrect codes today. Sign in from a device you used before, or try
   again tomorrow." (retry-after header: keep existing 900 or compute remaining;
   document the choice).
5. Unknown/expired/consumed challenge → `restart` (not the password message).
6. New `ErrorCode` `'mfa_restart'`; `authErrorResponse` maps it to **401**
   (otherwise unknown codes fall through to 503). Message: "Enter your password
   again."
7. `freshAuth`: a wrong TOTP/recovery code (password correct) also counts
   `mfa-failures-day:account`; same commit-then-throw pattern. Keep its
   `failedLogin` response.
8. `resetPassword` already deletes all rate-limit rows; keep it.

Tests (integration `auth-mfa.test.ts`): 5th wrong code deletes the challenge and
the 6th returns `mfa_restart` even with a valid code; a fresh password login gives
a new challenge that works; 11th MFA request in 15 min from untrusted callers →
rate-limited; 30 failures in 24 h block the untrusted path but a trusted device
still completes MFA; failures persist across a new `AuthService` instance; a
recovery code still works and is consumed exactly once; replay of a used TOTP step
still rejected; HTTP status for `mfa_restart` is 401.

Gate: standard gate + `npx playwright test tests/e2e/auth.test.ts`.
Covers: SEC-MFA-1…5, -7, -8.

### SH3.3 — Sign-in page MFA messages

Read first: `src/lib/components/AuthForm.svelte`, `src/lib/shared/i18n/{en,zh-CN}.ts`
(`auth.*`), `tests/e2e/auth.test.ts`.

Steps:

1. In the code step, `unauthorized` shows a new key `auth.mfaInvalid`
   ("Incorrect code. Try again.") instead of "Invalid username or password.".
2. `mfa_restart`: clear `challenge` and `code`, return to the password step and show
   `auth.mfaRestart` ("Too many incorrect codes or the code step expired. Enter your
   password again.").
3. `rate-limited`: show the server message (already the default branch).
4. Add both keys in `en.ts` and `zh-CN.ts`.

E2E (`tests/e2e/auth.test.ts`, MFA fixture already exists there): wrong code →
`auth.mfaInvalid`; 5 wrong codes → back to the password step with the restart
message; the following full sign-in works.

Gate: standard gate + build + `npx playwright test tests/e2e/auth.test.ts`.
Covers: SEC-MFA-9, -10.

### SH3.4 — Optional: owner notice of failed second-factor attempts (user-approved; done in session 11)

Approved by the user (new visible UI). Plan: keep a
protected bucket `mfa-failures-since-success:account` (30-day expiry, reset on
successful MFA); expose `failedSecondFactorAttempts` in `securityStatus()`; show in
Settings → Security: "N incorrect second-factor codes since your last sign-in.
Someone may know your password — change it." Files: `service.ts`, security DTO in
`src/lib/shared/`, `SecuritySettings.svelte`, i18n, tests.

As built: counter `mfa-failures-since-success:account` (protected, fixed 30-day window
from its first failure). Counted: wrong codes in completeMfa (both paths) and in
freshAuth. Cleared: successful completeMfa and password-only login (`login` with MFA off).
Not cleared by fresh-auth success (not a sign-in). `resetPassword` clears it with all
rate-limit rows. Cases SEC-MFA-11/-12.

---

## Issue 4 — Forwarded-address trust

### SH4.1 — `TRUSTED_PROXIES` configuration (done in session 12)

Read first: `src/lib/server/auth/policy.ts` (`authPolicy`, `clientIp`,
`privatePeers`), `src/hooks.server.ts` (call site), `src/lib/server/initialize.ts`
(`ignoreLegacyEnvironment` — the retired `TRUSTED_PROXY_*` name stays ignored),
`tests/unit/auth-policy.test.ts`.

Steps:

1. `authPolicy(env)` parses `TRUSTED_PROXIES`:
   - unset or empty → `trustedPeers = 'private'` (today's `privatePeers` list);
   - `none` (case-insensitive) → `trustedPeers = null` (never read XFF);
   - otherwise comma-separated entries, each an IPv4/IPv6 address or CIDR
     (`10.0.5.2`, `172.18.0.0/16`, `fd00::/8`); build a `BlockList`. Any invalid
     entry, prefix out of range, or more than 32 entries → `StartupConfigurationError`
     ("TRUSTED_PROXIES must be none or a comma-separated list of IP addresses/CIDRs").
     Add `trustedPeers` to the `AuthPolicy` interface.
2. `clientIp(peer, headers, policy)`: XFF is read only when the peer matches the
   configured list (IPv4-mapped IPv6 peers must match IPv4 entries — `BlockList`
   handles this when checked as `ipv6`; add a test). Behavior for trusted peers is
   unchanged (absent → peer; exactly one valid IP → it; otherwise 400).
3. `hooks.server.ts`: pass `runtime.policy`.
4. Startup log: when `TRUSTED_PROXIES` is set, log
   "Trusting X-Forwarded-For only from N configured proxy entries." (no addresses
   needed; addresses are not secrets but keep logs short).

Tests (unit `auth-policy.test.ts`): unset keeps every existing case green; `none`
ignores XFF from loopback; list trusts only listed peers (in and out of a CIDR,
IPv4-mapped IPv6 peer); invalid values throw at startup; the retired `TRUSTED_PROXY_*` legacy name (exact name in `ignoreLegacyEnvironment`) still ignored.

Gate: standard gate. Covers: SEC-XFF-1…5.

Done (session 12). Implementation notes: `AuthPolicy.trustedPeers` is `'private' | BlockList | null`;
the parser lives in `src/lib/server/auth/policy.ts` (`parseTrustedPeers`, `trustedProxyEntries`).
Entries are trimmed; an empty entry, a zone ID (`%`), a leading-zero or signed prefix, or

> 32 entries is rejected. Host bits in a CIDR are accepted and masked by `BlockList`.
> Startup log (runtime, once): `Trusting X-Forwarded-For only from N configured proxy entries.`
> or `X-Forwarded-For is ignored (TRUSTED_PROXIES=none).`; no addresses are logged. The
> `release-hygiene` env allowlist gained `TRUSTED_PROXIES`.

### SH4.2 — IPv6 /64 rate-limit bucketing (done in session 13)

Read first: `src/lib/server/auth/rate-limits.ts`, `tests/integration/auth.test.ts`.

Steps:

1. In `AuthRateLimiter`, derive the IP bucket key with `rateLimitAddress(ip)`:
   IPv4 → as is; IPv4-mapped IPv6 (`::ffff:a.b.c.d`) → the IPv4 address; other
   IPv6 → the first 64 bits, canonical lowercase, e.g. `2001:db8:1:2::/64`.
   Use `node:net` (`isIP`) and a small expansion helper; no new dependency.
2. Only the rate-limit key changes; `locals.clientIp` stays the full address.

Tests (unit): mapping table incl. compressed forms (`2001:db8::1`,
`2001:0db8:0000:0000:ffff::1`), mapped IPv4, IPv4. Integration: 10 attempts from
10 different addresses inside one /64 exhaust the IP bucket; another /64 is not
affected.

Gate: standard gate. Covers: SEC-XFF-6, -7.

Done (session 13). `rateLimitAddress(ip)` is exported from `rate-limits.ts`; `attempt()` uses it for the `:ip:` bucket only. Covers: `tests/unit/rate-limit-address.test.ts` "SEC-XFF-6…" and `tests/integration/auth.test.ts` "SEC-XFF-7…".

### SH4.3 — Documentation for issue 4 (delivered in review follow-up)

Files: `ops/DEPLOYMENT.md` (env table row for `TRUSTED_PROXIES`; hardening
paragraph near "Another proxy must…": how to find Caddy's address with
`docker network inspect proxynet`, giving Caddy a fixed `ipv4_address`, then
`TRUSTED_PROXIES=<caddy ip>`; `none` when the app port is exposed directly; note
Caddy replaces XFF by default and needs its own `trusted_proxies` only when it sits
behind a CDN), `.env.example` (commented optional line), `docs/ARCHITECTURE.md`
(XFF bullets near line 349 and 1241), `docs/PRODUCT_SPEC.md` only if it lists
environment variables.

Gate: `npm run lint` and `npm run test:integration -- release-hygiene`; the
hygiene guard checks `.env.example` text (dotenv has no Prettier parser).
Covers: SEC-XFF-8.
