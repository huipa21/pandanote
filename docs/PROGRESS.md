# PandaNote — Progress and cross-session handoff

## Current state

- **Phase:** authentication/persistence foundation, responsive shell and Markdown renderer; product implementation remains unfinished.
- **Completed steps:** S00–S04 — **done**, including the previously partial S02.
- **Earliest unfinished step:** S05 — Browser drafts and recovery — **not started**.
- **Requested work this session:** finish S02 authentication, optional MFA, recovery and security flows — **done**. This supersedes the partial S02 commit's misleading broad title, not its preserved history.
- **Repository:** clean starting HEAD `31e85e0` (committed S04). Existing S03/S04 preserved; this session's S02 changes are uncommitted. No commit created by this agent.
- **Implemented:** encrypted confirmed TOTP enrollment/change/cancel, password-bound pending MFA login, atomic drift/replay and recovery-code consumption, ten hashed generation-only codes/download/regeneration, five-minute single-use scoped fresh-auth, password/MFA/session-lifetime changes, security revision/cookie rotation, all-device signout, functional security UI and stdin-confirmed VPS-only recovery command. S03/S04 remain intact. Schema stays version 3 / 18 tables; only small pinned QR helper/types and lockfile added. Composer remains in-memory; drafts/uploads/notes/backups are not claimed.
- **Validation:** Windows check/lint/build, 39 unit + 72 integration + all 18 Chromium tests pass. Linux fresh native install, check/lint/build and all 39 unit + 72 integration tests pass. Linux Chromium passes both authentication tests, including actual generated-cert HTTPS/trusted-edge MFA/security UI. Existing renderer/CSP/shell/snapshot regressions remain passing on Windows. Linux cross-platform shell baselines, physical-device/IME, full assistive-technology, real-domain deployment and target-VPS performance audits remain S18, not claimed passes.
- **Runtime:** unchanged Node 24.21.0 LTS; npm 11.12.1 (Windows) / 11.19.0 (Linux). Host commands require explicit pinned executable **and PATH**, plus `NODE_TLS_REJECT_UNAUTHORIZED=1` because the harness supplies an insecure default.

## Next session: exact instructions

1. Read `AGENTS.md`, planning documents and the latest S02 completion handoff. Relevant contracts: ARCHITECTURE 6/7.1/11.1–11.2/12.5, IMPLEMENTATION_PLAN S05, ACCEPTANCE_TESTS DRAFT-01–04/AUTH-01–05.
2. Inspect git and preserve the uncommitted S02 work. Read `components/{Composer,Markdown,Modal}.svelte`, `shared/markdown/*.ts`, `shared/domain.ts`, `client/markdown/mermaid.ts`, styles and `tests/e2e/{auth,markdown,shell}.test.ts`.
3. Next task: **S05** versioned account/draft-scoped localStorage text/metadata and IndexedDB blob repositories with multiple draft recovery, persistence/quota errors, missing-blob reconciliation and cross-tab revision protection. No upload before explicit Post; no silent browser-draft rewrites.
4. Keep authentication regressions and schema/private storage boundaries intact. Future backup/restore actions must consume exact fresh-auth scopes inside coordinated action transactions; a login session alone is insufficient.
5. First validation: `npm run check && npm run test:integration`, then `npm run test:e2e`, on pinned Node with `NODE_TLS_REJECT_UNAUTHORIZED=1`. E2E now requires OpenSSL and owns ports 4173–4176. Preserve production CSP/runtime origin, hydration-safe forms, no-flash theme, zoom/safe-area and renderer attack tests. Linux shell baselines/physical-device/performance audits remain S18.

Subsequent sessions should always follow the next unfinished step recorded here.

## Step tracker

| Step | Description                        | State       |
| ---- | ---------------------------------- | ----------- |
| S00  | Bootstrap and technical validation | Done        |
| S01  | Schema and persistent storage      | Done        |
| S02  | Authentication and optional TOTP   | Done        |
| S03  | Design tokens and responsive shell | Done        |
| S04  | Markdown/code/Mermaid/tag parsing  | Done        |
| S05  | Browser drafts and recovery        | Not started |
| S06  | Private uploads and Sharp          | Not started |
| S07  | Atomic/idempotent note lifecycle   | Not started |
| S08  | Composer posting orchestration     | Not started |
| S09  | Cards, cursor timeline and filters | Not started |
| S10  | Exact multilingual SQLite search   | Not started |
| S11  | Month calendar and scroll sync     | Not started |
| S12  | Detail/edit/conflict/image viewer  | Not started |
| S13  | Drafts and Trash screens           | Not started |
| S14  | Tag administration                 | Not started |
| S15  | Location/settings/storage          | Not started |
| S16  | Manual backup/create/download      | Not started |
| S17  | Uploaded restore and rollback      | Not started |
| S18  | VPS deployment/release validation  | Not started |

## Settled decisions most likely to be accidentally regressed

- No note titles; the earlier optional-title answer was explicitly superseded.
- No separate search service; exact substring search, FTS5 trigram plus short-query fallback.
- New drafts stay entirely local until Post; text in localStorage, binary files in IndexedDB.
- Multiple local drafts; server drafts originate from published notes moved to draft.
- Server draft edits stay local until Post; no Save draft/background server autosave.
- Post button only; no Ctrl/Cmd+Enter publishing shortcut.
- Continuous single-column timeline; month calendar follows top visible note; not a year heatmap or masonry.
- Day filter locks results to that day; search/tag filters otherwise cover all dates.
- Month/year picker; fixed desktop composer/sidebar; primary scrolling only in notes pane.
- Optional location (lat/lon/accuracy/manual label), no auto tracking/geocoding/embedded maps.
- Static lossy WebP display + thumbnail; no retained originals after success; reject animation.
- Warm quiet UI, muted green, system/light/dark; configurable density and long-card collapse.
- Optional TOTP with single-use recovery codes; seven-day default sessions.
- Manual server-stored full backups/download; restore via uploaded backup in Settings.
- No automatic backups, no separate backup password; archives unencrypted/sensitive.
- Detail dialog/private URL; tag management edits source hashtags; no silent conflict overwrites.

## Defaults needing validation, not new user requirements

Examples: exact spacing/breakpoint/collapse heights, Monday week start, search/query limits, disk reserve, future-date restriction for initial nonscheduling scope, archive format and compatible dependency versions. These are explicitly marked in specification/architecture. Tune with evidence and document changes; do not quietly change settled behavior.

## Session handoff template

Append a new entry at the end; update current state/tracker above. Use a real date/session identifier when available.

```text
### Session <identifier> — Sxx
State: in progress / blocked / done
Implemented:
- ...
Touched files:
- ...
Checks actually run:
- <exact command>: <pass/fail/blocked + brief result>
Decisions/deviations:
- ... (update affected specification if needed)
Known issues / unfinished work:
- ...
Next session:
- Read: <specific files/sections>
- Do: <one precise next task>
- Verify: <specific command/test>
```

## Handoff history

### Planning session — documentation only

Created README, AGENTS instructions, product specification, architecture, S00–S18 implementation plan, acceptance-test matrix, and this progress tracker. Reviewed retry-before-upload behavior, transient backup exclusions, portable MFA keys, safe restore and destination backup rediscovery. No application code was implemented. Next agent should bootstrap S00 rather than redesign the app or assume any feature already exists.

Documentation checks: file/line inventory ran. A first link/fence/tracker check attempted Python, but Python was unavailable on the development host. A first Node version incorrectly treated an inline Markdown attachment example as a filesystem link; the check was corrected to ignore code examples and rerun.

Validation outcome: **PASS** — final Node documentation check covered 7 Markdown documents and 6 actual local navigation links; code fences valid; 19 ordered S00–S18 steps align with the progress tracker; each step contains dependencies, outcome, tasks, acceptance gate, and next-step hint. Manual cross-document review also completed. No application tests/builds/native validation ran.

### Session 2026-10-03 — S00 bootstrap and technical validation

**State: done.** All S00 acceptance requirements passed; S01 was not started.

Implemented:

