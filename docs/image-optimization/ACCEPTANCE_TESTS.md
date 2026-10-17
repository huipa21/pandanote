# Image optimization — acceptance tests

**Expected cases, not passing results.** Implement and map these IDs to actual tests
and exact commands in [PROGRESS.md](PROGRESS.md). The main
[verification rules](../ACCEPTANCE_TESTS.md) apply. Use real SQLite/filesystem/server,
real browsers and actual Linux Alpine production images where specified. Missing
engines, browsers, PTY tools, native packages or disk space mean **blocked**.

## 1. Size measurement (IMG-SIZE)

| ID          | Case                                                                                                                                                                                                                                                                                                               | Level                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| IMG-SIZE-01 | Read supplied/matched baseline and candidate Docker-format archives, report exact bytes/MiB/hash/platform/image labels and per-layer tar versus payload sizes; gzip level 6 gives reproducible byte counts. Historical archive identity and existing measurements remain intact.                                   | unit + actual archive |
| IMG-SIZE-02 | Logical aliases/legacy symlinks never double-count layer payload. Maps/package totals are labelled overlapping. Invalid/truncated/unsupported archives fail safely, metadata buffering is bounded and nothing is extracted or content-logged. Multiple images are handled explicitly, not silently treated as one. | unit + integration    |
| IMG-SIZE-03 | Matched source/runtime/platform/compression comparison shows reduced raw and gzip size; report engine size separately. Default 25% raw/20% gzip targets met or a measured, justified adjustment recorded. No architecture mismatch, omitted feature or hidden filesystem content explains the savings.             | measurement gate      |

## 2. Dependency contract (IMG-DEP)

| ID         | Case                                                                                                                                                                                                                                                                       | Level                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| IMG-DEP-01 | Dedicated runtime manifest has exact approved roots, no dev/prepare/build/workspace install behavior; its committed lock installs reproducibly. Direct versions match main manifest and applicable overrides/transitive differences are reviewed.                          | unit + clean install           |
| IMG-DEP-02 | Missing/extra/drifting root, removed necessary explicit peer, stale lock-root version or forbidden dependency fails the verifier/build/test with a safe actionable message. Changes are not silently corrected through unlocked installation.                              | unit + integration             |
| IMG-DEP-03 | Actual final inventory excludes raw Mermaid/DOMPurify/adapter-node and unused Vite/plugin/TypeScript/Rolldown/esbuild/Lightning CSS/test tooling. Any future genuine exception requires a reviewed reason and measured inventory update, not a weakened blanket assertion. | production image               |
| IMG-DEP-04 | Kit/Svelte/Shiki and all server, native, source CLI, deferred module and worker dependencies load and execute using the minimized tree. Final main package ESM/import mappings and source `.ts` paths remain correct.                                                      | integration + production image |
| IMG-DEP-05 | Peer omission does not remove explicit runtime peers; optional musl Sharp/libvips packages remain. No blanket optional omission or reliance on runtime npm/network repairs.                                                                                                | clean Alpine install + image   |

## 3. Alpine native compatibility (IMG-NATIVE)

| ID            | Case                                                                                                                                                                                                                                                                           | Level                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| IMG-NATIVE-01 | Verified digest-pinned supported Node 24 Alpine runs real better-sqlite3 transaction/WAL/FULL/foreign-key/integrity/FTS5-trigram/short-CJK and online backup/reopen operations. Correct architecture and musl linkage, no host/glibc native copy.                              | Alpine integration + image       |
| IMG-NATIVE-02 | Configured Argon2id hashes/verifies correct/wrong synthetic passwords; native load and authentication/MFA behavior succeed without secret logging.                                                                                                                             | Alpine integration + image       |
| IMG-NATIVE-03 | Sharp musl/libvips performs orientation, metadata stripping, display/thumb WebP and all currently supported static inputs. Animation/corrupt/oversize/concurrency/worker tests fail or recover correctly; no missing native/asset path after final COPY.                       | Alpine integration + image       |
| IMG-NATIVE-04 | Both install stages contain CA/Python/make/g++ before npm; a genuine documented native compile fallback is exercised where supported. Final runtime has only required linked libraries and no added compiler/Python/Git toolchain. Certificates and non-UTC/DST behavior work. | build + native probe + inventory |
| IMG-NATIVE-05 | Full common/unit/integration/build gates run in Alpine with Git/PTY/mode/fsync/archive/process-kill cases; no failing native test is skipped or credited from Debian/Windows. Test-only tools do not enter production.                                                         | Alpine validation image          |

