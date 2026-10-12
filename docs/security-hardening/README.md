# Change: Security hardening from the 2026-10 security review

**Status:** planned. Issue 1 is partly implemented (uncommitted, staged work from an
earlier session); issues 2–4 are not started. Live status: [PROGRESS.md](PROGRESS.md).

**Type:** post-S18 security change from a code review. Issue 2 changes an approved
requirement and was **approved by the user** (see Decisions). It does not close S18's
outstanding release gates.

## The four issues

| ID  | Issue                                                                      | Severity   | Who can exploit it                                     |
| --- | -------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| 1   | Anyone can lock the owner out of signing in (account-wide rate bucket)     | Medium     | Any anonymous internet user                            |
| 2   | First visitor can claim a fresh instance during the 60-minute setup window | Medium     | Anyone who finds the hostname first (CT-log scanners)  |
| 3   | TOTP second factor can be guessed slowly once the password is known        | Low–medium | An attacker who already has the password               |
| 4   | Any private-network peer is trusted for `X-Forwarded-For`                  | Low        | Other containers on the proxy network; some Docker NAT |

### 1 — Login lockout (denial of service)

`AuthRateLimiter` (`src/lib/server/auth/rate-limits.ts`) counts every login/MFA
attempt in a shared account bucket (30 per 15 minutes) **before** checking the
password. 30 junk requests every 15 minutes keep the owner out indefinitely, even
with the right password. Restart does not help (SQLite-persisted), and
`reset-password` did not clear the buckets. Existing sessions keep working; new
devices and expired sessions cannot sign in.

### 2 — Setup takeover

`PRODUCT_SPEC.md` §13 "approved first-visitor ownership": for 60 minutes after the
process starts, whoever first posts `/api/setup/account` owns the instance. Caddy
obtains a certificate as soon as the site is reachable, the hostname appears in
public Certificate Transparency logs, and bots probe new hostnames within minutes.

### 3 — TOTP guessing after password compromise

`completeMfa` accepts unlimited codes per 5-minute challenge, bounded only by the
MFA bucket (30/account/15 min). With ±1 step tolerance, three codes are valid, so
each guess succeeds with p ≈ 3·10⁻⁶: ≈ 2,880 guesses/day ≈ 0.9 %/day, about 50 % in
2–3 months, with no signal to the owner. `freshAuth` also accepts TOTP codes.

### 4 — Forwarded-address trust

`clientIp()` (`src/lib/server/auth/policy.ts`) trusts one `X-Forwarded-For` value
from **any** loopback/RFC 1918/link-local/ULA peer. Any container on `proxynet`, or
any deployment where Docker rewrites the source address (userland proxy, rootless
Docker), can forge client IPs and bypass per-IP buckets. The account bucket still
caps total attempts, so impact is limited. IPv6 clients can also rotate addresses
inside their own /64 to get fresh per-IP buckets.

## Documents

| File                                       | Purpose                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| [PLAN.md](PLAN.md)                         | Small ordered sub-tasks SH1.1–SH4.3 with files and gates |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Verification cases SEC-\*                                |
| [PROGRESS.md](PROGRESS.md)                 | Per-sub-task status and session handoff log              |

Authority for this change: user decisions below > this folder > main
`PRODUCT_SPEC.md`/`ARCHITECTURE.md` and `simplify-setup/*` where they conflict. The
main documents carry a note pointing here.

## Decisions

1. **Issue 1 (approved in the earlier session that implemented it):** a stateless
   HMAC trusted-device cookie `pandanote_device` moves known devices off the shared
   account bucket; `reset-password` clears all rate-limit rows. Exempting correct
   passwords from the account bucket was rejected because it removes the
   brute-force cap and the Argon2 cost bound.
2. **Issue 2 (user approved, this session):** add back a setup secret. Design:
   - A **setup code** is generated **in memory** at process start while no account
     exists, and printed **once** to the server log (stdout) together with a ready
     link `ORIGIN/setup#code=…`. No environment variable, no file, no extra command
     besides reading the log (`docker compose logs pandanote`).
   - The 60-minute window stays as a second limit. A restart creates a new code and
     a new window (only while no account exists).
   - This **supersedes** "no setup secret" in `PRODUCT_SPEC.md` §13 and
     `simplify-setup` D5/D16 ("No token exists"). It does **not** bring back the old
     operator-chosen setup-token variable (the retired `SETUP_*` names stay ignored as legacy).
   - Logging this code is a deliberate, documented exception to "never log
     tokens": the log is its delivery channel, it is useless once an account exists,
     and it expires with the window.
3. **Issue 3 (defaults; adjust only with a documented reason):** at most 5 wrong
   codes per MFA challenge (then the password must be entered again), MFA bucket
   lowered to 10 per account per 15 minutes, and at most 30 failed second-factor
   codes per account per 24 hours on the untrusted path. Trusted devices keep their
   own bucket so an attacker who knows the password cannot lock the owner out. An
   owner-visible "failed second-factor attempts" notice is **optional** and needs
   user approval before implementation (SH3.4).
4. **Issue 4 (defaults):** new optional variable `TRUSTED_PROXIES`. Unset keeps
   today's zero-config behavior (approved simplify-setup deployment). `none`
   disables `X-Forwarded-For`; a comma-separated list of IPs/CIDRs trusts only those
   peers. The retired legacy `TRUSTED_PROXY_*` name stays ignored (old semantics, avoid
   silent reactivation). IPv6 clients are rate-limited per /64.

## Rules for implementing agents

- Do **one** sub-task from [PLAN.md](PLAN.md) per session, in the listed order,
  unless the user names a different one. Read the sub-task's "Read first" files.
- Run `git status` first. Do not overwrite, revert or restage other sessions' work.
  Do not commit unless the user asks.
- Never log passwords, TOTP secrets, recovery codes, session/device tokens or note
  content. The setup code (Decision 2) is the only allowed exception, and only in
  the one startup log line defined in PLAN SH2.1.
- Keep the generic sign-in error ("Invalid username or password.") for password
  failures. Do not add new error details that reveal whether a username exists.
- Gates and handoff: see the top of [PLAN.md](PLAN.md). Update [PROGRESS.md](PROGRESS.md)
  and append a short entry to `docs/PROGRESS.md` every session.