- Git initialization and secret/data/archive/browser/build ignores; Docker context allowlist keeps host native modules and runtime data out of images.
- Pinned Node LTS/SvelteKit/Svelte/Vite/TypeScript/adapter-node, exact dependencies and npm lockfile; strict application and separate test/tooling TS checks; ESLint/Prettier; six mandatory validation scripts.
- Tiny SSR shell and no-store `/health` liveness endpoint, basic CSP/nosniff/referrer headers. No fake note/composer/settings screens or demo account.
- Real temporary SQLite WAL/FULL/foreign-key/busy-timeout/Drizzle/online-backup tests. Actual FTS5 trigram English/数据库/図書館 candidates; 香港/港/猫 and literal punctuation fallback compared to normalized literal oracle. Snapshot includes uncheckpointed WAL writes.
- Real Sharp WebP/thumbnail/orientation/metadata/alpha/size probes; generated static GIF/PNG/JPEG and animated GIF/WebP; corrupt/pixel-limit failures.
- remark UTF-16 source-span/CRLF rewrite feasibility without code/escaped markers/block HTML/destination changes; sanitized GFM; lazy/disposable Shiki smoke.
- Browser-only dynamic Mermaid import with strict security, SVG-native labels and explicit DOMPurify SVG policy. Actual flow/sequence diagrams, syntax failure and hostile SVG/click tests under CSP; no valid-diagram CSP violations or attacker requests. Harness is separate from production routes.
- Streamed tar.gz creation and no-write validation on real temp files; canonical paths, types, duplicates, allowlist/size/checksum/missing entries, compressed/expanded/count caps, corrupt gzip, raw PAX/global-PAX/GNU/link/device rejection. Valid archive then goes through actual second-pass staged extraction in the test.
- Deterministic Playwright-managed built adapter-node app + test-only browser server; isolated fixture data cleaned. Linux/glibc validation image installs its own native modules from lockfile.

Touched files:

- New root tooling: `.gitignore`, `.dockerignore`, `.node-version`, `.npmrc`, `.env.example`, `.prettierignore`, `.prettierrc.json`, `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.*.config.ts`, `playwright.config.ts`, `eslint.config.js`.
- New app: `src/app.html`, `src/app.d.ts`, `src/hooks.server.ts`, `src/routes/+page.svelte`, `src/routes/health/+server.ts`.
- New verification: `scripts/e2e-server.mjs`, `tests/README.md`, `tests/unit/`, `tests/integration/`, `tests/spikes/`, `tests/browser/`, `tests/e2e/`, `ops/Dockerfile.validation`.
- Updated `README.md`, ARCHITECTURE sections 2.1/13.1 and this progress log. PRODUCT_SPEC/ACCEPTANCE_TESTS received formatting-only table/fence changes from Prettier; no product requirements changed. Planning history preserved.

#### Exact selected versions

| Family                                          | Versions                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                                         | Node 24.21.0 LTS; npm Windows 11.12.1 / Linux 11.19.0                                                                                                   |
| App                                             | Kit 3.0.0; Svelte 5.57.1; adapter-node 6.0.0; vite-plugin-svelte 7.3.1; Vite 8.3.2; TypeScript 6.0.3; svelte-check 4.7.6                                |
| Persistence                                     | better-sqlite3 12.11.1 (bundled SQLite 3.53.2); drizzle-orm 0.45.3; drizzle-kit 0.31.11                                                                 |
| Images                                          | Sharp 0.35.5; bundled libvips 8.18.7 on both platforms                                                                                                  |
| Markdown                                        | unified 11.0.5; remark-parse 11.0.0; remark-gfm 4.0.1; remark-rehype 11.1.2; rehype-sanitize 6.0.0; rehype-stringify 10.0.1; Shiki 4.5.0                |
| Diagrams/archive                                | Mermaid 12.1.0; DOMPurify 3.4.16; tar-stream 3.2.2 (ships own types)                                                                                    |
| Later-domain helpers (not implemented features) | Zod 4.6.5; Temporal polyfill 0.5.1; Argon2 0.45.1; otplib 13.5.0                                                                                        |
| Testing                                         | Vitest 5.0.3; Playwright 1.63.0; Chromium 153.0.8010.12 (build 1243)                                                                                    |
| Lint/format                                     | ESLint 10.12.0; @eslint/js 10.0.1; typescript-eslint 8.71.0; eslint-plugin-svelte 3.23.0; globals 17.13.0; Prettier 3.9.9; prettier-plugin-svelte 4.1.1 |
| Types/override                                  | @types/node 24.19.1; @types/better-sqlite3 9.6.0; @types/mdast 4.0.4; scoped @esbuild-kit/core-utils esbuild override 0.28.2                            |

#### Commands actually run and final outcomes

On this Windows host, npm's system wrapper chooses its adjacent old Node. The
final commands therefore used the following explicit executable and npm CLI
(the machine-specific cache path is not part of the application contract):

```sh
export NODE_TLS_REJECT_UNAUTHORIZED=1
export PATH='/c/Users/huipa/AppData/Local/npm-cache/_npx/538786c08bcb9442/node_modules/node/bin':"$PATH"
N='/c/Users/huipa/AppData/Local/npm-cache/_npx/538786c08bcb9442/node_modules/node/bin/node.exe'
C='/c/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'
```

Node 24.21.0 was obtained using `npm exec --yes --package=node@24.21.0`.
On a correctly configured Node installation, the commands below are simply
`npm ...` as documented in README.

| Command                                                                            | Actual result                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `git status --short`, `ls`, document reads; `git init`                             | Initially no git/app files; docs read fully and preserved; git initialized, no commit |
| `npm view ... version engines peerDependencies`                                    | Compatible stable versions queried; package sources/types/API docs inspected          |
| `"$N" "$C" install`, then `"$N" "$C" ci` with final pins                           | PASS, fresh reinstall; 483 packages on Windows, zero reported vulnerabilities         |
| `"$N" "$C" exec -- playwright install chromium`                                    | PASS, actual Chromium and headless-shell downloaded with TLS verification enabled     |
| `"$N" "$C" run format`                                                             | PASS, source/docs formatted                                                           |
| `"$N" "$C" run check`                                                              | PASS, zero errors/warnings including test/tooling tsc                                 |
| `"$N" "$C" run lint`                                                               | PASS, ESLint and Prettier                                                             |
| `"$N" "$C" run test:unit`                                                          | PASS, 2 files / 17 tests                                                              |
| `"$N" "$C" run test:integration`                                                   | PASS, 4 files / 27 tests, actual native/filesystem libraries                          |
| `"$N" "$C" run test:e2e`                                                           | PASS, production build + 4 Chromium tests; fixture data cleanup verified              |
| `"$N" "$C" run build`                                                              | PASS, adapter-node output; no test-only probe routes shipped                          |
| `"$N" "$C" audit`                                                                  | PASS, zero vulnerabilities on final pins/override                                     |
| `"$N" "$C" exec -- drizzle-kit --version`                                          | PASS, Kit 0.31.11 / ORM 0.45.3                                                        |
| `podman machine start`; `podman pull docker.io/library/node:24.21.0-bookworm-slim` | PASS, existing local Podman VM started; Linux image pulled                            |
| `podman build -f ops/Dockerfile.validation -t pandanote-s00 .`                     | PASS, fresh Linux npm ci with own native modules, zero reported vulnerabilities       |
| `podman run --rm --cpus=2 --memory=4g pandanote-s00`                               | PASS: Linux check, lint, 17 unit, 27 integration, build; Node 24.21.0 / npm 11.19.0   |
| Host and container `node --input-type=module -e` native version queries            | Both: SQLite 3.53.2, Sharp 0.35.5, libvips 8.18.7                                     |

Linux base digest:
`sha256:5cbc7caba8c2c0f0bca675d1b61b9f2857e1cf1853c6164ee9dd409501a936e7`.
Validation image at the passing code gate:
`6d4ff6c5ef4da98efbd8759f06eb0f931d233ec92a6330f5b2004176e50759f0`.
Linux x86_64/glibc runs in the existing WSL2 Podman VM, with test-container CPU
limit 2 and memory limit 4 GB (VM itself was configured with 2 GiB RAM/8 CPUs).
This is native compatibility evidence, **not a target-VPS performance benchmark**.
Linux Playwright was not run in this S00 image; required browser smoke/CSP
checks passed on Windows. No native/Linux requirement was skipped.

#### Failed/intermediate attempts (resolved, not counted as passes)

