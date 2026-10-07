# Simplify setup — progress and handoff

## Current state

- **Status:** **SS05 done; former archive/common-gate blocker cleared.** Schema-v2
  startup/setup/account/language/title behavior now integrates with format-v2
  backup/restore and interactive, no-echo, live-safe `reset-password`. Windows
  check/lint/build, 130 unit, 204 integration + 7 explicit Linux-only skips and
  all 97 Chromium tests pass. Linux check/lint/build, 130 unit, all 211 integration
  (no skips/exclusions) and 9 affected Chromium tests pass. Normal production image
  plus genuine named-command PTY/live-HTTP probe pass (synthetic, not a release).
- **Steps:** SS01 in progress (directory-exchange clarification remains) ·
  SS02–SS04 implemented / common gates now pass · SS05 done · SS06 not started ·
  SS07 not started. Deployment artifacts and full doc rewrite remain later steps;
  this does not close S18's real-VPS/device/accessibility/release gates.
- **Session baseline:** HEAD `e300e51` (SS04 committed); clean tree before SS05.
  No user-repository commit created by this agent; dependencies/lockfile unchanged.

## Next session: exact task

1. Read `AGENTS.md`, SPEC §9, PLAN **SS06**, acceptance DEP-01–09, target OPERATIONS
   and the SS05 handoff below; inspect current `compose.yaml`, `ops/compose.external.yaml`,
   env examples, `ops/Dockerfile`, image-build script, release drill/benchmark and hygiene.
2. Implement **SS06** minimal root `docker-compose.yml`/single env template, remove
   superseded deployment artifacts, move Caddy/drill stack into test-only release
   files, validate image name/save/load and actual Linux deployment gates. Keep
   named reset/reindex and private/non-root/same-origin/restore protections intact.
   SS01 directory exchange remains an open clarification, not an SS05 defect.
3. First validation: `npm run check && npm run test:integration -- release-hygiene
container-bootstrap startup reset-password`. Host PTY skips are explicit; rerun
   Linux image for all native/PTY/deployment gates. Never rerun after timeout with
   stale `.e2e-data/run-*` fixtures; stop owned processes and clean only test data.

## Step tracker

| Step | Title                                            | State                           | Evidence                                                                        |
| ---- | ------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------- |
| SS01 | Migration baseline, data steps, pre-upgrade copy | in progress                     | Integration/common gates pass; literal directory-exchange clarification open    |
| SS02 | One startup path, environment, proxy trust       | implemented / common gates pass | Startup/proxy + Linux image/Caddy; full common gates now pass                   |
| SS03 | Accounts, setup flow, login                      | implemented / common gates pass | SET/ACC + host/Linux regressions pass                                           |
| SS04 | Language registry, site title, Settings General  | implemented / common gates pass | LANG/SET + host/Linux affected browser/common gates pass                        |
| SS05 | Backup/restore format v2, maintenance commands   | done                            | BAK/OPS/MIG-07; 211 Linux integration + genuine production-image PTY/live reset |
| SS06 | Deployment files and image                       | not started                     | —                                                                               |
| SS07 | Documentation and full regression                | not started                     | —                                                                               |

## Known risks to watch

- Adapter 6 handler awaits `server.init` before index calls `listen` (verified in SS02).
  Kit 3's environment module is `$app/env`; build analysis must skip initialization.
- AuthService live reset is verified in SS05: DB-backed credential/revision state,
  immediate session rejection, journal/replacement checks, atomic rollback; preserve it.
- Podman-built image name after `docker image load` (`localhost/` prefix) (SS06.3).
- Caddy defaults for body size, response-header timeout and `X-Forwarded-For`
  replacement must be confirmed on the pinned Caddy version (DEP-05, DEP-08).
- Removing `stop_grace_period`: confirm idle shutdown within 10 s (DEP-06).

## Handoff history

### 2026-10-07 — SS01 first slice (in progress)

Implemented / touched files:

- `src/lib/server/db/{migrations,data-migrations}.ts`: synchronous version-keyed
  registry, SQL then data step, one fixed `now`, nullable ledger `data_step` identity,
  all-pending IMMEDIATE rollback and safe migration-number/name errors. Removed the
  runner's S10-name special case; the current v4 backfill is registered instead.
- `src/lib/server/db/pre-upgrade.ts`, `storage/private-storage.ts`: known private
  paths; online SQLite copy including WAL pages; page-count × 1.1 + manifest/reserve
  budget; fsynced 0700/0600 snapshot and version/app/time manifest; no fresh/no-op copy.
  Snapshot is detached to DELETE journal mode so it needs no WAL/SHM alongside it.
- Recoverable rotation retains `pre-upgrade.old/` until a durable installed record,
  with `private/pre-upgrade-state.json` and startup cleanup/recovery. Actual killed
  children exercise prepared/retained/published/installed boundaries. Unsafe paths,
  malformed recovery and unexpected files fail closed. Copies never contain keys.
- `scripts/{container-bootstrap,container-entry,migrate}.ts`: existing stopped-app
  live entry paths now await the copy wrapper; only typed safe errors reach logs.
  `vite.config.ts`, `db/upgrade-version.ts`, build-metadata test: adapter emits the
  same immutable `build/build-info.json` identity for source startup tooling; runtime
  metadata env cannot override it. Source-only CLI is explicitly Development.
- `backups/trust.ts`: exact restore ledger checks now include `data_step`. Restore
  staging still uses the DB-only runner, with no destination copy side effects.
- New `tests/integration/{data-migrations,pre-upgrade}.test.ts`; updated migration/
  architecture/test documentation. Existing user planning edits preserved; no commit.

Validation (pinned Node 24.21.0/npm CLI/PATH; TLS verification = 1):

- `npm run test:integration -- migrations pre-upgrade`: initial **8 fail / 9 pass**;
  SQLite's copied WAL mode created snapshot sidecars. Detached snapshot to DELETE
  mode and allowed only exact SQLite sidecars in interrupted temporary cleanup;
  rerun **17/17 pass** before two additional copy/CLI cases.
