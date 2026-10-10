# Image optimization — implementation plan

**Implementation has followed IO00–IO07; current state is in PROGRESS.** This is
the retained ordered implementation/regression contract, not evidence by itself.
The user authorized a long session with sequential steps, individual gates and
progress updates. Do not skip a failed dependency gate.
Read [SPEC.md](SPEC.md), [DECISIONS.md](DECISIONS.md) and
[ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) first.

## Working rules and common gate

- Inspect Git/status and current handoffs before editing. Preserve unrelated work.
- Pin Node executable **and PATH** to the supported version; the analysis host's
  default executable reported Node 24.15.0, below this app's 24.21.0 minimum.
- Work only with synthetic data and owned temporary resources. Preserve the supplied
  archive, existing image aliases, engine caches and all prior validation history.
- No user-repository commit or deployment without approval. Prefer an isolated engine.
  When validating changed source with the clean-source wrapper, use an isolated
  full-history clone, explicitly copy reviewed changes and create synthetic commits
  only there. Record its source identity/patch relationship and do not call it a
  user release. Do not bypass clean/shallow checks or invent release metadata.
- No TLS bypass, force audit repair, hidden skips or broad engine cleanup.
- Run build/e2e/release commands sequentially when they share output/data paths.
- Update both dedicated and main PROGRESS at each completed step and on interruption.

For every code-bearing completed step run:

```sh
npm run check
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

Add the affected browser/Linux/production gates below. Exact commands, source/image
identity, failures/retries, skips and counts belong in PROGRESS. Proposed new scripts
are not available until implemented; verify the final CLI before documenting it.

## IO00 — Preserve baseline, inspect environment, establish measurements

**Outcome:** reproducible starting evidence and prerequisites; no premature size claim.

Read: main guidance and handoffs; root package/lock/npmrc; `ops/Dockerfile`, both
validation Dockerfiles, `.dockerignore`, `.gitignore`, `scripts/image-build.ts`,
release-version/build-info code, `tests/release/README.md` and release scripts.

1. Capture Git HEAD/status, supplied archive size/SHA-256 and its image labels/platform.
   Do not modify or delete `pandanote-image.tar`.
2. Record usable Docker/Podman server versions, OS/platform, Node/npm executables,
   TLS settings, browser availability and disposable disk capacity. Large deployment
   tests need approximately 8 GiB beyond the app's reserve; provision enough for
   multiple images, native builds and the >1 GiB fixture before starting.
3. Resolve the candidate Alpine tag and digest from the registry. Capture Node/npm/
   Alpine/index/platform details. Check AMD64 and the existing ARM64 option's
   availability. Stop on incompatible/absent base; do not invent a pin.
4. Establish a matched Debian control image from the current source if the supplied
   archive does not match current application/dependency state. Keep baseline build
   logs and identify changes affecting comparison. Use isolated aliases.
5. Implement a small typed `scripts/image-size.ts` with read-only streaming analysis
   of Docker-format tar/tar.gz, existing `tar-stream` and Node gzip/hash primitives.
   Proposed command: `npm run image:inspect -- --archive <path> --gzip-level 6
--output <ignored-report.json>`; explicitly define overwrite/output behavior.
6. Report archive bytes/MiB/hash, image identities/platforms, logical layer references
   versus distinct payloads, layer tar versus file payload totals, package/map totals
   and optionally streaming gzip bytes. Handle legacy layer aliases without double
   counting. Do not extract paths, buffer a full layer or log file contents.
7. Tests: tiny synthetic archives, multi-image manifest reporting/refusal as specified,
   legacy aliases, truncated/invalid input, tar.gz input and overlapping categories.
   Bound metadata buffering and fail safely for unsupported formats. Do not add an
   OCI parser unless necessary; exports in this scope are explicitly Docker-format.

Likely files: `scripts/image-size.ts`, `package.json`, new unit/integration tests,
this folder's PROGRESS. Root lock changes only if truly needed; no new large tool.

**Gate:** IMG-SIZE-01–03; common gate if reporter code is implemented. Baseline report
reproduces the historical archive measurements within labelled tar overhead/rounding.

**Next:** IO01; read the generated server and source tool/worker imports.

## IO01 — Audit and lock the minimal runtime dependency graph

**Depends on:** IO00; no platform migration yet if it would hide dependency failures.
**Outcome:** a reproducible smaller install with explicit runtime contracts.

1. Trace all generated server entry/chunks and static/dynamic imports, original
   container entry/bootstrap, startup initialization, reset/reindex, image/archive
   workers and deferred operations. Regex scans are hints, not proof of reachability.
2. Confirm Mermaid/DOMPurify are client-only; classify adapter/build tools as build-only.
   Keep Kit/Svelte/Shiki where generated/source runtime imports require them.
3. Add `ops/runtime/package.json` and `ops/runtime/package-lock.json`, exact roots
   selected from SPEC §4, no prepare/build scripts/devDependencies/workspaces.
4. Add a typed verifier (suggested `scripts/verify-runtime-dependencies.ts`) and a
   reusable pure contract module if appropriate. Proposed script:
   `npm run runtime:check`. Check allowed roots/reasons, exact version agreement,
   required explicit peers, lock root agreement and relevant overrides. Run it as
   a build prerequisite and unit/integration test, not just a manual convention.
5. Generate and commit the runtime lockfile as a normal tracked change; ordinary
   installs use `npm ci --omit=dev --omit=peer`. Verify npm 11 actually excludes
   tool peers and retains musl/native optional packages. Document deterministic
   regeneration and review transitive differences from the main lock.
6. Optional root reclassification: move adapter-node/Mermaid/DOMPurify into root dev
   dependencies if build behavior remains correct; regenerate/review the root lock.
   Do not remove Kit/Svelte from runtime wholesale or change unrelated versions.
7. Keep the final original application package metadata (`type`, `#lib` mappings).
   Audit how adapter output reads dependencies; validate the production source tools
   against the same install, not a full-development tree.
