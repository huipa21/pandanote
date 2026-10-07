# Simplify setup — acceptance tests

Rules from `docs/ACCEPTANCE_TESTS.md` §1 apply: real SQLite/filesystem/server in
integration tests, real browser for UI, Linux deployment image for container and
native behavior. A missing tool or browser is **blocked**, not passed.

## Setup flow (SET)

| ID     | Case                                                                                                                                                                                                                                          | Level             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| SET-01 | Fresh instance: `/`, `/login`, `/notes/x`, `/settings` all 303 → `/setup`; API calls return 409 `setup_required`; `/health` ok after startup.                                                                                                 | integration + e2e |
| SET-02 | Step 1 with valid username/email/password/re-enter creates exactly one account and a session, lands on `/setup/preferences`. No token field anywhere.                                                                                         | e2e               |
| SET-03 | Validation: username 2/33 chars, bad characters, uppercase input stored lowercase; email missing/invalid/255 chars; password 7/129 chars; mismatch re-enter (browser and direct API). Field errors shown, inputs kept, password never echoed. | unit + e2e        |
| SET-04 | Two concurrent step-1 requests: one account; the other gets 409 `already_set_up` and a "sign in" message.                                                                                                                                     | integration       |
| SET-05 | Setup window: with an injected clock, POST at 59 min succeeds, at 61 min returns 403 `setup_closed` and the page shows the restart message; a new process start reopens it.                                                                   | integration       |
| SET-06 | Step 2 prefills "PandaNote", browser-matched language and browser timezone (Playwright `timezoneId`/`locale`); edits saved; invalid title/zone/language rejected; Finish → `/`. No theme or week-start fields.                                | e2e + integration |
| SET-07 | Leaving after step 1: new browser context → `/` → `/login` → login → `/setup/preferences`; app pages and APIs blocked until finished.                                                                                                         | e2e               |
| SET-08 | After completion: signed out `/` and `/setup` → `/login`; signed in `/setup` and `/setup/preferences` → `/`; setup APIs return 409.                                                                                                           | integration + e2e |
| SET-09 | Setup pages pass axe (light/dark, phone/desktop) and keyboard-only completion.                                                                                                                                                                | e2e               |

## Accounts (ACC)

| ID     | Case                                                                                                                                               | Level                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| ACC-01 | Login with username in any case + password works; wrong username and wrong password give the same message, status and comparable timing.           | integration + e2e                |
| ACC-02 | Rate limits still apply per IP and account for login and setup.                                                                                    | integration                      |
| ACC-03 | MFA challenge after username/password unchanged.                                                                                                   | e2e (existing auth spec updated) |
| ACC-04 | Settings → Account: change username/email requires fresh auth (and TOTP when enabled); new username works for next login; invalid values rejected. | integration + e2e                |
| ACC-05 | Password change enforces 8–128; 8-character password accepted.                                                                                     | integration                      |

## Language and site title (LANG)

| ID      | Case                                                                                                                                                                      | Level              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| LANG-01 | Pickers list exactly the registry (English, 简体中文); unknown codes rejected by server.                                                                                  | unit + integration |
| LANG-02 | zh-CN translates setup, login/MFA, shell navigation and Settings General/Account; untranslated strings fall back to English; partial notice shown. `<html lang>` correct. | e2e                |
| LANG-03 | Before setup completes, `Accept-Language: zh-CN` shows Chinese setup; `zh-TW` and unknown fall back to English.                                                           | integration        |
| LANG-04 | Site title appears in tab, sidebar/mobile header and login heading; HTML/script-like titles render as text; long titles ellipsize without layout break.                   | e2e                |

## Migrations (MIG)

| ID     | Case                                                                                                                                                            | Level                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| MIG-01 | Empty data folder: startup creates keys, DB at current schema, default settings; no pre-upgrade copy; second start is a no-op.                                  | integration                        |
| MIG-02 | Synthetic pending migration with SQL + data step applies on startup and the data step's changes are visible; ledger records both.                               | integration                        |
| MIG-03 | Failing SQL **or** throwing data step: whole transaction rolls back, schema/data/ledger unchanged, process exits non-zero, log names the migration, no content. | integration                        |
| MIG-04 | Pre-upgrade copy is written before migrating, is a consistent openable DB with the old schema, replaces the previous copy, has 0700/0600 modes on Linux.        | integration (Linux for modes)      |
| MIG-05 | Insufficient space for the copy: no migration, no server, clear log with the needed size.                                                                       | integration (injected disk budget) |
| MIG-06 | Newer-schema DB and pre-release (`0000_foundation`) DB refuse to start with their exact messages.                                                               | integration                        |
| MIG-07 | Restoring an archive at an older known schema migrates on staging with data steps; current-schema archives restore unchanged.                                   | integration                        |