- `npm run check`: **pass**, zero diagnostics.
- `npm run test:unit`: **119 pass**.
- `npm run test:integration`: **192 pass + 2 explicit Windows-only skips**, 31 files
  (the two skipped root/UID cases are Linux-only and still require Linux execution).
- `npm run lint`: first run failed Prettier on the new data-step test; formatted it;
  final **pass**. `npm run build`: **pass** (existing large lazy-chunk warnings).
- `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/version.test.ts tests/e2e/zzrestore.test.ts`:
  **5 Chromium pass**, built auth/MFA/version/full web-restore regression. Full browser
  suite and cold production-image deployment were not run in this partial step.
- `podman info`: initially unavailable; `podman machine start` succeeded.
  `podman build -f .browser-spike/Dockerfile.ss01-tests -t pandanote-ss01-native-tests .`:
  **pass**, installs Git 2.39.5 + CA certificates then clean `npm ci --offline --no-audit`
  from verified Linux cache (no host native modules, no fresh audit claim).
- `podman run --rm --cpus=2 --memory=4g --name pandanote-ss01-native-validation pandanote-ss01-native-tests`:
  **pass**, Linux check/lint/build, **119 unit + all 194 integration**, no exclusions or
  skips. This includes modes/fsync, native Sharp/SQLite, archive/restore/process-kill,
  both root/UID cases and the four previously blocked real-Git cases. Old Linux Git
  exclusion is resolved for this checkout; final release/clean production image is
  still unverified. Ignored harness/logs under `.browser-spike/`.
- Final source changes after that run only tightened safe interrupted-manifest temp
  cleanup and added its regression; final reruns/image identity recorded below.

Decisions / remaining work:

- **Not SS01 done.** Old SQL/snapshots (v5), `setup_tokens`, and old authentication
  remain deliberately intact for a coherent testable first slice. No compatibility
  retrofit: existing ledgers without `data_step` are refused with the approved
  pre-release message. Baseline-specific `0000_foundation` refusal is tested against
  a synthetic new baseline; unconditional baseline replacement is still pending.
- Portable Node `rename` cannot replace an existing nonempty directory in one atomic
  exchange. The implemented journaled rotation is crash-safe before migrations/HTTP,
  but has a brief path-absence window. This constraint was raised during the session;
  **strict single-exchange atomicity is not claimed**. Decide/approve this clarification
  or provide a Linux-specific exchange design before closing the literal SPEC gate.
- SS02 owns shared dev/start initialization; SS03 owns new account/setup UI; SS05 owns
  format-v2 archives and complete old-known-schema staged restore. Copy exclusion is
  structural in existing archive capture; Storage display and explicit exclusion/
  untouched-by-restore tests still need integration in later work.

Next task / reads: complete SS01 baseline tasks 1–2, then adapt the v4 backfill
fixture/registry and restore trust assumptions. Read this log, SPEC §8, PLAN SS01,
`schema.ts`, `migrations.ts`, `data-migrations.ts`, `pre-upgrade.ts`, old guards/FTS
SQL and `tests/integration/{migrations,search-migration,data-migrations,pre-upgrade}.test.ts`.
First validation: `npm run test:integration -- migrations pre-upgrade search-migration`.

### 2026-10-06 — Planning session (documentation only)

- User asked to simplify setup/deployment; interview answers recorded in
  [DECISIONS.md](DECISIONS.md).
- Created `docs/simplify-setup/` with README, DECISIONS, SPEC, PLAN, ACCEPTANCE_TESTS,
  OPERATIONS, PROGRESS.
- Added "approved change, planned" pointers to `docs/PRODUCT_SPEC.md` §13,
  `docs/ARCHITECTURE.md` §1, `docs/IMPLEMENTATION_PLAN.md`, `docs/ACCEPTANCE_TESTS.md`,
  `docs/PROGRESS.md` and `README.md`. Full rewrites of those documents are deferred to
  SS07 so they keep describing actually implemented behavior until then.
- Commands run: read-only inspection (`git status`, `git log`, `grep`, file reads).
  No build/test commands run; no code changed.

### 2026-10-07 — SS01 continuation: baseline reset

User requested continuing the session. This supersedes the first slice's deferred
baseline state, not its historical passing results.

Implemented/touched:

- `schema.ts`: required account username/email; removed setup-token table. Removed
  old five SQL files/snapshots/journal; generated `0000_baseline.sql` and reviewed
  `0001_guards_and_search.sql`, two snapshots/journal. Schema **2 / 18 tables**;
  old triggers are preserved and FTS5 remains custom trusted SQL. Registry backfill
  is now version 2. Pre-release foundation histories are refused unconditionally.
- Migration/search/pre-upgrade fixtures adapted to the new baseline; required fields
  added only to synthetic test/benchmark accounts. Additional real isolated-v1 staged
  SQL/data migration regression leaves live source/schema untouched.
- `auth/service.ts`: removed obsolete token-storage implementation/import and recovery
  deletion. Retired typed entry points deliberately refuse (except existing-account
  startup no-op) until SS02/SS03 remove/replace them. **This is not completed setup**;
  no generated/default production username/email, compatibility table or fake account.
- Rewrote migration README; updated architecture/test/progress status. No dependencies,
  lockfile, Compose/env or application data changed; no commit.

Validation on the continued baseline:

- First `db:generate` attempts failed ENOENT because Drizzle requires a journal when
  the meta directory exists. Removed the now-empty meta directory and reran
  `npm run db:generate -- --name=baseline` and
  `npm run db:generate -- --custom --name=guards_and_search`: **pass**.
