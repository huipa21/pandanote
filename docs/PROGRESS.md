# PandaNote — Progress and cross-session handoff

## Current state

- **Phase:** technical bootstrap complete; product implementation remains unfinished.
- **Completed step:** S00 — Bootstrap and validate technical assumptions — **done**.
- **Next unfinished step:** S01 — Database, domain schema, and persistent storage foundation — **not started**.
- **Repository:** git initialized; no commit created. Planning and bootstrap files remain uncommitted and must be preserved.
- **Implemented:** minimal SvelteKit/adapter-node shell, liveness endpoint, strict tooling, separated real-library suites and test-only Mermaid harness; no product screens/domain persistence/authentication yet.
- **Validation:** Windows check/lint/build, 17 unit + 27 integration + 4 Chromium tests passed. Pinned Linux/glibc image independently passed check/lint/build and the same 17 unit + 27 integration tests. No unresolved S00 blocker; detailed results and limitations are below and in `tests/README.md`.
- **Runtime:** Node 24.21.0 LTS; tested npm 11.12.1 (Windows) and 11.19.0 (Linux). System Node 24.15.0 was not upgraded; this session used a separately downloaded 24.21.0 executable and explicit PATH.

## Next session: exact instructions

1. Read `AGENTS.md` and all planning documents; especially ARCHITECTURE sections 2.1–5, 12–13; IMPLEMENTATION_PLAN S01; acceptance persistence/security/backup invariants; this S00 history.
2. Inspect git and preserve the existing uncommitted tree. Read `package.json`, `vite.config.ts`, `tsconfig.json`, `tests/README.md`, `tests/integration/sqlite.test.ts`, and `ops/Dockerfile.validation`. Verify Node 24.21.0 is actually used by npm child processes; do not disable TLS verification.
3. Begin **S01 only**: create server-only database initialization and explicit versioned migrations (`src/lib/server/db/`, `migrations/`), with real temporary SQLite migration tests. Then add the S01 private data-root/key/settings/coordinator and typed-contract foundations. Do not import `tests/spikes` into product modules or start visual feature work.
4. First validation: `npm ci && npm run check && npm run test:integration`. Revalidate Drizzle Kit's TypeScript schema generation with the scoped esbuild override when adding migrations (S00 only exercised its version CLI and Drizzle SQL connection).
5. Complete S01's common gates and repeat the Linux image tests before declaring it done. Update this document with actual results and the next unfinished task.

Subsequent sessions should always follow the next unfinished step recorded here.

## Step tracker

| Step | Description                        | State       |
| ---- | ---------------------------------- | ----------- |
| S00  | Bootstrap and technical validation | Done        |
| S01  | Schema and persistent storage      | Not started |
| S02  | Authentication and optional TOTP   | Not started |
| S03  | Design tokens and responsive shell | Not started |
| S04  | Markdown/code/Mermaid/tag parsing  | Not started |
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
