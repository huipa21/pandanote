# Simplify setup — progress and handoff

## Current state

- **Status:** **SS01/SS02 core implemented / full gates blocked**. Schema-v2 baseline,
  SQL/data migrations and private pre-upgrade copies are implemented. Shared startup
  now initializes container, dev and built server paths before requests. Environment
  defaults and private-network proxy trust are tested, including the Linux image/Caddy.
  Browser account setup remains SS03; archives and interactive recovery remain SS05.
  **Do not deploy this intermediate state for note-taking.**
- **Steps:** SS01 in progress · SS02 in progress / integration gate blocked ·
  SS03 not started · SS04 not started · SS05 not started · SS06 not started · SS07 not started.
- **Session baseline:** HEAD `65c6067`; working tree clean before SS02. No user-repository commit created.

## Next session: exact task

1. Read `AGENTS.md`, this folder, and the SS02 handoff below. Read
   `src/lib/{shared/auth,shared/settings,server/auth/service,server/auth/policy,server/initialize,server/runtime}.ts`,
   `src/hooks.server.ts`, setup/login routes, settings repository and auth/browser fixtures.
2. Next planned integration: **SS03** account schemas, createAccount, username login
   and the two-step browser setup/routing. Replace obsolete token fixtures with real
   account setup, not invented production identities or test bypasses. SS01's strict
   directory-exchange clarification and SS05 archive integration remain open.
3. First validation: `npm run check && npm run test:integration -- startup container-bootstrap migrations pre-upgrade`;
   then the common gate and affected Playwright tests. The unfiltered suite currently
   reports 54 old-token-dependent failures; do not exclude them. `reset-password`
   is only a fail-closed reserved entry until SS05 implements the interactive tool.

## Step tracker

| Step | Title                                            | State                      | Evidence                                                                                  |
| ---- | ------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------- |
| SS01 | Migration baseline, data steps, pre-upgrade copy | in progress / gate blocked | Schema-v2 baseline + core tests; planned startup/auth/archive integration pending         |
| SS02 | One startup path, environment, proxy trust       | in progress / gate blocked | Startup/proxy core + Linux image/Caddy verified; common auth/archive/browser gate pending |
| SS03 | Accounts, setup flow, login                      | not started                | —                                                                                         |
| SS04 | Language registry, site title, Settings General  | not started                | —                                                                                         |
| SS05 | Backup/restore format v2, maintenance commands   | not started                | —                                                                                         |
| SS06 | Deployment files and image                       | not started                | —                                                                                         |
| SS07 | Documentation and full regression                | not started                | —                                                                                         |

## Known risks to watch

- Adapter 6 handler awaits `server.init` before index calls `listen` (verified in SS02).
  Kit 3's environment module is `$app/env`; build analysis must skip initialization.
- AuthService in-memory state when `reset-password` runs against a live server (SS05.3).
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