- `npm run db:generate -- --name=verify_no_drift`: **pass**, 18 tables/no drift.
- `npm run check`: **pass**, zero diagnostics.
- `npm run test:integration -- migrations pre-upgrade search-migration`: **20 pass**
  before the added isolated-staging test. Covers fresh/repeat/backfill/rollback,
  data identity, refusal messages, WAL/private copies, budget and process kills.
- `npm run test:unit`: **119 pass**. `npm run build`: **pass**.
- `npm run lint`: initially failed four unused retired-signature parameters; explicitly
  discard them without logging/persisting. Final rerun recorded below.
- `npm run test:integration`: **FAIL — 57 fail / 135 pass / 2 Windows skips**, 6 failing
  files: `auth`, `auth-mfa`, `container-bootstrap`, `backups`, `restores`,
  `runtime-server`. Every failure in this run reaches the deliberately retired token
  setup boundary. Assertions remain intact; none excluded or changed to pass.

Before this reset, final first-slice Linux image
`7363798cf7ce93f36f6d44b0b7fe71f4dc50b9f5d7dbe1322f1f49cec34c3c70`
passed check/lint/build, 119 unit, 194 integration (including Git/root/modes/native
restore, no exclusions) and 5 affected auth/version/restore Chromium tests. That
is **historical pre-baseline evidence, not the current application gate**. Current
Linux baseline/core and final host results will be appended below.

Remaining/blockers:

- Full gate not passed. SS02 must remove token bootstrap and initialize dev/start;
  SS03 must implement browser account setup/login and adapt real auth fixtures;
  SS05 must finish format-v2 backups and known-schema staged archive restore. Current
  `backups/{snapshot,trust}.ts` still contains obsolete table/version/name assumptions.
- MIG-01 actual fresh server startup and MIG-07 actual archive restoration remain
  pending those integrations. DB-only fresh initialization and isolated staged runner
  are tested, not claimed substitutes for the HTTP/archive acceptance cases.
- Strict directory atomic exchange remains the documented open design clarification.
  Implemented durable rotation has a path-absence window but retains/recoveries a
  complete old or new copy before migration. Storage UI copy display is still pending.

Exact next coding task: review/acknowledge these inter-step blockers, then PLAN **SS02**
`initializeApplication` (recover → keys → upgrade wrapper → settings) used by container
and dev/start, with obsolete token bootstrap removed. Read `scripts/container-*`,
`runtime.ts`, hooks/installed Kit init ordering and SPEC §8–9. First validation remains
`npm run test:integration -- migrations pre-upgrade search-migration`; the full suite
must continue to report old-auth failures honestly until SS03, not skip them.

Final continued-baseline validation / handoff:

- `npm run check` and `npm run lint`: **pass** after fixing the unused retired
  parameters; zero diagnostics. `npm run test:unit`: **119 pass**. `npm run build`:
  **pass**; the affected Playwright command also rebuilt successfully.
- `npm run test:integration -- migrations pre-upgrade search-migration`: final
  **21 pass**. An intermediate run had **1 fail / 20 pass** with a generic copy
  failure on Windows. Cause was not captured and is **not claimed fixed**: added
  server-only Error.cause diagnostics (safe logging still prints message only), then
  eight isolated first-copy repetitions and the complete 21-case rerun passed.
  Investigate if it recurs; migration is refused rather than proceeding without copy.
- `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/version.test.ts tests/e2e/zzrestore.test.ts`:
  **blocked / exit 1**, fixture initialization cannot call the retired token issuer;
  browser server did not start and no tests passed. This is the expected SS03 fixture
  dependency, not a browser/native installation issue and not a skipped pass.
- Podman socket was unavailable again on continuation; restarted its machine.
  `podman build -f .browser-spike/Dockerfile.ss01-tests -t pandanote-ss01-baseline-tests .`:
  **pass**, clean cached Linux ci/Git/CA setup. Image:
  `83b07cc1a7b7b03929bfdf74139bfc957aadcea68e0df870c9f45968e7f1e8d8`.
- `podman run --rm --cpus=2 --memory=4g --name pandanote-ss01-baseline-validation
pandanote-ss01-baseline-tests sh -c 'node --version; git --version; npm run check;
c=$?; npm run lint; l=$?; npm run test:unit; u=$?; npm run test:integration; i=$?;
npm run build; b=$?; npm run test:integration -- migrations pre-upgrade
search-migration sqlite images archive; t=$?; printf "RESULT check=%s lint=%s
unit=%s integration=%s build=%s core-native=%s\\n" "$c" "$l" "$u" "$i" "$b"
"$t"; test "$c$l$u$i$b$t" = 000000'`: overall **exit 1**. Individual results:
  Linux check/lint/build **pass**, **119 unit pass**; unfiltered integration
  **57 fail / 138 pass (195), no skips/exclusions**; explicit core/native suite
  **47 pass** (includes all 21 migration/core cases, modes/fsync/process kills,
  SQLite 3.53.2, Sharp 0.35.5/libvips 8.18.7 and archive safety probes). Actual
  archive restore remains blocked, not passed by probes. All four Git cases pass.
- No cold deployment-image build, full browser suite, final release or real-VPS check.
  Original data/keys/archives and user planning work retained; no user-repository commit.
  `git diff --check` passed; no host `.e2e-data` remained after blocked browser startup.

Final host close rerun (same pinned runtime/PATH/TLS): `npm run check`,
`npm run lint`, `npm run test:unit`, `npm run build` all **pass** (119 unit).
Unfiltered `npm run test:integration`: **57 fail / 136 pass / 2 Windows skips (195)**,
the same six old-token-dependent files; all new migration/core tests pass in this
run too. No source changes after these host/current-Linux checks, only this handoff.
Documentation-close Prettier/lint and `git diff --check` passed; dependencies/lockfile
are unchanged. Blocked Playwright startup left only empty `.e2e-data/security` parent
directories; removed them with `rmdir` and verified fixture cleanup.

Current state remains **SS01 in progress / full gate blocked**. Follow the exact
next task above; read this final evidence instead of relying on pre-baseline passes.