- Initial `npm install` attempts failed engine checks because npm's wrapper/child PATH used system Node 24.15.0 even though an explicit version command showed 24.21.0. Corrected explicit executable **and PATH**; did not modify the system Node installation.
- First check/build failed with Kit 3 `config_file_unsupported`; old `svelte.config.js` and `.svelte-kit/tsconfig.json` assumptions were invalid. Unit/integration transforms consequently failed before running tests. Moved config into the Vite plugin and extended `$app/tsconfig` using inspected Kit 3 sources.
- Next check exposed hook-type export moved to `@sveltejs/kit/hooks` and tar-stream's own `Header` type. Corrected imports and removed redundant `@types/tar-stream`.
- Two integration expectations initially failed: Shiki escapes `<` as `&#x3C;`, and tar-stream's packer does not emit a global-PAX type from that string option. Corrected the escaping assertion; global/PAX/GNU tests now mutate real raw headers/checksums, so they genuinely exercise hidden extension rejection.
- Initial `npm audit` reported four moderate dev-tool-chain advisories from Drizzle Kit's old esbuild. Targeted override initially left a stale nested package/lock resolution after `npm install`/`npm update`; regenerated the uncommitted lock/dependency tree, then verified clean install/audit and Drizzle CLI. No force downgrade of Drizzle was applied.
- One audit request transiently failed `ENOTFOUND registry.npmjs.org`; later successful audit returned zero. Browser download was rerun after the interrupted command chain.
- **Repeat `npm ci` with better-sqlite3 13.0.3 failed on Windows and the first Linux build:** npm defaulted to `node-gyp rebuild` despite the upstream package's `gypfile: false`. Both lacked the build toolchain. First install/native tests alone were not sufficient. Selected compatible stable **12.11.1**, then verified repeat clean Windows ci and fresh Linux ci/native suites without adding a global compiler or changing the stack.
- First Linux run with corrected native pin stopped at lint: new `tests/README.md` table formatting. Formatted it and reran the complete Linux gate successfully.
- Final installs retain upstream deprecation warnings for `prebuild-install` and Drizzle Kit's esbuild-kit loaders. Linux npm 11.19 also warns about reviewing native install-script approvals; these scripts ran successfully. No audit vulnerability remains. Revisit tooling on dependency updates; do not silently move to npm 12 or the broken native pin.

#### Decisions, limitations and next task

- API/version decisions are reflected in ARCHITECTURE 2.1. Archive format remains tar.gz, tightened to regular USTAR without hidden extensions. Mermaid CSP permits inline styles only, not inline scripts/eval; no product requirement changed.
- Every helper is labeled a capability probe. Full tag grammar, search semantics/benchmarks, image staging/queue/cleanup, production renderer/sanitizer defenses and complete manifest/schema/key/rollback restore behavior remain their planned steps. Authentication helpers are pinned, not implemented/benchmarked.
- `/health` is process liveness only; there is no durable data/schema yet. Do not expose this scaffold as a finished private application.
- No release/performance/accessibility/independent restore drill claimed. S18 remains not started.
- **Next session:** implement S01 server-only connection + explicit migrations and real migration tests first. Read the files listed in the current handoff. First command: `npm ci && npm run check && npm run test:integration` on the pinned runtime; then exercise Drizzle schema generation before creating the durable schema. Preserve uncommitted bootstrap files and this history.

### Session 2026-10-03 — S01 database and persistent storage foundation

**State: done.** S01's acceptance gate passed on Windows and Linux. S02 was not started.

Implemented / touched files:

- `src/lib/server/db/{schema,connection,migrations}.ts`, `drizzle.config.ts`,
  `migrations/0000_foundation.sql`, `0001_invariant_guards.sql`, Drizzle snapshots/
  journal and `migrations/README.md`: 17 domain tables, required indexes/FKs/checks,
  singleton account/settings, no titles/roles. Note identity/creation/revision and
  ready/reference-safe attachment triggers. WAL/FULL/FKs/5s busy timeout,
  trusted-schema off, synchronous IMMEDIATE transactions and draining close.
- `scripts/migrate.ts`, `package.json`, `tsconfig.tests.json`: explicit operator
  migration/init command, reviewed Drizzle generation, current schema version 2,
  hash-checked contiguous ledger and all-pending transactional upgrades. Unknown,
  modified, newer schemas and failed upgrades do not overwrite prior state.
  Native Node TS stripping uses erasable syntax and explicit relative extensions;
  `#lib` package imports map Kit 3 client/server aliases. Dependency pins/lockfile
  remain unchanged (lockfile-only reconciliation made no dependency diff).
- `src/lib/server/storage/private-storage.ts`: environment-configurable private
  root, absolute path required in production, source/public/symlink/junction/path
  rejection; generated UUIDv4 IDs/known variants, fsynced private JSON creation/
  replacement, random stable portable keys and missing/corrupt-key refusal.
  POSIX directories 0700, keys/DB/WAL/SHM 0600; NTFS ACLs documented for Windows.
- `src/lib/shared/{domain,settings}.ts`, `src/lib/server/settings/repository.ts`,
  `src/lib/server/db/receipts.ts`: strict safe DTO/error/UTC/location/revision/
  transition/result contracts, future-date validation, bounded settings defaults,
  validated singleton persistence, transactional receipt primitives with mismatch
  rejection. Initial timezone UTC pending explicit setup/browser proposal.
- `src/lib/server/maintenance/{coordinator,cleanup,journal}.ts`: synchronous and
  async write leases, bounded drain/exclusive gate, expiring maintenance capability,
  failure/timeout release and idempotent shutdown. Transactional, reference-checked
  cleanup enqueueing; generated-ID-only durable bounded restore journal primitive.
  Pending recovery journals block normal opening/migration; no restore claimed.
- `tests/helpers/persistence.ts`, new domain/coordinator unit tests and four new
  persistence/storage/migration/server-boundary integration files. Real read-only
  inspection connections assert integrity/FKs/index direction and invariants;
  seeding is test-only. Browser-boundary tests run actual isolated production
  builds for both direct and indirect server imports with test-mode bypass off.
- `.dockerignore`, `.env.example`, `ops/Dockerfile.validation`, README,
  ARCHITECTURE 4.3, `tests/README.md`, this handoff. Docker context now includes
  trusted migrations but still excludes runtime data/secrets/host native artifacts.
  No route/UI or settled product requirement changed.

Checks actually run:

Host commands used the S00 `N`/`C` executable paths and pinned PATH (see above).
Final network/validation commands explicitly exported
`NODE_TLS_REJECT_UNAUTHORIZED=1`.

| Command                                                                   | Actual result                                                                                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `git status --short`, `git log -1`, repository/doc/file reads             | Clean S00 baseline; preserved all existing files                                                                     |
| `"$N" "$C" ci && ... run check && ... run test:integration`               | PASS initial clean install, 0 audit vulnerabilities, baseline 27 integration tests                                   |
| `"$N" "$C" exec -- drizzle-kit generate --name=foundation`                | PASS after correcting SQLite index API; generated 17-table migration with scoped esbuild override                    |
| `"$N" "$C" exec -- drizzle-kit generate --custom --name=invariant_guards` | PASS, custom SQL migration/snapshot prepared and invariant triggers implemented                                      |
| `"$N" "$C" install --package-lock-only`                                   | PASS final rerun with TLS verification, no dependency/lockfile change, 0 vulnerabilities                             |
| `"$N" "$C" run db:generate -- --name=verify_no_drift`                     | PASS, no schema changes/nothing to migrate                                                                           |
| `"$N" "$C" run format`                                                    | PASS                                                                                                                 |
| `"$N" "$C" run check`                                                     | PASS, 0 errors/warnings including native-CLI erasable syntax/test tooling                                            |
| `"$N" "$C" run lint`                                                      | PASS, ESLint/Prettier                                                                                                |
| `"$N" "$C" run test:unit`                                                 | PASS, 4 files / 23 tests                                                                                             |
| `"$N" "$C" run test:integration`                                          | PASS, 8 files / 40 tests, actual repeated CLI, SQLite/filesystem and isolated browser-import rejection builds        |
| `"$N" "$C" run test:e2e`                                                  | PASS, production build + all 4 Chromium smoke/Mermaid regression tests                                               |
| `"$N" "$C" run build`                                                     | PASS, adapter-node output; no persistence or test fixture route in the client                                        |
| `podman build -f ops/Dockerfile.validation -t pandanote-s01 .`            | PASS, fresh Linux npm ci/native artifacts, 0 vulnerabilities                                                         |
| `podman run --rm --cpus=2 --memory=4g pandanote-s01`                      | PASS, Linux check/lint, 23 unit, 40 integration, build; POSIX/fsync/key/SQLite/Sharp/archive checks execute on Linux |
| `git diff --check`                                                        | PASS; only host autocrlf informational warnings                                                                      |

Passing Linux code-gate image:
`cae8c409453337091ec922343c27fff647980a77a15380b538478bf3907b8a28`.
Same pinned Node 24.21.0 bookworm/glibc base digest as S00; npm 11.19.0.
Linux Chromium was not run in this foundation image; full browser regressions
passed on Windows. This is native compatibility evidence, not a VPS performance
or full archive-restore drill (S17/S18).

Resolved intermediate failures / observations:

- Initial Drizzle generation used a PostgreSQL-style `.desc()` column method,
  unavailable on SQLite columns. Switched to typed SQL DESC index expressions;
  generated SQL/index_xinfo and no-drift generation verified actual order.
- Initial check found better-sqlite3 pragma results typed `unknown`; added narrow
  inspection casts. No type-check errors remain.
- Real CLI test rejected TS parameter properties in Node strip-only mode.
  Replaced them with ordinary fields and added `erasableSyntaxOnly` checking;
  repeated actual Node CLI passes on both hosts without a TS loader dependency.