## 4. Packaging and security (IMG-PKG, IMG-SEC)

| ID         | Case                                                                                                                                                                                                                                        | Level                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| IMG-PKG-01 | All production stages use the recorded Alpine pin. Image wrapper retains immutable committed source, clean/shallow rejection, engine selection and version/latest labeling. No Git history or fabricated provenance in runtime.             | unit/integration + actual builds   |
| IMG-PKG-02 | Dependency maps are removed before runtime COPY; no lower app layer retains them. Required executable/metadata/native/grammar/WASM/license files and browser `.gz`/`.br` assets survive.                                                    | archive inventory + image          |
| IMG-PKG-03 | Final image retains build-info, source entry/bootstrap/user/reset/reindex, trusted migrations/src/lib and actual worker paths. Default server and named tools need no TS compiler/tsx/network.                                              | image + deferred worker tests      |
| IMG-PKG-04 | Root Compose/existing-Caddy flow uses the configured ORIGIN, data bind, and `localhost/pandanote:latest` image; HEALTHCHECK/body limit and `/data` contract stay intact. No `.env` or extra production service is required.                 | hygiene + copied-root deployment   |
| IMG-PKG-05 | OCI labels agree with SSR/sidebar/mobile/About/build-info after rebuild/load/restart/restore. Synthetic clone evidence remains distinct from final user-release identity.                                                                   | integration + e2e + loaded image   |
| IMG-SEC-01 | Final filesystem has no app tests/docs/fixtures, browser profiles, personal data, credentials, archives, build caches or app Git history. Dependency-shipped artifacts are consciously reviewed; map cleanup never deletes license notices. | archive/image inventory            |
| IMG-SEC-02 | TLS verification remains enabled, no startup installer/debug endpoint/sanitizer bypass, no unresolved high-severity runtime auth/XSS/restore/data-loss issue. Record real audits or their blockers; no forced dependency update.            | review + audit + adversarial tests |

## 5. Actual runtime and maintenance (IMG-RUN)

| ID         | Case                                                                                                                                                                                                                                        | Level                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| IMG-RUN-01 | Fresh root deployment with ORIGIN configured in Compose through minimal TLS Caddy reaches readiness only after recovery/keys/migrations/settings, completes setup/login and survives restart/recreation with private notes/files.           | Alpine production + browser        |
| IMG-RUN-02 | Default/non-default positive UID/GID, private directory/file modes, cleared groups, PID1 Node and zero effective/permitted server capabilities. Root/unsafe paths/ownership refuse before secrets/DB/server; no Compose protection changes. | Alpine copied-root deployment      |
| IMG-RUN-03 | Idle default SIGTERM drains/closes SQLite/exits 0 within 10 seconds; backup interruption reports failure/no completed partial; journaled restore recovers on restart.                                                                       | production interruption tests      |
| IMG-RUN-04 | Real PTY reset-password works while server runs, no echo/secret output, immediate old-session revocation/MFA reset, new login and unchanged notes. Pipes/args/no account/pending journal/incorrect ownership refuse as before.              | Linux PTY + production live server |
| IMG-RUN-05 | Stopped-app reindex succeeds with minimized modules; multilingual search matches before/after/restart. Direct source bootstrap/maintenance and forked/embedded native workers resolve all paths without development dependencies.           | production image                   |

## 6. Browser and content (IMG-UI)

| ID        | Case                                                                                                                                                                                                                                                           | Level                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| IMG-UI-01 | Pages without diagrams do not eagerly fetch Mermaid; lazy diagrams render in the optimized built client after reload. Hostile directives/links/HTML/SVG and timeout/complexity limits preserve existing sanitization/CSP.                                      | browser against Alpine image |
| IMG-UI-02 | Server-rendered and browser-preview code highlighting works with an initially unloaded supported grammar; fallback and light/dark behavior unchanged. Required grammar/engine assets available without network package installation or WASM policy relaxation. | integration + browser        |
| IMG-UI-03 | Setup/account/MFA/i18n/title/timezone, note/draft/edit/conflict/private attachment flows and affected keyboard/accessibility tests pass. Full browser suite runs; unreviewed OS visuals are explicitly separate, not auto-regenerated as evidence.             | full e2e + deployment        |