### 2026-10-07 — SS02 startup, environment and proxy trust

**State: core implemented / full integration gate blocked.** Started clean at
`65c6067`. No user-repository commit, dependency change or application-data deletion.

Implemented/touched:

- `server/initialize.ts`: one async recovery → keys → migration/pre-upgrade wrapper →
  settings path; safe errors retain native causes server-side only. Container bootstrap
  delegates to it after privilege drop. `runtime.ts` initializes once from Kit's `init`,
  including existing cleanup, and `getRuntime` only returns an already-ready instance.
  No request performs migrations or creates keys/accounts.
- `hooks.server.ts`: building guard via installed Kit 3 `$app/env`, eager init and
  value-free safe failure boundary. Inspected adapter 6 `src/handler.js` (top-level
  await server.init) and `src/index.js` (imports handler before listen): production
  failures exit before listening. Real built-server and Vite dev tests cover this.
- `auth/policy.ts`, generated origin handoff in `vite.config.ts`: local dev origin
  5173 / non-production built start 3000; production requires canonical ORIGIN,
  HTTPS outside loopback. DATA_DIR defaults to ./data only outside production.
  Container always forces /data. Forwarding overrides remain prohibited.
- BlockList private peer ranges: loopback, RFC1918, v4/v6 link-local and IPv6 ULA;
  mapped-v4 decimal/hex works. Private peers accept exactly one IP XFF, fall back to
  peer when absent, reject chains/invalid/empty with 400; public peers ignore XFF.
  Legacy variables are ignored, scrubbed and produce one notice without their values.
- Container named dispatch (`server`, `reset-password`, `reindex` contracts) rejects
  arbitrary commands/arguments. Maintenance checks only mount ownership, skips the
  ownership walk and drops groups/UID/GID before execution. Linux tests prove no
  child traversal/chown and zero effective capabilities.
- Removed package migrate/setup-token/recover scripts and deleted migrate/setup-token
  files. `reset-password` is a **reserved fail-closed entry, not implemented recovery**;
  SS05 owns the interactive, live-safe implementation. Retired `auth-recover.ts`
  remains unexposed for SS05 removal. Docker COPY was minimally updated now so deleted
  files do not break builds; old Compose/examples are still SS06, not updated here.
  Root env template now has only required ORIGIN plus commented optional variables.
- Tests: startup/CLI helper, container bootstrap, policy/command ranges, private storage,
  pre-upgrade shared-startup and fresh HTTP readiness, release hygiene. Existing
  account/MFA/archive assertions were not removed/excluded to fake a full pass.

Validation (final host uses explicit Node 24.21.0 executable + PATH/npm CLI, TLS=1):

- `npm run check`: pass, zero diagnostics. `npm run lint`: pass after documenting
  intentional native-cause redaction at Kit logging boundary. `npm run test:unit`:
  **120 pass**. `npm run build`: pass (existing large lazy-chunk warnings).
- `npm run test:integration -- startup`: **4 pass**, including real Vite, built
  restart/defaults, safe no-listen failures, known-v1 startup data-step rollback/upgrade.
  Earlier targeted run had one expectation mismatch (invalid login is 401, not 400);
  corrected that assertion, not production authorization.
- `npm run test:integration`: **FAIL — 54 fail / 143 pass / 3 Linux-only Windows
  skips (200)**, five files: auth/auth-mfa/backups/restores/runtime-server. All failures
  still depend on retired token setup or removed token CLI; startup/container tests pass.
- `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/version.test.ts`: **blocked,
  exit 1** at obsolete fixture initialization; no browser tests passed. The build passes.
- `podman build -f .browser-spike/Dockerfile.ss02-tests -t pandanote-ss02-native-tests .`:
  pass, Git/CA-equipped SS01 base with clean `npm ci --offline --no-audit` from Linux
  cache, not Windows modules or a fresh audit. Image `9ee508baf5c3ed500599c2b5281060f77f3a0492ac854156bc4c8d313bb53f72`.
- `podman run --rm --cpus=2 --memory=4g --name pandanote-ss02-native-validation
pandanote-ss02-native-tests sh -c 'node --version; git --version; npm run check;
c=$?; npm run lint; l=$?; npm run test:unit; u=$?; npm run test:integration; i=$?;
npm run build; b=$?; npm run test:integration -- migrations pre-upgrade
search-migration startup container-bootstrap private-storage release-hygiene sqlite
images archive; t=$?; printf "RESULT check=%s lint=%s unit=%s integration=%s build=%s core-native=%s\\n" "$c" "$l" "$u" "$i" "$b" "$t";
test "$c$l$u$i$b$t" = 000000'`: overall exit 1. Linux check/lint/build and **120
  unit pass**; unfiltered integration **54 fail / 146 pass (200), no exclusions or
  skips**; explicit startup/core/native suite **66 pass**. Root maintenance/modes,
  Sharp/SQLite/archive probes and all four Git cases execute; actual archive restore
  remains blocked, not passed by probes.
- Pinned `node .browser-spike/verify-ss02-image.mjs`: **pass** normal unmodified
  production Dockerfile via actual clean-source wrapper in an isolated synthetic
  committed clone (no user commit). Fresh image dependency installs pass; existing
  two low Mermaid/KaTeX advisories remain. A pinned retry first hit a tooling-generated
  NUL file; removed only that new file and reran successfully. Original latest preserved.
  Synthetic image `localhost/pandanote-ss02-verification:latest`, ID
  `23ed8d0ea0529ca367b788e53a30dcadb289261464815649a009e9944eadc4cd`,
  version `261009-1`, commit `04b07901a693b8899146c1f6c19d08b1987ae484`: **NOT a release**.