- Initial boundary test failed on removed `$lib`, then missing `#lib` mapping.
  Added installed Kit 3 package imports mappings. A subsequent build unexpectedly
  succeeded because Vitest's inherited test environment bypassed Kit's import
  guard. The child explicitly sets TEST/VITEST false and NODE_ENV production;
  direct and indirect imports now genuinely fail at the server/client boundary.
- One lockfile-only command inherited harness TLS verification value `0` and
  emitted Node's insecure TLS warning. This was not intentionally configured by
  project code. Inspected the inherited value, explicitly set it to `1`, and reran
  the network command and final validation. Future sessions must set it explicitly.
- Existing upstream Drizzle-loader/prebuild-install deprecation and Linux npm
  native install-script review warnings remain; installs/native tests passed.
  No dependency change, service/stack expansion or security exception was added.

Remaining scope / exact next task:

- No S01 blocker. The schema/contract foundations are not account setup, full
  idempotent note services, file cleanup processing, search/FTS or restore. S07
  must enforce revision predicates and atomic content/tag/link/search/receipt
  writes; schema triggers are defense in depth, not service authorization.
- Low-level Drizzle/native handles exist for reads/migrations/online backup;
  domain mutations must use `Persistence.write`, never bypass the shared gate.
  S02 must integrate a single runtime instance with setup/auth and signal shutdown.
- Begin S02 operator-held setup token + single account and measured/bounded
  Argon2id implementation. Read the exact files in the current handoff; first
  validation is `npm ci && npm run check && npm run test:integration` using the
  pinned runtime and verified TLS. Add sole-account/token-reuse integration tests
  before sessions/MFA/UI. No new product functionality was deferred from S01.

### Session 2026-10-03 — S02 first slice: setup, password sessions and route privacy

**State: in progress.** This session intentionally implemented a tested first slice;
S02's optional TOTP/fresh-auth/security gate is **not complete**. No S03 work started.

Implemented / touched files:

- `src/lib/server/auth/{passwords,tokens,rate-limits,service,policy,http}.ts`,
  `src/lib/shared/auth.ts`, shared error code: Argon2id v19 with random salt,
  64 MiB / three passes / one lane / 32-byte output; a process-wide concurrency
  cap of one with no waiting queue. Exact Unicode password bytes, 12-codepoint
  minimum, 256 UTF-16 unit / 1024-byte maximum. Generic failed-login responses.
- `src/lib/server/db/{schema,migrations}.ts`, `migrations/0002_setup_tokens.sql`,
  snapshot/journal and README: version 3 / 18 tables. Operator-held 32-byte token
  hashes, one-hour expiry/reissue; account creation, token deletion and initial
  session commit together. Account singleton constraint preserved. Setup-token
  runtime state explicitly excluded from the later full backup design.
- `scripts/{setup-token,auth-benchmark}.ts`, `package.json`, `.env.example`:
  operator token issuance (no public endpoint), synthetic secret-free benchmark,
  explicit `.env` loading for dev/start/CLI. Token output is deliberately displayed
  once to the operator terminal, not logged by the server. No dependency/pin/lock
  resolution change; lockfile-only reconciliation produced no actual lock diff.
- Persistent fixed-window limits: independent setup/login scopes, 10 attempts/IP
  and 30 account-wide per 15 minutes, including successes, no sliding lockout.
  Keyed IP digests, expiry cleanup, protected account buckets and hard 1024-row cap.
- Hashed random bearer sessions, default seven-day absolute expiry via settings,
  host-only HttpOnly/Secure-production/SameSite=Strict cookies, expiry/revocation/
  security revision checks, current-session logout, expired pruning and 100-session
  bound with oldest eviction. Login rechecks account/hash/revision after async
  verification. MFA-enabled rows currently deny password-only access entirely.
- `src/lib/server/runtime.ts`, `src/hooks.server.ts`, `src/app.d.ts`: one lazy
  explicitly migrated runtime, safe initialization errors, coordinator-backed
  writes and adapter post-request graceful shutdown. Method-aware exact public
  allowlist; private page redirects and API/file/backup 401s, required configured
  Origin on mutations, ignored untrusted forwarded headers and explicit exact-IP
  proxy trust. Authentication JSON has a 4 KiB actual streamed-byte cap. Safe
  no-store/nosniff/referrer/frame/CSP headers; no auth secrets in routine DTOs.
- `vite.config.ts`: adapter 6's generated origin handoff is narrowly replaced
  after the stock adapter build with a canonical runtime ORIGIN reader. The
  expected export must occur exactly once; upstream drift or build-time origin
  configuration fails closed. No dependency source patch, baked-in domain,
  wildcard trusted origin or disabled CSRF. Same artifact tested at two origins.
- `src/lib/components/AuthForm.svelte`, setup/login pages, auth API routes, root
  page/load: functional minimal setup/login/logout, accessible labels/feedback,
  duplicate-submit prevention and retained input on failures. The private root is
  still an explicitly labeled technical scaffold, not a notes/security-settings UI.
- `tests/unit/auth-policy.test.ts`, `tests/integration/{auth,auth-http,runtime-server}.test.ts`,
  migration test update, `tests/e2e/auth.test.ts`, smoke/teardown and e2e server
  fixture initialization: real SQLite/Argon2/CLI/browser tests, setup races and
  transaction failure retry, revision races, session/rate bounds/restart, streaming
  limits, built private routes and production cookie flags. E2E teardown now stops
  its own app before removing Windows-locked SQLite files; fixtures cleaned.
- README, ARCHITECTURE 12.4/backup runtime exclusions, migrations/test README and
  this handoff. No PRODUCT_SPEC requirements, stack or scope changes.

Checks actually run (host uses the S00 N/C paths and pinned PATH; TLS explicitly 1):