## 7. Data safety (IMG-DATA)

| ID          | Case                                                                                                                                                                                                                                                                          | Level                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| IMG-DATA-01 | Current schema no-op and synthetic pending SQL/data migration preserve records; old WAL-consistent copy/private manifest is valid. Failed SQL/data step leaves DB/ledger unchanged and no server; newer/modified histories refuse.                                            | Alpine integration + upgrade image    |
| IMG-DATA-02 | Immediate documented old-image/DB-copy rollback works on synthetic data. No live baseline hash edit, schema/archive change, current user-data deletion or approval of SS01 atomicity deviation.                                                                               | isolated production deployment        |
| IMG-DATA-03 | Manual full backup/download/upload/validate/confirm on a second synthetic domain preserves note/draft/Trash/tag/file/settings/auth/MFA/checksums, invalidates sessions and keeps destination origin. Local drafts and unrelated completed archives retain existing semantics. | real two-domain TLS drill             |
| IMG-DATA-04 | Traversal/links/duplicates/corruption/unsupported archive and disk/validation failure leave previous app usable. Process kills across journal/replace/reopen phases recover complete old or restored state, not a mixture.                                                    | Alpine adversarial/interruption tests |
| IMG-DATA-05 | Existing >1 GiB streamed TLS restore succeeds under unchanged minimal Caddy and root Compose, with restored file hashes; memory/disk reserve and upload controls remain enforced.                                                                                             | real copied-root large deployment     |

## 8. Transfer, performance and documentation

| ID          | Case                                                                                                                                                                                                                                                    | Level                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| IMG-XFER-01 | Actual Docker-built optimized image exports as raw/gzip level-6 Docker archive and loads on disposable Docker; checksum/gzip integrity, labels, image ID, native/health smoke verified.                                                                 | actual engine transfer      |
| IMG-XFER-02 | Actual Podman-built Docker-format raw/gzip archive loads on Docker directly as `localhost/pandanote:latest`, identity/native/health probes pass. Podman load tested if advertised.                                                                      | cross-engine transfer       |
| IMG-XFER-03 | Corrupt/truncated compressed archive fails integrity/load safely; prior deployed image/data unaffected. Operator instructions retain raw alternative and verify transfer hash.                                                                          | isolated failure test       |
| IMG-XFER-04 | Supplied archive, prior aliases and unrelated resources preserved. Cleanup removes only owned resources; archives/reports/data remain ignored, not committed.                                                                                           | state/artifact review       |
| IMG-PERF-01 | Matched CPU/memory/data representative startup/search/image/backup/restore/RSS and install/build/load timings recorded; no unexplained substantial regression is hidden by image-size gains. Existing product performance budgets remain authoritative. | Linux benchmark             |
| IMG-DOC-01  | README/canonical ops/main architecture/plan/acceptance/tests and this folder accurately describe Alpine, runtime locks and compressed transfer; no current Debian-production claim or broken local links; historical evidence preserved.                | doc hygiene                 |
| IMG-DOC-02  | Follow the final documented clean build/export/transfer/Compose-configured deploy instructions on an isolated Linux driver and reproduce readiness/setup/native behavior. Script examples exist and use supported Node/npm.                             | reproducible operator drill |
| IMG-DOC-03  | Acceptance-to-test mapping, exact outcomes/skips/blockers, before/after source/platform/bytes and final next task recorded. ARM64/unapproved exact user commit/manual S18/SS01 remain honestly open where applicable.                                   | final handoff review        |

## Completion boundary

All mandatory AMD64 cases require actual evidence. A synthetic committed clone can
support local packaging completion; it does not close the exact user-release-commit
check. Missing mandatory local gates keep this change blocked/in progress. Broader
SS01/S18 completion is not claimed even when all image-optimization local gates pass.
