# PandaNote — Progress and cross-session handoff

## Current state

- **Phase:** S18 deployment/accessibility/measurement implemented and locally verified; **release gate NOT fully closed** (no real VPS, physical-device or screen-reader audit). S18 is committed; the approved version enhancement is implemented but its final validation remains **blocked / in progress**.
- **Completed steps:** S00–S17 — **done**. S18 — **in progress / locally verified** (see tracker and `docs/RELEASE_RESULTS.md`).
- **Repository:** Session baseline HEAD `25c3341` (prior version work committed externally). Follow-up image-builder patch is **implemented / Linux build validation blocked**; no commit created by this agent.
- **Implemented in S18:** `ops/Dockerfile` (3-stage, pinned Node 24.21.0 bookworm, non-root, read-only-compatible), `compose.yaml` (app + Caddy proxy + networkless `ops` tasks migrate/setup-token/recover-auth/reindex), `ops/Caddyfile`, `ops/production.env.example`, `ops/DEPLOYMENT.md`, readiness-aware `/health`, `ops/release-drill.sh` + `ops/release-benchmark.sh` with `tests/release/` and `playwright.release.config.ts`, `tests/e2e/zzzaccessibility.test.ts` (axe-core 4.13.0 dev dependency), `tests/integration/release-hygiene.test.ts`, a11y fixes (task checkboxes, `aria-controls`), README rewritten to actual install/test instructions, ARCHITECTURE §16.
- **Validation:** Windows check/lint/build, 95 unit + 167 integration, 94 Chromium e2e pass; Linux clean `npm ci`, check/lint/unit/integration/build + 88 e2e (all except Windows-only visual `shell.test.ts`) pass; two-domain web-restore drill with TOTP/recovery code, graceful stop (exit 0) and restart persistence pass; 10k-note benchmark meets budgets. Details and measured numbers: `docs/RELEASE_RESULTS.md`.
- **Open before final release:** real VPS/public-domain/Let's Encrypt deployment, physical-device/IME/screen-reader audit, Linux visual baselines for `shell.test.ts`, maximum-bound/100k stress, decision on timeline virtualization (DOM grows linearly: 3,030 cards ≈ 448k nodes/176 MiB, next-page append 739 ms), commit/tag and rerun gates on that exact commit.
- **Runtime:** Node 24.21.0 LTS; npm 11.12.1 (Windows) / 11.19.0 (Linux). Host commands need explicit pinned executable **and PATH**, plus `NODE_TLS_REJECT_UNAUTHORIZED=1`. Podman 5.8.2 on WSL2 with `docker-compose` v2.40.3 as compose provider (validation tooling only, not a repo dependency).

## Active enhancement: commit-derived release versioning

**Latest follow-up (2026-10-06):** user requested native compilation fallback,
`pandanote:latest` on every build and automatic Docker/Podman selection. Patched
both dependency stages with CA/Python/make/g++, retained a small runtime, added
bounded server probes and latest + version tags, and made Compose default to
latest with independent provenance build args. Host check/lint/build, **110 unit +
173 integration** and both Development/synthetic-release version e2e pass. Actual
auto-selection chose Podman in an isolated clean snapshot, but the unmodified
production Dockerfile stalled downloading Debian package indexes (240 s timeout).
No Linux image/native-source-build success claimed. See the final handoff entry.
Next: restore container apt/npm/Node-header connectivity and build the patched
Dockerfile; then commit with user approval and build/inspect the exact release.

User approved UTC committer date + same-day first-parent sequence (`YYMMDD-N`),
clean-source image builds, identical image/web metadata, sidebar/drawer footer and
Settings About. Detailed implementation and VER-01–08 gate:
`docs/VERSIONING_PLAN.md`; plan recorded before coding. Implementation is present:
`npm run version:release` / `npm run image:build`, Git archive snapshot, strict Docker
metadata/OCI labels, Vite constants and UI. Windows check/lint/build, 108 unit,
173 integration and 95 full e2e pass. Cached Linux production-image metadata/UI/
native probes pass; Linux check/lint/build, 108 unit, **169 integration (four Git
tests explicitly excluded)** and 9 affected/a11y e2e pass. Cold image npm downloads
and installing Git in the Linux validation environment failed/timed out; excluded
Git cases are a **blocker**, not a pass. New audit: 2 low Mermaid/KaTeX advisories;
no forced unrelated dependency change. No user-repository commit created.

Next: restore dependency/apt connectivity, install Git in the Linux validation
image and run the complete integration suite without exclusions; then user-approved
commit + clean exact-commit image build. Read the version handoff below, the plan
and deployment guide. First validation: `podman build -f ops/Dockerfile.validation
-t pandanote-version-native . && podman run --rm --cpus=2 --memory=4g
pandanote-version-native`. S18's outstanding VPS/device/screen-reader gates remain open.

## Next session: exact instructions

1. Read `AGENTS.md`, `docs/RELEASE_RESULTS.md`, `ops/DEPLOYMENT.md` and the S18 handoff at the end of this file.
2. Complete the version enhancement's blocked Linux Git/cold-build validation, then commit the enhancement (user approval; S18 itself is already committed). On a **real Linux VPS with a real domain** follow `ops/DEPLOYMENT.md`: first install, TOTP, manual backup/download, and an independent second deployment restore (different domain). Record results in `docs/RELEASE_RESULTS.md`.
3. Perform and record physical-device/IME/pinch-zoom and screen-reader review; review Linux `shell.test.ts` visual baselines (`--update-snapshots` only after inspection).
4. Raise with the user: timeline virtualization (needs approved scroll-sync/history redesign) given the measured DOM growth; optional 100k-note stress run.
5. Re-run on the release commit: `npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e`, the Linux validation image, `ops/release-drill.sh`, `ops/release-benchmark.sh`. Only then mark S18 done.

Subsequent sessions should always follow the next unfinished step recorded here.

## Step tracker

| Step | Description                        | State                                                        |
| ---- | ---------------------------------- | ------------------------------------------------------------ |
| S00  | Bootstrap and technical validation | Done                                                         |
| S01  | Schema and persistent storage      | Done                                                         |
| S02  | Authentication and optional TOTP   | Done                                                         |
| S03  | Design tokens and responsive shell | Done                                                         |
| S04  | Markdown/code/Mermaid/tag parsing  | Done                                                         |
| S05  | Browser drafts and recovery        | Done                                                         |
| S06  | Private uploads and Sharp          | Done                                                         |
| S07  | Atomic/idempotent note lifecycle   | Done                                                         |
| S08  | Composer posting orchestration     | Done                                                         |
| S09  | Cards, cursor timeline and filters | Done                                                         |
| S10  | Exact multilingual SQLite search   | Done                                                         |
| S11  | Month calendar and scroll sync     | Done                                                         |
| S12  | Detail/edit/conflict/image viewer  | Done                                                         |
| S13  | Drafts and Trash screens           | Done                                                         |
| S14  | Tag administration                 | Done                                                         |
| S15  | Location/settings/storage          | Done                                                         |
| S16  | Manual backup/create/download      | Done                                                         |
| S17  | Uploaded restore and rollback      | Done                                                         |
| S18  | VPS deployment/release validation  | In progress — locally verified; real-VPS/device/AT gate open |

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

### Session 2026-10-03 — S05 browser-local draft repositories and recovery

**State: done.** All S05 common/browser gates pass on Windows; native/common and
actual auth/draft Chromium gates also pass on Linux. Started clean at `f0fb21e`.
Existing S00–S04/S02 completion and all prior history preserved. No commit created.
No server note/upload/backup functionality or final product completion claimed.

Implemented / touched files:

- `src/lib/client/drafts/{model,repository,blobs,workspace.svelte}.ts`: strict first
  product schema v1, per-account/per-draft text records and rebuildable index,
  composite-key IndexedDB files confirmed on transaction completion, debounced
  autosave with serial revision-aware snapshots, startup/orphan/missing reconciliation,
  quota/blocked/version warnings, storage persistence request and temporary URL cleanup.
  Metadata and server recovery kind/ID/revision/base-digest capabilities are typed;
  future server association requires snapshot checks, not automatic stale uploads.
- `src/lib/components/{Composer,DraftFeedback}.svelte`, private layout/server load
  and `routes/(app)/drafts/+page.svelte`: actual multiple local list/excerpts,
  resume/create/confirmed discard, image/file picker/paste/drop and cursor-inserted
  internal image references, Write/Preview with local images, original-file repair
  or exact image-span removal, device-only/not-backup/storage/privacy warnings.
  No new-draft content or blob is sent to a server. Post remains disabled for S08.
- Account-level Web Locks cover read/compare/write and byte reconciliation. Storage
  and BroadcastChannel notifications detect stale tabs; authoritative revision
  checks reject races even without timely notifications. Conflicts retain local
  edits, offer separate copies with bytes or confirmed loading of saved state.
  If a blob is already evicted, a separate copy still preserves text/descriptors
  and visibly requires file repair/removal. Discard writes a content-free tombstone
  before deleting scoped bytes; failed cleanup warns/retries, stale tabs cannot
  resurrect it. Unknown/corrupt records and associated blobs remain untouched.
- `SecuritySettings.svelte`, Settings: signout/revoke-all flush pending local edits,
  warn about retained browser drafts and never silently erase storage. Plaintext
  drafts remain accessible to someone controlling that browser, not protected by MFA.
  `eslint.config.js` configures the installed Svelte parser for `.svelte.ts` runes.
  No dependencies/lockfile or server database schema changed (still v3/18 tables).
- `tests/unit/drafts.test.ts`, `tests/e2e/drafts.test.ts`: 13 new unit and 12 real
  browser scenarios for DRAFT-01–04/POST-01's pre-posting boundary. Unit adapters
  exercise contracts/faults; actual Chromium covers storage, exact bytes, reload,
  full process restart, quota/transaction abort, persistence denial, missing repair,
  account/unsupported-version boundaries, unsupported locking, concurrent tabs,
  losing-text recovery with evicted files, signout/relogin, no premature requests,
  local URL disposal and mobile native file picker/260px editor geometry.
- `ops/Dockerfile.browser-validation` now runs both auth and draft test files;
  README, ARCHITECTURE 6.3/historical S03 clarification, tests README and this handoff
  document actual capabilities and remaining step boundaries.

Commands actually run:

Host commands used Node **24.21.0**, pinned executable **and PATH**, npm 11.12.1
CLI `N`/`C` from S00, and `NODE_TLS_REJECT_UNAUTHORIZED=1`. No install or dependency
change was needed on Windows. Linux images installed from the unchanged lockfile.