| Command                                                                             | Actual result                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`, `git log -2`, docs/API/source reads                           | Clean S01 baseline `ea7b9ee`; planning docs read fully; installed Argon2, Kit 3/adapter 6 sources inspected                                           |
| `"$N" "$C" ci && ... run check && ... run test:integration`                         | PASS baseline: clean install, zero audit vulnerabilities, 0 diagnostics and all original 40 integration tests                                         |
| `"$N" "$C" run db:generate -- --name=setup_tokens`                                  | PASS, reviewed new singleton table migration/snapshot; version incremented to 3                                                                       |
| `"$N" "$C" run db:generate -- --name=verify_no_drift`                               | PASS, no schema drift/nothing to migrate                                                                                                              |
| `"$N" "$C" install --package-lock-only`                                             | PASS, zero audit vulnerabilities, no dependency/lock resolution change                                                                                |
| `"$N" "$C" run format`                                                              | PASS; final source/docs formatted                                                                                                                     |
| `"$N" "$C" run check`                                                               | PASS final, zero errors/warnings including test/tool/CLI TypeScript                                                                                   |
| `"$N" "$C" run lint`                                                                | PASS final ESLint/Prettier                                                                                                                            |
| `"$N" "$C" run test:unit`                                                           | PASS final, 5 files / 28 tests                                                                                                                        |
| `"$N" "$C" run test:integration`                                                    | PASS final, 11 files / 53 tests, real native/filesystem/CLI and production-server tests                                                               |
| `"$N" "$C" run test:e2e`                                                            | PASS final, production build + all 5 Chromium tests, including full password setup/login/logout and existing Mermaid CSP regressions                  |
| `"$N" "$C" run build`                                                               | PASS final adapter-node build with runtime origin handoff                                                                                             |
| `"$N" "$C" run auth:benchmark`                                                      | PASS, synthetic native measurements and explicit concurrent-operation rejection (below)                                                               |
| `podman build -f ops/Dockerfile.validation -t pandanote-s02-partial .`              | PASS final fresh Linux ci, native artifacts and zero audit vulnerabilities                                                                            |
| `podman run --rm --cpus=2 --memory=4g pandanote-s02-partial`                        | PASS final Linux check/lint, 28 unit + 53 integration, build; actual production restart/two-origin/form-CSRF/graceful-shutdown test executes on Linux |
| `podman run --rm --cpus=2 --memory=4g pandanote-s02-partial npm run auth:benchmark` | PASS final Linux synthetic probe, concurrency bound enforced                                                                                          |
| `git diff --check`; `test ! -e .e2e-data`                                           | PASS; host autocrlf informational warnings only, E2E fixture cleanup verified                                                                         |

Final passing Linux code-gate image:
`0d3336f5c9e5db5300a46fb0d801203cb7a24f23101b7f4bac021e681f85303f`.
Same pinned Node 24.21.0 bookworm/glibc base digest as S00/S01; npm 11.19.0.
This image precedes the final progress-log-only update. Linux Chromium was not
run; all five browser tests passed on Windows. No full S02 pass is claimed.

Argon2 measurements (five hash + five verify samples; 10 ms RSS sampler):

| Host                                          | Hash median / p95 | Verify median / p95 | Baseline / peak RSS |
| --------------------------------------------- | ----------------- | ------------------- | ------------------- |
| Windows x64, Node 24.21.0                     | 123 / 134 ms      | 131 / 136 ms        | 66 / 131 MiB        |
| Linux x64, final 2-CPU/4-GB-limited container | 139 / 178 ms      | 137 / 166 ms        | 81 / 146 MiB        |

Each probe confirmed that a second concurrent hash is rejected, with no queue.
Linux uses the same WSL2 VM described in S00 (VM memory 2 GiB), not a real VPS.
These small synthetic samples justify the initial bounded 64 MiB parameters,
**not** a target-VPS benchmark or load-testing guarantee. Recheck on deployment.

Resolved intermediate failures / observations:

- First check had two unused root CSS selector warnings after replacing its link
  with logout; selectors corrected. Final check has zero warnings.
- Initial integration run had 3 failures: Argon2 0.45.1 serializes PHC parameters
  as `m,p,t`, not assumed `m,t,p`; the overly strict verifier rejected its own
  hashes and broke login. Now accepts only those two explicitly bounded orders.
  Rate-limit test incorrectly expected later IP buckets to expire at the earlier
  account deadline; corrected the test to the actual fixed-window expiry.
- First new e2e run failed reading a response body after navigation and then hit
  the 240-second command timeout during fixture teardown with live SQLite handles.
  Test assertion no longer races navigation; teardown explicitly stops the
  test-owned child before deletion. A stale fixture directory was removed only
  after confirming that the timed-out test servers had exited.
- Second e2e run expected an authenticated APIRequestContext request to send a
  Secure cookie over loopback HTTP. Chromium accepts the loopback exception but
  APIRequestContext does not; the private probe now explicitly sends its captured
  test credential. It verifies real authenticated 404, not a followed login 200.
- Next e2e run revealed a real logout 403: adapter 6 no longer honors runtime
  ORIGIN, and inferred HTTPS made Kit's pre-hook form CSRF disagree with HTTP
  loopback. Implemented the version-checked adapter wrapper described above;
  added a real production-server regression at both loopback and a configured
  HTTPS origin on the same build. Kit and central CSRF stay enabled; final
  login/logout tests pass. HTTP transport in that test simulates a TLS proxy and
  does not establish real HTTPS/browser correctness by itself.
- Existing upstream Drizzle/prebuild-install deprecations and Linux npm native
  install-script review warnings remain. Native installs/tests passed, with zero
  audit vulnerabilities; no security exception or dependency change introduced.

Remaining work / exact next task:

- **S02 remains in progress.** No TOTP enrollment/QR/confirmation, pending MFA
  completion, atomic replay protection/recovery codes, five-minute scoped fresh
  auth, password/MFA changes, revoke-all, security UI or implemented operator
  recovery command yet. MFA-enabled rows deny access; this is a safety boundary,
  not a completed optional-MFA feature. No placeholder marked done.
- Real HTTPS/proxy/browser drill and target-VPS Argon2/load measurement remain.
  Linux native/runtime tests passed; Linux browser tests and full S02 acceptance
  must be completed with the remaining features. No new native dependency blocker.
- Continue S02 with AES-GCM encrypted TOTP enrollment and atomic time-step/recovery
  consumption tests first; then pending challenges/fresh-auth/security actions/UI.
  Read the files listed in the current handoff and pinned otplib types/source
  (`epoch` seconds and valid result `timeStep`). First command:
  `npm run check && npm run test:integration` on the pinned runtime with TLS verified.
  Do not begin S03 or remove fail-closed login behavior before MFA completion exists.

### Session 2026-10-03 — S03 design tokens and responsive fixed shell

**State: in progress.** Requested S03 implementation and automated gates passed.
S02 is still incomplete, and real-device/manual UI checks are not claimed. This
session followed the user's explicit S03 request ahead of that dependency; it did
not silently reinterpret the S02 commit title as a completed authentication gate.

Implemented / touched files:

- `src/lib/styles/{tokens,global}.css`: warm off-white/white light palette, dark
  and system themes, muted-green accent, semantic warning/danger, native CJK font
  fallbacks, centralized layout/spacing/density/collapse/focus/motion tokens. AA
  foreground contrast and 3:1 control/focus contrast have actual-token tests.
- `src/lib/shared/appearance.ts`, `src/lib/server/settings/repository.ts`,
  `src/routes/api/settings/appearance/+server.ts`: strict three-field DTO and
  same-origin/authenticated, bounded-JSON PATCH. Coordinated transaction merges
  only appearance with current SQLite settings. No security/storage field edits,
  extra/sensitive keys, schema changes or dependency/lockfile changes.
- `src/app.{html,d.ts}`, `src/hooks.server.ts`, root `+layout.{server.ts,svelte}`:
  initial validated HTML attributes via Kit 3 `transformPageChunk`; system theme
  handled directly in CSS, with no inline-script flash workaround or weakened CSP.
  Authenticated pages receive saved appearance, public auth pages default to system.
  Dynamic viewport, safe-area and content-resizing keyboard meta configuration.
- `src/lib/components/{AppShell,Sidebar,Composer,Modal}.svelte`: fixed 272px desktop
  sidebar, expandable composer, filter placeholder and independent notes scroller;
  900px breakpoint, mobile header/drawer/compose/full-screen editor; short-height
  independent sidebar scrolling/fallback, searchable Show all tag panel, native
  modal inertness plus explicit Tab/Shift+Tab wrapping, Escape and opener return.
- `src/routes/(app)/`: private layout and root moved from old scaffold, real
  navigation to Drafts/Tags/Trash/Settings. Appearance settings save/reload/error
  retry works; current-session logout now lives in Settings. Non-appearance and
  future note screens explicitly identify their owning steps. No demo notes/tags,
  fake counts, title field, uploads, server draft saves or publishing implemented.
- Composer text is explicitly **in-memory only** until S05. It survives internal
  private navigation and close/reopen, registers beforeunload when nonempty, never
  uploads/posts, and warns to keep a copy before reload. Post is disabled. This is
  editor/layout plumbing, not local-draft persistence or note functionality.
- `AuthForm.svelte` now uses shared color/focus tokens; auth browser regression
  navigates to Settings for logout. Existing route privacy/Origin checks and
  fail-closed MFA behavior remain intact.
- `tests/unit/appearance.test.ts`, `tests/integration/appearance.test.ts`,
  `tests/e2e/shell.test.ts`, three Windows PNG baselines, browser fixture HTML/TS/
  Svelte and browser Vite plugin: real preferences/SSR/API and UI tests. Separate
  fixture reuses actual shell with 60 synthetic cards/200 tags, not production
  content. Screenshots were opened/reviewed for desktop light, mobile light and
  desktop dark/compact. README, ARCHITECTURE 11.1, test README and this handoff
  document implemented contracts and explicit limitations.

Checks actually run:

Host commands used the existing pinned Node 24.21.0 executable/PATH and npm CLI
`N`/`C` from the S00 handoff. `NODE_TLS_REJECT_UNAUTHORIZED=1` was exported for
all validation/network commands; dependencies stayed pinned and unchanged.

| Command                                                                 | Actual result                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `git status --short`, `git log -3`, full required document/source reads | Clean baseline `6ea8b8e`; existing committed work preserved                                                     |
| `"$N" "$C" run format`                                                  | PASS, repeated after source/document edits                                                                      |
| `"$N" "$C" run check`                                                   | PASS final, 0 errors/warnings, including tooling/test TS                                                        |
| `"$N" "$C" run lint`                                                    | PASS final, ESLint and Prettier                                                                                 |
| `"$N" "$C" run test:unit`                                               | PASS final, 6 files / 30 tests                                                                                  |
| `"$N" "$C" run test:integration`                                        | PASS final, 12 files / 55 tests, real SQLite/filesystem/native/build/runtime behavior                           |
| `"$N" "$C" run test:e2e -- --update-snapshots`                          | First run: 7 pass / 2 fail; generated three baselines, exposed real dialog Tab/Escape problems (fixed below)    |
| `"$N" "$C" run test:e2e`                                                | PASS final without snapshot updates, production build + all 9 Chromium tests including auth/Mermaid regressions |
| `"$N" "$C" run build`                                                   | PASS final adapter-node build; no synthetic fixture route/production demo content                               |
| `podman build -f ops/Dockerfile.validation -t pandanote-s03 .`          | PASS, fresh Linux npm ci, own native artifacts, zero reported audit vulnerabilities                             |
| `podman run --rm --cpus=2 --memory=4g pandanote-s03`                    | PASS, Linux check/lint/build, 30 unit + 55 integration tests                                                    |
| `git diff --check`; `test ! -e .e2e-data`                               | PASS, no whitespace errors or leftover E2E private data (only host autocrlf informational warnings)             |

Passing Linux image:
`0ad387675b2797d0ada1512b89f3aafe34f0f3c887015d36b4cac5e6bfc1267b`.
Same pinned Node 24.21.0 bookworm/glibc base digest as previous sessions, npm
11.19.0; VM/CPU/memory context unchanged. Image precedes only this final handoff
update. Real SQLite 3.53.2, Sharp 0.35.5/libvips 8.18.7 and archive probes passed.
Linux Chromium/baselines were **not run**; Windows browser baselines are
platform-specific. This is compatibility evidence, not release/performance/restore
completion. No new native dependency was introduced.

Intermediate failures / corrections:

- First check: six warnings (intentional focusable scroll regions, a nonreactive
  textarea ref and initial form snapshots). Made textarea reactive, explicitly
  untracked the form snapshot, and documented the two necessary focusable-scroll
  accessibility exceptions. Final check has zero warnings.
- First lint: two unkeyed each blocks. Added stable navigation/fixture keys.
- First browser run: native dialog Tab reached browser chrome/body for a cycle;
  Escape in a filled search field cleared the field instead of closing the panel.
  Reproduced with focus-event instrumentation in the separate fixture. Added
  explicit wrapping and Escape prevention/close; nested modals stop propagation.
  Final drawer/editor/tag-panel focus/close/return tests all pass, without weakening
  assertions or pretending the failures were harmless.
- One documentation edit failed exact matching; it applied no partial changes.
  Corrected the match and reapplied. No document/history was overwritten.

Remaining work / next task:

- S02 prerequisite remains incomplete: encrypted TOTP confirmed enrollment,
  pending-MFA completion, replay/atomic recovery codes, fresh-auth/security changes,
  all-device revocation and operator recovery. Return to that work unless the user
  explicitly requests another slice. Do not remove fail-closed MFA behavior.
- S03 manual gate remains open: real mobile IME/virtual keyboard, safe areas and
  touch/gesture workflow, actual 200% browser zoom and screen-reader review.
  Automation tested 390x390 keyboard-shrink and 720x450 zoom-equivalent CSS
  viewports, not physical hardware/native zoom. Linux browser validation and
  reviewed Linux screenshot baselines are also unclaimed.
- Search/calendar/tag filtering/management, persisted drafts, renderer, cards,
  note mutations, uploads, detail and backups are later steps, not completed by
  placeholders or a disabled Post. Collapse preference is saved/plumbed only.
- Next read: ARCHITECTURE 11.1/12.4; auth service/private keys/challenge schema and
  pinned otplib sources, plus shell/modal/settings files and tests listed above.
  Next task: AES-GCM TOTP enrollment with replay/expiry/parallel integration tests;
  then complete remaining S02 and manual S03 gates before starting S04.
  First validation: `npm run check && npm run test:integration`, then
  `npm run test:e2e`, on pinned Node with TLS verification enabled.

### Session 2026-10-03 — S03 completion after scope clarification

**State: done.** This supersedes the earlier S03 **in progress** assessment,
without erasing its history. The user clarified that S03 must be finished this
session. Rereading the actual S03 gate confirmed the initial status was too broad:
MFA/fresh-auth is S02, draft persistence is S05, posting is S08, and full physical
mobile/assistive-technology release auditing is S18. S03 explicitly permits shells
and clearly identified later-step placeholders. The user-approved out-of-order
S03 slice does not mark S02 complete or weaken its fail-closed security behavior.

Implemented / touched files:

- `tests/e2e/shell.test.ts`: two additional browser tests, beyond the original
  viewport approximations. A temporary MV3 extension invokes Chromium's actual
  `chrome.tabs.setZoom(..., 2)` and verifies 720x450 CSS viewport, DPR 2 and pinch
  scale 1 from a 1440x900 browser. Drawer/editor controls, forward/reverse keyboard
  focus, return and overflow pass at native 200% zoom. The synthetic extension and
  isolated profile are removed in `finally`; no production extension/dependency.
- Touch-capable mobile context navigates all private shell destinations using taps.
  CDP sets real CSS safe-area environment values (top 24 / bottom 34 / left 12 /
  right 18 px). Tests verify applied padding, accessibility-tree dialog/textbox/
  close/Post labels, retained text, and keyboard-shrunken heights 390/320/260.
  Close/Post must fit **fully** inside the safe area, and at least one full text
  line must remain visible. This is actual Chromium layout with controlled
  keyboard/safe-area scenarios, not a claim of physical phone/OS IME operation.
- `src/lib/components/Composer.svelte`: condensed the explicit unsaved-text warning
  on very short mobile screens. Screenshot review found the old verbose warning
  left too little room for text at 260px height plus safe areas; the final full-line
  geometry test and reviewed screenshot now pass. It still clearly says text is
  unsaved; no fake draft saving or publishing was added.
- `docs/PROGRESS.md`, ARCHITECTURE 11.1 and `tests/README.md`: corrected S03 status
  and acceptance scope, documented native zoom/test-only extension, safe-area,
  touch/keyboard and accessibility-label checks. S02 remains separately in progress.
  Earlier history and the full product/acceptance requirements were not erased.

S03 acceptance gate evidence:

1. Desktop document stays at scrollY 0 while the actual notes surface scrolls;
   sidebar and composer bounding boxes stay fixed (60-card synthetic fixture).
2. No document/horizontal overflow at 360/390/768/1440 CSS px widths, constrained
   heights, keyboard-shrink scenarios and native 200% zoom.
3. Short-screen navigation remains reachable, including 200-tag searchable panel;
   drawer/editor/nested-dialog Tab/Shift+Tab, Escape and opener return pass.
4. Light/dark/system and comfortable/compact visibly apply and persist in SQLite;
   no-JavaScript dark SSR prevents theme flash; contrast/focus/reduced motion pass.
5. One chronological column, textarea shell, native dialog and plain tokenized CSS;
   no masonry, rich editor, external fonts or added component framework.

Commands actually run (pinned N/C/PATH from S00; TLS verification explicitly 1):

| Command                                                             | Actual result                                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`, S03/product/UI gate and current source reads  | Preserved this session's uncommitted S03 work                                                                                                       |
| Native zoom capability probes with pinned Node + Playwright         | Browser preference approach did not change zoom; generated test-only MV3 API did, verified viewport/DPR/pinch scale. All temporary profiles cleaned |
| `"$N" "$C" run test:e2e -- --grep 'native Chromium\|touch-only'`    | PASS, both new tests independently of auth-test ordering                                                                                            |
| `"$N" "$C" run format`                                              | PASS                                                                                                                                                |
| `"$N" "$C" run check`                                               | PASS final, 0 errors/warnings                                                                                                                       |
| `"$N" "$C" run lint`                                                | PASS final                                                                                                                                          |
| `"$N" "$C" run test:unit`                                           | PASS final, 6 files / 30 tests                                                                                                                      |
| `"$N" "$C" run test:integration`                                    | PASS final, 12 files / 55 tests                                                                                                                     |
| `"$N" "$C" run test:e2e`                                            | PASS final, production build + all 11 Chromium tests, normal screenshot comparisons (no baseline updates)                                           |
| `"$N" "$C" run build`                                               | PASS final                                                                                                                                          |
| `podman build -f ops/Dockerfile.validation -t pandanote-s03-done .` | PASS fresh Linux dependency/native install                                                                                                          |
| `podman run --rm --cpus=2 --memory=4g pandanote-s03-done`           | PASS Linux check/lint/build and all 30 unit + 55 integration tests                                                                                  |
| `git diff --check`; `test ! -e .e2e-data`                           | PASS, no E2E private-data leftovers                                                                                                                 |