- Pinned `node .browser-spike/probe-ss02-image.mjs`: **pass** fresh root-owned Linux
  bind, forced /data, PID 1 Node, UID/GID 12345:12346, effective/permitted capabilities
  zero, secret-free server environment, one safe legacy notice, ready schema/settings/
  keys, restart persistence, root-ID refusal, named reindex and wrong-owner refusal.
  Idle SIGTERM exits 0 within default 10 s. Real Caddy **2.11.6** with only
  `localhost { reverse_proxy pandanote-ss02-app:3000 }` plus actual Chromium TLS/login
  load passes; Caddy replaces spoofed XFF, three spoof/nonspoof login attempts use
  the same real-client rate bucket and no spoof bucket. First diagnostic attempted
  /proc/1/environ as image root and got EACCES; reran as the actual app UID. The first
  diagnostic also selected system Node 24.15; final probe/wrapper reruns use explicit
  24.21.0. Self-signed TLS trust is test-context-only. Probe containers/bind removed.

Remaining / next:

- Common gate and normal e2e remain blocked by SS03 auth fixtures/setup; SS05 archives/
  interactive reset are not functional. No full SS02/SS01 completion, public VPS,
  production setup, maximum-size restore or backup-during-stop success is claimed.
- Strict pre-upgrade directory atomic exchange remains SS01's documented clarification.
  SS06 owns simple Compose/deployment artifacts; SS07 owns full doc rewrites/regression.
- Next task: **SS03**, starting strict username/email/password/setup schemas and
  atomic createAccount, then username login/routing/preferences and real fixtures.
  Read the files in the current next-session list; first command is
  `npm run check && npm run test:integration -- startup container-bootstrap migrations pre-upgrade`.
  Logs/harnesses are ignored under `.browser-spike/`; original data/keys/archives retained.

Final close rerun after documentation updates used the explicit pinned executable
(`v24.21.0` verified), npm CLI and PATH/TLS=1: check/lint/build **pass**, **120 unit
pass**, unfiltered integration **54 fail / 143 pass / 3 Linux-only skips (200)**,
unchanged known blockers. Overall gate remains exit 1. Linux images/probe above
precede documentation-only edits, not application changes. `git diff --check` and
fixture cleanup pass; package-lock unchanged, no NUL remains, original latest still
points to `05a2848ebd8e2c7ea6882c584694ec6e55df135fb93a5513d5cb54da40e53f14`.

### 2026-10-07 — SS03 accounts, two-step setup and username login

**State: implemented / common gate blocked by SS05 archive integration.** Started
clean at `50e3465`. No user-repository commit, dependency/lockfile change, application
storage deletion or production account seed. SS03's specific SET/ACC gates pass;
this does not mark SS01/SS02/SS03 or the product fully done while common gates fail.

Implemented/touched:

- `shared/auth.ts`: normalized 3–32 ASCII username; required trimmed basic email;
  exact 8–128 Unicode-codepoint password with 1024-byte bound, no complexity/trim/
  normalization; strict confirmation/preferences/account schemas; account-update scope.
  `shared/settings.ts`: siteTitle/language/setupCompletedAt defaults. The minimal
  `shared/i18n/registry.ts` supplies the two authoritative language options and browser
  default only; catalogs/translations/HTML language/title/shell/General remain SS04.
- `auth/service.ts`: removed retired token methods; createAccount + initial hashed
  session commit atomically, rate limits include invalid setup fields, singleton
  hashing serialized across connections, window rechecked after hashing. Runtime
  captures process-start time before initialization; injectable service clock proves
  59-minute success/60-minute close/restart. Login always verifies the actual bounded
  Argon2 hash even for an unknown username, then rechecks username/hash/revision.
  No second-factor/full-session regression. finishSetup atomically saves preferences
  and completion; account changes consume exact fresh grants without signing out devices.
- `auth/{setup-routing,validation,http,policy}.ts`, hooks: all three setup states,
  exact page/API gates, 409 setup_required/already_set_up and 403 setup_closed, no
  non-setup data APIs during step two, same-origin/private headers remain. Field
  responses contain safe messages, never passwords. Removed `api/auth/setup`; new
  `api/setup/{account,preferences}` and private `api/auth/account` are reviewed surfaces.
- `/setup` and `/setup/preferences`: retained fields and adjacent accessible errors,
  first-visitor/60-minute notice and expired restart message, browser language/timezone
  prefill, no skip/theme/week-start. AuthForm now username/password with unchanged MFA
  interaction. AccountSettings + Settings loader/page provide fresh-auth username/email
  editing and error retention; SecuritySettings explains/enforces the new password rule.
- Tests: `unit/setup`, rewritten `integration/auth` (obsolete token cases replaced by
  equivalent account/timeout/race/rollback/security cases), `integration/setup-server`
  (actual built HTTP, injected child-only clock, every routing cell, timeout/restart,
  rate limits, validation/race), MFA/account tests; auth Playwright (keyboard, mobile,
  different-device resume, field failures/retention, cookies/CSRF, account changes,
  axe light/dark 390/1440 scans on both setup pages), helper/fixture/hygiene updates.
  Browser launcher now starts truly empty storage; shared sessions come only from
  actual setup/login endpoints. Archive test/benchmark accounts also use real setup;
  archive assertions stay intact and fail honestly pending SS05.

Commands actually run (host Node 24.21.0 executable + PATH, npm CLI at
`C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`, TLS verification = 1;
logs under ignored `.browser-spike/ss03-*`):