| Command                                                                                        | Final actual result                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `git status --short`, `git log -2`, full required document/source reads                        | PASS; clean committed S02-complete baseline, no preexisting work overwritten               |
| `npm run test:integration` (early baseline)                                                    | PASS, 14 files / 72 tests                                                                  |
| `npm run format`; targeted `npm exec -- prettier --write ...`                                  | PASS                                                                                       |
| `npm run check`                                                                                | PASS, zero errors/warnings including test/tooling TypeScript                               |
| `npm run lint`                                                                                 | PASS, ESLint/Prettier                                                                      |
| `npm run test:unit`                                                                            | PASS, 10 files / 52 tests                                                                  |
| `npm run test:integration` (final)                                                             | PASS, 14 files / 72 tests; real SQLite/filesystem/native/build/server regressions          |
| `npm run test:e2e -- tests/e2e/drafts.test.ts` / targeted Playwright rerun                     | Initial 5 pass/2 fail; corrected selectors/profile cleanup, 7/7 pass; suite later expanded |
| `npm run test:e2e -- --grep 'conflict with evicted'`                                           | PASS, targeted missing-file conflict recovery                                              |
| `npm run test:e2e` (final)                                                                     | PASS, production build + all 30 Chromium tests, unchanged existing screenshots             |
| `npm run build` (final standalone, plus E2E builds)                                            | PASS, adapter/runtime origin/CSP/server-only boundaries preserved                          |
| `podman build -f ops/Dockerfile.validation -t pandanote-s05 .`                                 | PASS, fresh Linux npm ci/native artifacts; zero audit vulnerabilities                      |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s05`         | PASS, Linux check/lint/build, 52 unit + 72 integration tests                               |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s05-browser .`                 | PASS, fresh native modules/OpenSSL/Chromium dependencies                                   |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s05-browser` | PASS, all 14 Linux Chromium auth/draft tests                                               |

Passing final code-gate images (precede only this progress-log completion update):

- Native: `272b591eec0e68e9bbbd90248fad16560f9a0f29ebf8e112dde01ae581340ac8`.
- Browser: `ef1d71fee5f506cb56b870f9cd473840d5f409dde62c943090e5ea3b358d5d1d`.

Final log-only close checks: `npm exec -- prettier --write docs/PROGRESS.md`,
`npm run lint`, `git diff --check` and `test ! -e .e2e-data` all pass; no private
E2E data remains. Git reports only the expected S05 source/tests/docs changes.

Same S00 pinned Node 24.21.0 bookworm/glibc digest, npm 11.19.0, existing WSL2 VM
and 2-CPU/4-GB-limited test container. Linux SQLite/Sharp/archive capability probes
remain passing; these are not full S16/S17 archive restore or VPS benchmarks.

Intermediate failures / corrections (not counted as passes):

- Initial check caught a nonreactive input ref and narrow browser element types;
  corrected them. Test tooling also rejects TypeScript parameter properties under
  `erasableSyntaxOnly`; client classes now use ordinary explicit fields.
- ESLint initially parsed `.svelte.ts` with the JS fallback, then found an unnecessary
  regex escape. Added the actual installed parser configuration and corrected the
  regex. Later final Windows/Linux lint caught an ephemeral Set in the workspace;
  switched to array deduplication and repeated both full gates successfully.
- First draft browser run: hidden expanded-editor summary duplicated a text selector;
  scoped the query to the visible composer. Windows profile deletion raced Chrome's
  closing log handle; bounded filesystem retry now cleans the actual restarted
  profile. The first failed run's temporary profile was explicitly removed afterward.
- First full expanded browser suite exhausted the unchanged ten-login/IP window
  (five failures with HTTP 429). Draft tests now reuse only real server-issued test
  sessions across isolated contexts, check their validity and reauthenticate revoked
  sessions. No production rate-limit weakening, auth bypass or shared browser data.
- Review found that a missing file could block saving a losing tab's text separately.
  Copy now keeps its text/descriptors as an explicitly repairable draft; added actual
  browser eviction/conflict/repair and unit regressions, then repeated all host/Linux
  gates. Existing build chunk-size/upstream install-script warnings remain visible.

Decisions / limitations / exact next task:

- ARCHITECTURE 6.3 records schema/key/index/lock/tombstone/cleanup contracts. Web Locks
  are the safe browser primitive, not a hand-rolled localStorage lease. Unsupported
  browsers get read/copy access and visible failed writes rather than false safety.
  Tombstones are small and intentionally retained until site data is cleared.
  No new service, library, security exception or settled product behavior changed.
- No known unfinished S05 acceptance item. Browser eviction/private browsing/cleared
  data can still destroy drafts; persistence requests are not backup guarantees.
  Date/location controls, actual server snapshot reads/draft overlays and frozen
  posting/confirmed-success cleanup remain S08/S11–S13/S15. No hidden server autosave.
- Physical devices/OS IME, full assistive technology, Linux shell screenshot baselines,
  real-domain HTTPS/VPS performance and complete backup/restore remain S18/later steps.
- **Next: S06**. Read ARCHITECTURE 7, server DB/schema/private-storage/coordinator/runtime/
  auth HTTP, local draft descriptor contracts and image/private-storage integration
  fixtures. Start authenticated resumable upload-batch service + streaming limits and
  private staging tests, then bounded Sharp processing/private downloads/disk reserve.
  Do not invoke upload initialization from selection/autosave; S08 owns explicit Post.
  First validation: `npm run check && npm run test:integration`, then full E2E and
  real Linux native/image/resource tests. Preserve S05 blobs/conflicts and auth gates.

### Session 2026-10-04 — S06 private attachments and bounded image processing

**State: done.** Final common/browser gates pass on Windows and Linux. Started
clean at `f18ad32`; preserved prior implementation and handoff history. No commit
created. This is ready upload/download infrastructure, not note posting or a
completed note-taking application.

Implemented / touched files:

- `src/lib/shared/attachments.ts`, `server/attachments/service.ts`: strict frozen
  manifest, stable IDs/input SHA-256/byte-size identity, receipt-first initialization,
  account-owned resumable batch/readiness DTOs, mismatched mutation/file-ID rejection,
  bounded pending metadata, duplicate PUT verification without overwriting. Safe
  inventory of unreferenced ready retries for S15; no automatic ready-file expiry.
- `server/attachments/{files,images,resources}.ts`: raw streamed bodies with actual
  byte counting/receive deadline/hash, generated exclusive private staging paths,
  raster magic independent of filename/client MIME, decoded/input/configured limits,
  orientation/no-upscale/alpha/WebP outputs and stripped metadata. Native pages plus
  APNG/WebP/HEIF container checks reject animation. Sharp cache disabled/thread=1,
  one Node subprocess/at most two bounded waiters, hard 30-second kill deadline;
  at most three admitted receives. Ordinary files (including HTML/SVG and zero-byte
  files) are unchanged and download-only. Variant dimensions/bytes/digests
  are exact. Disk claims include conservative incoming/output space and protect
  max(5 GiB, 10% capacity), with operator-only reserve override.
- `server/attachments/{cleanup,http}.ts`, `server/maintenance/{coordinator,cleanup}.ts`:
  fsynced output installation before SQLite readiness; original image deletion before
  commit; failure/unready crash output and startup staging cleanup. Durable queued
  byte deletion drains active writers, rechecks clone/Trash references, deletes
  immutable generated files before job/metadata, and retries interrupted/failed
  jobs on startup in bounded pages. Async writers receive an expiring capability
  so an admitted upload can finish while exclusive maintenance is draining.
- `routes/api/uploads/{+server,[batchId]/+server,[batchId]/[attachmentId]/+server}.ts`,
  `routes/api/attachments/[attachmentId]/[variant]/+server.ts`, runtime/hook:
  current-session/ownership/revocation checks, central same-origin protection,
  safe errors and no public files. Private GET/HEAD WebP/file variants; portable
  sanitized Unicode basename + RFC 5987 disposition, octet-stream for all ordinary
  files, nosniff/sandbox/private-no-store headers. Explicit HEAD closes its handle.
  No original-image variant. Runtime awaits queued startup cleanup.
- `components/Composer.svelte`: final regression exposed pre-hydration compose clicks
  being swallowed before handlers existed. Initial compose controls now wait for
  mount; file input waits for local workspace readiness. No uploads were wired into
  selection, and Post is still disabled. This is small adjacent loss-prevention
  hardening, not S08 orchestration or a new editor scope.
- `tests/{unit/attachments,integration/attachments,e2e/uploads}.test.ts`,
  `tests/helpers/images.ts`: actual SQLite/files/native subprocess/HTTP/browser
  failures, retries, checksums/orientation/metadata/animation, concurrency/deadlines,
  disk reserve, revocation, failed DB commit cleanup, startup recovery/ready-file
  preservation, cloned/Trash last reference and interrupted deletion. Genuine
  two-frame APNG with CRCs/deflate data. Browser checks unchanged/no premature upload,
  hostile HTML download without execution, Unicode names, zero-byte and >512 KiB
  files, HEAD/privacy/CSRF and deliberately delayed entry-module hydration.
- `scripts/images-benchmark.ts`, package script, `.env.example`, E2E launcher,
  `ops/Dockerfile.browser-validation`: synthetic native resource probe, adapter
  `BODY_SIZE_LIMIT=512M`, reserve documentation and Linux UTF-8 browser locale.
  README, ARCHITECTURE 7.4 and test README record actual contracts/scope. No dependency,
  lockfile or migration change; schema stays v3/18 tables.

Commands actually run:

Host uses the explicit Node 24.21.0 executable/PATH and npm CLI N/C from S00,
with `NODE_TLS_REJECT_UNAUTHORIZED=1`. All final gates below were repeated after
filename/locale and hydration fixes; no failed/filtered run is counted as a full pass.

| Command                                                                                                         | Final actual result                                                         |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `git status --short`, `git log -1`, full required document/source/installed API reads                           | Clean S05 baseline; current Sharp/Kit streaming/HEAD/adapter APIs inspected |
| `npm exec -- prettier --write <touched files>`                                                                  | PASS; source/docs formatted                                                 |
| `npm run check`                                                                                                 | PASS, zero errors/warnings including test/tooling TS                        |
| `npm run lint`                                                                                                  | PASS, ESLint and formatting                                                 |
| `npm run test:unit`                                                                                             | PASS, 11 files / 56 tests                                                   |
| `npm run test:integration`                                                                                      | PASS, 15 files / 85 real integration tests                                  |
| `npm run test:e2e -- tests/e2e/uploads.test.ts`                                                                 | PASS targeted final upload/hydration test; earlier runs/fixes below         |
| `npm run test:e2e`                                                                                              | PASS final build + all 31 Chromium tests, unchanged prior screenshots       |
| `npm run build`                                                                                                 | PASS final standalone adapter-node production build                         |
| `npm run images:benchmark`                                                                                      | PASS Windows synthetic native probe (below)                                 |
| `podman build -f ops/Dockerfile.validation -t pandanote-s06 .`                                                  | PASS, fresh Linux ci/own native artifacts, zero audit vulnerabilities       |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s06`                          | PASS Linux check/lint/build, 56 unit + 85 integration                       |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s06 npm run images:benchmark` | PASS Linux probe with the same production worker code                       |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s06-browser .`                                  | PASS fresh native/OpenSSL/Chromium install and UTF-8 locale                 |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s06-browser`                  | PASS all 15 Linux auth/draft/upload Chromium tests                          |
| `git diff --check`; `test ! -e .e2e-data`                                                                       | PASS; only host autocrlf informational warnings                             |

Passing final code-gate images (precede only this progress-log close update):

- Native: `4596986306b62f1dd30996ffa8cb3583ad14934640efa21f7ea54cc9f5823812`.
- Browser: `b96ec1055b72e9ce7c17ec261f564f00a9ca9322c9988f8a56f62e49d6344a03`.

Both use the S00 Node 24.21.0 bookworm/glibc digest, npm 11.19.0 and existing WSL2
VM (2 GiB VM memory; containers capped at two CPUs/4 GiB). Linux browser scope is
15 auth/draft/upload tests, not unreviewed Linux shell screenshot baselines.

Native measurements (Sharp 0.35.5/libvips 8.18.7):

| Host                          | Three native job times | Batch wall | Parent baseline / peak | Worker peak | Conservative combined peak |
| ----------------------------- | ---------------------- | ---------- | ---------------------- | ----------- | -------------------------- |
| Windows x64 / Node 24.21.0    | 424 / 861 / 406 ms     | 2148 ms    | 82 / 432 MiB           | 133 MiB     | 565 MiB                    |
| Linux x64 / two-CPU container | 484 / 887 / 402 ms     | 1984 ms    | 105 / 464 MiB          | 149 MiB     | 613 MiB                    |

Fixtures: two 50 MP JPEGs with EXIF orientation 6 (0.28 MiB each) and a 19,998,000
pixel noisy JPEG (10.04 MiB), all under the 20 MiB input default. Outputs have
long edge 2560; all three calls queue concurrently but execute one native worker.
RSS includes parent-side synthetic fixture generation and sums separate peaks
conservatively, not a claim that peaks coincide or a target-VPS p95 benchmark.
Native kill/queue/receive overload tests use real workers/streams, not mocked Sharp.

Intermediate failures / corrections:

- First native tests: six failures from Windows fsync on a read-only output handle.
  Open output for read/write during fsync; all actual files remain `0600`. A fixture
  then held a Sharp filename cache handle across temp deletion; inspect output via
  buffers instead. Final product worker disables cache and exits before cleanup.
- One early full Windows integration run returned a generic unexpected storage
  failure on a valid retry (84 pass/1 fail). Cause was not captured then and did
  not reproduce in eight isolated repetitions or subsequent complete suites.
  Added server-only Error.cause for diagnosis (HTTP still sends only safe code/
  message). This transient is recorded, not claimed as a proven fixed root cause;
  investigate if it recurs. Final Windows/Linux suites pass with retry/error tests.
- First lint found an unused synthetic-root argument and unnecessary suppression;
  removed both. Targeted formatting needed a second pass once. A hydration test
  variable collided with the earlier batch-resume response; renamed it after the
  real TypeScript failure. Final check/lint have zero diagnostics.
- First upload browser test tried Add files while composer was collapsed; use the
  real Drafts/create flow. Initial alphabetical `attachments.test.ts` created an
  account before auth's empty-deployment test; renamed to `uploads.test.ts`, without
  weakening authentication or introducing an auth bypass.
- First Linux browser gate: 14 pass/1 fail, valid exact downloaded bytes but Unicode
  filename became “download”. An ASCII-name probe passed; UTF-8 LANG/LC_ALL proved
  the actual root cause. Set the browser image locale, keep the Unicode assertion
  and safe portable basename; final 15/15 pass. Temporary diagnostic container
  removed; synthetic traces/probes remain only in ignored `.browser-spike`.
- A later Windows full browser run caught the real pre-hydration compose action
  issue (30 pass/1 fail); disabled initial controls until mounted/ready. Added held
  entry-module evidence. Initial route teardown double-handled a request; waiting
  for handlers with `unrouteAll({ behavior: 'wait' })` fixed the test race. Final
  Windows 31/31 and Linux 15/15 pass, including the delayed-module assertions.
- Existing upstream install-script/deprecation and lazy chunk-size warnings remain
  visible; no missing native/browser dependency was skipped as a pass.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 7.4 documents the embedded subprocess, container animation checks,
  disk accounting, frozen identity, expiring admitted-writer lease and cleanup
  ordering. This adds no service/dependency/stack replacement or security bypass.
- No known reproducible S06 defect or unfinished S06 gate remains. App note commits,
  frozen client posting/progress/confirmed-success cleanup, image viewer and Storage
  UI remain S07/S08/S12/S15. Ready retries are preserved; temporary inputs are not
  backup. No original download, automatic backup or new background draft save.
- Real VPS/p95/worst-content load, screenshot readability, physical device/IME,
  assistive technology, Linux shell baselines and full backup/restore remain later
  gates. Current native archive probes are not implemented restore evidence.
- **Next: S07**. Read ARCHITECTURE 4/7.4, shared domain/attachment/tag contracts,
  server schema/receipts/attachment service/coordinator/cleanup and actual integration
  tests. Start receipt-first create/update with canonical request digest and atomic
  tags/authorized-ready joins/search/receipt, then revision-safe lifecycle/deletion.
  Keep Post disabled until S08 and preserve all local recovery data. First command:
  `npm run check && npm run test:integration`, then full E2E with pinned Node/TLS.

### Session 2026-10-04 — S07 note mutation service and idempotent lifecycle

**State: done. Milestone A passed.** Started clean at `6e13a43`; existing S00–S06
implementation and all history preserved. No commit created. This is trustworthy
backend lifecycle, not a completed composer/timeline or a release claim.

Implemented / touched files:

- `src/lib/shared/notes.ts`: strict typed create/update/publish/status/delete
  commands, full content replacement, explicit revisions/confirmation and bounded
  body/ordered unique IDs/location. A versioned fixed-order canonical JSON array
  supplies the exact UTF-8 SHA-256 input shared with S08's future browser hashing.
  The server accepts no caller-supplied commit digest.
- `src/lib/server/notes/{service,content,http}.ts`: coordinated IMMEDIATE note
  mutations, receipt-first original-success replay even after edits/deletion,
  digest/batch binding, optimistic predicates and complete safe 409 snapshots,
  empty/UTF-8/date/location/tag/AST image validation, authorized ready file joins
  with actual immutable variant existence/type/size checks. Text/image/file-only,
  including zero-byte ordinary files, are supported; incomplete/unready/foreign
  attempt IDs, files used as images and omitted manifest files fail before commit.
- Note/tag/attachment joins, separate normalized search fields and source revision,
  upload batch commitment, durable last-reference cleanup jobs and receipt change
  atomically. Final receipt-write fault injection proves rollback of all preceding
  changes. Creation is immutable; date/location/status-only changes do not imply a
  content edit. Draft publication requires its explicit timeline instant, normally
  the original. Both prior Trash statuses/data/files restore correctly. Permanent
  deletion is Trash-only, confirmed, revision-checked and receipt-retaining.
- `src/routes/api/notes/{+server,[noteId]/+server,[noteId]/actions/+server}.ts`,
  runtime: real private GET/create/update and lifecycle endpoints, path/command
  binding, strict streamed JSON (6 MiB + 64 KiB escaping allowance, 15-second
  deadline), stable safe errors, current-session and central same-origin protection.
  `auth/identity.ts` shares the existing transaction/session recheck with the
  attachment service. Upload initialization now checks committed receipts before
  current settings limits, so tightened limits cannot hide lost-response success.
  No draft autosave endpoint, force-overwrite flag or new
  public route was added. Post stays disabled for S08.
- `tests/{unit/notes,integration/notes}.test.ts`, expanded built
  `integration/runtime-server.test.ts`: 4 new unit + 13 real integration scenarios,
  concurrent two-connection create/update/revision conflicts, receipt mismatch
  binding, atomic failure/retry, read-only integrity/FK inspection, native files,
  clone/Trash reference preservation/cleanup, settings bounds/retired-tag guard,
  maintenance/revocation, reopen/startup recovery and actual HTTP lifecycle calls
  across two configured origins/restart with no private content logged.
- README, ARCHITECTURE 4.4, tests README and this progress/handoff. No dependency,
  lockfile or migration change; schema remains v3/18 tables. No client storage or
  composer behavior was changed in this backend-only step.

Commands actually run:

Host used the existing explicit Node **24.21.0** executable and PATH plus npm
**11.12.1** CLI from S00, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Linux builds
installed their own native artifacts from the unchanged lockfile.

| Command                                                                                                                                               | Actual result                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `git status --short`, `git log -1`, full required docs/source reads                                                                                   | Clean committed S06 baseline, preserved                                     |
| `npm run check && npm run test:integration` (initial)                                                                                                 | PASS, 0 diagnostics / original 85 integration tests                         |
| `npm exec -- prettier --write <touched files>`                                                                                                        | PASS                                                                        |
| `npm run check`                                                                                                                                       | PASS, zero errors/warnings including test/tooling TS                        |
| `npm run lint`                                                                                                                                        | PASS, ESLint/Prettier                                                       |
| `npm run test:unit`                                                                                                                                   | PASS, 12 files / 60 tests                                                   |
| `npm exec -- vitest run --config vitest.integration.config.ts tests/integration/notes.test.ts tests/integration/runtime-server.test.ts` (early slice) | PASS, 12 tests before two additional scenarios were added                   |
| `npm run test:integration` (final)                                                                                                                    | PASS, 16 files / 98 actual integration tests                                |
| `npm run test:e2e`                                                                                                                                    | PASS, production build + all 31 Chromium regressions; unchanged screenshots |
| `npm run build` (standalone final)                                                                                                                    | PASS, adapter-node production artifact                                      |
| `podman build -f ops/Dockerfile.validation -t pandanote-s07 .`                                                                                        | PASS, fresh Linux ci, 0 reported vulnerabilities                            |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s07`                                                                | PASS, Linux check/lint/build, 60 unit + 98 integration tests                |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s07-browser .`                                                                        | PASS, fresh native/OpenSSL/Chromium install                                 |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s07-browser`                                                        | PASS, all 15 Linux auth/draft/upload Chromium regressions                   |
| `git diff --check`; `test ! -e .e2e-data`                                                                                                             | PASS at code gate, no private fixture leftovers                             |

Passing code-gate images (precede only this final progress-log update):

- Native: `03737aa1586cfa606897d68e2b2f385ef1001c66eda5b1f03f625987ba5cbe37`.
- Browser: `260c9c457042e89a4e0f7088b04bd294e8f51c984acfde63ad26dfecb212c18a`.

Same pinned Node 24.21.0 bookworm/glibc digest, npm 11.19.0, existing WSL2 VM
(2 GiB VM memory) and two-CPU/4-GB-limited container context as S06. Actual
SQLite/Sharp/private deletion and archive capability regressions pass; this is
not target-VPS performance or implemented full archive restore. No failed test,
missing native/browser dependency or skipped gate occurred in this session.
Final code review found upload initialization's prior settings check could hide a
committed receipt after limits were tightened. Moved admission validation after
receipt lookup, added the cross-feature regression, and repeated all gates.
Existing upstream install-script/deprecation and lazy chunk-size warnings remain
visible; Linux installs report zero vulnerabilities. Two log reads initially
used POSIX `/tmp` paths with the Windows read tool; resolved to actual Windows
Temp paths and inspected the passing logs. No application changes were needed.

Decisions / remaining scope:

- Exact endpoint/command/digest/timestamp/attachment/transport contracts are in
  ARCHITECTURE 4.4. Files may be cloned safely from an existing singleton-account
  note reference, including Trash, but not borrowed from unrelated pending attempts.
  Queued cleanup is transactional; existing restartable exclusive byte deletion
  runs at startup, not falsely inside the note's SQL transaction.
- Retired history keys fail closed; history creation and explicit resolution are
  S14, not implemented tag management. FTS/query/search UI remains S10; derived
  separate normalized fields and source revisions are real, atomic S07 hooks.
- No known unfinished S07 gate or defect. Frozen browser posting/progress/success
  cleanup, timeline/detail/conflict/draft/Trash UI and storage remain S08–S15.
  Physical-device/IME, full assistive technology, Linux shell screenshot baselines,
  real-domain/VPS performance and full backup/restore remain later gates.
- **Next: S08.** Read the files listed in the current handoff, especially strict
  `shared/notes.ts`, upload manifests and browser draft workspace/repository.
  Start persisted frozen posting attempts and receipt-first retry/readiness before
  enabling Post. Preserve local work on upload failure, conflict, response loss and
  reload; clear only confirmed submitted data. First validation:
  `npm run check && npm run test:integration`, then posting-specific and full E2E
  on pinned Node with TLS verification enabled.

### Session 2026-10-04 — S08 composer posting orchestration and upload UX

**State: done.** Started clean at `31a83fb`; S00–S07 implementation and all prior
handoff history preserved. The interrupted session was resumed from its actual
validation logs. No commit created. This completes composer-to-server posting,
not the full persisted timeline, later lifecycle screens or product release.

Implemented / touched files:

- `client/uploads/{attempt,protocol,date,file-kind}.ts`, `client/drafts/{model,
repository,workspace.svelte}.ts`: optional additive v1 frozen attempts with
  strict create/update/publish commands, canonical UTF-8 SHA-256 identity, frozen
  original-blob manifests, phase/batch/readiness/confirmation persistence and
  revision checks. Post flushes/freezes before networking; per-draft Web Locks
  serialize orchestrators separately from account repository locks. Every retry
  checks the receipt first, then server readiness and exact missing-file hashes.
  No upload/initialization from autosave/selection/preview/startup/reload.
- Sequential XHR uploads show actual byte transfer and subsequent processing;
  complete-note save has separate feedback. Timeouts/errors/reloads retain text,
  blobs and mutation identity. Double clicks cannot start another save. Editor
  mutations stay locked across uncertain failures; explicit editable copies retain
  originals, allocate new local attachment IDs and remap parsed image destinations
  without rewriting code/alt/title/prose. Existing server references are reused.
  Original-file repair preserves attachment order.
- Confirmation persists before scoped tombstone/blob cleanup. Local quota failure
  after server commit or response loss can replay the original successful receipt;
  no duplicate commit/files, optimistic deletion or false irreversible success.
  Other drafts remain untouched. Server conflict/stale-tag/auth/storage failures
  retain work and expose comparison/retry/copy/sign-in actions. Rich conflict and
  stale-history resolution remain S12/S14; no background server draft saving.
- `components/{Composer,DraftFeedback,TimelineOptions}.svelte`: enabled Post/Save
  changes, frozen retry controls, bounded feedback scroll region, local removal/
  reorder, existing cursor/paste/drop/Write/Preview/expanded modes, and secondary
  Date dialog. Temporal uses the configured app timezone; future/ambiguous/
  nonexistent local times reject instead of clamp. Local byte magic inserts a
  renamed raster selected through the generic picker at the cursor; the server
  remains authoritative for kind/animation/input/pixel validation.
- `shared/{notes,domain}.ts`, `server/{notes,attachments}/service.ts`, private layout:
  canonical base-snapshot identity rechecks server recovery before new uploads
  (after receipt lookup), catching same-revision/different-content restored bases.
  Safe GET/409 snapshots include ordered ready descriptors, never paths/checksums/
  batch IDs/secrets. Layout exposes only the timezone alongside account identity.
- `(app)/+page.svelte`: refresh just the confirmed saved snapshot and update a
  date/ID-sorted deduplicated **30-item session list**, without page navigation;
  actual processed images and private file download rows. Backdating does not
  prepend artificially. This interim list is explicitly labeled, not claimed as
  S09's persisted SSR/cursor timeline. Published/server-draft composer capability
  is tested through seeded local recovery; full entry screens remain S12/S13.
- `tests/unit/posting.test.ts`, expanded unit drafts and `e2e/posting.test.ts`:
  nine additional unit and eight real browser scenarios. Native/read-only receipt
  inspection proves one successful mutation; uploads and commits use the actual
  production app/SQLite/Sharp/files, not mock success routes. Coverage includes
  second-upload disconnect, active-upload reload, post-commit dropped response,
  confirmation-storage quota, renamed/oriented images, exact file bytes, image/
  file-only/empty validation, mobile progress/errors, date order, server draft/
  published recovery, stale base/history and expired-session retry.
- Existing draft/shell assertions now reflect enabled explicit Post. Two light
  shell screenshots were regenerated for intentionally updated status text and
  opened/reviewed; no contrast/focus/viewport checks were weakened. Test-only
  `helpers/browser-session.ts` shares verified server-issued synthetic sessions
  across posting/upload workers through private ignored `.e2e-data`, preserving
  unchanged production rate limits. `scripts/e2e-server.mjs` has bounded cleanup
  retries after Windows child shutdown; persistent failure still reports an error.
- `ops/Dockerfile.browser-validation`, README, ARCHITECTURE 7.5, tests README and
  this handoff. No dependency, lockfile or migration change (schema v3/18 tables).

Commands actually run:

Host used explicit Node **24.21.0** executable and PATH plus npm **11.12.1** CLI
N/C from S00, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final host runs were repeated
sequentially after the interrupted parallel environment, not inferred from partial
logs. Linux installs its own native modules from the unchanged lockfile.