Final Linux image:
`ce9e3430c3c9af54fa199df71d6ad6b0051cb7708bd23279929b0b36d21fd7b7`.
Same Node 24.21.0 bookworm/glibc base, npm 11.19.0 and constrained VM context as
previous checks. Image precedes only this final log append. Native probes still
pass; Linux browser baselines/browser suite and physical-device/VoiceOver/NVDA
read-aloud audits remain explicitly unclaimed for the integrated release gate.
Native zoom and safe-area/keyboard screenshots were opened/reviewed. No remaining
S03 defect or incomplete S03 feature is known. No commit was created.

Next task:

- Default: return to earlier unfinished S02, encrypted TOTP confirmed enrollment
  plus replay/expiry/parallel consumption integration tests, then remaining MFA/
  fresh-auth/security/recovery work. If the user selects S04, use the completed
  tokens/shell and shared Modal; do not mark S02 done implicitly.
- Read ARCHITECTURE 11.1/12.4, auth service/key/challenge schema and pinned otplib
  sources for S02; IMPLEMENTATION_PLAN S04 and shared shell/appearance modules if
  that step is explicitly selected.
- First validation: `npm run check && npm run test:integration`, then
  `npm run test:e2e`, with pinned Node and TLS verification enabled.

### Session 2026-10-03 — S04 Markdown rendering, code copy, Mermaid and tag parser