| Command                                                                                                    | Actual result                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm exec -- prettier --write <touched files>`                                                             | PASS; repeated after edits                                                                                                                                             |
| `npm run check`                                                                                            | PASS, zero errors/warnings                                                                                                                                             |
| `npm run lint`                                                                                             | PASS; initial unused old drafts password constant removed                                                                                                              |
| `npm run test:unit`                                                                                        | PASS, **124 / 24 files**                                                                                                                                               |
| `npm run test:integration -- auth setup-server runtime-server startup release-hygiene`                     | PASS, **39 / 7 files**, including real MFA/operator/HTTP/clock/rate tests                                                                                              |
| `npm run test:integration`                                                                                 | **FAIL: 31 fail / 170 pass / 3 Linux-only skips (204)**; only backups/restores fail                                                                                    |
| `npm run build`                                                                                            | PASS, standalone and browser builds; existing lazy chunk warnings                                                                                                      |
| `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/version.test.ts`                                     | PASS **4 Chromium tests**, including all SS03 auth/setup/account flows and axe scans                                                                                   |
| `npm run test:e2e`                                                                                         | **FAIL: 3 fail / 93 pass (96)**; only two backup creation cases and the archive round trip fail; shell baselines unchanged                                             |
| `podman build -f .browser-spike/Dockerfile.ss03-tests -t pandanote-ss03-native-tests .`                    | PASS clean offline Linux ci from verified SS02 native/browser cache, Git/CA installed; no Windows modules or fresh audit claim                                         |
| `podman run --rm --cpus=2 --memory=4g --name pandanote-ss03-native-validation pandanote-ss03-native-tests` | Overall **exit 1**; Linux check/lint/build + **124 unit pass**; unfiltered integration **31 fail / 173 pass (204)**, no skips/exclusions; affected **4 Chromium pass** |
| `git diff --check`, `test ! -e .e2e-data`                                                                  | PASS, fixture cleanup verified                                                                                                                                         |

Linux image `8f1e855078669ffaf90f465c8a6226853000ebf4b5dd04d1f4922d090645a379`
uses Node 24.21.0/npm 11.19.0/Git 2.39.5, 2 CPU/4 GiB container on the existing WSL2
VM. Sharp/SQLite/filesystem/modes/root/Git/clock tests execute; actual archive restore
**does not pass**. Native output: check=0 lint=0 unit=0 integration=1 build=0 e2e=0.
This is a validation image, not a clean committed production release image or VPS.

Intermediate results: first check exposed 69 old-fixture signature/schema errors;
all replaced with genuine createAccount/username calls, not compatibility methods.
First targeted auth gate passed 37 before new HTTP/MFA-account cases; expanded gate
passes 39. First affected browser run passed 3 before adding account/axe/keyboard cases;
final affected run passes 4 on both hosts. Full regressions were not excluded/retried
as passes: SS05 snapshot still deletes absent setup_tokens, and trust still has old
format/version/table assumptions. Do not fix only the table name without implementing
format v2 and complete safe restore. The unexposed old operatorRecover/CLI remains
SS05 cleanup; the named reset-password tool is not implemented.

Remaining/next: **SS04** catalogs/fallback/Accept-Language + saved language/title +
Settings General. Read SPEC sections 5–7, PLAN SS04, registry, setup/login/AccountSettings,
root hook/HTML/layout/shell. First validation `npm run check && npm run test:integration
-- auth setup-server`. Keep archive failures visible until SS05, complete SS06 deployment
and SS07 docs/full gate later. Old intermediate settings/data are pre-release, not
silently retrofitted; user data was retained, not deleted. No S18 manual/VPS gate closed.

### Session 2026-10-07 — SS04 language registry, site title, Settings → General

**State: implemented / common gate blocked by SS05 archives.** Started from `6f50805`,
clean tree. No commit, dependency/lockfile or application-data change.

Implemented / touched files:

- `src/lib/shared/i18n/{en,zh-CN,registry,index}.ts`: `en` is the typed complete
  catalog (`MessageKey`); `zh-CN` is `Partial<Catalog>` (compile-time subset check);
  per-key English fallback with literal `{placeholder}` filling. Registry = `languageCodes`
  (`en`, `zh-CN`), native names, `complete` flag (zh-CN **declared partial** although
  all current keys are translated — the rest of the UI is not), tag matcher
  (zh, zh-CN/SG/Hans → zh-CN; zh-TW/HK/MO/Hant and unknown → en) and a bounded,
  q-value-aware `Accept-Language` matcher. `browserLanguage()` reuses the matcher.
- `hooks.server.ts`, `app.html`, `app.d.ts`, `appearance.ts`: `locals.i18n` = saved
  language/title when setup is complete, else `Accept-Language` best match + stored
  title; `<html lang="%pandanote.lang%">` substituted server-side from registry codes.
  `+layout.server.ts`/`+layout.svelte`: reactive `I18n` context (`client/i18n.svelte.ts`,
  `useI18n()` with English default for isolated fixtures), client `lang` follows it.
- Translated scope (SPEC §5): AuthForm (sign-in + MFA, “Invalid username or password.”
  mapped by error code), setup and preferences pages (with unsaved live language
  preview and the partial-language notice), Sidebar/AppShell/mobile header/drawer/
  SearchControl, AccountSettings, new Settings → General and the Settings title.
- Site title: `PageTitle.svelte` (`<page> · <site title>`; all page titles moved to it
  — **tab titles changed from `X — PandaNote` to `X · PandaNote`**), sidebar and mobile
  header brand, sign-in/setup headings. Escaped text only; `.site-title` ellipsis CSS,
  full text stays in DOM + `title`; mobile brand link aria-label contains the title.
- Settings → General: `GeneralSettings.svelte`, `PATCH /api/settings/general`
  (`updateGeneral`, strict partial `{siteTitle?, language?}`, session identity checked,
  merged inside the write transaction, no fresh auth; same-origin by the hook).
  Interpretation of “immediate save”: language saves on change; title via its Save
  button. Status/alert paragraphs render only when non-empty (existing Appearance
  tests use page-wide `getByRole('status')`).
- Tests: new `unit/i18n.test.ts`, `integration/general-settings.test.ts`,
  `e2e/language.test.ts`; extended `integration/setup-server.test.ts` (real HTTP
  Accept-Language, saved-wins-after-setup, escaping, PATCH validation/401/403) and
  `e2e/auth.test.ts` (zh-CN browser sees Chinese sign-in/preferences before setup
  completes, preview); route inventory + smoke title updated; `settings-dark-compact`
  Windows visual baseline intentionally regenerated (new General section).
  Docs: ARCHITECTURE §12 language bullet, `tests/README.md` SS04 table.

Validation (Windows, Node 24.15.0 on PATH — **not the repository-pinned 24.21.0**; npm scripts):

- `npm run check`: **pass**, 0 errors/warnings. `npm run lint`: **pass** (after Prettier).
  `npm run build`: **pass** (existing chunk-size warnings).
- `npm run test:unit`: **130 pass** (25 files, incl. 6 new i18n tests).
- `npm run test:integration`: **31 fail / 172 pass / 3 skipped (206)**; all failures are
  the known `backups.test.ts` (7) and `restores.test.ts` (24) archive cases (SS05).
  `general-settings`, `setup-server`, `release-hygiene` pass.
- `npm run test:e2e` (full): **3 fail / 94 pass**; failures are the known
  `backups.test.ts` ×2 and `zzrestore.test.ts` archive cases. `language.test.ts` and
  updated `auth.test.ts` pass; axe on zh-CN settings, English settings and public
  sign-in (light/dark, 390/1440).
- Intermediate failure fixed: a first shell run failed because my General section
  added a second `role=status` (strict-mode) and its cascade leaked the dark theme
  into the next screenshot test. `shell-light-1440x900` differs when `shell.test.ts`
  runs alone (it depends on a tag seeded by earlier specs): not regenerated.
- **Not run:** Linux validation image (no native/server-runtime change), any real-device
  or screen-reader review of Chinese text/IME.

Known gaps / decisions:

- Server and shared-zod validation messages (e.g. “3–32 characters…”) and the rest of
  the app (timeline, composer, calendar, Appearance/Security/Storage/Backup settings,
  tag/draft screens) stay English by design; zh-CN is labelled partial.
- Setup/login pages before completion follow `Accept-Language`; the preferences page
  starts from the browser's `navigator.languages` and previews the choice only
  locally until “Finish setup”.
- Language changes via Settings apply to all sessions on their next page load.

Exact next task: **SS05** (see “Next session” above). First validation:
`npm run check && npm run test:integration -- backups restores`.

### Session 2026-10-07 — SS05 backup/restore and maintenance commands

**State: done.** Started clean at `e300e51` (SS04). No user-repository commit,
application-data deletion, dependency/lockfile or deployment-topology change.
Former 31 integration/3 browser archive failures are cleared, not excluded.
SS01 directory-exchange clarification, SS06 deployment and SS07 full doc rewrite
remain open; no S18 real-VPS/manual/release completion claimed.

Implemented / touched:

- `shared/backups.ts`, `server/backups/{archive,service,snapshot,trust,restore}.ts`:
  format **2**, explicit pre-release format-1 refusal before extraction; removed
  obsolete table/v4/v5/name assumptions. Exact migration-produced schema/ledger
  comparison includes data-step identity. Known baseline-v1 has no FTS/guards;
  trusted SQL + registered search data step run only on staging, then trusted FTS
  recreation/semantic search rebuild and final inspection. Current archives preserve
  username/email/title/language/timezone/completed setup; invalid identity/incomplete
  setup fail before replacement. `pre-upgrade` is explicitly excluded and destination
  copy remains outside swaps. Existing file/MFA/key/receipt/privacy/budget/journal/
  rollback/crash protections remain, including all original attack/fault tests.
- `scripts/reset-password.ts`, new `server/maintenance/terminal.ts`, `auth/service.ts`:
  argument-free stdin/stdout TTY requirement, bounded Unicode raw/no-echo prompts,
  validation/mismatch retry, backspace and cancellation with terminal restoration.
  Username + configured login URL printed; no secret echo/argv/env/stdin JSON.
  Missing account points to setup, pending restore/upgrade recovery refuses; no
  migration/init/recovery or ownership traversal. No DB handles during prompting;
  reopen/recheck account afterwards, then Argon2 + one IMMEDIATE transaction updates
  password/MFA/codes/security revision/sessions/challenges. Journal/inode/cancellation
  rechecks after hashing refuse concurrent replacement rather than writing retained
  DB. Existing AuthService reads credentials/revisions from SQLite, not a cache.
- Removed `scripts/auth-recover.ts`/retired API; `scripts/reindex.ts` rejects arguments,
  otherwise retains stopped-app atomic/content-preserving behavior. Docker COPY list
  already ships reset/reindex and `src/lib` (including terminal helper), so no image
  COPY change was needed. Compose/env changes deliberately remain SS06.
- `tests/{unit/backups,integration/backups,integration/restores,integration/auth-mfa,
integration/reset-password,e2e/zzrestore}.test.ts`, new `tests/helpers/terminal.ts`:
  BAK/OPS/MIG-07 coverage. Genuine util-linux `script` pseudo-TTY on Linux, no runtime
  PTY dependency. Live built HTTP reset rejects old sessions/password/challenges,
  accepts eight-character Unicode password without MFA/restart, keeps notes/files/
  keys/settings; final-delete fault proves full rollback. No-account, args/pipes,
  cancellation, journals including restore starting mid-prompt covered. Independent
  archived MFA/account metadata roundtrip and staged-v1 data-step/FTS assertions;
  downloaded Settings archive restores zh-CN/title/timezone/email and completed login,
  leaves local work/archives. Synthetic distinct client buckets retain abuse limits.
- ARCHITECTURE §13.7/current archive details, PRODUCT_SPEC current-status pointer,
  target SPEC status, `ops/RESTORE_RUNBOOK.md`, tests README and both progress logs.
  Full historical deployment/doc replacement remains SS07; history preserved.

Commands/results (Windows explicit Node **24.21.0** executable + PATH, npm CLI
`C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`, TLS verification **1**;
Linux Node 24.21.0/npm 11.19.0/Git 2.39.5, WSL2 container 2 CPUs/4 GiB):

| Command                                                                                                                       | Real result                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` / `npm run lint` / `npm run build`                                                                            | PASS, zero diagnostics; existing lazy-library chunk warnings retained                                                                                                                                                                                                                                                                                                 |
| `npm run test:unit`                                                                                                           | PASS, **130 / 25 files**                                                                                                                                                                                                                                                                                                                                              |
| `npm run test:integration -- backups restores auth-mfa reset-password`                                                        | Early PASS **48 + 3 Linux-only skips**, before final additional PTY case                                                                                                                                                                                                                                                                                              |
| `npm run test:integration` (final)                                                                                            | PASS, **204 + 7 Linux-only skips / 211 / 35 files**; no failed/excluded cases                                                                                                                                                                                                                                                                                         |
| `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/backups.test.ts tests/e2e/zzrestore.test.ts tests/e2e/language.test.ts` | Final PASS **9**; two intermediate failures below                                                                                                                                                                                                                                                                                                                     |
| `npm run test:e2e` (clean final standalone)                                                                                   | PASS **97**, normal unchanged visual baselines + full a11y; 5.3 min                                                                                                                                                                                                                                                                                                   |
| `podman build -f .browser-spike/Dockerfile.ss05-tests -t pandanote-ss05-native-tests .`                                       | PASS clean offline Linux `npm ci --offline --no-audit` from verified SS03 cache, not Windows modules/current audit                                                                                                                                                                                                                                                    |
| `podman run --rm --cpus=2 --memory=4g --name pandanote-ss05-native-validation pandanote-ss05-native-tests`                    | PASS check/lint/build, **130 unit + all 211 integration (zero skips/exclusions)**, **9 affected Chromium**; RESULT all 0                                                                                                                                                                                                                                              |
| Pinned `node .browser-spike/verify-ss05-image.mjs`                                                                            | PASS normal unmodified production Dockerfile via actual clean-source image wrapper in an isolated synthetic committed clone; original latest restored                                                                                                                                                                                                                 |
| Pinned `node .browser-spike/probe-ss05-image.mjs`                                                                             | PASS actual production image: genuine Python-pty→`podman run -it … reset-password` through named entry/privilege drop, live HTTP auth/MFA/session reset, real manual create/download/upload/confirm archive restore/login, native Sharp WebP/SQLite trigram/Argon2, named stopped reindex, missing-TTY refusal, UID 12345:12346/zero caps and idle exit 0 within 10 s |
| `git diff --check`, `test ! -e .e2e-data`, `test ! -e NUL`                                                                    | PASS; synthetic fixture/probe cleanup and original latest preserved                                                                                                                                                                                                                                                                                                   |