| Command                                                                                                                                                                                                                                                                                                                                                              | Final actual result                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `git status --short`, `git log -1`, all required docs/source reads                                                                                                                                                                                                                                                                                                   | Clean S07 baseline preserved; all prior history retained                                                        |
| `npm exec -- prettier --write <touched files>`                                                                                                                                                                                                                                                                                                                       | PASS                                                                                                            |
| `npm run check`                                                                                                                                                                                                                                                                                                                                                      | PASS, zero errors/warnings including test/tooling TS                                                            |
| `npm run lint`                                                                                                                                                                                                                                                                                                                                                       | PASS, ESLint/formatting                                                                                         |
| `npm run test:unit`                                                                                                                                                                                                                                                                                                                                                  | PASS, 13 files / 69 tests                                                                                       |
| `npm run test:integration`                                                                                                                                                                                                                                                                                                                                           | PASS, 16 files / 98 real native/SQLite/filesystem/server tests                                                  |
| `npm run test:e2e -- tests/e2e/posting.test.ts` and targeted mobile/shell runs                                                                                                                                                                                                                                                                                       | Final targeted PASS; failed intermediate attempts below                                                         |
| `npm run test:e2e` (final)                                                                                                                                                                                                                                                                                                                                           | PASS, build + all 39 Chromium tests, normal screenshot comparisons                                              |
| `npm run build` (standalone final)                                                                                                                                                                                                                                                                                                                                   | PASS, adapter-node production artifact                                                                          |
| `podman build -f ops/Dockerfile.validation -t pandanote-s08 .` + `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s08`                                                                                                                                                                                                              | PASS initial Linux check/lint/build, 69 unit + 98 integration before final test-harness hardening               |
| `podman machine start` (after interruption)                                                                                                                                                                                                                                                                                                                          | PASS, restarted stopped validation VM                                                                           |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s08-browser .` (final)                                                                                                                                                                                                                                                                               | PASS, fresh Linux ci/Sharp/SQLite/OpenSSL/Chromium, zero reported vulnerabilities                               |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s08-browser sh -c 'node --version && npm --version && npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/drafts.test.ts tests/e2e/posting.test.ts tests/e2e/uploads.test.ts'` | PASS final Linux 69 unit + 98 integration, check/lint/build and all 23 auth/draft/posting/upload Chromium tests |
| `git diff --check`; `test ! -e .e2e-data`                                                                                                                                                                                                                                                                                                                            | PASS; no host private E2E fixture remains                                                                       |

Passing final Linux code-gate image (precedes only final handoff documentation):
`f46267ba6082e5a24d5a51e9a09f85d9bd34fd4fe9a8cf8ae9fe2b06768dce74`.
The initial native-only image was
`11db53c2a3888e3b8b306dfd82b29a8df59b9058605ce0e8aca504e234595289`.
Same S00 pinned Node 24.21.0 bookworm/glibc base digest, npm 11.19.0, existing
WSL2 VM (2 GiB VM memory) and two-CPU/4-GB-limited container. Final Linux image
runs all native/common gates as well as its 23-browser scope. This is compatibility
and reliability evidence, not target-VPS performance, Linux shell baselines or
implemented full archive restore; archive capability regressions still pass.

Intermediate failures / corrections (not counted as passes):

- Early check found a leftover renamed attachment DTO call, wrong settings-reader
  argument and overly broad command return type; corrected and reran checks.
  Later test-session refactor removed `readFileSync` still needed for the upload
  download assertion; restored the import after actual host/Linux check failures.
- First posting browser run: 4 pass/1 fail from checking separate-copy storage
  before its asynchronous locked write finished. Poll the real persisted record;
  exact bytes/new-ID and enabled-editor assertions remain. Subsequent cases pass.
- Full regression exposed obsolete disabled-Post assertions, removed sign-in
  status text and intentionally changed light-shell copy. Kept the accurate sign-in
  status, updated Post expectations, reviewed only the two changed light baselines.
- Short safe-area/keyboard geometry caught the new inline Date row leaving less
  than a full text line. Moved Date into a toolbar-owned secondary dialog and bounded
  the feedback region; original full-line/control/focus assertions pass unchanged.
- A later full browser run: 38 pass/1 fail, last suite HTTP 429 from spending an
  additional login. Added verified real-session test sharing; no production auth
  bypass/rate-limit change. Final Windows 39/39 and Linux 23/23 pass.
- The interrupted parallel final run recorded worker exits 1073807364/3221226091
  (8 pass, 8 failed, 23 not run), and Linux build stopped before a final image;
  Podman's VM was stopped on resume. No application cause was established and no
  failed/missing gate was treated as passed. Restarted VM and reran sequentially;
  complete host/Linux gates pass without suppressing assertions.
- First resumed Windows browser run passed 39 tests but emitted transient fixture
  `EPERM` after child exit. Global cleanup removed it; added the same bounded
  Windows deletion retries to the fixture launcher and explicit error handling,
  then repeated all host and final Linux gates with clean teardown.
- Existing native install-script/deprecation and lazy bundle-size warnings remain
  visible. No missing browser/native dependency, skipped gate or security exception.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 7.5 records additive local schema, frozen protocol/locks/copy IDs,
  confirmation cleanup, canonical recovery identity, Date/DST, safe descriptors
  and interim list boundary. The temporary session list avoids implementing an
  unbounded or counterfeit complete timeline before S09; it uses real saved notes.
  No settled stack/scope/security requirement changed.
- No known unfinished S08 gate or reproducible S08 defect. S09 persisted timeline,
  S10 search, S11 calendar, S12–S14 detail/conflict/lifecycle/history UI, S15 location/
  storage and S16/S17 backups/restore remain unfinished. Browser storage remains
  plaintext/evictable/not backup; original-file repair or explicit copies may be
  needed. A copy does not cancel an uncertain committed original save.
- Physical-device/OS IME, assistive technology, Linux visual baselines, real-domain
  HTTPS/VPS performance and full backup/restore drills remain later release gates.
- **Next: S09.** Read the exact files listed in the current handoff; start a bounded
  published-only SQLite list/cursor/SSR contract with equal-date/filter-binding
  tests. Replace session-only posting results with unified sorted timeline state,
  preserving deduplication/scroll anchors and no premature uploads. First command:
  `npm run check && npm run test:integration`, then posting and full browser regressions
  on pinned Node with TLS verification enabled.

### Session 2026-10-04 — S09 timeline cards, lazy pagination and filter state

**State: done.** Started clean at `4391fb8` (S08). Preserved all existing code and
handoff history; no commit created. S09's common, affected-browser and Linux gates
pass. Search/calendar/detail/lifecycle/storage/backup and product release remain
unfinished; this is not a final acceptance claim.

Implemented / touched files:

- `shared/timeline.ts`, `server/notes/timeline.ts`, root loader and GET
  `routes/api/notes/+server.ts`: one typed, published-only SSR/API list, 30 default/
  100 maximum, DESC timestamp/BINARY ID cursors, fixed timezone/month-end anchor,
  canonical tag fingerprint and all-tag AND. Wrong-filter/timezone cursors and
  malformed/unbounded queries fail safely. Read-transaction batched tag/file joins
  and published sidebar counts; no offset/whole-note collection fetch.
- Explicit 8 KiB UTF-8 card previews and 192 KiB page-source budget, SQLite substr
  selection and contiguous cursor boundary. Safe SSR Markdown/code/diagram metadata,
  private thumbnails with dimensions and file download rows. Full source loads on
  expansion or visibility with full-card preference. Partial code cannot be copied
  as the complete original; controls wait for hydration. A card is not a full
  editor/recovery snapshot.
- `components/NoteCard.svelte`, Markdown/shared renderer, Sidebar/AppShell, private
  layout and appearance help: timeline/actual Edited rows, optional location text/
  files, clickable tags/chips/counts, collapse/density, inert clipped controls,
  Markdown copy, confirmed draft/Trash actions and revision-conflicted refresh
  including older loaded cards. Detail/viewer/server lifecycle/location popovers
  remain S12/S13/S15, clearly identified in UI.
- `client/timeline/scroll.ts`, root Svelte page and workspace saved event replace
  the temporary session list: sorted revision-aware mutation merging/invalidation,
  no navigation or artificially prepended backdates. Saves outside filters/loaded
  dates explain how to find them. Lazy loading/error/retry, stale response/observer
  cancellation, ID/offset anchors, month separators/top-visible tracking and Kit 3
  snapshot() Back restoration. Show less returns to its card, not the list bottom;
  tracking never fetches calendar data or writes history.
- Five unit + five integration + four browser cases in `tests/{unit,integration,
e2e}/timeline.test.ts`: actual 10k SQLite/300-card DOM measurements, equal-date
  completeness, source/query bounds, canonical/NFKC keys, AND/status/privacy/version
  guarantees, no-JS SSR, stale responses, retry/Back, collapse/full/compact, exact
  code copy/disabled partial copy, older-card conflict refresh, Trash and mobile.
- Posting tests include persisted prior cards. Three shell baselines intentionally
  regenerated/reviewed for sidebar/filter/preferences changes, masking only the
  variable timeline timestamps/content in screenshot comparisons. Layout/focus/
  overflow checks remain real/unmasked. Separate unmasked light/desktop and dark/
  compact/mobile timeline screenshots were opened/reviewed. Linux browser Docker
  scope now includes timeline cases. README, ARCHITECTURE 10.3, tests README and
  this handoff document actual contracts/scope. `server/notes/http.ts` supports a
  safe list-failure message. No dependency/lockfile/migration change (v3/18 tables).

Commands actually run:

Host used explicit Node **24.21.0** executable/PATH and npm **11.12.1** CLI N/C
from S00, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final host commands were sequential;
Linux installed its own native modules from the unchanged lockfile.

| Command                                                                                                                                                                                                                                                                                                                                                                                         | Final actual result                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `git status --short`, `git log -1`, complete required docs and source/Kit 3 snapshot/Temporal API reads                                                                                                                                                                                                                                                                                         | Clean S08 baseline preserved                                                          |
| `npm exec -- prettier --write <touched text files>`                                                                                                                                                                                                                                                                                                                                             | PASS                                                                                  |
| `npm run check`                                                                                                                                                                                                                                                                                                                                                                                 | PASS, 0 errors/warnings, application and test/tooling TS                              |
| `npm run lint`                                                                                                                                                                                                                                                                                                                                                                                  | PASS, ESLint/Prettier                                                                 |
| `npm run test:unit`                                                                                                                                                                                                                                                                                                                                                                             | PASS, 14 files / 74 tests                                                             |
| `npm exec -- vitest run --config vitest.integration.config.ts tests/integration/timeline.test.ts` (early slice)                                                                                                                                                                                                                                                                                 | PASS, original four cases; expanded fifth also passes final suite                     |
| `npm run test:integration`                                                                                                                                                                                                                                                                                                                                                                      | PASS, 17 files / 103 actual tests                                                     |
| `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/posting.test.ts tests/e2e/timeline.test.ts` and targeted history/timeline reruns                                                                                                                                                                                                                                                          | Affected cases pass final suite; intermediate failures below                          |
| `npm run test:e2e -- --update-snapshots`                                                                                                                                                                                                                                                                                                                                                        | PASS, 43 tests; only three intended shell baselines changed/reviewed                  |
| `npm run test:e2e` (final normal comparisons)                                                                                                                                                                                                                                                                                                                                                   | PASS, build + all 43 Chromium tests                                                   |
| `npm run build` (standalone final)                                                                                                                                                                                                                                                                                                                                                              | PASS, adapter-node/runtime origin/server-boundary/CSP retained                        |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s09-browser .`                                                                                                                                                                                                                                                                                                                  | PASS, fresh Linux native/OpenSSL/Chromium installation; zero reported vulnerabilities |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s09-browser sh -c 'node --version && npm --version && npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/drafts.test.ts tests/e2e/posting.test.ts tests/e2e/timeline.test.ts tests/e2e/uploads.test.ts'` | PASS, Linux check/lint/build, 74 unit + 103 integration, all 27 scoped Chromium tests |
| `git diff --check`; `test ! -e .e2e-data`                                                                                                                                                                                                                                                                                                                                                       | PASS, no private host fixtures remain; autocrlf informational warnings only           |

Passing Linux code-gate image (precedes only final handoff documentation):
`8549b7de10116fbeb469aeb93ed73efc4030e5fcc81ddb1efc0f0a77b1e60b20`.
Same S00 Node 24.21.0 bookworm/glibc digest, npm 11.19.0, WSL2 VM with 2 GiB RAM,
container limited to two CPUs/4 GiB. Actual SQLite/Sharp/private files and archive
capability regressions pass; this is not a full restore drill or real VPS benchmark.
Linux browser scope excludes unreviewed platform-specific shell snapshots.

Measurements (synthetic, not target-VPS budgets):

- 10k multilingual synthetic notes, roughly 2 KiB bodies, hourly timeline spread,
  all tagged Work. Thirty-card JSON page **131,276 bytes** (~128 KiB), never 10k
  bodies. Ten warm all-match tag queries **including safe SSR rendering**: Windows
  p50 **50.8 ms**, p95 **56.3 ms**; Linux p50 **46.8 ms**, p95 **66.1 ms**. SQLite
  EXPLAIN confirms indexed descending access. No compressed-network, cold startup,
  target-VPS or rare/no-match query latency claim.
- After ten pages: **300 cards / 12,143 elements**. Sampled JS heap: Windows
  **8.7 -> 46.6 MiB**, Linux **8.7 -> 47.4 MiB** (not forced-GC/RSS or leak proof).
  Normal DOM paging retained; virtualization/trimming deferred pending longer-
  session/image/diagram/release measurements.

Intermediate failures / corrections (not counted as passes):

- Initial check caught missing Temporal ZonedDateTime.toPlainYearMonth and a
  nonreactive retry identity. Used toPlainDate month keys and reactive state;
  final check has zero diagnostics.
- Early browser runs exposed extra paging around Show less/history and stale
  filter scroll. IO is generation/geometry guarded, query navigation resets
  restoration state, and tall-card collapse returns to its header. Synthetic
  scroll instrumentation traced the extra-page cause to collapse clamping at the
  list bottom, not lost Back pages. All diagnostic instrumentation/delays removed.
- Back raw scrollTop differed by 50 px when a restored bounded-preview label
  replaced a loaded full card. Tests now assert the correct exact visible ID and
  pixel offset, not unchanged total pixels above it. Final Windows/Linux pass.
- Intended screenshot changes stopped appearance cleanup in the first full run,
  leaving later tests dark/full. Timeline tests now explicitly set appearance;
  baselines were updated with variable pane masking and separate card review.
  Final normal screenshot comparisons pass, geometry checks unchanged.
- NFKC tests initially created a tag exceeding S07's existing normalized
  64-codepoint domain bound. Kept that bound and used valid expansions/Arabic
  spaces instead; normalized registry keys must not be revalidated as raw hashtag
  source grammar. Actual creation/filter round trips now pass.
- One formatting command included Dockerfile.browser-validation (no Prettier
  parser); repeated text-file formatting without it. No missing native/browser
  dependency or failed gate was skipped. Existing install-script/deprecation and
  lazy bundle-size warnings remain visible.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 10.3 records byte budgets, partial-card contracts, canonical
  query/cursor/NFKC keys, current-month versus all-month tag anchors, SSR/copy and
  scroll/history integration. Defaults documented; no stack/security/scope change.
- No known unfinished S09 gate or reproducible S09 defect. Larger DOM/history
  storage growth, target-VPS/cold/rare-match performance, physical-device/IME,
  assistive technology, Linux visual baselines, real-domain HTTPS and full archive
  restore remain later release checks. Three hundred cards are not evidence of
  unlimited scalability. No premature upload/server draft autosave/extra service.
- **Next: S10.** Read ARCHITECTURE 8/10.3, shared/server timeline, note mutation/
  search hooks, DB migrations and timeline tests. Implement bounded literal/phrase
  parsing plus oracle tests first, then FTS migration/reindex and transactional
  updates on the same paginated list. First validation:
  `npm run check && npm run test:integration`, on pinned Node/PATH with verified TLS.

### Session 2026-10-04 — S10 SQLite exact multilingual search and snippets

**State: done.** Started clean at `a5a6b54` (S09). Prior code and all history
preserved; no commit created. S10 gates pass; S11–S18 and product release remain
unfinished. Schema is **v4**, 18 domain tables plus FTS/shadows. Dependencies and
lockfile unchanged.

Implemented / touched files:

- `shared/search.ts`: NFKC/lowercase literal oracle, whitespace AND/whole quoted
  phrases, quote/backslash escaping (unknown escapes stay literal), canonical
  deduplication/order and helpful malformed/bounded-query errors. No fuzzy matching,
  file-content extraction or Han/readings/accent conversion.
- `server/search/{index,query}.ts`, `server/notes/{service,timeline}.ts`: separate
  body/tag/filename fields, parameterized safely quoted FTS5 trigram candidates,
  mandatory field-local literal `instr` post-filter, short CJK/unsupported Unicode/
  punctuation fallback. Source joins/derived fields/rowid-linked FTS/receipts commit
  together; permanent deletion removes FTS before the derived FK cascade. Published
  status remains authoritative. No virtual-table triggers or trusted-schema relaxation.
- `migrations/0003_search_trigram.sql`, snapshot/journal/runner: atomic existing-note
  application-normalized backfill at all statuses, rollback to usable v3 on failure.
  `scripts/reindex.ts` repairs only derived data atomically with the app stopped.
- `shared/timeline.ts`, root page/layout, AppShell/Sidebar/SearchControl/NoteCard:
  same newest-first SSR/cursor list, canonical `q`/all-tags/optional half-open UTC
  `dayStart`/`dayEnd`, context-bound cursors and no implicit month bound. Up to three
  escaped structured snippets (one per field, <=320 normalized codepoints each).
  SQL fetches bounded body byte windows even far into source; boundary decoding and
  NUL display markers never modify saved text. Visible labels identify normalized
  excerpts. 300 ms/composition-aware search, malformed-input retention, superseded
  SSR/paging suppression, chips/clear/Back/mobile and full-snapshot mutation matching.
- `unit/search.test.ts`, `integration/{search,search-migration}.test.ts`, expanded
  migration/timeline tests, `e2e/{search-navigation,zsearch}.test.ts`: SEARCH-01–04
  examples/code/filenames/separate phrases, 240 randomized Unicode fixtures plus
  100 derived substrings with accelerated/fallback oracle comparisons, atomic edits/
  status/deletion/rollback/reindex, tied-date/tag/day/cursor context, far-source safe
  snippets/no-JS SSR/XSS, held requests/invalid input/IME/Back/mobile. No mock API.
- `scripts/search-benchmark.ts`, package scripts, Linux browser image, README,
  ARCHITECTURE 8.3, migration/test READMEs and this handoff. Two Windows shell
  baselines intentionally regenerated/opened/reviewed for enabled search/help text;
  mobile baseline unchanged. Synthetic fixtures never ship as product seeds.

Commands actually run:

Host used explicit Node **24.21.0** executable/PATH and npm **11.12.1** CLI N/C
from S00, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. All final host/Linux gates were
repeated after the last NUL snippet fix; failed intermediate runs are not passes.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Final actual result                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Git/docs/source/installed API reads                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Clean S09 preserved; Kit 3 goto options verified                                                |
| `npm run db:generate -- --custom --name=search_trigram`                                                                                                                                                                                                                                                                                                                                                                                                                                   | PASS, reviewed custom SQL/snapshot                                                              |
| `npm run db:generate -- --name=verify_no_drift`                                                                                                                                                                                                                                                                                                                                                                                                                                           | PASS, 18 domain tables, no drift                                                                |
| `npm exec -- prettier --write <touched text files>`                                                                                                                                                                                                                                                                                                                                                                                                                                       | PASS                                                                                            |
| `npm run check` / `npm run lint`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | PASS, 0 diagnostics; ESLint/format clean                                                        |
| `npm run test:unit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | PASS, 15 files / 79 tests                                                                       |
| `npm run test:integration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | PASS, 19 files / 107 actual native/SQLite/filesystem/server tests                               |
| Targeted Vitest search/migrations and `npm run test:e2e -- tests/e2e/search-navigation.test.ts tests/e2e/zsearch.test.ts`                                                                                                                                                                                                                                                                                                                                                                 | PASS after corrections below                                                                    |
| `npm run test:e2e -- --update-snapshots`                                                                                                                                                                                                                                                                                                                                                                                                                                                  | PASS, 46 tests; only two intended sidebar baselines changed/reviewed                            |
| `npm run test:e2e` (final normal comparisons)                                                                                                                                                                                                                                                                                                                                                                                                                                             | PASS, build + all 46 Chromium tests                                                             |
| `npm run build` (final standalone)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | PASS, adapter-node/CSP/server boundaries preserved                                              |
| `npm run search:benchmark`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | PASS, synthetic 10k oracle/latency/resource measurements                                        |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s10-browser .`                                                                                                                                                                                                                                                                                                                                                                                                            | PASS, fresh Linux native/OpenSSL/Chromium install; zero reported vulnerabilities                |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s10-browser sh -c 'node --version && npm --version && npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build && npm run search:benchmark && npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/drafts.test.ts tests/e2e/posting.test.ts tests/e2e/timeline.test.ts tests/e2e/uploads.test.ts tests/e2e/search-navigation.test.ts tests/e2e/zsearch.test.ts'` | PASS, Linux common gates, 79 unit + 107 integration, benchmark and all 30 scoped Chromium tests |
| `git diff --check`; `test ! -e .e2e-data`                                                                                                                                                                                                                                                                                                                                                                                                                                                 | PASS, no private host fixtures remain                                                           |