## Backup and maintenance (BAK, OPS)

| ID     | Case                                                                                                                                                   | Level             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| BAK-01 | Backup/restore round trip preserves username, email, site title, language, timezone; sessions invalidated; login with archived credentials.            | integration + e2e |
| BAK-02 | Format-v1 archive refused with the pre-release message before any replacement.                                                                         | integration       |
| BAK-03 | `pre-upgrade/` is excluded from archives and untouched by restore.                                                                                     | integration       |
| OPS-01 | `reset-password`: no TTY/args/piped input refused; mismatch re-prompt; 7-char rejected; success prints username + login URL, never the password.       | integration (pty) |
| OPS-02 | `reset-password` while the server runs: existing sessions rejected on next request, new password works without restart, MFA disabled, notes untouched. | integration       |
| OPS-03 | `reset-password` refuses with a pending restore journal and with no account (prints setup URL).                                                        | integration       |

## Deployment (DEP) — Linux image required

| ID     | Case                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEP-01 | Root `docker-compose.yml` is the only production Compose file (synthetic test-only stacks excluded); contains none of `read_only`, `tmpfs`, `cap_drop`, `cap_add`, `security_opt`, `init`, `stop_grace_period`, `ipv4_address`, `ports`, `profiles`. `docker compose config` passes with `.env` containing only `ORIGIN`. |
| DEP-02 | Fresh deployment folder (`docker-compose.yml`, `.env`, loaded image, external network) → `docker compose up -d` → healthy; `./data` created and owned by 1000:1000 with private modes; browser setup completes through Caddy with the minimal site block.                                                                 |
| DEP-03 | Restart and `docker compose down && up -d` keep account and notes; setup not shown again.                                                                                                                                                                                                                                 |
| DEP-04 | Server process: UID/GID = PUID/PGID, effective/permitted capabilities 0, PID 1 is node; non-default PUID/PGID works; root PUID refused.                                                                                                                                                                                   |
| DEP-05 | Client IP: through Caddy, rate limiting keys on the real client IP; spoofed client `X-Forwarded-For` is not honoured; from a public peer XFF is ignored.                                                                                                                                                                  |
| DEP-06 | `docker compose stop` idle → exit 0 within 10 s; stop during a backup → backup shown as failed after restart, app healthy, no partial archive listed.                                                                                                                                                                     |
| DEP-07 | Upgrade: load image with an extra synthetic migration → `up -d` → pre-upgrade copy exists, migration applied, notes intact; rollback steps in OPERATIONS restore the old image + copy successfully.                                                                                                                       |
| DEP-08 | Restore upload ≥1 GiB through the minimal Caddy config succeeds (no body limit / header timeout issue).                                                                                                                                                                                                                   |
| DEP-09 | Docker- and Podman-built images both load on the server as the name used in `docker-compose.yml` following OPERATIONS exactly.                                                                                                                                                                                            |

## Documentation (DOC)

| ID     | Case                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-01 | No current Markdown guidance or deployment artifact references removed setup-secret/exact-proxy-IP config, manual migration/secret issuance/JSON-recovery commands or deleted Compose/env paths. Only PROGRESS history is exempt. Intentional legacy scrub/refusal code and negative test assertions remain required, not configuration. release-hygiene scans docs, resolves local links and pins the operations contracts. |
| DOC-02 | Following `ops/DEPLOYMENT.md` verbatim on a clean Linux host reproduces DEP-02 (performed by the agent in the validation image and recorded).                                                                                                                                                                                                                                                                                |
| DOC-03 | PRODUCT_SPEC, ARCHITECTURE, IMPLEMENTATION_PLAN, ACCEPTANCE_TESTS and README describe the implemented behavior with no contradiction to SPEC.md.                                                                                                                                                                                                                                                                             |