Linux test image: `3e009b4a41ff849339894fe4ad2311ce3870d2c1e5f93c29a77be5a1681264d6`.
Production-shaped **synthetic/not release** image: `40f2d0f2840006c4c5903f30d3f342203331f5a634fcfe9c5ababbdb2d13f22f`,
`localhost/pandanote-ss05-verification:latest`, version `261010-1`, isolated commit
`00e3e72607d21f6542b594d0ce0856aeec1bc3f9`. Uses cached production dependency layers;
not a cold download/source-compilation claim. Original `localhost/pandanote:latest`
remains `05a2848ebd8e2c7ea6882c584694ec6e55df135fb93a5513d5cb54da40e53f14`.
Ignored harness/logs `.browser-spike/ss05-*`; probe root/containers removed.

Failures/intermediate findings (not passes):

- First check/34 archive tests passed on accidentally selected system Node 24.15.0.
  All later common/browser/image commands use the explicit pinned executable; no
  unpinned result treated as final gate. One exact-edit miss applied nothing.
- Affected browser run **8 pass/1 fail**: new timezone fixture omitted required
  `weekStart`, so API correctly returned 400. Added the required preference.
  Next **7 pass/2 fail**: shared synthetic fresh-auth IP bucket exhausted after SS04
  account/language tests; separate test-client IPs keep unchanged production limits.
  Final affected **9/9** pass on Windows/Linux; no security limit weakened.