Final Linux image (precedes only completion documentation):
`81b6a8c918cc054003eb103e3834b15d97f5cc2d7665fca5b6ee42ad6558f640`.
Same S00 Node 24.21.0 bookworm/glibc digest, npm 11.19.0, WSL2 VM with 2 GiB RAM,
container capped at two CPUs/4 GiB. SQLite **3.53.2**, Sharp and archive capability
regressions pass; full archive restore is still S17. Linux browser scope excludes
unreviewed OS-specific shell screenshot baselines.

Measurements:

10,000 synthetic notes, average **2041 UTF-8 bytes**, 300 tags, mixed English/
Cantonese/Simplified/Japanese/width/combining/emoji/punctuation, daily dates across
many years. Common/rare-near-oldest/no-match units, indexed and forced scan, all
compared to a direct literal oracle. First-query plus 30 warm samples per mode;
10 full SSR samples. First-query is **not OS-cold disk/startup**. ID limit 31,
actual SSR 30 cards; no deployment data read/logged.

| Measurement                                   | Windows x64         | Linux 2-CPU container |
| --------------------------------------------- | ------------------- | --------------------- |
| Indexed TypeScript warm p50 / p95             | 7.33 / 7.90 ms      | 6.13 / 7.78 ms        |
| Indexed 数据库 / 図書館 p95                   | 2.57 / 2.68 ms      | 2.61 / 2.41 ms        |
| Indexed rare p95 (forced scan)                | 1.57 ms (82.39 ms)  | 1.19 ms (45.90 ms)    |
| Indexed absent p95 (forced scan)              | 0.90 ms (105.30 ms) | 0.69 ms (50.58 ms)    |
| Quoted coffee shop indexed p95                | 8.51 ms             | 13.53 ms              |
| Short matching 香港 / 猫 scan p95             | 0.64 / 0.62 ms      | 0.52 / 0.56 ms        |
| Short no-match 龘 / 咗心 scan p95             | 83.73 / 85.48 ms    | 43.96 / 50.37 ms      |
| Full 図書館 query + SSR p50 / p95             | 87.9 / 96.6 ms      | 35.2 / 48.4 ms        |
| Atomic reindex                                | 2735.4 ms           | 1903.4 ms             |
| Process peak RSS (includes seeding/rendering) | 325.9 MiB           | 348.2 MiB             |
| Main DB after checkpoint                      | 120,299,520 bytes   | 120,336,384 bytes     |
| Thirty-card JSON (uncompressed)               | 200,577 bytes       | 200,577 bytes         |

Short-query scan p95 maxima across both modes are 85.48 ms Windows / 50.91 ms Linux.
Dense newest matches may scan faster than building broad candidates; FTS materially
helps rare/no-match units. Initial search budgets are met on this host/image, **not
claimed on the actual VPS, OS-cold disk, network/browser rendering or mixed-media
backup load**. No budget relaxation or external service was needed.

Intermediate failures / corrections:

- Initial check used obsolete Kit 2 goto flags and absent snippet-column unions
  poisoning Drizzle types. Verified Kit 3 `reset` and always selected typed nullable
  columns. Unit/integration failures found a supplementary exclusion regex skipping
  paired surrogates and a missing file-fixture directory; codepoint eligibility and
  generated directory creation fixed both. Old S09 unsupported-q assertion now tests
  malformed q while retaining all other bounds.
- First 10k reindex took ~35 seconds because virtual note-ID deletion scanned the
  growing FTS table per note. Ordinary derived-rowid linkage/indexed deletion reduced
  rebuild to ~2 seconds and preserves pre-cascade permanent-delete correctness.
- First browser correctness case passed; Back raced Settings navigation completion.
  Exact URL completion assertions fixed the test; small/large tag-list paths are both
  supported. Final Windows/Linux Back/filter tests pass.
- Final review found SQLite text substr truncates at body NULs. SQL replace with a
  NUL pattern did not fix it (106 pass / 1 fail in the new regression). Bounded BLOB
  byte windows and safe decoded/control-marker excerpts fixed the real case; NUL
  query input is explicitly invalid. Repeated all final host/Linux gates afterward.
  Original source and literal predicate/oracle semantics remain intact.
- Existing native install-script/deprecation and lazy bundle warnings remain visible.
  No missing native/browser dependency, skipped test or security-policy weakening
  was counted as a pass. Failed exact-text documentation edits applied nothing;
  retried against the actual file, preserving history.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 8.3 records grammar, conservative acceleration, rowid synchronization,
  schema/backfill/repair, typed day foundation and bounded normalized snippets. The
  **default** 256 raw characters became 256 normalized content codepoints / 1024
  escaped input codepoints so canonical quotes/NFKC expansion round-trip. No settled
  product/stack/security change. NUL query input is invalid; body controls stay searchable.
- No known unfinished S10 gate or reproducible S10 defect. S11 owns day/month boundary
  calculation/UI, S14 management must call the transactional search hook. Detail/
  full lifecycle/location/storage/backups/restore remain later steps. Physical OS
  IME/read-aloud, Linux visual baselines, real-domain HTTPS, VPS/mixed-load performance
  and independent restore drills remain release requirements.
- **Next: S11.** Read ARCHITECTURE 8.3/10/10.3, shared timeline/search/settings, server
  timeline/mutation/search, AppShell/Sidebar/root observer/history and search/timeline
  tests. Implement Temporal half-open day/month boundaries and published global
  activity counts with DST/Hong Kong/Tokyo/leap/year tests first; then calendar grid/
  month/year/Today, stable scroll synchronization and locked day mode. First validation:
  `npm run check && npm run test:integration`; affected/full E2E at Milestone B.

### Session 2026-10-05 — S11 month activity calendar and scroll synchronization

**State: done. Milestone B's full Windows browser gate passed.** Started clean at
`333066c` (S10). Existing implementation/history preserved; no commit created.
S12–S18 and the product release remain unfinished. No schema, dependency or lockfile
change; native Linux validation used a clean reinstall with the verified S10 cache,
not a claimed successful cold download.

Implemented / touched files:

- `shared/calendar.ts`, `server/calendar/activity.ts`, `routes/api/calendar/+server.ts`:
  Monday/Sunday Gregorian grids, leap years, named IANA validation, Temporal local
  start-of-day/day/month boundaries including DST/midnight transitions, global
  published-only counts via one indexed counts-only scan. No search/tag predicate,
  note content, coordinate or whole-collection payload in the count endpoint.
- `shared/timeline.ts`, `server/notes/timeline.ts`: canonical local `date` and explicit
  `month` URLs, server-derived half-open day ranges, fingerprint-bound month/timezone
  cursors, rejection of duplicates/conflicting controls and old-zone cursors.
  Existing typed UTC day ranges remain supported. Manual empty months return an
  optional older seek cursor and stay empty until explicit resume; ordinary paging
  skips sparse empty matching months without fetching each month separately.
- `client/timeline/calendar.svelte.ts`, `components/Calendar.svelte`, Sidebar/AppShell,
  private layout/root page: SSR grid/counts, five neutral/green levels, separate
  today dot/selected outline, readable date/count/weekday labels, arrows/native
  picker/Today, desktop/drawer shared request owner, abort/deadline/generation guards,
  visible retry errors. Scroll only changes displayed calendar month, never URL or
  timeline; day mode locks month/results. Back snapshots retain loaded cards,
  expansion, calendar/empty state, timezone and ID/pixel anchor. Empty-month sentinel
  is suppressed. Mutation insertion respects explicit month and loaded bounds.
- `server/settings/repository.ts`, `routes/api/settings/calendar/+server.ts`,
  `components/CalendarSettings.svelte`, private Settings and reactive draft workspace
  timezone: strict coordinated/session-rechecked two-field merge; explicit browser
  proposal/manual IANA input/week start; errors retain choices. Saved zone never
  follows browser/VPS automatically. Counts/date filters/cursors/grouping update on
  timezone change. Persistent layout invalidates counts after composer completion,
  even when posting from Drafts; lifecycle actions use existing invalidation.
- `styles/tokens.css`, `unit/appearance.test.ts`: heat levels and actual-token AA
  numeral contrast in light/dark. `unit/calendar.test.ts`, `integration/calendar.test.ts`
  cover CAL-01–04, status/date/republish/restore, midnight/leap/year/DST, locked paging,
  settings/auth/old cursors, sparse months/search, epoch-zero/western-1969 dates
  and dense 10k aggregation.
  `e2e/calendar.test.ts` adds five actual built flows including no-JS SSR, day locks,
  picker/Today/empty/Back, tall/Mermaid/year transitions, held stale/error counts,
  different browser zone, lifecycle and Drafts-post invalidation, delayed-image anchors
  and mobile drawer. No simulated successful API/fixture bypass.
- `e2e/posting.test.ts`: its in-range backdate now uses one hour earlier than now;
  the old 2020 assumption fell outside the first 30 cards once calendar fixtures
  existed, correctly producing no invented pagination gap. Ordering/date assertions
  remain. Active-upload reload routing now waits for real hydration before
  unregistering routes, avoiding a pending-entry-module teardown race found in
  final regression. Shell screenshot masks now include variable calendar dates/counts; only
  two intended Windows baselines changed, opened/reviewed. Separate unmasked fixed
  month desktop/mobile calendar screenshots were opened/reviewed.
- README, ARCHITECTURE 10.4, tests README, Linux browser-image scope and this handoff.
  Default control years 1969–9998 keep four-digit URLs and cover UTC epoch-zero
  notes in western timezones; query bounds may be negative, note instants may not;
  no future scheduling/stack/security change. Desktop calendar cell height 32px fits
  seven columns; mobile height uses 44px targets, with short/sidebar scrolling intact.

Commands actually run:

Host used explicit Node **24.21.0** executable/PATH and npm **11.12.1** CLI N/C
from S00, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. The final common gates and normal
browser comparison run passed; intermediate failures below are not passes.

| Command                                                                                                    | Actual outcome                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Git/status/log, full required docs/source reads                                                            | Clean S10 preserved                                                                                      |
| `npm exec -- prettier --write <touched text files>`                                                        | PASS, including second pass where required                                                               |
| `npm run check` / `npm run lint`                                                                           | PASS final, zero diagnostics, ESLint/format clean                                                        |
| `npm run test:unit`                                                                                        | PASS, 16 files / 83 tests                                                                                |
| `npm run test:integration`                                                                                 | PASS, 20 files / 112 actual native/SQLite/filesystem/server tests                                        |
| `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/calendar.test.ts`                                    | Initial 3 pass/3 fail; corrected selectors/reseed, final 6/6 before fifth calendar case                  |
| `npm run test:e2e -- --update-snapshots`                                                                   | 49 pass/1 fail from obsolete out-of-range backdate expectation; two intended baselines updated/reviewed  |
| `npm run test:e2e` (final normal comparisons)                                                              | PASS, production build + all 51 Chromium tests                                                           |
| `npm run build` (final standalone)                                                                         | PASS, adapter/runtime origin/CSP/server-only boundaries retained                                         |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s11-browser .`                             | FAILED: socket unavailable, then two actual cold builds failed prebuild download/compiler fallback       |
| `podman machine start`                                                                                     | PASS, restarted unavailable VM                                                                           |
| `podman run --rm pandanote-s10-browser sh -c 'ls -l /root/.npm/_prebuilds; node --version; npm --version'` | Verified cached Linux x64 SQLite v12.11.1/node ABI137 archive and unchanged Node/npm                     |
| `podman build -f .browser-spike/Dockerfile.s11-cached -t pandanote-s11-browser-cached .`                   | PASS, clean `npm ci` removes/reinstalls node_modules using verified Linux cache; 0 audit vulnerabilities |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s11-browser-cached`      | PASS Linux check/lint/build, 83 unit + 112 integration, all 35 scoped Chromium tests                     |
| `git diff --check`; `test ! -e .e2e-data`                                                                  | PASS, no private host fixture left                                                                       |

The temporary ignored validation Dockerfile is precisely `FROM
localhost/pandanote-s10-browser:latest`, `WORKDIR /app`, `COPY . .`, `RUN npm ci`.
Its CMD runs `node --version && npm --version && npm run check && npm run lint &&
npm run test:unit && npm run test:integration && npm run build && npm run test:e2e --
tests/e2e/auth.test.ts tests/e2e/calendar.test.ts tests/e2e/drafts.test.ts
 tests/e2e/posting.test.ts tests/e2e/timeline.test.ts tests/e2e/uploads.test.ts
 tests/e2e/search-navigation.test.ts tests/e2e/zsearch.test.ts`. This does not copy
Windows node_modules or skip reinstall/native tests. Cold downloads remain unverified
this session; the two failed cold builds are not passes and should be retried during
S18 deployment validation. No TLS verification exception or package change was used.

Passing Linux code-gate image (precedes only this handoff close update):
`baabdbb0e55c055659a59ef2a918717a264259a3d08d7f1e9371f184a6263279`, based on
verified S10 image `81b6a8c918cc054003eb103e3834b15d97f5cc2d7665fca5b6ee42ad6558f640`.
Same pinned Node 24.21.0 bookworm/glibc base, npm 11.19.0, WSL2 VM (2 GiB RAM),
container capped at two CPUs/4 GiB. SQLite/Sharp/private files/archive capability
regressions pass; this is not a complete archive restore or real-VPS release audit.
Linux browser scope excludes unreviewed OS-specific shell screenshot baselines.

Measured 10,000 synthetic published notes concentrated in March (31 independent
UTC day ranges), 30 warm count queries, counts-only JSON <500 bytes:

| Host                               | Warm p50 | Warm p95 |
| ---------------------------------- | -------- | -------- |
| Windows x64 / Node 24.21.0         | 11.19 ms | 13.99 ms |
| Linux two-CPU validation container | 10.52 ms | 20.13 ms |

These meet the initial calendar target on these hosts, not a promised VPS/OS-cold
budget. No counts cache/index table, extra service or budget relaxation was needed.

Intermediate failures / corrections:

- Initial check warned about a self-closing datalist option; corrected, final zero
  warnings. New contrast test initially excluded numbered heat tokens with its old
  regex; broadened token-name parsing, all levels actually pass AA. A formatting
  pass required a second pass; failed lint was not counted as success.
- First targeted browser run used a nonexistent Mermaid class and treated a datalist
  input as textbox rather than combobox; actual diagram rendered, corrected to the
  product data selector/label. Worker restart after failure reseeded duplicate notes;
  seeding now queries actual existing fixtures before creation, never bypasses auth.
- Full browser run exposed the old posting test's fixed 2020/in-loaded-range assumption
  with >30 previously seeded notes. Kept correct no-gap behavior; the in-range test
  uses a recent explicit backdate and exact date/order checks. Final 51/51 passes.
- Final review found the initial 1971 control bound could break the calendar when
  scrolling a valid UTC epoch-zero note (western app zones show December 1969).
  Lowered the control bound to 1969; negative UTC query boundaries are valid while
  stored note instants remain nonnegative. Added actual SQLite/browser regressions
  for this edge and repeated host/Linux common/browser gates.
- The first post-review Windows browser rerun had 50 pass/1 fail: active-upload reload
  left all hydration controls disabled. Trace had an uncompleted entry-module GET
  around `unrouteAll`, with no application exception. The test now waits for actual
  hydration before unregistering network routes. Final Windows 51/51 and Linux
  35/35 pass. This is test-harness ordering hardening, not relaxed assertions or a
  claim that Chromium's internal cause was proven; investigate if it recurs.
- Linux socket initially unavailable. Restarted VM; cold builds twice logged
  `prebuild-install warn install aborted`, then node-gyp failed because Python was
  absent. Exact download-abort cause was not established. Cached Linux archive from
  the unchanged verified S10 image allowed **clean** npm ci and all native/browser
  gates, without adding compilers/dependencies or disabling TLS. Cold-image networking
  remains an environment/deployment verification issue, not silently passed.
- Existing upstream install-script/deprecation and lazy bundle-size warnings remain
  visible; no missing browser/native dependency was skipped in the passing gate.

Remaining scope / exact next task:

- No known unfinished S11 feature or reproducible S11 defect. S12 owns full private
  detail/edit/conflict/image viewer; S13/14 lifecycle/tag management and S15 storage/
  location remain. Counts already react to every currently exposed note mutation;
  later lifecycle/tag/settings UI must retain the shared invalidation hooks.
- Physical device/OS IME, assistive technology, Linux shell baselines, real-domain
  HTTPS/VPS load, cold install network/toolchain robustness and independent full
  backup/restore remain S18/later gates. No final product completion is claimed.
- **Next: S12.** Read ARCHITECTURE 4.4/6.3/7.5/10.4/11, shared snapshots/domain/notes,
  NoteService/private file routes, draft/frozen workspace, NoteCard/Markdown/Modal,
  root timeline/calendar history and browser tests. Start the private addressable
  full-note route and dialog/mobile entry with direct SSR/refresh/not-found plus
  focus/history/scroll return. Then published edit/conflict choices/viewer. First
  validation: `npm run check && npm run test:integration`, then affected browser/full
  suites with pinned Node/PATH/TLS and genuine sessions. Preserve S11 work.

### Session 2026-10-05 — S12 addressable detail, edits, conflicts and image viewer

**State: done.** Started clean at `fb56fbe` (committed S11). Prior implementation
and all history preserved; no commit created. S13–S18 and product release remain
unfinished. Schema v4, dependencies and lockfile unchanged.

Implemented / touched files:

- `routes/(app)/notes/[noteId]/+page.{server.ts,svelte}`, `components/NoteDetail.svelte`,
  private layout, `app.d.ts`: private full-snapshot SSR/refresh/no-JavaScript route,
  safe 404/transient failure, desktop dialog/mobile full-screen, complete content/
  metadata/files, Edit entry and private permalink. Timeline shallow entries carry
  only IDs; Close/Escape/Back restores the mounted filters/scroll/focus, Forward
  reopens. Direct/refresh entry closes to All notes when no mounted prior timeline
  exists. Detail reads use deadline/abort/stale guards with visible retry.
- `client/drafts/recovery.ts`, model/repository/workspace, Composer/DraftFeedback,
  local Drafts page: full-snapshot published/server-draft recovery with ordered
  server references and canonical base digest. Reuse existing local work, detect
  stale bases, retain dates/location/files, no upload on entry/edit/reload. Save
  changes/Post reuse the real frozen protocol. Device-only server references may
  describe existing files up to the server hard bound; local staging limits remain
  unchanged. Recovery labels include base links, modification time and frozen state.
- `components/ConflictDialog.svelte`: safe full server/local source comparison,
  keep edits, confirmed load current server, publish separately and explicit replace
  observed revision. Load of an observed Trash version opens read-only private
  detail. Copy/replace fork records, remap new local IDs/source spans and reuse
  authorized existing files. Original losing recovery/text/blobs/frozen identity
  remain intact, even after the resolved fork succeeds. Replacement races conflict
  again; no force overwrite/merge/autosave/cancellation claim was introduced.