8. Tests: drift/missing/extra root and lock failures, explicit peer rules, manifest
   changes without lock updates, no optional blanket omission, actual module imports.

Likely files: `ops/runtime/*`, `scripts/verify-runtime-dependencies.ts`,
`package.json`/lock if needed, tests/unit runtime contract, integration runtime install,
`.dockerignore` only if its existing ops allowlist does not cover the new files.

**Gate:** IMG-DEP-01–05, common gate, built Markdown/Mermaid/highlighting tests. Record
actual installed inventory; absence of tool packages must be observed, not inferred.

## IO02 — Prove Alpine native compatibility before switching production

**Depends on:** IO01.
**Outcome:** verified musl install/runtime, including source-build fallback.

1. In an isolated Alpine probe, install CA/Python/make/g++ before npm; install the
   runtime lock without host modules or disabled TLS. Use the verified IO00 base.
2. Probe better-sqlite3: load/transaction, WAL/FULL, FTS5 trigram and short-CJK query,
   foreign keys, integrity checks and online backup/reopen.
3. Probe Argon2: actual configured Argon2id hash/verify, correct/wrong password;
   confirm async/native operation without logging secrets or hashes.
4. Probe Sharp: musl binding and libvips load, auto-orientation, supported static
   formats, metadata stripping, display/thumbnail WebP, animation/corrupt/limit
   failures and worker subprocess execution. Match product's supported formats.
5. Inspect `ldd`/equivalent linkage; identify runtime libraries and distinguish their
   absence from a download failure. Verify no glibc-native payload is substituted.
6. Demonstrate a genuine native compilation fallback where the chosen module
   supports it, using a disposable build stage with its documented controls. Do not
   disable all lifecycle scripts; do not claim fallback tested from tool presence.
   Sharp's bundled musl libvips can remain prebuilt unless its fallback is in scope.
7. Verify Node native TS stripping, `process.execve`, positive-ID privilege drop,
   required BusyBox commands, certificate availability and non-UTC/DST formatting.
8. Record cold-install outcomes, resolved versions, native architecture/libc and
   any justified extra runtime library. No glibc shim as an unexplained fix.

Likely files: Alpine probe/integration helper/tests; owned probes/logs under ignored
`.browser-spike/`; DECISIONS native findings. Promote useful probes into tracked tests.

**Gate:** IMG-NATIVE-01–05 on Linux Alpine; common gate for tracked test/code changes.
Any failed required native operation blocks the production base switch.

## IO03 — Build the optimized production image and prune before COPY

**Depends on:** IO02.
**Outcome:** small, usable final image using the approved production Dockerfile.

1. Change `ops/Dockerfile` to the single verified Alpine pin in all three stages.
   Replace apt tooling in build/production-deps with apk prerequisites. Keep runtime
   library installation minimal and explicit; no compiler/Python/Git/test tooling.
2. Build from full root install; production-deps installs only `ops/runtime` lock.
   Integrate the runtime verifier so stale pins fail before an image can be produced.
   No need to delete a prepare script from the dedicated manifest if it has none.
3. Remove dependency maps before COPY. Preserve native/grammar/WASM assets,
   executable code/metadata/licenses and client `.gz`/`.br`. Avoid broad package
   deletions. Show measured layer/file counts proving the pruned payload never enters
   a lower runtime layer.