**State: done.** S04's common and user-facing acceptance gates passed. The user
explicitly requested this step after S03; unfinished S02 remains fail-closed and
in progress. No product/release completion or note publishing is claimed.

Implemented / touched files:

- `src/lib/shared/markdown/{parse,render,highlight,tags}.ts`: shared bounded
  remark/GFM AST, sanitized rehype HTML, safe URL policy, descriptor-only direct/
  reference-style internal images, original-code metadata, offset-associated
  nested/footnote code, lazy bounded Shiki with no-eval JavaScript engine and
  themed CSS, Unicode/NFKC/deduplicated tags and exact reverse-span rewrites.
- `src/lib/client/markdown/mermaid.ts`: pre-import directive/HTML/encoded-asset/
  click/custom-style rejection; strict SVG-native library configuration, serial
  visible rendering, 12k/160/300 complexity defaults, five-second async deadline,
  separate DOMPurify + scoped SVG/CSS sanitizer, bounded cache and unique SVG IDs.
- `src/lib/components/{Markdown,Composer,Modal}.svelte`,
  `src/lib/styles/markdown.css`: stale-safe debounced Write/Preview, copy success/
  denied-copy feedback, diagram visibility/theme/cleanup and syntax/size errors,
  shared content/table/code styles. Short mobile editor spacing was adjusted to
  preserve one full text line with the new tabs at 260px plus safe-area insets.
  Text stays in memory, Post stays disabled; no publish shortcut was added.
- `vite.config.ts` plus browser CSP: image policy allows only same-origin and
  ephemeral blob images. Script CSP remains self-only; no eval/WASM/inline-script
  exception or external image origin. Dependencies, lockfile and schema unchanged.
- New `tests/unit/{tags,diagram-policy}.test.ts`,
  `tests/integration/markdown-render.test.ts`, `tests/e2e/markdown.test.ts` and
  `tests/browser/{MarkdownFixture.svelte,markdown.html,markdown.ts}`. The actual
  built private composer is tested under production CSP with zero upload requests;
  separate fixtures exercise real product attack policies and injected deadline/
  clipboard failures. No fixture/debug route or synthetic note ships in the app.
- README, ARCHITECTURE 11.2, tests README and this handoff. Existing S03 work and
  all prior history were preserved. HEAD advanced externally from `6ea8b8e` to
  `b85aba2` during the session; this agent created no commit.

Commands actually run:

Host commands used the explicit Node 24.21.0 `N`, npm CLI `C` and pinned PATH from
S00, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. No dependencies were changed.