- `components/ImageViewer.svelte`, Markdown/NoteCard/Modal, reading state and root
  timeline: card/detail keyboard image entry, selected-only larger WebP, ordered
  navigation, zoom controls/keys, bounded drag pan/resize, fit-mode touch swipe,
  retry and processed-WebP download. Native modal focus wrapping, safe Escape,
  opener return and hydration-gated close; background Mermaid/full-source/paging
  work paused. Composer avoids duplicate preview and reveals edits only after
  detail closes, preventing delayed reopening after quick mobile Escape.
- `tests/unit/drafts.test.ts`, `e2e/detail.test.ts` (eight scenarios), posting
  assertions, Linux browser scope, README/ARCHITECTURE 11.3/tests README/this handoff.
  Exact IndexedDB/downloaded losing bytes, server image sharing, two-context copy/
  load/replace and third-edit/status races use real server/SQLite/files/Sharp, never
  fake successful endpoints. Actual CDP touch swipe, short mobile editor geometry,
  private SSR/no-JS/refresh, stale GET and Back/focus tests pass. Five unmasked
  synthetic screenshots were opened/reviewed; existing shell baselines unchanged.

Commands actually run:

Host commands used the S00 explicit Node **24.21.0** N executable/PATH and npm
**11.12.1** C CLI with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final host gates were
repeated sequentially after the modal/focus/mobile fixes; no partial run is counted
as a pass. Linux installs its own native modules from the unchanged lockfile.

| Command                                                                                               | Actual final outcome                                                                                |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Git/status/log and complete required docs/source/API reads                                            | Clean S11 baseline preserved                                                                        |
| `npm run check && npm run test:integration` (baseline)                                                | PASS, 0 diagnostics and original 112 integration tests                                              |
| `npm exec -- prettier --write <touched text files>`                                                   | PASS; second pass where needed                                                                      |
| `npm run check` / `npm run lint`                                                                      | PASS final, 0 errors/warnings, ESLint/format clean                                                  |
| `npm run test:unit`                                                                                   | PASS, 16 files / 85 tests                                                                           |
| `npm run test:integration`                                                                            | PASS, 20 files / 112 actual tests                                                                   |
| `npm run test:e2e -- tests/e2e/detail.test.ts tests/e2e/posting.test.ts`                              | PASS final affected gate, 16 Chromium tests                                                         |
| `npm run build`                                                                                       | PASS final standalone adapter-node production artifact                                              |
| `npm run test:e2e`                                                                                    | PASS final, production build + all 59 Chromium tests, normal screenshot comparisons                 |
| `podman build -f ops/Dockerfile.browser-validation -t pandanote-s12-browser .`                        | FAILED: prebuild download aborted, compiler fallback lacked Python; not a pass                      |
| `podman build -f .browser-spike/Dockerfile.s12-cached -t pandanote-s12-browser-cached .`              | PASS final clean `npm ci` with verified Linux prebuild/browser cache; zero reported vulnerabilities |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s12-browser-cached` | PASS final Linux check/lint/build, 85 unit + 112 integration and all 43 scoped Chromium tests       |
| `git diff --check`; `test ! -e .e2e-data`                                                             | PASS, no private host fixture left; autocrlf informational warnings only                            |

Passing final Linux image (precedes only this handoff close update):
`8275fd6123c3d2132db42d5b68812c12da686c994361ba9c6578ba2661ff9657`.
Temporary ignored Dockerfile: `FROM localhost/pandanote-s11-browser-cached:latest`,
`WORKDIR /app`, `COPY . .`, `RUN npm ci`; CMD executes node/npm version, check, lint,
unit/integration, build and E2E auth/calendar/drafts/detail/posting/timeline/uploads/
search-navigation/zsearch. Base is verified S11 image
`baabdbb0e55c055659a59ef2a918717a264259a3d08d7f1e9371f184a6263279`, retaining
only Linux caches, not Windows modules. Same pinned S00 bookworm/glibc Node image,
npm 11.19.0, existing WSL2 VM and two-CPU/4-GB container. Actual SQLite/Sharp/files/
archive capability probes pass; not full archive restore, cold-install networking,
Linux shell baselines, real-VPS or release performance evidence.

Intermediate failures / corrections (not passes):

- First detail run expected 30 large cards, but 24 correctly filled the existing
  192 KiB page budget. Kept the budget and asserted 24. Direct SSR upgrade initially
  lost native modal state; later hydration-gating reproduced this for shallow/
  viewer dialogs. Compiler inspection proved Svelte grouped the `open` property
  with unrelated reactive button attributes. Post-mount markup now preserves the
  actual native DOM state; `showModal`/`close` alone control the desired state.
  Diagnostic logs were removed. Focus initialization waits for rendered controls,
  and Tab handles focus on the dialog itself as well as first/last controls.
- Initial posting checks selected both progress and saved-status regions; scoped
  exact saved feedback. Viewer keyboard handling originally missed the header Close
  focus; the native modal now delegates non-Tab/Escape keys to the viewer.
- Mobile edit originally revealed the composer before detail navigation completed,
  allowing a delayed second reveal after quick Escape. Recovery is persisted first,
  detail closes, then the editor reveals/focuses once. Actual mobile close/resume/
  retained-byte/save assertions pass afterward.
- Full regression initially had 54 pass/2 fail: obsolete conflict-summary text and
  fixture-driven loaded-range/backdate assumptions. History fixtures now use 2020;
  posting checks exact backdate and descending chronological order, not an assumed
  second position among other fixtures. Conflict checks target the working dialog.
- An intermediate concurrent Windows/Linux run had one HTTP `ECONNRESET` in the
  test credential probe; no root cause established. Final complete host/Linux
  gates ran sequentially and pass. Three Linux intermediate browser failures
  reproduced the modal bug; after fixes all 43 pass. Cold Linux prebuild failure
  is the same S11 environment issue; no TLS exception/compiler/library substitution
  or failed native test was silently treated as passed.
- Early lint/format failures and the final reactive-dialog-ref warning were fixed;
  all final common/browser gates reran with zero diagnostics. Existing lazy-bundle/
  native install-script/deprecation warnings remain visible.

Decisions / limitations / exact next task:

- ARCHITECTURE 11.3 records history/SSR/recovery/fork/viewer contracts. Original
  losing records intentionally survive conflict resolution, rather than changing
  immutable frozen retries or deleting uncertain work. S13 must label/reconcile
  multiple recoveries clearly, not silently remove them. No stack/security/product
  requirement change or automatic server save was added.
- No known reproducible S12 defect or unfinished S12 acceptance item. Device-local
  drafts remain plaintext/evictable, not backup. Physical device/OS IME/read-aloud,
  Linux visual baselines, real-domain/VPS, cold-install robustness and independent
  full restore remain later release requirements.
- **Next: S13.** Read ARCHITECTURE 4.4/6.3/7.5/10.4/11.3, shared snapshots/lifecycle,
  NoteService/attachment cleanup, workspace/recovery/frozen records, NoteDetail/
  ConflictDialog and Drafts/Trash pages/tests. Start bounded private status-specific
  server-draft/Trash listing with actual SQLite tests, then clear local/server
  recovery overlays, republish and restore/confirmed permanent delete. Keep normal
  timeline/search/calendar published-only and preserve prior status/dates/files.
  First validation: `npm run check && npm run test:integration`, then affected
  detail/posting/draft/timeline/calendar and full browser gates on pinned Node/TLS.

### Session 2026-10-05 — S13 Drafts and Trash screens

**State: done.** Started clean at `ccccc11` (committed S12); prior implementation
and every handoff history entry preserved. No commit created. S14–S18 and product
release remain unfinished. Schema v4, dependencies and lockfile unchanged.

Implemented / touched files:

- `shared/status-notes.ts`, `server/notes/status-list.ts`,
  `routes/api/notes/status/+server.ts`, Drafts/Trash server loaders: typed private
  status-specific SSR/API pages, 30 default/100 maximum, DESC date/ID ties,
  status-bound validated cursors and transaction/session rechecks. SQL selects
  <=1024 source bytes/row, batch-aggregates selected image/file counts, emits safe
  <=240-codepoint labels/optional ellipsis. No title, full body, location or file
  paths in list DTOs; local drafts never enter SQLite/server list sources.
- `components/StatusNoteList.svelte`, Drafts/Trash pages, workspace recovery:
  separate device-only new/published-edit/server-draft-edit labels, base revision,
  local-copy ID/time/frozen identity; explicit last-saved server text and multiple
  recovery counts. Active/matching/newest full-base recovery reuse preserves all
  losing copies. Local edits/files survive reload and remain browser-only until
  Post; original server date/location/files survive republication. No Save draft,
  background server save or automatic publication.
- `client/drafts/lifecycle.svelte.ts`, `components/LifecycleDialog.svelte`, cards,
  detail, private layout and root timeline: one confirmed expected-revision action
  flow for move-to-draft/Trash, prior-status restore and permanent delete. Independent
  content-free browser records persist the exact command before networking; quota
  failure sends nothing, storage events refresh other tabs, corrupt bytes remain.
  Unconfirmed commands survive navigation/reload and resolve lost-response receipts
  even after permanent deletion. Inspection/conflict refresh never forces newer
  revisions; Stop retrying is explicitly not cancellation or undo.
- Lifecycle/composer receipts invalidate timeline/tag counts, calendar, status lists
  and open detail. Known newer status mutations filter stale list/history rows;
  a newer remote revision is not suppressed by an older local event. Older status
  pages remain deduped and retained after known removals; explicit Refresh starts
  over. Bounded request deadlines/abort/generation guards and actionable retry states
  protect paging. Shallow detail preserves list context; direct deletion returns
  to Trash. Native reference-safe cleanup remains the S07 queued worker; no timer
  or bulk Empty Trash action was introduced.
- `styles/global.css`: semantic danger button text/border/hover uses existing tokens
  (old danger classes were unstyled). No new palette/security/dependency exception.
  `tests/{unit,integration,e2e}/status-notes.test.ts`: 2 unit, 2 real SQLite/native
  integration and 8 real built-browser scenarios. Cross-device/no-premature-write,
  dates/files/location, both restores, mobile confirmation/detail, exact lost-delete
  retry payload, quota, stale status/local retention, multiple recoveries, bounded
  SSR/no-JS/privacy/paging and count/search/Back tests. Existing posting Resume
  selector now targets local rows, since server rows also offer Resume.
- README, ARCHITECTURE 11.4, tests README, Linux browser scope and this handoff.
  Drafts desktop/Trash mobile confirmation screenshots opened/reviewed; prior shell
  baselines unchanged. All files/credentials/blobs/logs are synthetic and ignored.

Commands actually run:

Host used S00's explicit Node **24.21.0** executable/PATH and npm **11.12.1**
N/C CLI, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final host/Linux gates ran
sequentially after review fixes; failed intermediate runs are not counted as passes.

| Command                                                                                                                             | Final actual outcome                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Git/status/log; complete required docs and relevant source reads                                                                    | Clean S12 baseline preserved                                                                  |
| `npm exec -- prettier --write <touched text files>`                                                                                 | PASS, including required second formatting passes                                             |
| `npm run check` / `npm run lint`                                                                                                    | PASS, zero errors/warnings; ESLint/Prettier clean                                             |
| `npm run test:unit`                                                                                                                 | PASS, 17 files / 87 tests                                                                     |
| `npm exec -- vitest run --config vitest.integration.config.ts tests/integration/status-notes.test.ts`                               | PASS final targeted cases; initial failures below                                             |
| `npm run test:integration`                                                                                                          | PASS final, 21 files / 114 real tests                                                         |
| `npm run test:e2e -- tests/e2e/status-notes.test.ts`                                                                                | Initial 4 pass/1 error-message assertion failure; later expanded cases all pass full suite    |
| `npm run test:e2e -- tests/e2e/status-notes.test.ts tests/e2e/timeline.test.ts tests/e2e/detail.test.ts tests/e2e/calendar.test.ts` | PASS, 22 affected cases before three additional S13 cases                                     |
| `npm run build`                                                                                                                     | PASS standalone final production build; runtime origin/CSP/server-only boundaries retained    |
| `npm run test:e2e`                                                                                                                  | PASS final, build + all 67 Chromium tests, normal unchanged screenshot comparisons            |
| `podman build -f .browser-spike/Dockerfile.s13-cached -t pandanote-s13-browser-cached .`                                            | PASS final clean Linux `npm ci` with verified native/browser caches, 0 audit vulnerabilities  |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s13-browser-cached`                               | PASS final Linux check/lint/build, 87 unit + 114 integration and all 51 scoped Chromium tests |
| `git diff --check`; `test ! -e .e2e-data`                                                                                           | PASS, no private host fixture left; autocrlf informational warnings only                      |

Final passing Linux image (precedes only this documentation close update):
`2acc59c62a93898a04aacb5f41172330d4370da3d274904d8c55d86b5795176c`.
Ignored temporary Dockerfile uses `FROM localhost/pandanote-s12-browser-cached:latest`,
`WORKDIR /app`, `ENV NODE_TLS_REJECT_UNAUTHORIZED=1`, `COPY . .`, `RUN npm ci`.
CMD runs Node/npm versions, check/lint/unit/integration/build, then E2E auth/calendar/
drafts/detail/posting/timeline/uploads/search-navigation/zsearch/status-notes.
Verified base is S12 image
`8275fd6123c3d2132db42d5b68812c12da686c994361ba9c6578ba2661ff9657`;
clean ci removes/reinstalls modules using Linux caches, never host Windows modules.
Same pinned Node 24.21.0 bookworm/glibc base, npm 11.19.0, existing WSL2 VM and
2-CPU/4-GB container context. Native SQLite/Sharp/files/archive capability checks
pass; this is not full archive restore, a cold download or real-VPS benchmark.
No cold native-image build was attempted this session; S11/S12's prebuild networking/
missing-compiler fallback issue remains an explicit later deployment verification.

Intermediate failures / corrections:

- Initial integration had 113 pass/1 fail: empty SQLite BLOB selection was null;
  source decoding now handles that. Next targeted case exposed Drizzle's unqualified
  outer columns in correlated SELECT expressions yielding zero attachment counts.
  Replaced those expressions with a bounded batch aggregation; real native image/
  file-only labels and both restores now pass on Windows/Linux.
- Initial lint requested writable derived dialog state and reactive Maps; adopted
  installed Svelte APIs. Some Prettier files needed a second pass. Final diagnostics
  are zero. Early exact-text edit misses applied no changes and were retried safely.
- First targeted browser run had 4 pass/1 fail: network TypeError showed raw Failed
  to fetch rather than actionable older-page feedback. Added the safe retry message.
- First full 66-test run had 65 pass/1 fail: old generic Resume selector now matched
  both local and server entries. Scoped it to local rows without weakening assertions.
  Expanded full runs exposed fixture/selector assumptions: a UUID-tied note can be
  outside page one after 33 drafts, and selected calendar labels include a selection
  suffix. Tests now deliberately page older data/use the exact selected label.
- A later full run had 66 pass/1 fail: its paging loop ran before navigation completed
  and saw no older-load button. Await exact Drafts URL and hydrated Refresh before
  paging. Final complete Windows 67/67 and Linux 51/51 pass. No production limit,
  assertion, security policy or dependency was weakened to obtain a pass.
- Final code review added revision-aware known-mutation filtering to both incoming
  and retained rows, preventing stale responses/history from reintroducing known
  draft/Trash/deleted IDs while allowing later restored remote revisions. Repeated
  common/full host and scoped Linux gates afterward. Existing large lazy-bundle and
  upstream native install-script/deprecation warnings remain visible.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 11.4 documents list/cursor/excerpt/recovery/durable-action contracts.
  No schema/stack/product/security change. Browser retry commands are independent
  immutable records, not another note store or backup; they contain no note text,
  file bytes, location or credentials. Permanent deletion is one note at a time.
- No known reproducible S13 defect or unfinished S13 gate remains. Full backup/
  restore sources do not exist yet; local exclusion is structural and tested at
  server list/SQLite boundaries, not falsely claimed as an archive round trip.
  Physical-device/IME/read-aloud, Linux visual baselines, real-domain/VPS performance,
  cold installation and independent archive restore remain later release checks.
- **Next: S14.** Read ARCHITECTURE 9/11.4 and shared tag spans, note/search hooks,
  `tagChanges`, frozen draft preflight and Tags placeholder/tests. Start typed tag
  preview/rename/merge/remove with exact cross-status source rewrites, history and
  revision/search transactions in real SQLite; then UI and explicit stale-local-tag
  resolution. Preserve browser drafts/lifecycle retries and never force versions.
  First validation: `npm run check && npm run test:integration`, then affected/full
  browser gates with the pinned runtime and verified TLS.

### Session 2026-10-05 — S14 tag management and stale local tags

**State: done.** Started clean at `3d2bdae` (committed S13); prior implementation
and all handoff history preserved. No commit created. S15–S18/product release remain
unfinished. Schema is v5 / 19 domain tables; dependencies and lockfile unchanged.

Implemented / touched files:

- `shared/tags.ts`, `server/tags/service.ts`, `routes/api/tags/{+server,preview,check}`,
  Tags loader/page: searchable 100-result usage inventory; confirmed rename,
  case-only spelling, explicit existing-target merge and removal. Preview binds
  source/target registry, history and every affected note revision/body; includes
  counts, ten safe source samples and full-note inspection. All statuses rewrite
  only parser hashtag spans; unrelated source/code/HTML/URLs/escapes stay exact.
  Notes/dates/files/location/status are preserved, even when removal empties text.
- One coordinated IMMEDIATE transaction updates source, joins/deduplication,
  registry, +1 revisions/content-edited time, derived fields/FTS, history and receipt.
  `migrations/0004_tag_receipts.sql`, snapshot/journal, schema/version introduce a
  separate tag receipt table, preserving note receipt shape. Durable independent
  content-free browser management commands survive response loss/reload; retry
  resolves original success before changed source/preview checks.
- Draft model/workspace/shared note canonical contract, `StaleTagDialog.svelte`,
  private layout and note service: explicit Post history check before freezing/
  uploads; frozen retry checks receipts first, then tags/base before upload. Local
  source/files stay unchanged until Apply history, Remove locally or confirmed
  intentional recreation. Choices save locally and require another explicit Post.
  Frozen choices fork/remap IDs/bytes while retaining original immutable retries.
  Optional local-v1 `{key,generation}` acknowledgements are canonical-digest bound;
  absent/empty fields retain all pre-S14 frozen command bytes.
- History follows latest identity-changing source event and only later target
  events, terminates cycles/removals, ignores self-key case-only changes and remains
  sticky after recreation. Exact intentional acknowledgement permits reuse; a newer
  retirement requires review again. `TagAutocomplete.svelte` and Composer provide
  AST-eligible local prefix suggestions, keyboard/touch and IME-safe activation;
  no typed prefix/body/file goes to a server while writing.
- Layout/root/status pages invalidate tag/detail/status/timeline data by history
  generation, preventing Back/retained older pages from reviving rewritten cards.
  Server recovery bases are not silently rebased. Shared JSON reader accepts smaller
  tag caps with existing actual-byte/deadline protection. Runtime registers TagService.
- `tests/{unit,integration,e2e}/tag-management.test.ts`: 3 unit, 6 real SQLite and
  7 real built-browser cases, plus updated posting preflight regression. Cross-status
  exact CRLF spans/counts/joins/search, collision/case/removal, chronological chains,
  recreation/new retirement, revision conflicts/two connections, restart/idempotency,
  final-receipt fault rollback, inventory/text bounds, anonymous/CSRF/transport,
  Back/filter invalidation, response loss, unchanged local draft/files before choice,
  frozen-copy retained bytes/IDs, keyboard/touch autocomplete and losing editor work.