4. Preserve root final package.json mappings, build/migrations/src/lib and all source
   commands/workers, build-info, labels, entry/CMD, healthcheck, ENV, private volume,
   root-to-non-root/PID1 handoff. Keep final runtime copies explicit.
5. Update hygiene tests currently hardcoding bookworm/apt to pin the new exact
   Alpine contract. Preserve substantive privacy/provenance/privilege checks; tests
   must reject tools in final installed inventory rather than only match comments.
6. Build through `npm run image:build` in an isolated clean committed clone, record
   image ID and labels. Exercise Docker and Podman build modes as available without
   changing the wrapper's source/provenance contracts.
7. Inspect final runtime: no unwanted build-tool roots, native libraries available,
   package mappings correct, no test/data/secrets/Git/archives, source maps absent
   from dependency copy. Runtime startup must not install anything.

Likely files: `ops/Dockerfile`, `tests/integration/release-hygiene.test.ts`,
image inventory/smoke tests, runtime verifier/build integration, optional root scripts.

**Gate:** IMG-PKG-01–05, IMG-SEC-01–02, common gate and initial Alpine production smoke.
Do not deploy or call the optimized image production-ready yet.

## IO04 — Add Alpine regression tooling and production-image probes

**Depends on:** IO03.
**Outcome:** repeatable automated Linux gates, not ephemeral successful shells.

1. Add an Alpine common/native validation image (suggested
   `ops/Dockerfile.alpine-validation`) using the same pin and native install semantics.
   Test-only Git/PTY/bash/GNU tools may be included where existing tests require them;
   explain their need. Do not copy them into production.
2. Keep Debian `ops/Dockerfile.browser-validation` for Playwright's supported browser
   installation. Existing Debian common validation can remain as additional coverage;
   it cannot substitute for Alpine native execution. Update naming/docs accurately.
3. Run the complete common/unit/integration/build gate in Alpine with fresh installs,
   including Linux-only modes/PTY/Git/native/archive/process-kill cases. Record any
   Windows-only results separately. No exclusion to hide an Alpine failure.
4. Add a typed production-image smoke/deployment harness (extend existing release
   tests where possible) that targets an externally supplied image, uses disposable
   private binds and asserts real startup/deferred native work/SSR/highlighting.
5. Add inventory checks and dynamic imports that run **inside final production**,
   not the development validation image. Verify native files/linked libraries and
   all source worker paths under actual non-root identity.
6. Negative tests: missing dependency/asset or stale lock causes build/test failure;
   root/unsafe ownership, recovery/config errors do not open a server or leak causes.
7. Ensure every acceptance ID has a runnable test or explicit manual procedure with
   evidence. Script names/examples must match implementation; no TODO-only smoke.

Likely files: new Alpine validation Dockerfile, integration/native helpers,
`tests/release/*`, `tests/README.md`, release README and package scripts if appropriate.

**Gate:** IMG-NATIVE-01–05 and IMG-RUN-01–05 automated coverage; common host gate plus
full Alpine common/native gate without unreported skips.

## IO05 — Validate application, private data, maintenance and restore behavior

**Depends on:** IO04.
**Outcome:** optimization preserves the actual product under deployed conditions.

1. Run affected host/development e2e, then drive the **Alpine production image** with
   a Debian/host Playwright driver through test-only minimal TLS Caddy.
2. Verify two-step setup/login/MFA, note post/edit/search/private images/files, Mermaid
   lazy loading and sanitization, server/browser syntax highlighting and i18n/timezones.
   Include a language not yet loaded to expose missing deferred grammar assets.
3. Run copied-root deployment gates with real root Compose and ORIGIN-only env:
   default/non-default UID/GID, private modes/PID1/capabilities, spoofed XFF,
   restart/recreation, default idle SIGTERM and interrupted backup.
4. Exercise reset-password under a real PTY while the server runs: no echo, session
   revocation/MFA reset/new login and notes unchanged. Test refusals. Reindex with
   app stopped; compare multilingual search before/after and after restart.
5. Backup/download/upload/restore on a second synthetic domain: retain destination
   origin, validate checksums/credentials/settings/private attachments and invalidated
   sessions. Run adversarial archive and journal process-kill recovery tests in Alpine.
6. Build an isolated synthetic pending SQL/data migration image using the new
   packaging. Prove current startup no-op, old WAL-consistent pre-upgrade copy,
   transaction failures, newer/modified-schema refusal and documented immediate
   rollback. Do not edit real baseline hashes or settle SS01 atomicity by assertion.
7. Run the existing >1 GiB TLS restore gate unchanged. Preserve Caddy defaults and
   root Compose; missing disk/engine/PTY/browser is blocked, not a pass.
8. Run release drill/benchmark on the actual candidate using existing image override.
   Compare representative search/image/backup/restore/idle-memory performance on
   matched resources; do not conflate image size with RSS or accept a major regression.