| Command                                                                                                              | Actual result                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`, full required document/source/API reads                                                        | Preserved existing S03 work; verified installed Shiki 4 HAST/engine and Mermaid 12 APIs                                                      |
| `"$N" "$C" run format`                                                                                               | PASS, repeated after edits                                                                                                                   |
| `"$N" "$C" run check`                                                                                                | PASS final, zero errors/warnings, application and tooling/test TS                                                                            |
| `"$N" "$C" run lint`                                                                                                 | PASS final ESLint/Prettier                                                                                                                   |
| `"$N" "$C" run test:unit`                                                                                            | PASS final, 8 files / 37 tests                                                                                                               |
| `"$N" "$C" run test:integration`                                                                                     | PASS final, 13 files / 60 tests with actual libraries/SQLite/filesystem/native/build/server                                                  |
| `"$N" "$C" run test:e2e -- --grep 'production Markdown\|production diagrams\|production sanitizers\|composer Write'` | Initial 2 fail/2 pass; fixes below, rerun 4/4 pass                                                                                           |
| `"$N" "$C" run test:e2e`                                                                                             | PASS final production build + all 17 Chromium tests; unchanged S03 screenshot baselines, no snapshot updates                                 |
| `"$N" "$C" run build`                                                                                                | PASS final adapter-node build; large lazy library chunk warnings remain visible, not suppressed                                              |
| `"$N" .browser-spike/inspect-s04.mjs`                                                                                | Final PASS; reviewed real light/dark code/flowchart screenshots and SVG geometry. Temporary ignored diagnostic artifacts, no production code |
| `podman build -f ops/Dockerfile.validation -t pandanote-s04 .`                                                       | PASS, fresh Linux ci/native install, zero reported vulnerabilities                                                                           |
| `podman run --rm --cpus=2 --memory=4g pandanote-s04`                                                                 | PASS Linux check/lint, 37 unit + 60 integration, production build                                                                            |
| `git diff --check`; `test ! -e .e2e-data`                                                                            | PASS, no private E2E leftovers; autocrlf informational warnings only                                                                         |

Passing Linux image: `947f62a4bb611419d76e018f859ee21e86463207e94d19853868ab35ba9cca8d`.
Same pinned Node 24.21.0 bookworm/glibc base digest and constrained WSL2/2-CPU/4-GB
container context as previous sessions; npm 11.19.0. Actual Sharp/SQLite/archive
probes pass with Linux-native artifacts. Image precedes this progress-log-only
update. Linux Chromium was not run; Windows full browser suite passed. This is
native compatibility evidence, not target-VPS performance or full restore evidence.

Intermediate failures / corrections (not counted as passes):

- Initial TypeScript checks found HAST child/doctype types, Shiki tabindex typing,
  nullable image alt and CSP's required `blob:` syntax; corrected narrow types.
  ESLint identified the explicit sanitized-HTML boundaries, nonreactive observer
  bookkeeping, control-regex policy and an unnecessary regex escape; documented
  only the intentional exceptions and fixed the rest. Final check/lint are clean.
- First code-copy browser expectation differed only because Windows' native
  clipboard changes LF to CRLF. Tests now assert the exact `writeText` argument
  separately and verify the actual clipboard round trip with OS newline handling.
- Sequence arrows were initially over-rejected by a security regex; corrected
  longest-arrow matching and added ordinary flow/sequence policy tests. Invalid
  syntax, oversized graphs and malicious assets remain isolated errors.
- Visual probing revealed that `display:none` gave Mermaid a 16x16 empty viewBox
  despite text existing in the SVG. Replaced it with invisible offscreen layout;
  tests now assert real diagram width and theme-dependent paint, not just SVG presence.
  Early visual probes failed while waiting for an offscreen lazy diagram and then
  while expecting stripped Shiki classes; neither was counted as a visual pass.
- Shiki 4 emits `class`/`tabindex`, not canonical HAST properties; normalization
  prevents the sanitizer stripping highlight classes/focus. The JavaScript engine
  avoids relaxing CSP for WASM. Tests require real `.shiki` output under both
  fixture and production CSP and no policy violations.
- Removing an entire Mermaid stylesheet for animation/import syntax also removed
  safe colors. Detached CSS parsing now retains only diagram-ID-scoped paint/text
  rules and strips global selectors/URLs/imports/font faces/animations. Reviewed
  light/dark diagrams remain readable and hostile assets never fetch/execute.
- Full browser regression initially failed the shortest mobile textarea geometry
  after tabs consumed extra height (14 pass/1 fail). Condensed editor spacing;
  all original touch/safe-area/native-zoom regressions now pass (17/17 final).
- One ad-hoc diagnostic invoked system Node 24.15.0 despite the PATH prepend;
  reran with the explicit pinned executable. All final gates used Node 24.21.0.
  Existing upstream deprecation/native-install-review and lazy chunk-size warnings
  remain; no install/native/browser dependency was missing or skipped as a pass.

Decisions / remaining scope:

- ARCHITECTURE 11.2 records the exact image/URL/SVG policies, parser grammar,
  UTF-8/tag/highlighter/diagram cache limits and original-code newline convention.
  Arbitrary remote images are not fetched; caller-owned internal descriptors are
  required. Blob lifecycle/uploads remain S05/S06, not placeholder uploads.
- Mermaid uses bounded cooperative main-thread rendering; the asynchronous deadline
  is not hard CPU preemption. Worst-case target-device/VPS responsiveness, physical
  IME/assistive-technology review and cross-platform browser baselines remain S18.
  Lazy Mermaid/Shiki build chunks are large; no initial-Mermaid load was observed in
  no-diagram tests. Final bundle/performance budgets are not claimed complete.
- No known unfinished S04 feature or failing S04 test. Tag management/history and
  note transactions remain S07/S14; editor recovery is S05 and posting S08.
  S02 optional MFA/recovery/fresh-auth/security/revocation/operator recovery remains
  unfinished. Do not infer product completion from this renderer gate.

Exact next task:

- Default: resume S02 encrypted TOTP enrollment/confirmation with replay/expiry/
  concurrent-consumption integration tests. Read auth service, private keys,
  account/challenge/recovery schema, pinned otplib 13.5 sources and ARCHITECTURE 12.4.
- If explicitly asked for S05: read ARCHITECTURE 6/7.1/11.2, the product renderer/
  Composer and S04 tests; implement account/draft-scoped versioned localStorage/
  IndexedDB repositories first, preserving all data on failure and never uploading
  before explicit Post.
- First validation: `npm run check && npm run test:integration`, then
  `npm run test:e2e`, with pinned Node and TLS verification enabled.

### Session 2026-10-03 — S02 completion: MFA, recovery, fresh authentication and security

**State: done.** Supersedes the partial S02 assessment and misleading broad commit
title. S02's common, browser and Linux authentication gates pass; no product or
note/backup/restore completion claimed. Started clean at `31e85e0`; S03/S04 and all
prior history preserved. No commit created.

Implemented / touched files:

- `server/auth/{service,factors,tokens,rate-limits,http,policy}.ts`, `shared/auth.ts`,
  `routes/api/auth/{login,mfa,fresh,security}/+server.ts`: purpose/account/session-bound
  AES-256-GCM TOTP encryption, confirmation-only activation/change, cancellation,
  five-minute hashed password-bound pending MFA, ±one-step drift and monotonic replay
  protection. Factor/challenge/session writes commit atomically. Pending credential
  types cannot be passed to the cookie setter. Same-origin/session gates retained.
- Ten 128-bit random hashed recovery codes, generation-only display/download,
  single-use atomic consumption and regeneration invalidation. Five-minute exact
  fresh scopes bind session/security revision and require password plus enabled
  factor. Password changes recheck after hashing. Security/MFA/recovery/lifetime
  changes rotate revision/cookie and revoke old sessions/challenges; revoke-all
  also signs out the current device. Session lifetime accepts 1–30 days.
- `components/{AuthForm,SecuritySettings}.svelte`, private Settings: working
  MFA/recovery login, local QR/manual confirmation, fresh-auth action forms, code
  export, password/authenticator changes, disable/regenerate/lifetime/revoke and
  destructive confirmations/errors. Auth/appearance controls are hydration-gated
  to prevent silent resetting of pre-hydration choices. Secrets stay transient,
  never URLs/localStorage. QR helper `qrcode` 1.5.4/types 1.5.6 exact-pinned with
  lockfile; no UI kit/service/schema replacement. Schema stays version 3/18 tables.
- `scripts/auth-recover.ts`, package script, README: stopped-app VPS/filesystem-only
  reset with explicit flag and bounded stdin JSON, no passwords in argv/env/logs.
  Resets password, removes MFA/codes, rotates revision and revokes access without
  erasing user content. Missing/corrupt keys fail closed; no public bypass route.
- `tests/integration/auth-mfa.test.ts`, auth regression, unit factor/policy tests:
  real SQLite/Argon2/CLI/RFC vectors, enrollment encryption/expiry/cancel/binding,
  wrong/drift/replay, two-connection parallel consumption, restart/rollback retry,
  scope/session/revision/expiry and password races, every security action,
  persistent limits/table bound and actual operator command. Routine DTO/DB
  dumps exclude plaintext secrets.
- E2E auth test, fixture launcher/teardown, Playwright config,
  `ops/Dockerfile.browser-validation`: isolated built security deployment behind
  ephemeral generated-cert HTTPS/trusted forwarding. Tests actual TLS production
  cookies, QR/confirmation/recovery download, pending access denial, replay, fresh
  scope failure and every security form. Parallel HTTP recovery attempts accept
  exactly once. Explicit OpenSSL and both owned app children are tested/cleaned.
- README, ARCHITECTURE 12.4 historical annotation/12.5 final contracts, test README
  and this handoff. Product/acceptance requirements unchanged.

Commands actually run (host uses pinned N/C/PATH from S00; TLS explicitly 1):

| Command                                                                                         | Actual result                                                                 |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Git/status/docs/source and otplib 13.5 API inspection                                           | Clean committed S04 baseline; existing work preserved                         |
| `npm run check && npm run test:integration`                                                     | Initial baseline PASS, 0 diagnostics and 60 integration tests                 |
| `npm view qrcode version engines`; exact QR/types installs                                      | PASS; pinned 1.5.4/1.5.6, lock updated, zero audit vulnerabilities            |
| `npm ci`; `npm audit`                                                                           | Final repeat PASS from lockfile; zero vulnerabilities                         |
| `npm run format`, `npm run check`, `npm run lint`                                               | Final PASS; 0 errors/warnings, ESLint/Prettier clean                          |
| `npm run test:unit`                                                                             | PASS, 9 files / 39 tests                                                      |
| `npm run test:integration`                                                                      | PASS, 14 files / 72 tests, native filesystem/SQLite/CLI/build/server          |
| `npm run test:e2e -- --grep 'confirmed MFA'`                                                    | PASS targeted built flow after fixing confirmation form bug                   |
| `npm run test:e2e`                                                                              | PASS production build + all 18 Chromium tests, unchanged screenshot baselines |
| `npm run build`                                                                                 | PASS; adapter-node/runtime origin/CSP preserved                               |
| `podman build -f ops/Dockerfile.validation -t pandanote-s02-complete .`                         | PASS fresh Linux ci/native artifacts                                          |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s02-complete` | PASS Linux check/lint/build, 39 unit + 72 integration tests                   |
| Initial Linux `npx playwright install --with-deps chromium` + auth E2E                          | FAILED startup: OpenSSL absent; not a pass                                    |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s02-browser .`                  | PASS explicit OpenSSL/native install/Chromium dependencies                    |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s02-browser`  | PASS both Linux Chromium auth tests, including actual HTTPS MFA/security      |

All host commands and both Linux image gates were repeated successfully after the
final pending/session typing and parallel HTTP recovery test. Fixture cleanup and
`git diff --check` pass. Passing images (precede only this final handoff update):

- Native: `59ddcd3f965bc4db0b8f2c949ae7c0c227561d4f20ff4bf7f6e8be28e410b9a8`.
- Browser: `7edecbcecd69bd96a72e2e5b8d012a315d953c280689ca9359e85f563a43b070`.

Both use the S00 pinned Node 24.21.0 bookworm/glibc digest, npm 11.19.0 and the
same constrained WSL2/2-CPU/4-GB test container context. Linux browser run covers
AUTH-01–05, not full cross-platform shell/renderer baselines or VPS performance.

Intermediate failures / corrections:

- Initial check found otplib's HOTP/TOTP result union; narrowed `timeStep` presence.
  TLS fixture JS needed explicit Server type/listen callback; fixed. Pending/session
  discriminated union now prevents accidental pending-token cookies.
- First targeted browser failure: Svelte interpolated `{6}` in a quoted input
  pattern, preventing valid six-digit confirmation submission. Used literal string
  expression; wrong-code retry and confirmation pass.
- First full browser run: 17 pass/1 fail. Trace proved appearance fields were edited
  before hydration and reset to initial values. Disabled auth/appearance controls
  until mounted rather than weakening assertions; all 18 tests pass afterward.
- First Linux browser attempt installed Chromium but lacked `openssl`; explicit
  browser validation Dockerfile fixes this, and both tests pass. No dependency
  blocker was skipped as a pass.
- One formatting pass needed a second targeted Prettier pass. Failed exact-text
  edits applied nothing; retried against unique small regions. Existing upstream
  deprecation/native-install-review and lazy bundle warnings remain visible.

Decisions / limitations / next task:

- Exact contracts/scopes in ARCHITECTURE 12.5. Grants are deliberately single-use,
  not reusable elevated cookies. Security changes keep only a rotated current
  session except revoke-all. QR is local; no external service/raw SVG/CSP weakening.
- No unfinished S02 feature or known S02 defect remains. Real-domain deployment,
  target-VPS Argon2/load, Linux shell baselines and physical device/assistive-technology
  audits remain S18. Native Sharp/SQLite and archive capability probes pass on Linux;
  full archives/restore remain S16/S17, not claimed by probes.
- **Next: S05**, versioned account/draft-scoped localStorage/IndexedDB, multiple
  draft recovery, quota/missing blobs and cross-tab revision protection. Read
  ARCHITECTURE 6/7.1/11.2, Composer/Markdown/Modal, shared Markdown/domain contracts
  and E2E auth/markdown/shell tests. First validation:
  `npm run check && npm run test:integration`, then full E2E. Preserve
  no-upload-before-Post/security gates.