- README, ARCHITECTURE 9.1/schema/backup receipt notes, migration/test READMEs,
  Linux browser Docker scope and this handoff. Desktop preview/mobile confirmation
  screenshots opened/reviewed; existing shell baselines unchanged. All runtime
  files, credentials, blobs and diagnostics are synthetic/ignored.

Commands actually run:

Host used S00's explicit Node **24.21.0** executable/PATH and npm **11.12.1**
N/C CLI, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final complete gates were sequential.

| Command                                                                                               | Actual result                                                                           |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Git/status/log, required docs/source/native API reads                                                 | Clean S13 preserved                                                                     |
| `npm run db:generate -- --name=tag_receipts`                                                          | PASS, reviewed 19-table generated migration/snapshot                                    |
| `npm exec -- prettier --write <touched text files>`                                                   | PASS final, repeated where necessary                                                    |
| `npm run check` / `npm run lint`                                                                      | PASS final, zero errors/warnings, ESLint/format clean                                   |
| `npm run test:unit`                                                                                   | PASS, 18 files / 90 tests                                                               |
| `npm run test:integration`                                                                            | PASS final, 22 files / 120 real native/SQLite/filesystem/server tests                   |
| `npm run test:e2e -- tests/e2e/tag-management.test.ts`                                                | Initial 3 pass/3 fail; final targeted 6/6 before seventh cache/security test            |
| `npm run test:e2e -- tests/e2e/tag-management.test.ts tests/e2e/posting.test.ts`                      | Intermediate 13 pass/1 test-context failure; fixed touch context                        |
| `npm run build`                                                                                       | PASS final standalone production artifact                                               |
| `npm run test:e2e`                                                                                    | PASS final build + all 74 Chromium tests, unchanged normal shell baselines              |
| `podman build -f .browser-spike/Dockerfile.s14-cached -t pandanote-s14-browser-cached .`              | PASS clean Linux ci using verified native/browser cache; zero vulnerabilities           |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s14-browser-cached` | PASS Linux check/lint/build, 90 unit + 120 integration and all 58 scoped Chromium tests |
| `git diff --check`; `test ! -e .e2e-data`                                                             | PASS at code gate, no private host fixtures left; autocrlf informational warnings only  |

Passing Linux code-gate image (precedes only final documentation close changes):
`6e6718b49755becf86868fcbd8650fdc79c700ed340e0c10d3bbfd42ab3de795`.
Ignored temporary Dockerfile uses `FROM localhost/pandanote-s13-browser-cached:latest`,
`WORKDIR /app`, TLS verification 1, `COPY . .`, `RUN npm ci`; CMD runs Node/npm
versions, all common gates and auth/calendar/drafts/detail/posting/timeline/uploads/
search-navigation/zsearch/status-notes/tag-management E2E. Verified S13 base is
`2acc59c62a93898a04aacb5f41172330d4370da3d274904d8c55d86b5795176c`;
clean ci reinstalls modules from Linux caches, never Windows modules. Same pinned
bookworm/glibc Node base, npm 11.19.0, WSL2 VM and 2-CPU/4-GB container context.
Actual SQLite/Sharp/private files/archive capability tests pass, not a full restore
or real-VPS benchmark. No cold prebuild download was attempted; S11/S12's cold
network/compiler fallback remains an explicit later deployment verification.

Intermediate failures / corrections:

- Initial lint found an ephemeral Map in the rune workspace, writable modal state
  and control-regex rule. Used SvelteMap/writable derived/explicit codepoint checks;
  generated JSON and a few source files needed a second formatting pass. Check had
  zero diagnostics throughout; final lint/common gates pass on both hosts.
- Initial tag browser run timed out on an exact label including nested option text
  and used an obsolete conflict dialog name. Added explicit Tag action label and
  selected the actual Note conflict dialog. Next run lacked a touch-enabled test
  context for tap; enabled real hasTouch and retained tap assertions. Final 74 host/
  58 Linux tests pass, without changing production limits/auth or weakening assertions.
- First mobile screenshot preceded modal rendering; added the visible-dialog wait
  and reviewed the actual confirmation screenshot. No baselines were regenerated.
  Small exact-edit misses applied no changes and were retried against unique regions.
- Review made Post report false on preflight blocking rather than pretend it saved.
  Existing native install-script/deprecation and lazy chunk warnings remain visible;
  no failed or missing native/browser dependency was counted as a pass.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 9.1 records chronological sticky history and explicit recreation,
  case-only non-retirement, receipt/digest compatibility, source-size/10k management
  bounds and 5,000-metadata/eight-option local autocomplete bounds. These are safety
  defaults, not a stack/security/scope substitution. Oversized management refuses
  without partial changes; an operator workflow for beyond-release-scale batches
  is not claimed. Management search finds tags beyond the autocomplete subset.
- No known reproducible S14 defect or unfinished S14 acceptance item. Browser drafts
  remain plaintext/evictable, not backup. Full location/storage, backups/restore,
  physical device/IME/read-aloud, Linux visual baselines, real-domain/VPS load,
  cold install robustness and independent restore remain later release requirements.
- **Next: S15.** Read ARCHITECTURE 4/6/7.4/9.1/10.4/12.5, shared settings/location,
  composer Date/workspace, Settings/security/calendar forms, card/detail location,
  AttachmentService inventory/resources/cleanup and integration tests. Start explicit
  manual/browser location with local retention and card/detail popover, then complete
  settings/storage/limits and reference-safe manual cleanup. First validation:
  `npm run check && npm run test:integration`; full browser gate at Milestone C.
  Stop app and run `npm run db:migrate` before serving v5. Preserve S14 work.

Final documentation-close checks: `npm run db:generate -- --name=verify_no_drift`
passed (19 tables, no schema drift/nothing generated); `npm exec -- prettier --write
docs/ARCHITECTURE.md docs/PROGRESS.md`, `npm run lint`, `git diff --check` and
`test ! -e .e2e-data` passed. Only documentation changed after the full code gates.

### Session 2026-10-05 — S15 geolocation and complete non-backup Settings/storage

**State: done. Milestone C passed.** Started clean at `cd523e9` (committed S14).
Prior implementation and all handoff history preserved. No commit created. S16–S18
and product release remain unfinished; schema v5/19 domain tables, dependency pins
and lockfile unchanged.

Implemented / touched files:

- `shared/location.ts`, `components/{LocationOptions,LocationPopover}.svelte`,
  Composer/NoteCard/NoteDetail and central Permissions-Policy: explicit current
  location or decimal manual coordinates/optional label, strict ranges/null manual
  accuracy, edit/remove, staged modal fields, ten-second current-position timeout,
  denial/unavailability/HTTPS feedback and late/canceled-result guards. Location
  metadata uses normal local revision/quota/frozen-post recovery; never auto-requested
  or uploaded before Post/Save changes. Missing location renders no row. Native
  small nonmodal popover offers escaped label/coordinates/known accuracy, exact copy
  and failure feedback, and explicit new-tab OpenStreetMap action; no embed/geocoder.
- `shared/storage.ts`, `server/settings/{repository,storage}.ts`, private settings
  storage GET/PATCH/cleanup endpoints, Settings loader/page/StorageSettings and
  shared layout/workspace/model: nine bounded persisted image/upload/note controls,
  atomic session-rechecked merges, retained failed choices and cross-device defaults.
  Native/server bounds remain authoritative. Local selection follows saved byte/count
  limits, and local descriptors now accept the existing 500 MiB hard ceiling without
  making prior recovery undecodable when settings shrink. Full supported-IANA
  datalist/manual entry complements explicit browser-zone proposal. Existing fresh
  security/MFA/recovery/session/revoke-all actions remain functional and tested.
- Distinct live/server-draft, Trash-only, unreferenced/queued attachment byte totals
  count shared files once; filesystem DB/WAL/SHM/staging/archive/free/reserve readings
  expose no paths/content/keys. Measurements are bounded snapshots, not whole-OS
  accounting or browser-draft backup. Small byte counts are displayed without
  misleading rounding to zero. No arbitrary paths/reserve/origin/security-field
  injection through limit settings.
- `AttachmentService.cleanupUnused`: confirmed account-owned whole-batch cleanup,
  observed activity binding, conservative 24-hour quiet interval, active-upload and
  published/draft/Trash/clone reference checks. Resume and admitted transfers renew
  protection, including duplicate/failed transfers. All selection abandonment/jobs
  commit together or roll back; exact abandoned-batch retry is safe. Existing
  exclusive durable worker deletes bytes/rechecks references and survives restart.
  Confirmed Retry queued cleanup reruns only already-queued IDs. Local drafts/blobs
  remain; UI warns an abandoned frozen attempt requires a separate editable copy
  with fresh local IDs. No timer, automatic expiry or automatic Trash deletion.
- `attachments/files.ts`: built HTTP limit tests found unconditional reader cancel
  destroyed the adapter-node socket before a validation response. Ordinary rejection
  now stops disk writes/releases the reader; inspected Kit 3 `setResponse` drains
  unread bytes after responding. Receive deadlines still cancel; byte/pixel/hash,
  native queue/deadline, transport and temporary-file policies remain unchanged.
  Appearance HTTP writes now also use the bounded JSON deadline and transactional
  session recheck rather than relying only on earlier hook authorization.
- `tests/unit/location-storage.test.ts`, `integration/storage.test.ts`,
  `e2e/location-storage.test.ts` and updated local-descriptor unit assertion: two
  unit, six real SQLite/filesystem/native and seven built-browser scenarios covering
  GEO-01/DRAFT-01–03/FILE-01/AUTH-04/05/UI-01–03. Actual browser geolocation reports
  synthetic accuracy; manual/null/zero/denial/timeout/quota/reload/Post/removal,
  clipboard and explicit-only map requests are verified. Real bounds/shared bytes,
  stale/active/referenced cleanup, rollback, exact retry and restart recovery pass.
  A synthetic committed-queue/crash fixture exercises the actual browser retry
  endpoint/worker, not a fake deletion response. Full prior feature regressions pass.
- README, PRODUCT_SPEC safety-default note, ARCHITECTURE 15, tests README, Linux
  browser-image scope and this handoff. Four new desktop/mobile screenshots plus
  the short safe-area editor were opened/reviewed; existing shell baselines were
  not regenerated. No large UI kit, external location service or public file route.

Commands actually run:

Host uses the existing explicit Node **24.21.0** executable/PATH and npm **11.12.1**
N/C CLI from S00, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final full host and Linux
runs were sequential; failed/partial gates below are not counted as passes.

| Command                                                                                               | Final actual outcome                                                                               |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Git/status/log, full required planning/source and installed Kit adapter reads                         | Clean S14 preserved; socket/draining API verified against installed source                         |
| `npm run check && npm run test:integration` (baseline)                                                | PASS, zero diagnostics and original 120 integration tests                                          |
| `npm exec -- prettier --write <touched text files>`                                                   | PASS final; repeated when formatting required                                                      |
| `npm run check` / `npm run lint`                                                                      | PASS final, zero errors/warnings, ESLint/Prettier clean                                            |
| `npm run test:unit`                                                                                   | PASS final, 19 files / 92 tests                                                                    |
| Targeted Vitest storage and affected location/storage/touch Playwright runs                           | PASS after corrections below; production/native paths exercised                                    |
| `npm run test:integration`                                                                            | PASS final, 23 files / 126 actual native/SQLite/filesystem/server tests                            |
| `npm run build`                                                                                       | PASS final standalone production artifact; runtime origin/CSP/server-only boundaries retained      |
| `npm run test:e2e`                                                                                    | PASS final, build + all 81 Chromium tests, unchanged normal shell baselines                        |
| `podman image inspect pandanote-s14-browser-cached --format '{{.Id}}'`                                | Verified Linux cache provenance `6e6718b49755becf86868fcbd8650fdc79c700ed340e0c10d3bbfd42ab3de795` |
| `podman build -f .browser-spike/Dockerfile.s15-cached -t pandanote-s15-browser-cached .`              | PASS clean Linux ci with own native artifacts from verified caches; zero vulnerabilities           |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s15-browser-cached` | PASS Linux check/lint/build, 92 unit + 126 integration, all 65 scoped Chromium tests               |
| `git diff --check`; `test ! -e .e2e-data`                                                             | PASS, no private host fixture left; only autocrlf informational warnings                           |

Passing Linux code-gate image (precedes only this documentation close update):
`de07d2b23f89dc7eea1402f895554c9c238cc6ebceee0e4861171cf79b19a26f`.
Ignored validation Dockerfile uses `FROM localhost/pandanote-s14-browser-cached:latest`,
`WORKDIR /app`, TLS verification 1, `COPY . .`, `RUN npm ci`. CMD runs Node/npm
versions, check/lint/unit/integration/build and E2E auth/calendar/drafts/detail/posting/
timeline/uploads/search-navigation/zsearch/status-notes/tag-management/location-storage.
Clean ci reinstalls modules from Linux-native caches, never Windows node_modules.
Same pinned bookworm/glibc Node base, npm 11.19.0, WSL2 VM and 2-CPU/4-GB container
context as S14. Actual SQLite/Sharp/archive capability probes pass; not full archive
restore, target-VPS performance or a cold download. Cold prebuild networking/compiler
fallback from S11/S12 was not retried; deployment verification remains S18. Linux
scope excludes unreviewed OS-specific shell baselines, not missing native tests.

Intermediate failures / corrections:

- Initial lint rejected a Svelte `RequestInit` global type; used the installed fetch
  signature. Adding popover Escape handling required a focusable dialog tabindex;
  warning was corrected. A formatting pass needed repetition. Exact-text edit misses
  applied nothing and were safely retried. Final diagnostics are zero.
- First new browser run: 1/5 passed; four failures were ambiguous status/alert selectors
  from existing progress/appearance regions. Scoped actual feedback. Second run:
  2/5 passed, with two obsolete saved-message assumptions and the real rejected-upload
  socket reset. Tests now assert Saved on server; the adapter cancellation defect was
  fixed as described above and genuine HTTP 400/local-limit validation now passes.
- First full 80-test gate: 77 passed/3 failed. A test clipboard override lacked
  `configurable: true`, a desktop-only test helper was invoked after its mobile
  screenshot, and the new toolbar's location label wrapped on the shortest safe-area
  viewport, leaving only 18 px versus the required 25.6 px text line. Corrected the
  two test assumptions and made the short-screen trigger compact/nonwrapping; kept
  the original full-line/control/focus assertions. Affected tests and full 80-test
  rerun passed. Visual review then improved tiny-byte display and queued-cleanup
  recovery, added the seventh case, and repeated complete host/Linux gates: 81/81
  Windows and 65/65 scoped Linux pass.
- Existing large lazy-chunk/native-install-script/upstream deprecation warnings
  remain visible. No missing browser/native dependency, failed gate, loosened auth
  limit, baseline rewrite or security exception was treated as a pass.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 15 documents whole-batch/activity/24-hour protection, local hard-bound
  adjustment, storage measurements, explicit map behavior and adapter error handling.
  PRODUCT_SPEC records the cleanup interval as an implementation safety default,
  justified by protecting inter-request active/recoverable posting attempts. Nothing
  expires automatically; no major scope/stack/security change or new dependency.
- No known reproducible S15 defect or unfinished S15 gate remains. Browser-local
  data is plaintext/evictable and not backed up. Physical phone/permission prompt/IME,
  assistive technology, Linux shell baselines, real-domain/VPS load/cold installation
  and independent full restore still belong to later release gates. Backup/restore
  are not placeholders marked complete; the application is not a finished release.
- **Next: S16.** Read ARCHITECTURE 13/15/12.5/7.4, persistence/write coordinator,
  private storage/keys, schema/receipt tables, disk budget/immutable files/cleanup,
  StorageSettings and archive spikes. First implement versioned `.pnb` manifest and
  consistent online SQLite/file/key capture with bounded maintenance/failure tests,
  then fresh-auth manual create/list/status/download/delete. Preserve included-note
  and tag-history receipts; exclude sessions/local drafts/pending uploads/old archives.
  First validation: `npm run check && npm run test:integration`, then affected/full
  browser and real Linux archive/native gates. No automatic backup scheduler.

Final documentation-only close: `npm exec -- prettier --write docs/PROGRESS.md`,
`npm run lint`, `git diff --check` and `test ! -e .e2e-data` passed. No application
code changed after the final full host/scoped Linux code gates.

### Session 2026-10-05 — S16 manual full backup creation/list/download

**State: done.** Started clean at `ec5d475` (committed S15). Prior implementation
and all handoff history preserved. No commit created. S17/S18 and product release
remain unfinished. Schema v5 / 19 domain tables; dependency pins/lockfile unchanged.

Implemented / touched files:

- `shared/backups.ts`, `server/backups/{service,archive,snapshot,http}.ts`: bounded
  format-v1 manifest-first regular USTAR tar.gz with raw pre-parser extension guard,
  canonical generated paths, strict counts/sizes/duplicates and SHA-256 verification.
  Own online SQLite snapshot includes WAL, all server statuses/data/settings/auth/
  MFA/recovery/portable keys and referenced immutable variants. Sessions/challenges/
  rates/setup credentials, pending/unreferenced files/batches, cleanup/backup catalogs,
  derived search, old archives/staging/local drafts/deployment are excluded. Included-
  note and tag-history receipts remain; referenced batch associations are cleared.
- Real shared write-gate drain and post-drain identity check; immutable hardlink
  capture with streamed copy fallback; shared production upload/backup disk budget
  with worst-case copy/compaction/archive/overhead estimate. Gate releases before
  isolated bounded SQLite sanitization/VACUUM subprocess and streaming hashing/
  compression/verification. Staged secure-delete/compaction removes freed credential
  and FTS pages. Only fsynced, verified, renamed archives become complete. Failed/
  interrupted jobs clean only their own artifacts and never automatically resume.
- Private `/api/backups` create/list and ID download/delete endpoints: single-use
  exact fresh scopes, bounded commands and create UUID retry identity, no public GET/
  HEAD archive path, no half-created download, byte-identical regular-file streaming
  with safe download headers. Explicit delete refuses running jobs. Catalog/staging
  startup recovery handles pre-publication crash and missing completed bytes; unknown
  completed destination archives are retained for S17 rediscovery. Runtime shares disk
  budget and waits for bounded jobs before persistence shutdown. Attachment checksum
  helper now accepts an optional abort signal; other callers retain existing behavior.
- `components/BackupSettings.svelte`, Settings page: manual create/status/progress/
  time/size/error, protected native POST download, confirmed deletion, password/MFA
  reauthentication and error/retry states. Only content-free create UUID can enter
  sessionStorage; credentials/factors/grants never enter storage/URLs. Refresh after
  response loss discovers the original job without recreation. Warns unencrypted
  archives contain sensitive authentication material and server-local copies alone
  do not protect against VPS loss. Restore is explicitly unavailable (S17).
- `tests/{unit,integration,e2e}/backups.test.ts`: two unit, ten real SQLite/filesystem/
  Sharp/MFA/archive/process and three built-browser scenarios. Covers exact scopes,
  receipts/history/source exclusion, raw freed-session-byte absence, portable MFA
  decryption/recovery state, processed images/no originals, both hardlink/copy live
  deletion, actual streamed admitted upload drain, concurrent mutations/reads,
  security revision race, storage-full/timeout/finalization failure, actual process
  SIGKILL after verification and startup recovery, malicious archive subset rejection,
  protected byte-identical browser download, local-draft retention, lost response,
  CSRF/anonymous/oversize and mobile dialog. No mock successful backup/restore route.
- `scripts/backups-benchmark.ts`, package script; README/ARCHITECTURE 13.5/test README,
  Linux browser image scope and this handoff. Desktop/mobile screenshots opened and
  reviewed; existing shell baselines unchanged. No dependency/migration/stack/security
  exception, scheduler/passphrase or restore functionality was introduced.

Commands actually run:

Host uses the S00 explicit Node **24.21.0** executable/PATH and npm **11.12.1**
N/C CLI with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final complete runs are sequential;
failed intermediate attempts below are not counted as passes.

| Command                                                                                               | Actual outcome                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Git/status/log, complete required docs/source/pinned archive/native API reads                         | Clean S15 preserved                                                                                             |
| `npm exec -- prettier --write <touched text files>`                                                   | PASS final; repeated after edits                                                                                |
| `npm run check` / `npm run lint`                                                                      | PASS, zero errors/warnings; ESLint/Prettier clean                                                               |
| `npm run test:unit`                                                                                   | PASS, 20 files / 94 tests                                                                                       |
| `npm exec -- vitest run --config vitest.integration.config.ts tests/integration/backups.test.ts`      | Initial fixture failures; final native cases pass complete suite                                                |
| `npm run test:integration`                                                                            | PASS, 24 files / 136 actual native/SQLite/filesystem/server tests                                               |
| `npm run build`                                                                                       | PASS standalone production artifact; runtime origin/CSP/server boundaries retained                              |
| `npm run test:e2e -- tests/e2e/auth.test.ts tests/e2e/backups.test.ts`                                | Two intermediate 4-pass/1-fail runs; fixed null-Origin form and event attribution                               |
| `npm run test:e2e`                                                                                    | PASS build + all 84 Chromium tests, unchanged normal baselines                                                  |
| `npm run backups:benchmark`                                                                           | PASS synthetic hardlink/copy metrics below                                                                      |
| `podman image inspect pandanote-s15-browser-cached --format '{{.Id}}'`                                | Verified base `de07d2b23f89dc7eea1402f895554c9c238cc6ebceee0e4861171cf79b19a26f`                                |
| `podman build -f .browser-spike/Dockerfile.s16-cached -t pandanote-s16-browser-cached .`              | PASS clean Linux ci using verified native/browser caches; zero vulnerabilities                                  |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s16-browser-cached` | PASS Linux check/lint/build, 94 unit + 136 integration, benchmark and all 5 affected auth/backup Chromium tests |
| `git diff --check`; `test ! -e .e2e-data`                                                             | PASS; no private host fixtures left, autocrlf informational warnings only                                       |

Final Linux validation image: `aa31eed1c9bd4f42e9fd5836f28a85262d04a53d509ae44f2e531dcc242b11f7`.
Earlier passing images before final failure-path/monotonic-timing review were
`5ef812374feeec236dc79004a882c39c2a45371da0e5e01ca85cc0b1717b593c` and
`77fd3323f7a691c60c37256a10c4783f33ca0d5009d9b0d2f94313d1659a3999`.
The ignored Dockerfile uses `FROM localhost/pandanote-s15-browser-cached:latest`,
`WORKDIR /app`, TLS verification 1, `COPY . .`, `RUN npm ci`; CMD runs node/npm,
check/lint/unit/integration/build, backup benchmark and auth/backup E2E. Clean ci
reinstalls Linux-native modules, never Windows node_modules. Same pinned bookworm/
glibc Node 24.21.0, npm 11.19.0 and WSL2 two-CPU/4-GB container context as S15.
Cold native networking was not retried; earlier cold-download/compiler fallback
issues remain a deployment verification, not a claimed pass. Linux Chromium scope
is the five affected tests; full native regressions include Sharp/SQLite/archives.

Measured synthetic workload: **10,000** multilingual ~2 KiB notes across published/
server-draft/Trash plus **32 MiB** incompressible unchanged file. 25 ms sampler;
parent RSS includes fixture generation. Disk numbers are sampled regular-file
logical/unique-inode bytes, not exact allocated-block peaks; the second run retains
its first completed archive (included in baseline, not nested in the payload).
Worker maxRSS is separate and summing peaks is conservative, not simultaneous RSS.

| Measurement                                      | Windows hardlink / copy         | Linux hardlink / copy           |
| ------------------------------------------------ | ------------------------------- | ------------------------------- |
| Capture                                          | 132 / 186 ms                    | 27 / 93 ms                      |
| Full verified job                                | 1850 / 2156 ms                  | 1457 / 1563 ms                  |
| Sampled unique total disk peak                   | 135,242,142 / 203,429,148 bytes | 134,035,420 / 202,222,477 bytes |
| Baseline disk including live WAL/old archives    | 77,542,335 / 112,174,909 bytes  | 77,534,119 / 112,166,749 bytes  |
| Parent sampled peak RSS                          | 330,522,624 / 338,329,600 bytes | 373,657,600 / 374,448,128 bytes |
| Sanitizer worker peak                            | 79,064 / 79,608 KiB             | 106,208 / 118,400 KiB           |
| Successful concurrent write probes / busy probes | 66/3 / 71/5                     | 58/1 / 60/3                     |
| Max indexed read probe                           | 0.18 / 0.18 ms                  | 0.21 / 0.18 ms                  |
| Longest sampler interval                         | 78.91 / 69.13 ms                | 28.42 / 29.74 ms                |

Archive ~34.63 MB; streaming/memory and useful read/write behavior remain within
initial budgets on these hosts, **not claimed on the target VPS, OS-cold disk,
maximum-format-size data or an independent restore**. Final measurements use the
same completed sources on both hosts and monotonic duration/retry clocks; UTC
manifest/job timestamps remain wall-clock instants. No performance budget was relaxed.

Intermediate failures / corrections:

- Initial checks/fixtures used the wrong instant/header type names and flattened
  content instead of the existing nested note command. Added required USTAR header
  fields and corrected typed fixtures; final check and all native tests pass.
  Unused-import/format checks and exact-edit misses were corrected without erasing
  source/history. Tests now cover native process kills, not just simulated rows.
- First browser download failed real CSRF: native POST form `noreferrer` produced
  **Origin: null**. Kept the same-origin gate and removed only noreferrer, retaining
  noopener and same-origin referrer policy (grant never in URL). Second run had a
  genuine HTTP 200 archive but test waited for download on the new tab; Chromium
  emits it on the initiating page. Asserted that actual download and exact bytes.
  Final Windows 84/84 and Linux affected 5/5 pass without auth-policy changes.
- Final review strengthened real SQLITE_FULL/ENOSPC handling (including safe worker
  error codes), asynchronously freed incomplete staging before failed-status SQL,
  guaranteed budget release, checked raw freed-session bytes/settings, and used
  monotonic timing/retry deadlines. Then repeated Windows common/full 84-browser
  gates and Linux common/affected 5-browser gates on the final sources; all pass.
- Empty backup status/alert regions were made conditional to avoid duplicate empty
  live regions in Settings; normal appearance/shell tests still pass unchanged.
  Existing large lazy-chunk and upstream native install-script/deprecation warnings
  remain visible. No missing native/browser dependency or failed gate was skipped.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 13.5/README record format, bounds, subprocess, disk/leases, POST-native
  download and crash/delete semantics. These are implementation safety defaults,
  not a new service/stack/passphrase/security exception. Runtime uses one shared
  budget for uploads and backups rather than independent reservations.
- No known reproducible S16 defect or unfinished S16 acceptance item. S17 must still
  implement uploaded immutable staging, untrusted DB/schema/key/reference validation,
  trusted staged migrations/search rebuild, destructive summary/confirmation,
  journaled whole-data swap/rollback/crash recovery, destination archive rediscovery
  and session invalidation. **Checksum verification alone is not secure restore.**
- Physical devices/IME/assistive technology, Linux shell baselines, cold installation,
  real-domain/VPS loads, maximum-bound resource checks and the independent downloaded-
  archive web-upload restore drill remain S17/S18. Product completion is not claimed.
- **Next: S17.** Read ARCHITECTURE 13/12.5/4; production backups, private storage/keys,
  migration ledger/schema/search reindex, coordinator/journal/runtime and native backup
  tests. First implement private uploaded staging and complete no-write format plus
  known-schema/DB/key/reference trust validation. Never execute uploaded schema SQL.
  Then journaled replacement/rollback and browser restore. First validation:
  `npm run check && npm run test:integration` on pinned Node/PATH with TLS verified.

Final documentation-only close: formatted ARCHITECTURE/PROGRESS, then `npm run lint`,
`git diff --check` and `test ! -e .e2e-data` passed. No application/test source changed
after the final full Windows and affected Linux code gates.

### Session 2026-10-05/06 — S17 uploaded full restore and rollback

**State: done.** Started clean at `8da746a` (committed S16). Prior implementation
and all handoff history preserved; no commit created. S18/product release remains
unfinished. Schema v5 / 19 domain tables, dependency pins and lockfile unchanged.

Implemented / touched files:

- `shared/restores.ts`, `server/backups/{restore,trust,replacement}.ts`, existing
  archive verifier and private `/api/restores`/`confirm`: raw private exact-byte
  upload, early manifest disk claims, complete no-write first-pass verification,
  second-pass bounded regular USTAR extraction and immutable private candidate.
  Strict known migration-produced schema/ledger, disabled trusted schema/query-only
  native inspection, singleton settings/account/bounded hash, portable AES-GCM MFA/
  recovery state, UUID/UTC/revision/location, tags/ordered image/file references,
  exact variants/counts/digests, static metadata-free fully decoded WebP and receipt/
  history checks. Reject altered/newer schemas, modules/config/oversized shadow cells,
  malformed data or missing/corrupt variants before replacement. Known v4 migrates
  through application SQL to v5 on staging; fresh trusted FTS shadow/config state
  and the shared source hook rebuild search cooperatively outside live maintenance.
- `db/connection.ts`, runtime/hooks, existing backup service/HTTP/storage key schema:
  exclusive drain, post-drain fresh identity, successful WAL checkpoint/handle closure,
  journal-before-rename of DB directory/files directory/key, Linux parent fsync,
  reopen/restored keys/settings/integrity and durable verified commit. Earlier failures
  durably select rollback before inverse moves; startup chooses complete old or new
  state before opening DB/keys or cleanup, and is idempotent through rollback crashes.
  Unrecoverable state blocks normal access; committed cleanup is restartable, not
  falsely reported as rollback. Unrelated destination archives are preserved and
  verified catalog rebuilt; source sessions/challenges cannot survive replacement.
- `components/RestoreSettings.svelte`, BackupSettings: current password/MFA for
  upload and separately for explicit destructive replacement, actual byte progress,
  validation feedback, safe capture/schema/status/count/MFA summary, reload/discard,
  failure and uncertain-response instructions, archived-account login redirect.
  No grants/passwords/factors in URLs/storage; no separate archive password, merge,
  automatic restore or draft upload. Browser-local work is untouched; existing
  revision/base/receipt checks remain. One process-local candidate; restart discards
  unconfirmed uploads. `.env.example` raises archive transport ceiling to 64G;
  image/file/JSON domain limits remain unchanged.
- New `unit/restores.test.ts`, `integration/restores.test.ts` (24 cases) and
  `e2e/zzrestore.test.ts` (2 cases), Linux browser validation scope. Native independent
  initialized destination restores all statuses/source/dates/tags/location/images/
  files/settings/keys/receipts, both archived TOTP and recovery login, old-session
  invalidation and destination archives. Nine injected failures and ten real killed
  subprocess boundaries cover prepared/all six renames/reopen/commit/verified,
  different old/new keys and old-only files, usable rollback and deterministic
  restart. Includes corruption/scope/full disk, strict schema/config/variants, v4
  migration, admitted security-writer race and unconfirmed restart cleanup. Browser
  uses actual downloaded archive then Settings upload/summary/reload/confirmation/
  login; old revision restored, local recovery retained, bad uploads/CSRF/auth rejected.
- `ops/RESTORE_RUNBOOK.md`, README, ARCHITECTURE 13.6, tests README and this handoff:
  destination-VPS workflow, compatibility/resource/transport/disk bounds, crash
  phases and protected stopped-app operator recovery. Desktop summary/mobile auth
  screenshots opened/reviewed; existing shell baselines unchanged. No generated
  archive, runtime data, credential, diagnostic or browser profile enters git.

Commands actually run:

Host uses S00's explicit Node **24.21.0** executable/PATH and npm **11.12.1** N/C
CLI, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Final host/Linux runs were sequential;
no failed/partial gate is counted as a pass.

| Command                                                                                               | Actual final outcome                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Git/status/log, full required docs and relevant installed APIs/source                                 | Clean committed S16 preserved; SQLite native defensive/iterator behavior inspected                           |
| `npm run check && npm run test:integration` (baseline)                                                | PASS, 0 diagnostics / original 136 integration                                                               |
| `npm exec -- prettier --write <touched text files>`                                                   | PASS, repeated where needed                                                                                  |
| `npm run check` / `npm run lint`                                                                      | PASS, 0 errors/warnings; ESLint/format clean                                                                 |
| `npm run test:unit`                                                                                   | PASS, 21 files / 95 tests                                                                                    |
| Targeted restore Vitest and auth/backup/restore Playwright                                            | PASS final; intermediate failures below                                                                      |
| `npm run test:integration`                                                                            | PASS final, 25 files / 160 actual tests                                                                      |
| `npm run build`                                                                                       | PASS final standalone production artifact; server-only/origin/CSP retained                                   |
| `npm run test:e2e`                                                                                    | PASS final build + all 86 Chromium tests, normal unchanged shell baselines                                   |
| `podman image inspect pandanote-s16-browser-cached --format '{{.Id}}'`                                | Verified base `aa31eed1c9bd4f42e9fd5836f28a85262d04a53d509ae44f2e531dcc242b11f7`                             |
| `podman build -f .browser-spike/Dockerfile.s17-cached -t pandanote-s17-browser-cached .`              | PASS clean Linux ci with verified native/browser caches, zero audit vulnerabilities                          |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-s17-browser-cached` | PASS Linux check/lint/build, 95 unit + 160 integration and all 7 affected auth/backup/restore Chromium tests |
| `git diff --check`; `test ! -e .e2e-data`                                                             | PASS, no private host fixture left; only autocrlf informational warnings                                     |

Final passing Linux image (precedes only this documentation-close update):
`e291a8c8d4cfb482718e6adc3df571cfcfc7bea8078023e7f236a71b25a03ba3`.
Ignored Dockerfile uses `FROM localhost/pandanote-s16-browser-cached:latest`,
`WORKDIR /app`, TLS verification 1, `COPY . .`, `RUN npm ci`; CMD runs node/npm,
check/lint/unit/integration/build and E2E auth/backups/zzrestore. Clean ci reinstalls
Linux-native modules using verified caches, never Windows node_modules. Same pinned
bookworm/glibc Node base, npm 11.19.0, WSL2 two-CPU/4-GB container context as S16.
Earlier passing review images: `295998976c98bfe54aee5d88bcb1d014b9a01c51daeb529b8f238641b7dd986e`
and `34c397b1237643753101e487b89275e9e5305796fb586248dd6f99897e08ce9f`.
Native Sharp/SQLite/full restore/fsync/process-kill tests actually execute on Linux;
this is not a real-VPS, maximum-bound, cold-download or full Linux visual audit.

Intermediate failures / corrections (not passes):

- First targeted run: 18 pass/2 fail. Test used nonexistent `LoginResult.kind`
  instead of `mfaRequired` and an incorrect trigger name; corrected the fixtures/API
  checks. Next attack sweep exceeded the unchanged ten-attempt/IP fresh-auth window;
  independent synthetic IPs exercise all attacks under the unchanged account limit.
  No production rate limit or security policy was weakened. Lint found one unused
  import/conditional expression; corrected. One Prettier file needed a second pass.
- A cooperative reindex review initially used an active SQLite iterator while
  writing FTS; native better-sqlite3 correctly rejected it (136 pass/22 restore
  failures). Materialize only bounded <=100k IDs, never bodies, before staged writes;
  retain yield/deadline checks and exact shared search hook. All common/full browser
  gates reran successfully after the fix.
- Final FTS-corruption fixtures initially attempted direct shadow writes under
  SQLite defensive mode (159 pass/1 fail before validation ran). Disable defensive
  mode **only in that synthetic fixture** to forge the archive; product connections
  retain native defensive mode. Strict config/shadow validation and fresh trusted
  shadow recreation pass, then final Windows/Linux common/browser gates reran.
- Review strengthened commit-record fsync ambiguity (durably select rollback before
  any inverse rename), pending-journal refusal, WAL busy check, cooperative semantic
  iteration and full native WebP decoding rather than metadata-only acceptance.
  Final review shares `notes/content.ts` rather than a second image/tag AST validator,
  preserving CommonMark first-definition-wins behavior; the independent image round
  trip includes an ignored duplicate definition. These changes and differing-key/file
  fault tests were validated in final full Windows and common/affected Linux gates.
  Existing lazy-bundle and native install-script/deprecation warnings remain visible;
  no missing native/browser dependency, skip, assertion weakening or baseline rewrite.

Decisions / remaining scope / exact next task:

- ARCHITECTURE 13.6/runbook record the known v4/v5 trust policy, native subprocess,
  staged-only yielding transaction, durable old/new commit/rollback protocol, single
  candidate/restart cleanup, destination catalog and header-only upload grant. Added
  safety bounds (100k notes / 256 MiB Markdown / one-million ordinary rows / 16 KiB
  non-body cells / 4 KiB keys) keep native/AST work bounded on the small deployment;
  larger inputs fail explicitly, not partially restore. Transport 64G supports full
  archives while smaller authoritative domain limits/disk reserve remain. No new
  service, dependency, schema, encryption/passphrase, scheduler or stack change.
- No known reproducible S17 defect or unfinished S17 feature gate. Browser storage
  remains plaintext/evictable and not backed up. Physical-device/IME/read-aloud,
  Linux shell baselines, cold native installation, maximum-bound resource checks,
  real-domain/VPS performance/security/accessibility and independent deployed-domain
  web-upload restore drill remain S18. Native independent-instance restore and local
  production browser round trip pass; they are not a final deployed-VPS release drill.
- **Next: S18** production single-instance Linux Dockerfile/Compose/HTTPS proxy with
  persistent private DATA_DIR, explicit stopped-app initialization/migration and
  configurable ORIGIN. Read the current handoff's files, `ops/RESTORE_RUNBOOK.md`,
  ARCHITECTURE 13.5–13.6/14 and all acceptance/performance gates. First command:
  `npm run check && npm run test:integration`, then cold production image native/
  restart/independent-domain restore and full browser/measurement/audit gates. Do
  not declare project completion before the final acceptance gate passes.

Final documentation-only close: updated this handoff to the final passing Linux
image and shared-content validation decision, formatted PROGRESS, then `npm run
lint`, `git diff --check` and `test ! -e .e2e-data` passed. No application/test code
changed after the final full Windows and affected Linux gates.

### Session 2026-10-06 — S18 deployment, measured performance, accessibility, release gate

State: in progress (implementation and local verification done; release gate not closed)

Implemented:

- Production image/Compose/Caddy: one app (non-root, read-only rootfs, caps dropped, init, 60 s grace, 2 CPU/3 GiB defaults, healthcheck), fixed-IP edge network, only the proxy publishes ports, `TRUSTED_PROXY_IPS` = proxy IP, Caddy overwrites X-Forwarded-For, streaming bodies, HSTS, 5 s active health + 30 s retry window. Operator tasks are networkless one-shot services (migrate, setup-token, recover-auth, reindex); migration is never automatic.
- `/health` now readiness-aware (200 ok / 200 maintenance / 503 unavailable, no details).
- Accessibility gate (axe-core + scripted checks); fixed unlabeled task checkboxes (render.ts) and dangling `aria-controls` (TagAutocomplete.svelte); "shell fixture" wording removed from production Sidebar.
- Release hygiene integration test, release drill + benchmark harnesses, DEPLOYMENT.md, RELEASE_RESULTS.md, README/ARCHITECTURE/ACCEPTANCE updates.

Touched files:

- New: `ops/Dockerfile`, `compose.yaml`, `ops/Caddyfile`, `ops/production.env.example`, `ops/DEPLOYMENT.md`, `ops/release-drill.sh`, `ops/release-benchmark.sh`, `playwright.release.config.ts`, `tests/release/{support,drill,restart,benchmark}`, `tests/e2e/zzzaccessibility.test.ts`, `tests/integration/release-hygiene.test.ts`, `docs/RELEASE_RESULTS.md`, `.gitattributes`.
- Changed: `src/routes/health/+server.ts`, `src/lib/shared/markdown/render.ts`, `src/lib/components/{TagAutocomplete,Sidebar}.svelte`, `tests/integration/{runtime-server,markdown-render}.test.ts`, `.dockerignore`, `.gitignore`, `package.json`/lockfile (devDependency `axe-core@4.13.0` only), README, ARCHITECTURE §14/§16, ACCEPTANCE §13, IMPLEMENTATION_PLAN.

Checks actually run:

- `npm run check && npm run test:integration` baseline: PASS (160). Final Windows: check, lint, unit 95, integration 167, build PASS; `npm run test:e2e` 94 PASS (after a11y fixes; later changes were docs/tests/ops only).
- Linux `.browser-spike/Dockerfile.s18-cached` (pinned base, clean `npm ci`, 2 CPU/4 GB): check, lint, 95 unit, 167 integration, build, 88 e2e PASS (shell.test.ts excluded). Earlier Linux runs failed on `.dockerignore` allowlist gaps and a Prettier error in DEPLOYMENT.md (all fixed).
- `bash ops/release-drill.sh` (COMPOSE=docker-compose DOCKER=podman): PASS on the final image after two failed restart-phase runs caused by Caddy's 30 s health interval (fixed in Caddyfile; restart is now masked to ~2.4 s).
- `bash ops/release-benchmark.sh`: PASS, numbers in RELEASE_RESULTS. A `content-visibility` experiment on note cards worsened append latency and was reverted. One unexplained 150 s DCL/LCP outlier in a throttled series did not recur in 12 reruns.
- `npm audit` (all/prod): 0 vulnerabilities. Cold `npm ci` in the production image downloaded native modules successfully. `recover-auth` compose task verified manually.

Decisions/deviations:

- axe-core added as a pinned dev-only dependency (MPL-2.0) for the accessibility gate; no runtime dependency, schema or stack change.
- `/health` changed from pure liveness to readiness (ARCHITECTURE §14 already required readiness); maintenance reports 200 deliberately.
- Drill uses `*.localtest.me` names (public DNS to 127.0.0.1) and Caddy's local CA because Node on Windows cannot resolve `*.localhost`; `CADDY_TLS_DIRECTIVE` exists only for drills.

Known issues / unfinished work:

- No real VPS/public domain/Let's Encrypt, no physical-device/IME/screen-reader audit, no Linux shell visual baselines, no max-bound/100k stress, nothing committed; timeline DOM growth (see RELEASE_RESULTS); throttled-network emulation appeared ineffective (informational only).
- npm 11.19 install-script warnings are informational; native modules verified working.

Next session:

- Read: docs/RELEASE_RESULTS.md ("Not performed"), ops/DEPLOYMENT.md.
- Do: real-VPS install + independent second-deployment restore, device/screen-reader audit, commit/tag and rerun gates.
- Verify: the command list under "Next session: exact instructions" on the release commit.

### Session 2026-10-06 — Approved commit-derived release version enhancement

**State: in progress / final validation blocked by environment.** V01–V03 behavior
is implemented; V04 cannot be declared done because four real-Git integration
cases have not run on Linux and cold production dependency downloads failed.
Started clean at `4828cb0` (S18 committed externally). No user-repository commit
or tag created. User explicitly approved this enhancement ahead of the remaining
S18 manual/VPS gate. Plan was written and linked before application coding.

Implemented / touched files:

- `docs/VERSIONING_PLAN.md`: detailed user-approved UTC committer date,
  first-parent daily sequence, clean-source/immutable metadata rules, V01–V04
  implementation order, VER-01–08 test matrix and scope exclusions. Updated
  PRODUCT_SPEC §14.3, ARCHITECTURE §17, IMPLEMENTATION_PLAN, ACCEPTANCE_TESTS,
  README, `ops/DEPLOYMENT.md` and this handoff without erasing prior history.
- `src/lib/shared/{build-info,version}.ts`: typed development/release identity,
  strict version/full-hash/canonical-UTC validation, explicit Development default,
  frozen build-time SSR/browser constant. `vite.config.ts` and the separate browser
  fixture config inject it. No runtime env/filesystem/Git/database access in the
  application accessor; no public endpoint or `/health` change.
- `scripts/{release-version,image-build,verify-build-metadata}.ts`, package scripts:
  `npm run version:release`, `npm run image:build -- --platform linux/amd64`
  (optional arm64 / Podman); reject dirty/untracked non-ignored or shallow/missing
  history, ignore Git replacement objects, anchor full first-parent timestamps to
  captured HEAD, count same UTC-date ancestors including target. Git archive takes
  only committed source, rechecks HEAD/cleanliness, then feeds an immutable private
  temporary tar to the engine; restrict args, reject submodules, propagate failure,
  close/delete snapshots. No automatic commits/tags or dependency additions.
- `ops/Dockerfile`: required version/hash/UTC commit-time build args, real validation
  CLI before build, matching OCI version/revision/created labels (created = source
  commit time). No Git/history in runtime and no runtime version override.
  `compose.yaml`, production env example and release drill/benchmark scripts now
  pin the printed image version and deploy/task-run with `--no-build`; low-level
  provenance args are documented, but the supported release path is the clean-Git
  snapshot wrapper. Existing-Caddy one-app-container local build/save/scp/load/run
  instructions added. No topology, storage, schema or archive-format change.
- `Sidebar.svelte` and Settings page: small footer version on desktop/mobile drawer;
  semantic About section with version, full wrapping hash and UTC commit time (or
  explicit non-release Development explanation). Native private auth/SSR remains.
- `tests/unit/build-info.test.ts`, `integration/{release-version,build-metadata}.test.ts`,
  `e2e/version.test.ts`, tests README and validation Dockerfiles (Git as **test-only**
  tooling). Two Windows sidebar screenshots updated and opened/reviewed; no geometry,
  focus, overflow or tag assertions weakened. Real synthetic release desktop/drawer/
  mobile About screenshots also opened/reviewed. Lockfile/dependency versions unchanged.

Commands actually run:

Host used S00's explicit Node **24.21.0** executable/PATH and npm **11.12.1** CLI
N/C, with `NODE_TLS_REJECT_UNAUTHORIZED=1`. Logs and diagnostic scripts are ignored
under `.browser-spike/`, never runtime data or production credentials.

| Command                                                                                                                                                                               | Actual outcome                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Git status/log and relevant docs/source inspection                                                                                                                                    | Clean baseline; existing work preserved                                                                                                                                                                                                                |
| `npm exec -- prettier --write <changed text files>`                                                                                                                                   | PASS (repeated after test/docs edits)                                                                                                                                                                                                                  |
| `npm ci`                                                                                                                                                                              | PASS clean host reinstall; **2 low audit advisories**, not the old zero-vulnerability status                                                                                                                                                           |
| `npm run check`, `npm run lint`                                                                                                                                                       | PASS, zero errors/warnings, ESLint/Prettier clean                                                                                                                                                                                                      |
| `npm run test:unit`                                                                                                                                                                   | PASS: 22 files / **108** tests                                                                                                                                                                                                                         |
| `npm run test:integration`                                                                                                                                                            | PASS: 28 files / **173** real tests, including all four Git cases and actual adapter metadata build/server                                                                                                                                             |
| `npm run build`                                                                                                                                                                       | PASS, production adapter build (Development metadata when no release args supplied)                                                                                                                                                                    |
| Targeted version unit/Git/build tests                                                                                                                                                 | PASS: 13 new unit and 6 new integration tests                                                                                                                                                                                                          |
| `npm run test:e2e -- tests/e2e/shell.test.ts tests/e2e/version.test.ts --update-snapshots`                                                                                            | PASS: 7; two intentional desktop footer baselines reviewed, mobile baseline unchanged                                                                                                                                                                  |
| `npm run test:e2e` (final normal comparisons)                                                                                                                                         | PASS: **95** Chromium tests, including restore/a11y; prior run had 94 pass / 1 screenshot fixture mismatch                                                                                                                                             |
| `PANDANOTE_VERSION=261006-12 PANDANOTE_COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb PANDANOTE_COMMITTED_AT=2026-10-06T12:34:56.000Z npm run test:e2e -- tests/e2e/version.test.ts` | Final PASS: 1 synthetic release UI/no-JS test; first attempt failed an ambiguous hidden drawer selector, corrected                                                                                                                                     |
| `npm audit`                                                                                                                                                                           | FAIL / report: **2 low** findings, KaTeX GHSA-238p-pmpm-9mq7 + Mermaid dependency chain; proposed force-fix downgrades Mermaid, deliberately not applied                                                                                               |
| `.browser-spike/verify-version-image.mjs` (pinned Node)                                                                                                                               | Normal production Dockerfile via actual CLI in an isolated clean synthetic Git clone: FAILED prebuild download abort / missing Python compiler fallback                                                                                                |
| Repeat isolated `node scripts/image-build.ts --engine podman`                                                                                                                         | FAILED npm `ECONNRESET`; no cold-image success claimed                                                                                                                                                                                                 |
| `.browser-spike/verify-version-image-cached.mjs`                                                                                                                                      | PASS actual CLI/tar/tag build in isolated clean clone, **validation-only** Dockerfile inserts verified S18 Linux npm cache and uses offline clean ci; runtime base/stages/code stay production-shaped                                                  |
| `.browser-spike/inspect-version-image.mjs`                                                                                                                                            | PASS non-root/no Git/history/tests/docs; OCI metadata equals private desktop/drawer/About; runtime spoof ignored; real native SQLite FTS5, Sharp WebP and Argon2; explicit migrate/setup/run and cleanup                                               |
| Linux Git-enabled validation-image builds                                                                                                                                             | BLOCKED: HTTP apt download stalls (180 s and 600 s timeouts); HTTPS initially lacked OS CA bundle; temporary public Node/Mozilla roots restored TLS verification but subsequent apt downloads still stalled/timed out. No TLS verification bypass used |
| `podman build -f .browser-spike/Dockerfile.version-partial-validation -t pandanote-version-partial-validation .`                                                                      | PASS clean offline Linux ci from verified S18 native/browser cache; **offline audit output is not a current audit pass**                                                                                                                               |
| `podman run --rm --cpus=2 --memory=4g -e NODE_TLS_REJECT_UNAUTHORIZED=1 pandanote-version-partial-validation`                                                                         | PASS Linux check/lint/build, **108 unit**, **169 integration**, **9 version/a11y e2e**; **four Git cases explicitly EXCLUDED** due missing Git, not a completed Linux gate                                                                             |

Synthetic production-shaped verification image:
`d2293d2ec4aa167ceb7a2330781890074c4b43e4023c671b67c0b8fe049a933e`,
tag `pandanote:261007-2`, synthetic clone commit
`41724aec88220fbd874ce8702f6cc8276c4c0a92`, time
`2026-10-07T00:00:01.000Z`. This is **not a user-repository release** and must not
be promoted as one. Only the isolated clone was committed. Cache source was
`localhost/pandanote-s18-browser-cached:latest` (verified existing Linux modules;
clean ci reinstalls them, never copies Windows node_modules).
Partial Linux test image:
`8bb7fe91f7b7aa9bd0a8239110de88a5321893667cfa6119538973b08d31ad0b`.
Linux Node 24.21.0 / npm 11.19.0. Actual native archive/restore/process-kill cases
are among the 169 passing integration tests; the exclusion is only Git derivation.

Intermediate issues / decisions:

- First check found tar-stream event payload typed unknown; narrowed the synthetic
  test chunk. Final diagnostics zero. Initial exact-text test edit miss applied no
  changes and was retried safely.
- The first release UI test matched both visible desktop and hidden drawer footer;
  scope to the desktop sidebar, then independently test the opened drawer.
- A targeted shell baseline had no earlier calendar fixtures; the full suite has
  `#S11calendar(39)`. Reviewed actual/diff and retained the full-suite fixture text
  in the changed baseline (no new mask or relaxed pixel threshold). Full 95 rerun
  passes; no unrelated UI behavior was changed.
- Native/network blockers reproduce previous S11/S12 download issues. Do not add a
  compiler/upgrade native dependencies/disable TLS just to hide them. Temporary
  Linux npm cache and public-root bootstrap are validation-only workarounds, not
  edits to the production Dockerfile. Terminate only this session's orphaned apt
  processes after harness timeouts; no application/container data was removed.
- Image version is not byte-for-byte image digest reproducibility. Package 0.0.0,
  migration ledger and backup format/compatibility are intentionally independent.
  The wrapper uses only Node built-ins, so local image building needs pinned Node/npm
  but no host npm ci/native modules. Linux AMD64 was validated; ARM64 was not run.
- Existing Caddy must have a fixed shared-network peer address; documented exact
  proxy trust and no published app port. No second Caddy or DB service introduced.

Remaining / exact next task:

1. Fix Linux dependency/apt connectivity and install Git in the validation image.
   Run all **173** integration cases with no exclusions, plus common gates; retry
   the unmodified production Dockerfile cold build. Missing Git and failed downloads
   remain blockers, not passes. Read VERSIONING_PLAN V04 and this entry first.
2. Review/address the two low KaTeX/Mermaid advisories separately using compatible
   upstream versions; do not run `npm audit fix --force` or silently change stack.
3. With user approval, commit these changes. The supported image command correctly
   refuses the current dirty checkout; do not bypass it or present an old hash for
   uncommitted code. Build the actual clean commit, inspect OCI labels, verify UI
   and transfer/load that exact tag. No app data needs a migration for this feature.
4. S18 real-VPS/public HTTPS/device/IME/screen-reader/Linux visual/performance gates
   remain open; the version enhancement does not close them.
5. First next validation command: `podman build -f ops/Dockerfile.validation
-t pandanote-version-native . && podman run --rm --cpus=2 --memory=4g
pandanote-version-native`; then affected release UI and exact-commit image.

Final documentation-only close: formatted VERSIONING_PLAN/PROGRESS/README/deployment
instructions; `npm run check`, `npm run lint`, `npm run build` and `git diff --check`
PASS. Host `.e2e-data` cleanup and unchanged `package-lock.json` verified. Actual
`npm run image:build -- --platform linux/amd64` on the current checkout produces the
**expected exit 1 / Dirty working tree refusal**, before invoking an engine. This
is validation of rejection, not an image-build pass. This session's last orphaned
apt process was terminated. No application/test source changed after the passing
full Windows and explicitly partial Linux gates.

### Session 2026-10-06 — Latest image alias, engine detection and native build fallback

**State: implemented / Linux image validation blocked.** Started clean at
`25c3341`; user explicitly requested this follow-up. No user-repository commit
created. This supersedes the earlier default version-only tag/Docker-only selection
and the earlier preference against adding compilers; prior history is preserved.
S18 and the version enhancement's Linux/release gate remain open.

Implemented / touched files:

- `ops/Dockerfile`: CA certificates, Python 3, make and g++ before npm ci in both
  build and production-deps stages; runtime remains independent and non-root with
  no added compiler packages. Allows node-gyp fallback when native prebuilds fail;
  download connectivity is still required.
- `scripts/image-build.ts`: default auto detection probes Docker then Podman server
  readiness via `info` with 15 s per-engine timeout; explicit docker/podman/auto
  overrides. Missing/stopped engines report diagnostics and startup instructions.
  Actual build spawn errors now include their cause. No engine retry after a build
  failure. Successful builds apply `pandanote:latest` and the versioned tag to one
  image, preserving commit-derived OCI/SSR/browser version/hash/time and immutable
  clean committed-source archives.
- `compose.yaml`, `ops/production.env.example`: latest is the default image tag;
  low-level `PANDANOTE_VERSION` is separate from `PANDANOTE_TAG` (latest is never
  valid release metadata). Existing drill/benchmark harnesses retain version pins.
- Unit `build-info` and integration `release-version`/`release-hygiene` tests cover
  detection preference/fallback/overrides/missing engines, both tags, Podman Docker
  format, metadata arguments, dirty-source rejection before detection and tools in
  both install stages only.
- README, deployment guide, PRODUCT_SPEC, ARCHITECTURE, ACCEPTANCE_TESTS,
  VERSIONING_PLAN and this progress: latest vs embedded identity, Docker-compatible
  Podman save/load, image inspection, version pinning before overwriting latest,
  stopped-app migrations and explicit container recreation on upgrade.

Commands actually run (Node 24.21.0 executable and PATH, npm CLI from S00;
`NODE_TLS_REJECT_UNAUTHORIZED=1`):

- `npm exec -- prettier --write <changed text files>`: PASS.
- `npm run check`: PASS, zero errors/warnings.
- `npm run lint`: PASS.
- `npm run test:unit`: PASS, 22 files / **110 tests**.
- `npm run test:integration`: PASS, 28 files / **173 tests**, including all host Git
  and actual SQLite/filesystem/server/archive regressions (203.48 s).
- `npm run build`: PASS (log `.browser-spike/image-wrapper-build.log`); existing
  lazy chunk-size warnings remain.
- `npm run test:e2e -- tests/e2e/version.test.ts`: PASS, one Chromium Development
  sidebar/drawer/no-JS About case.
- `PANDANOTE_VERSION=261006-12 PANDANOTE_COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb PANDANOTE_COMMITTED_AT=2026-10-06T12:34:56.000Z npm run test:e2e -- tests/e2e/version.test.ts`:
  PASS, one synthetic release UI case. Full e2e not rerun (no UI source changes).
- `podman info --format '{{.Host.Arch}}'`: PASS, amd64.
- `node .browser-spike/verify-latest-image.mjs`: **BLOCKED / timeout after 240 s**.
  Ignored harness created/committed only an isolated temporary clone, then ran the
  actual wrapper with auto detection and unmodified patched Dockerfile. Selected
  Podman correctly and passed latest + synthetic version metadata; build stalled
  on `apt-get update`, at Debian main package-index download, before npm ci. Log:
  `.browser-spike/latest-image.log`; context path recorded in
  `.browser-spike/latest-image-context.json`. Synthetic commit
  `eb846f4c0583bbecb06def9794cea56ef0dad8df`, version `261007-1`, is NOT a release.
  No completed image or native source-compilation validation claimed. After the
  harness timeout, terminated only this build's orphaned apt/sh PIDs 51093/51016.
- `git diff --check`: PASS; expected Windows autocrlf warnings only. Host e2e data
  cleaned; a generated `NUL` file from tooling removed (absent at session start).

Remaining / exact next task:

1. Read patched `ops/Dockerfile`, `scripts/image-build.ts`, deployment guide and
   VERSIONING_PLAN V04. Restore Linux apt/npm/Node-header network access. In the
   existing isolated clean context rerun `node scripts/image-build.ts` on Node
   24.21.0; verify both tags share an image ID, OCI labels equal private web UI,
   and run actual Linux SQLite/Sharp/Argon2/native restore tests. Exercise node-gyp
   source fallback as well as ordinary installs; host passes are insufficient.
2. With user approval commit the repository changes; run
   `npm run image:build -- --platform linux/amd64` on the actual clean commit.
   Do not bypass dirty-source rejection, publish the synthetic context or claim
   the stalled build passed. No schema/data migration needed for these changes.
3. On a Podman build machine export `podman save --format docker-archive -o
pandanote-image.tar pandanote:latest`; server Docker loads and inspects labels.
   Retain the old inspected version tag/image ID before overwriting latest.
4. S18 real-VPS/public HTTPS/device/accessibility and the earlier Linux Git/cold
   build gates remain open. No dependency/lockfile or UI/auth/storage change.