Likely files: affected `tests/e2e/*`, existing release deployment/drill/benchmark tests,
small reusable driver helpers and exact commands/results in PROGRESS.

**Gate:** IMG-UI-01–03, IMG-RUN-01–05, IMG-DATA-01–05, IMG-PERF-01, mapped simplify-setup
DEP/OPS/BAK/MIG cases. Common gate; affected e2e and actual Alpine deployment tests.

## IO06 — Compressed export, cross-engine transfer and operator instructions

**Depends on:** IO05.
**Outcome:** operator can transfer/load a smaller artifact without new app config.

1. Preserve supported raw Docker/Podman save commands; document compression of the
   saved archive with `gzip -6 -c`, keeping the original file. Add SHA-256 verification
   and gzip integrity checks before load; do not recommend destructive recompression.
2. On disposable Docker, actually load compressed Docker-built and Podman-built
   Docker-format archives, retag the localhost namespace where required, inspect
   immutable labels/ID and run native/health smoke after load. Verify Podman load too
   if advertised. Both engine builds and actual Docker import are required cross-engine
   evidence; Podman-only success cannot stand in for Docker.
3. Record load time, exact compressed/raw bytes and available disk. Reject/troubleshoot
   a corrupt/truncated gzip; keep the previous deployment/image intact.
4. Update `ops/DEPLOYMENT.md` and root README to prefer compressed transfer, retain
   raw alternative, retag/private handling, existing-Caddy install and rollback.
   Update guards that assert canonical command strings without weakening them.
5. Document runtime-lock maintenance, Alpine native caveats, supported versus tested
   platforms, size CLI and test-only browser/native topology. OPERATIONS stays a
   pointer to canonical guidance, not a competing install recipe.

Likely files: README, `ops/DEPLOYMENT.md`, `tests/release/README.md`,
`tests/integration/release-hygiene.test.ts`, relevant main/change specifications.
No new required production Compose/env key or export-service dependency.

**Gate:** IMG-XFER-01–04, IMG-DOC-01–03; common gate for test/script changes and loaded
Alpine image probes. Any unavailable required engine transfer remains blocked.

## IO07 — Matched measurements, full regression and final handoff

**Depends on:** IO06.
**Outcome:** evidence-backed local completion with release limitations explicit.

1. Rebuild the final source through the clean-source wrapper in the approved user
   commit if available; otherwise use the documented synthetic clone and keep exact
   user-release-commit verification pending. Report ID/digest/version/source relationship.
2. Save final raw/compressed archives and run the size reporter against matched
   baseline and candidate: engine size, raw/gzip bytes, layer/file/map/package sizes,
   exclusions, savings %, platform/Node/npm, cold-install/build/load timing.
3. Investigate target misses; record justified target adjustments only with evidence
   and no feature/security weakening. Keep overlapping savings categories distinct.
4. Final host check/lint/unit/integration/build and **full** e2e; full Alpine common/
   native regression; production-image deployment/PTY/worker/restore/upgrade/large-
   upload/drill/cross-engine gates. Run supported Debian browser coverage against
   candidate. Keep unreviewed OS visual baselines/manual checks explicitly open;
   never auto-update snapshots merely to make them green.
5. Reconcile main ARCHITECTURE §§2/16, main implementation/acceptance docs, README,
   ops/tests guidance and both progress logs. Preserve earlier historical results.
   Update RELEASE_RESULTS only with clearly dated new packaging evidence, not by
   overwriting old benchmark outcomes.
6. Map all acceptance IDs to actual files/commands/results. Record known advisories,
   ARM64 availability versus validation, unrelated SS01/S18 blockers and any exact-
   commit limitation. Status is blocked/in progress if mandatory gates are unrun.
7. Remove only owned disposable stacks/binds/clones/temp aliases; restore captured
   shared aliases if safely necessary. Keep supplied archive and prior evidence.
   Finish with Git diff/status/whitespace, links, formatting and secret/artifact review.

**Gate:** all mandatory image-optimization cases pass; actual size reduction proved;
no unresolved high-severity auth/data-safety issue; documentation matches artifacts.
Mark image optimization locally done only on that evidence, not whole project/release.

## Exact first validation command

Start with `git status --short` and `node --version`, then select the supported
Node/npm PATH before running `npm run runtime:check` once IO01 has created it.
Before then, the existing focused guard is:

```sh
npm run test:integration -- release-hygiene
```

IO00 must record engine/registry/baseline results before the base pin or dependency
install strategy is accepted. The complete copyable agent prompt is
[IMPLEMENTATION_PROMPT.md](IMPLEMENTATION_PROMPT.md).