- Combined final-common + full-browser command exceeded its **600 s harness timeout**
  after 93 browser cases; not a complete pass. It left stale `.e2e-data/run-*`.
  First standalone rerun **13 fail/84 pass** because older fixture directory was
  selected by existing DB-inspection helpers (ENOENT/missing receipts/wrong seeded
  DB), not live archive failure. Normal teardown removed stale test dirs; verified
  no owned app process, reran from clean fixture → **97/97**. No test assertions or
  screenshots changed to conceal this. Remove stale owned fixtures after interruption.
- Production probe reached successful genuine PTY reset twice, then host-to-WSL
  forwarded HTTP returned ECONNRESET after slow SSH. App remained running. Final
  post-PTY requests execute real HTTP inside the container (Linux integration also
  proves external built-server HTTP); complete production reset/archive/native probe
  passes. No production network/restore behavior or TLS policy changed.
- Removed tooling-generated `NUL` absent at baseline. Existing install-script/
  upstream deprecation/chunk warnings retained; no fresh audit claim.

Exact next task: **SS06**. Read current next-session list, SPEC §9/PLAN SS06/DEP tests,
current deployment files/hygiene/image wrapper/release drill. Implement minimal root
Compose + one env template and real Linux deployment tests. First validation:
`npm run check && npm run test:integration -- release-hygiene container-bootstrap
startup reset-password`. SS01 directory atomicity stays a separate open clarification;
SS07 removes superseded shipped documentation, then full final regression/drill.

Documentation-only close: Prettier on changed Markdown, `npm run lint`,
`npm run check` and `git diff --check` pass after final handoff updates. No
application/test code changed after the full host/Linux/image gates. Podman SSH
recreated a `NUL` known-hosts artifact; removed only that generated file and
rechecked `.e2e-data`/NUL absence. No unrelated processes/data were touched.
