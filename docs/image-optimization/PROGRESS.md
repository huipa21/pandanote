# Image optimization — progress and handoff

## Current state

- **IO00–IO07 locally done**, not an overall PandaNote release. Verified pinned
  Node24.21.0 Alpine3.23/musl, 18-root dedicated lock/drift guard, pre-COPY dependency
  map pruning, read-only bounded reporting and compressed/raw operator transfer.
- **Measured matched savings:** raw612,746,240→280,161,280B (**54.28%**);
  canonical Node gzip6 181,377,850→92,421,571B (**49.04%**). Actual GNU gzip6
  179,033,507→90,823,530B (**49.27%**). Packages/maps/build categories overlap;
  Docker containerd already-compressed export and engine `.Size` are separate.
- **Final gates:** host check/lint/build +142unit/212integration+7 explicit host Linux
  skips +98full Chromium PASS; fresh Alpine check/lint/build +142unit/**all219integration,
  zero skips/exclusions** PASS; fresh supported Debian nonvisual92 PASS. Actual final
  production native/inventory/PTY/reindex2, copied-root/upgrade/rollback/large-TLS5,
  two-domain restore/restart3+1, content/SSR/mobile/no-JS identity1, full benchmark9
  and two-engine compressed/corrupt-load/default-Compose gates PASS.
- **Source:** user HEAD stays287d4bef…; no user commit. Final packaging code validated
  from full-history synthetic3fd5b7df… (version261009-1), never a user release.
  Later identity-test/docs and tooling-only JSON-error redaction do not alter runtime behavior.
- **Evidence:** [RESULTS.md](RESULTS.md) records exact images/platform/bytes/performance;
  append-only histories below contain commands, real failures/retries and scope.
  Runtime audit0; root2low advisories remain (no moderate/high/critical or force fix).
- **Cleanup:** owned stacks/volumes/networks/daemons/isolated Podman storage/tunnels/
  binds/clones removed; ignored reports/archives/logs/source patch retained. Shared
  latest and supplied archive unchanged. Two prerequisite base pulls intentionally
  remain shared cache; unrelated images (including new other-session images) untouched.
- **Independent limits:** SS01 literal exchange, S18 VPS/public TLS/device/IME/AT/
  Linux visuals/exact-user-commit remain open. ARM64 not executed; Windows CDP
  throttling stalls remain an unpassed measurement limitation, with full Linux
  workloads passed. No application/schema/Compose/env/security/feature removal.

## Step tracker

| Step | State        | Evidence                                                                        |
| ---- | ------------ | ------------------------------------------------------------------------------- |
| IO00 | done         | Exact-source preserved control; streaming reporter/synthetic/common gates       |
| IO01 | done         | 18 locked roots, zero transitive version drift; actual minimized imports        |
| IO02 | done         | Musl cold install/linkage/static formats/workers/source compilation/drop/execve |
| IO03 | done         | Actual clean-source Alpine production build, pre-COPY maps0, initial smoke      |
| IO04 | done         | Tracked Alpine common/production inventory/PTY/deferred/negative harness        |
| IO05 | done         | Full browser/production/migration/rollback/two-domain/large-TLS/10k gates       |
| IO06 | done         | Actual Docker+Podman build/gzip/fresh Docker load/retag/corrupt safety/docs     |
| IO07 | locally done | Final full gates/measurements/current docs/owned cleanup; release limits open   |

## Acceptance mapping

Mandatory AMD64 local cases in [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) pass.
Unreviewed visual/manual/ARM64/exact-user-release conditions remain separate.

| Cases            | Actual tests/evidence                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IMG-SIZE-01–03   | integration/image-size6 incl metadata-content redaction; actual preserved/final Docker and Podman reports, matched54.28%/49.04% reductions                                     |
| IMG-DEP-01–05    | unit/runtime-dependencies12; cold minimized install/imports, native/image probes, final installed inventory; no version drift                                                  |
| IMG-NATIVE-01–05 | ops/Dockerfile.native-probe + release/native-probe; forced SQLite CC/CXX; actual final musl probes; all219 Alpine integration                                                  |
| IMG-PKG-01–05    | hygiene/real-Git/build-metadata; actual clean wrapper builds, every-layer maps0; image-probe + source/restarted/restored desktop/mobile/no-JS About equals labels              |
| IMG-SEC-01–02    | pristine image inventory, optional/asset/license preservation, TLS1/audits, full auth/XSS/adversarial archive gates; no high/critical advisory                                 |
| IMG-RUN-01–05    | external image.test2 and deployment5; real default/non-default UID/modes/zero caps/PID1/readiness/stop/interruption/livePTY/stopped reindex/source workers                     |
| IMG-UI-01–03     | full host98/nonvisual Linux92, actual Alpine content1 + full Linux9-case benchmark; supported deferred grammar/lazy sanitized diagrams                                         |
| IMG-DATA-01–05   | all219 native suite incl migration/trust/kill/rollback, synthetic upgrade+old-copy rollback, final drill3+1, 1,208,340,295B TLS restore/hashes                                 |
| IMG-PERF-01      | matched fresh9+9, final9; actual2CPU/3GiB app + Linux driver; slower samples/repeated native investigation disclosed in RESULTS                                                |
| IMG-XFER-01–04   | actual two-engine builds/save/gzip/fresh Docker load/retag/identity/native/root Compose; corrupt integrity+load fails with prior data intact; original archive/alias preserved |
| IMG-DOC-01–03    | canonical docs/current architecture/spec/tests/workflow reconciled; hygiene7/local links, exact commands/results/cleanup and all limits recorded                               |

## Next session: exact task

Review the uncommitted packaging change and obtain user approval before a user-repo
commit. Resolve SS01 literal atomicity separately; do not approve it by implication.
After an approved clean full-history commit, run `npm run image:build -- --platform
linux/amd64`, inspect exact OCI/private UI identity, retain the prior image/full
backup and rerun the image/production/transfer gates on that exact commit. Deploy
only if explicitly requested. Then S18 real VPS/public TLS/independent-host restore/
physical device/IME/screen-reader/Linux visual gates; ARM64 needs native validation.

Read AGENTS, this final history/RESULTS, runtime contract/manifests, Dockerfile,
ops/DEPLOYMENT §1–2/14 and tests/release/README. First safe validation on supported
Node executable **and PATH** with TLS1:

```sh
npm run runtime:check && npm run check && npm run test:integration -- image-size release-hygiene
```

Preserve supplied archive and ignored measurement evidence. The cleaned synthetic
clones/engines are not reusable deployments or user releases.

## Session handoff template

Append entries; never erase this history.

```text
### Session <identifier> — IOxx
State: not started / in progress / blocked / done
Implemented behavior and touched files:
- ...
Source/engine/image/platform/Node/npm identity:
- ...
Exact commands and actual results (including failures/retries/skips):
- ...
Acceptance IDs and measurements:
- ...
Decisions/deviations and rationale:
- ...
Known issues, remaining gates and owned-resource cleanup:
- ...
Next task, files to read and first validation command:
- ...
```

## Handoff history

### Session 2026-10-09 — user-requested image optimization planning

**State: planning done; IO00–IO07 implementation not started.** The repository was
clean before writing this folder. This session created README/SPEC/DECISIONS/PLAN/
ACCEPTANCE_TESTS/OPERATIONS/PROGRESS/IMPLEMENTATION_PROMPT and linked the work from
main PROGRESS. The simplify-setup folder was used as the structural reference.

Reviewed current Docker/build/dependency configuration, main product/deployment/
validation/provenance contracts, simplify-setup SPEC/PLAN/DECISIONS/acceptance/current
handoff, release-hygiene guards, Debian validation Dockerfiles and release tooling.
Alpine and minimal runtime dependencies remain designs requiring upstream/install/
native/production validation. Scope preserves source workers, native TS tools,
Kit/Svelte/Shiki, platform optional packages and clean-source versioning.

Earlier analysis used read-only streaming tar and gzip probes on the supplied
archive. Their historical measurements are recorded in SPEC; this session does not
claim that an optimized image or actual compressed Docker import was tested.
The analysis host's default `node --version` was `v24.15.0`, below the app minimum;
the implementation agent must select supported executable and PATH.

Validation used the existing supported host executable and npm CLI, not the default
older Node. Exact setup and commands:

```sh
export NODE_TLS_REJECT_UNAUTHORIZED=1
export PATH='/c/Users/huipa/AppData/Local/npm-cache/_npx/538786c08bcb9442/node_modules/node/bin':"$PATH"
N='/c/Users/huipa/AppData/Local/npm-cache/_npx/538786c08bcb9442/node_modules/node/bin/node.exe'
C='/c/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'
"$N" --version
"$N" "$C" --version
"$N" node_modules/prettier/bin/prettier.cjs --write docs/image-optimization
"$N" node_modules/prettier/bin/prettier.cjs --check docs/image-optimization docs/PROGRESS.md
"$N" "$C" run test:integration -- release-hygiene
"$N" "$C" run lint
git diff --check
git status --short
```

Actual results: Node **24.21.0**, npm **11.12.1**; new Markdown formatted; changed-doc
format check **PASS**; existing release-hygiene **7/7 PASS** (includes local links,
current documentation and unchanged deployment-artifact contracts); full ESLint +
Prettier lint **PASS**; Git whitespace check **PASS**. Git reports only the intended
main PROGRESS edit and eight new change documents. The Git LF/CRLF conversion notice
is informational, not a test failure. No failed/skipped documentation check.

Full TypeScript check, unit/full integration/e2e/build, Alpine native/production,
benchmark and engine transfer gates were **not run** for this documentation-only
session. No implementation/native success is implied by the hygiene test. No
dependency/lock/app data/image alias change or user-repository Git commit performed.

Next: IO00 environment/matched-baseline/reporter, followed by the complete ordered
long-session plan. Existing SS01/S18 blockers remain separate.

### Session 2026-10-09 — IO00

**Done.** Read AGENTS, all required main documents in full, simplify-setup SPEC/full
handoff and every image-optimization document. HEAD is
`287d4bef540dff761c129cdc7fcb001bac92de96`; preexisting planning changes retained.
The supplied archive's revision matches HEAD and application/dependency state,
so it is the matched Debian control, not an unrelated historical comparison.
Its image ID is `e7a173be0b7c32d8a5944735760d8431e0ddaa1fc6270817167d07035f9be4e7`,
Node 24.21.0/npm 11.19.0, Linux AMD64; engine size 612,706,544 bytes on original
Podman (612,706,664 after isolated load: engine accounting differs slightly).
Raw 612,746,240 bytes; gzip-6 181,377,850; archive SHA-256
`c4cd2bfcc3b92eafb6878531b3e259f10b55815899862c8bcf2f8cb9376c24a3`.

Implemented `scripts/image-size.ts`, `image:inspect` and 3 real synthetic integration
cases: read-only multi-pass streaming Docker tar/gzip, checksums/framing/metadata
bounds, explicit multi-image reporting, legacy alias deduplication, labelled
cumulative payload/overlap and exclusive new-report creation. No extraction/content
logging. Baseline report exactly reproduces prior raw/gzip counts; dependency
payload 339,857,318 bytes, overlapping maps 102,554,129; build 18,959,195 including
4,796,837 precompressed client bytes. Reports/logs are ignored in `.browser-spike/io`.

Environment: default Node 24.15.0 rejected; explicit executable AND PATH use cached
24.21.0 and npm CLI 11.12.1. Every command exports TLS verification 1 (inherited 0
was not used for network operations). Host free disk ~186 GiB; VM ~949 GiB/15 GiB
RAM, sufficient for large synthetic tests; Chromium build1243 installed. Podman
5.8.4 Linux AMD64, client5.8.2; actual disposable Docker29.8.2 ready. Isolated
Podman graph root `/var/tmp/pandanote-io-engine/storage`, private service socket;
original engine/images/aliases untouched. Docker-in-Docker is test-only tooling.

Verified registry `node:24.21.0-alpine3.23`, actual index digest
`sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2`,
AMD64 manifest `sha256:a01ebbfa28f5ac85e27044d661b4415d30508b2e64dc23eef236493b7a99f916`;
ARM64 manifest present, not executed. Pulled/run: Node24.21.0/npm11.19.0/Alpine3.23.6.
No production switch yet. Registry token/fetch/pulls used normal TLS validation.

Exact commands: `git status --short; git rev-parse HEAD; node --version`,
`sha256sum pandanote-image.tar`, `podman version`, `podman machine ssh 'df -h / /tmp;
free -h'`, `podman manifest inspect docker.io/library/node:24.21.0-alpine3.23`,
`podman pull docker.io/library/node:24.21.0-alpine3.23`, registry fetch to capture
Docker-Content-Digest, `podman load -i pandanote-image.tar` (isolated), native Node/npm
version queries, `podman exec pn-io-docker docker version`. PASS. First background
service launch SSH exceeded 60s; service did start; direct SSH inspection confirmed
its owned PID/socket. No unrelated process killed.

All following commands use `source .browser-spike/io/env.sh` and `"$N" "$C"`:
`run test:integration -- release-hygiene` 7 PASS;
`run image:inspect -- --archive pandanote-image.tar --output .browser-spike/io/baseline-size.json`
PASS; final `run check`, `run lint`, `run test:unit`, `run test:integration`, `run build`
PASS: zero diagnostics, 130 unit, 209 integration + 7 explicit Linux-only host skips.
Initial MSYS path conversion prevented npm starting (no tests passed); corrected
CLI path to C:/… with path conversion disabled. Initial reporter check had 4 stream
and unknown-chunk type errors; initial size tests had 3 passes but an unhandled
streamx secondary error, NOT a pass. Narrowed actual stream types/handled secondary
emission; complete common rerun passes. Build retains existing lazy chunk warnings.

IMG-SIZE-01/02 pass; IMG-SIZE-03 awaits candidate. IO01 next: audit/lock minimal graph,
then `npm run runtime:check`; native/production/browser/transfer gates remain pending.
SS01/S18 unchanged. Owned isolated engine/resources retained for subsequent steps.

### Session 2026-10-09 — IO01

**Done.** Added ops/runtime manifest/lock, typed root/reason/forbidden-package
contract, read-only drift CLI (`runtime:check`, build prerequisite), 12 unit cases.
Audited generated SSR/API/internal Kit exports, shared Markdown/timezones, source
startup/reset/reindex and embedded Sharp/snapshot/trust workers via createRequire.
18 roots match main pins; Svelte explicit peer; Mermaid/DOMPurify/adapter are
build/client only. Main classifications/versions/root lock unchanged.

Seeded runtime lock from root resolutions, then supported npm11
`install --package-lock-only --ignore-scripts --omit=dev --omit=peer` in ops/runtime.
306 lock entries; **zero transitive version differences**; no applicable root
override (esbuild-kit absent). Runtime lock audit 0 vulnerabilities; root browser
advisories remain separate. Actual Debian cold `npm ci --omit=dev --omit=peer`
loads all 18 roots/excludes forbidden roots and retains platform optional packages.
`npm ls --omit=dev --omit=peer --depth=0` PASS; 254 package.json files including
package subdirectories. Probe image
`6ebe08e008c2018d5eb8ca4c18e2d42447e61894382846f98d74f41c8f7e6ca9`
is not production/Alpine evidence; upstream native-script warnings retained.

Exact final commands use IO00 N/C/PATH/TLS1: `run runtime:check`, `run check`,
`run lint`, `run test:unit`, `run test:integration`, `run build` PASS: 0 diagnostics,
142 unit, 209 integration + 7 explicit Linux-only host skips. `run test:e2e --
tests/e2e/markdown.test.ts`: **6 PASS**, highlighting/lazy Mermaid/sanitizer/CSP/copy.
`podman build -f .browser-spike/io/Dockerfile.runtime-debian -t pn-io-runtime-debian .`
PASS, actual all-root/inventory assertions execute. Logs/import/transitive audit
ignored. No new gate failure; host skips require Alpine execution later.

IMG-DEP-01/02 and IO01 install classification pass; final minimized SSR/source/
deferred and musl behavior remain IO02–05. Next IO02: cold Alpine native install,
linkage/forced rebuild; first `podman build -f .browser-spike/io/Dockerfile.native-alpine
-t pn-io-native-alpine .`. No user commit/deployed data/unrelated alias touched.

### Session 2026-10-09 — IO02

**Done.** Tracked `ops/Dockerfile.native-probe` and `tests/release/native-probe.ts`
prove actual musl minimized roots, SQLite WAL/FULL/FK/transaction/trigram/short-CJK/
backup/reopen, configured Argon2 correct/wrong passwords, six static Sharp formats
(JPEG/PNG/WebP/GIF/TIFF/AVIF), product subprocess orientation/metadata/WebP, animation/
corrupt/pixel rejection, CA bundle and New York EST/EDT. Native-report objects select
Sharp linuxmusl + matching bundled libvips, argon2.musl and SQLite. Required shared
libraries resolve; musl ldd standalone reports Node/V8 symbols supplied by Node,
not missing shared libraries. No glibc shim/system vips/SQLite/runtime compiler.

Cold Alpine ci installs 237 packages in 7s, audit 0. Genuine fallback command
`npm_config_build_from_source=true npm_config_nodedir=/usr/local npm rebuild
better-sqlite3 --foreground-scripts` logs Python3.12.15/node-gyp12.4.0, actual CC SQLite
and CXX addon/SOLINK, then native probes pass again. npm11 warns these env controls
are unknown/future npm12 removal; npm remains pinned11 and they demonstrably work.
Node headers from pinned base, no network/TLS workaround. Upstream C++ warnings
retained. Separate minimal base installs only CA/libstdc++ (libgcc already supplied).
Both root and UID1000 probes pass without python/make/g++/Git. A real source native-TS
becomeContainerUser drops to12345:12346, clears groups/capabilities, then execve runs
native probes successfully. Runtime `/data` behavior still requires production gates.

Commands: `podman build -f .browser-spike/io/Dockerfile.native-alpine -t
pn-io-native-alpine .` PASS; promoted reusable `podman build -f ops/Dockerfile.native-probe
-t pn-io-native-proof . && podman run --rm pn-io-native-proof` PASS; final rebuild
with drop/execve PASS (`io02-drop-execve.log`). Node24.21.0/npm11.19.0/Alpine3.23.6,
SQLite3.53.2/Sharp0.35.5/libvips8.18.7. Earlier minimal probe ID
`11ea95545773611e40019291927145e428fb2b5002f0c7b09f7382eec0a777f3`;
final drop/execve image identity is in owned build log.

Host N/C/PATH/TLS1 `run check`, `run lint`, `run test:unit`, `run test:integration`,
`run build`: PASS, zero diagnostics, 142 unit / 209 integration + 7 explicit Linux
host skips. `run test:integration -- release-hygiene`: 7 PASS after tracked probe.
No failed native operation. Corrected an initially weak count assertion before
rerunning probes (now exact n=1 for trigram and short query). IMG-NATIVE-01–04 probe
portion passes; full Alpine common (05) is IO04, production data/UI remains IO03–05.
ARM64 published but not executed. Next IO03 production Dockerfile/pruning/clean-clone
build and initial real image smoke; no user commit or unrelated resources touched.

### Session 2026-10-09 — IO03

**Done.** Production Dockerfile uses verified Alpine index for all 3 stages;
both install stages CA/Python/make/g++, runtime only CA/libstdc++. Production-deps
installs dedicated lock with `--omit=dev --omit=peer`, deletes only dependency maps
before runtime COPY. Final main package ESM/#lib mapping, build/precompressed client,
trusted src/lib/migrations/tools/workers/metadata, entry/env/HEALTHCHECK unchanged.
Hygiene now asserts actual Alpine pin/pruning placement/optional preservation/build
drift prerequisite while retaining privacy/provenance/privilege/Compose guards.
Root Compose/env/main dependency lock and all application source are unchanged.

Host `run check`, `run lint`, `run test:unit`, `run test:integration`, `run build`
PASS: zero diagnostics, 142 unit / 209 integration + 7 Linux-only host skips.
Clean-source build `"$N" .browser-spike/io/build-clone.mjs candidate` first refused
unreviewed tooling-generated NUL before build; removed only that new artifact with
Windows extended-path unlink, deleted only the incomplete owned clone, reran.
Final supported clone `node scripts/image-build.ts --engine podman` PASS; full history,
reviewed diff/new-file allowlist, synthetic commit only, dirty/shallow checks intact.
Synthetic commit `d00a164b6112c5d9cd816335dd39b6970cf181a3`, version261009-1,
image `550627a66a2e2496edbfd6fded182607c2e9461ab4afbad5266c3c9c2a78116d`.
NOT a user release. Original engine latest untouched; wrapper latest lives only
inside isolated owned Podman storage. Native install/build warnings retained.

Actual default production entry/readiness/PID1 UID1000/zero caps/main ESM mapping,
native subprocess/probes and idle stop exit0 PASS; temporary test file was copied
only into that synthetic container then container/anonymous data removed. Pristine
image inventory PASS: no app tests/docs/Git/env, no forbidden modules/tool executables,
no dependency maps; gzip/Brotli assets retained. `podman save --format docker-archive
-o .browser-spike/io/candidate.tar localhost/pn-io-candidate:latest`, then
`run image:inspect -- --archive .browser-spike/io/candidate.tar --output
.browser-spike/io/candidate-size.json` PASS: preliminary raw **280,161,280 bytes**,
gzip6 **92,421,561**, engine280,121,934; dependency payload78,549,536, maps0 in every
saved layer. Sizes preliminary until final source/gates; >54% raw/~49% gzip savings.

IMG-PKG-01–04/DEP inventory and initial security/native smoke pass; full private
UI/identity/recovery/maintenance/restore pending. IO04 next tracked Alpine common
image + final-image probe/harness; first build/run ops/Dockerfile.alpine-validation.
No deployment, user commit, real-data deletion or unrelated image overwrite.

### Session 2026-10-09 — IO04

**Done.** Added pinned ops/Dockerfile.alpine-validation (full root ci, test-only
Git/bash/util-linux/OpenSSL/GNU tools; none copied to production), typed external
image gate tests/release/image.test.ts and final-image inventory/deferred-highlight
probe. Existing Debian browser driver retained. Pristine image checked before copying
only temporary probe files into an owned container; container/anonymous volume
cleaned. Real default entry/native/static formats/Sharp worker/zero caps/ESM/source
paths/licenses/WASM/precompressed assets/all runtime-root imports pass. Negative
missing-Shiki control fails as intended in a disposable layer, original image intact.
OCI equals immutable build-info. Real Linux PTY named reset runs against live app:
no echo, immediate revocation, disabled MFA, old-password refusal, unchanged full
note/key; missingTTY/args refused. Stopped named reindex preserves multilingual
search and restart. No production install/config changes.

Commands: `podman build -f ops/Dockerfile.alpine-validation -t pn-io-alpine-validation .`
then `podman run --rm --cpus=2 --memory=4g --name pn-io-alpine-validation-run
pn-io-alpine-validation`: final **PASS check/lint/build, 142 unit/all216 integration,
zero skips/exclusions**. Image1081d4b262a3091298495feb958fbc634a8bcf5a1656c370a1aa793b645e1b4f.
Actual musl Sharp/SQLite/PTY/Git/fsync/modes/pre-copy/archive/adversarial/fault/kill
and startup no-listen/error cases execute, no Debian/Windows substitution.
Host N/C/PATH/TLS1 final `run check/lint/test:unit/test:integration/build` PASS,
142 unit/209 integration +7 explicit host Linux skips.

External image command (N/PATH/TLS1) `node_modules/@playwright/test/cli.js test
--config playwright.release.config.ts tests/release/image.test.ts` with
IMAGE_ENGINE=podman, IMAGE_UNDER_TEST=localhost/pn-io-candidate:latest,
IMAGE_REMOTE=podman-machine and IMAGE_PTY_CLIENT_JSON selecting only the isolated
Podman --root/--runroot: **2 PASS (1.2min)**. First run 2 FAIL: Rust isn't in the
existing Shiki web bundle (correct plain fallback), and password-login success
returns `{ok:true}`, not `mfaRequired:false`. Verified installed grammar inventory,
use deferred supported SQL/Python, explicitly test Rust fallback and correct login
DTO/old-password refusal. Full reruns pass; no supported language/assertion/security
behavior removed. Logs retain failures and final results without secret output.

IMG-NATIVE-05 and automated IMG-RUN/DEP/source-tool portions pass. IO05 next full
host/production browser, copied-root/large TLS restore/upgrade/rollback/drill and
matched performance. Independent SS01/S18 remain open; all resources synthetic.

### Session 2026-10-09/10 — IO05

**Done.** Full host `run test:e2e`: **98 PASS**, unchanged snapshots. Fresh supported
Debian browser image `podman build -f ops/Dockerfile.browser-validation -t
pn-io-debian-browser . && podman run --rm --cpus=2 --memory=4g pn-io-debian-browser`
**92 nonvisual PASS** (Windows-only shell visuals remain unreviewed, not passed).
Actual Alpine image `bash ops/release-drill.sh` **3+1 PASS** (two-domain account/MFA,
private files, downloaded web upload/restore, archived login/settings and restart).
New tests/release/content.test.ts against that image **1 PASS**: no-diagram/lazy
library, built SSR and browser deferred SQL grammar, strict/sanitized hostile
Mermaid preview, no attacker request. Host driver plus actual Linux browser
performance use production Alpine, never credit Debian-native as musl evidence.

Copied-root `deployment.test.ts`: **5 PASS (3.1min)** on actual disposable Docker29.8.2,
loaded Podman candidate + synthetic upgraded clone. ORIGIN-only/root Compose and
minimal Caddy unchanged. Positive IDs/private modes/PID1/zero caps/XFF/recreation,
idle <10s exit0, active backup interruption, schema2→3 SQL/data/pre-copy/immediate
old-image/DB rollback pass. **1,208,340,194-byte** streamed TLS backup/download/upload/
validate/restore retains all three file hashes. Upgrade changes exist only in
throwaway full-history clone; no existing migration hash edited.

Added test-only isolated-engine socket and Docker-in-Podman transport to deployment
harness (client-file bridging only). Timing uses Node monotonic clock instead of GNU
date in Alpine. Default test path unchanged. Original attempt: 1 FAIL/4 unrun because
Podman alternate --root systemd health timers invoked default storage (verified
ExecStart/status125). No health bypass: switched to real disposable Docker. Next
attempt 1 FAIL/4 unrun because nested published port lacked driver tunnel; added
owned SSH tunnel. Next 1 PASS/1 FAIL/3 unrun from `node -p` BigInt's trailing n;
fixed `.toString()`, full 5 PASS. Every failed run retained. Standard image
HEALTHCHECK, TLS/provenance/ownership/limits/Compose remain unchanged.

Performance: full existing `bash ops/release-benchmark.sh` on **fresh matched 10k
fixtures**, each app2CPUs/3GiB, Linux Debian Chromium driver2CPUs/4GiB, same Docker
host: baseline **9 PASS (4.7min)** / Alpine **9 PASS (5.9min)**, no exclusions. Raw
results ignored `.browser-spike/io/linux-{baseline,candidate}-fresh-performance.json`.
Warm HTTPS list p95 50.9→31.2ms, coffee trigram74.0→70.8ms, 香港55.9→45.1ms,
absent short scan37.6→39.2ms; warm first-card p95 448.5→532ms. Four12MP photos+file5→6s;49MP0.9→0.9s/noOOM.
Final idle338.2→289.1MiB; restore peak538.5→403.6MiB. Full web backup8→11.8s,
validation23.2→30s, replacement2.3→2.4s are slower single-run observations, not
hidden. Investigated with 3 repeated native 10k+32MiB synthetic backups per image
at2CPUs/3GiB: median hardlink2070→2017ms, copy1965→2092ms; no sustained 47% native
backup slowdown, worker RSS ~105–119→73–80MiB. Browser polling/sampling/other workload
contribute to single wall-time samples; no exact root cause or equal-speed claim.
All actual budget/functional assertions pass, no performance target relaxed.

Benchmark failures before final pass: nested Docker memory update required memory+
swap together (test wrapper sets3GiB/6GiB, no app config change); both initial host
full suites1 PASS/1 FAIL/7 unrun because setup authenticated and /login redirects.
Clear only synthetic driver's cookies before genuine login. Subsequent Windows
throttled rendering twice2 PASS/1 FAIL/6 unrun,150s CSS stalls. Updated deprecated
CDP emulator to current per-rule API/cache-disabled cold workload (verified installed
protocol); Windows limitation persists, **not passed**. Moved same full benchmark
to supported Linux browser with direct synthetic DNS/IP/TLS; initial copied Docker
client EACCES fixed test-only executable mode. Full Linux reuse9 PASS, then both
fresh matched full9 PASS. No timeout/assertion increase, exclusion or TLS bypass.
Metadata driver-platform label now dynamic instead of hardcoded Windows.

Commands/env: IO00 N/C/PATH/TLS1; release scripts use ignored transport wrappers
COMPOSE=.browser-spike/io/compose, DOCKER=.browser-spike/io/docker,
PANDANOTE_IMAGE=localhost/pn-io-candidate:latest, DRILL_DIR=.drill/io or io-bench.
Wrappers execute actual Docker CLI inside pn-io-docker; SSH forwards only test ports.
Benchmark Linux driver pn-io-linux-perf uses direct c.localtest.me→owned Docker IP,
actual Docker CLI (not mock), no Node TLS disable. Copied-folder env additionally
DEP_DOCKER_CONTAINER=pn-io-docker/DEP_ENGINE=podman/DEP_ENGINE_SOCKET=/var/run/docker.sock;
DEP_IMAGE/UPGRADE_IMAGE=owned candidates, verified Compose binary hash unchanged.
Final host `run check/lint/test:unit/test:integration/build` PASS: 0 diagnostics,
142 unit/209 integration+7 explicit host Linux skips. No application source/schema/
root Compose/env dependency upgrade; owned synthetic stacks retained for IO06–07,
no user commit/data/aliases touched. IMG-UI/RUN/DATA/PERF local gates pass; SS01/S18
and physical/ARM64/exact-user-release limitations stay independent.

### Session 2026-10-10 — IO06

**Done.** Canonical README/ops guide now prefer preserving raw tar + gzip6/checksum,
integrity before load, explicit Podman localhost retag, trusted transfer and retained
prior image/full backup; raw alternative remains. Runtime lock maintenance, actual
Alpine/library/platform limits, size/engine/RSS distinctions and reusable test-only
commands documented in ops/tests/main architecture/plan/acceptance/change docs.
Root Compose/env/Caddy unchanged. No startup repair/service/config requirement.

Actual supported clean synthetic clone wrapper via real Docker29.8.2 build PASS
(`.browser-spike/io/build-docker.mjs`: buildImage still derives/checks complete clean
Git/archive/metadata; runner invokes actual Docker CLI in owned daemon, not a mock).
Both Podman and Docker builds use same d00a164… synthetic source, never a user release.
Docker save raw/gzip6, Podman docker-archive save/gzip6, checksum + gzip integrity,
**fresh disposable Docker** compressed loads/native/private default root Compose/
health/PID1 UID1000 zero caps/exit0 PASS. Explicit Podman retag matches root reference.
Docker-load engine IDs53376dde… (Docker build),ee067bf8… (Podman build), load times
7000/5864ms. Identity/public labels match source; engine/index/config IDs need not
match across formats. Corrupt half-truncated gzip fails `gzip -t` AND actual Docker
load for each; prior running image alias/data marker/readiness unchanged. Actual
`podman load -i .browser-spike/io/podman-transfer.tar.gz` also PASS.

Exact commands: `podman exec pn-io-docker docker image save -o /tmp/docker-transfer.tar
pandanote:latest`; in owned daemon `gzip -6 -c ... > ...tar.gz; gzip -t; sha256sum`;
`podman save --format docker-archive -o .browser-spike/io/podman-transfer.tar
localhost/pandanote:latest`; host `gzip -6 -c` preserving raw, `gzip -t`, `sha256sum`;
`"$N" .browser-spike/io/transfer-probe.mjs` PASS on pn-io-load-docker; probes copy
real root Compose + ORIGIN-only env into owned Linux folder, delete only that data.
`run image:inspect` on both actual gzip exports PASS. Logs/checksums ignored.

Real Docker29/containerd save contains gzip-compressed layer blobs in its Docker
manifest. Initial reporter failed unsupported tar numeric field on compressed bytes,
not a corrupt export. Extended streaming decoder to referenced gzip/zstd only,
stored/decoded accounting and 2 synthetic codec cases; no OCI graph inference.
Also bound combined config/name/extension/layer metadata and use prototype-free
package counters. Reporter now handles both real engine formats. Docker raw
92,836,864 bytes already holds compressed blobs; outer GNU gzip92,403,316 and
canonical reporter recompression92,483,500 differ by implementation/header.
Do NOT use this raw format difference as matched packaging savings; final matched
comparison remains Podman legacy tar/control. No guessed additive category saving.

IO00 N/C/PATH/TLS1 final `run check/lint/test:unit/test:integration/build` PASS:
zero diagnostics,142 unit/211 integration +7 explicit Linux-only host skips (218).
Hygiene includes links/canonical commands/security contracts. Runtime lock audit0;
root low advisories not force-fixed. IMG-XFER/DOC local gates pass; IO07 final clone,
matched size/common/full browser/Alpine/production reconfirmation and cleanup next.
Supplied archive/shared aliases untouched; no real data/user commit/deployment.

### Session 2026-10-10 — IO07 final gate and cleanup

**Locally done.** Final runtime/application/packaging source built clean through both
real engine paths from full-history synthetic3fd5b7dffb4da2d39aac2c41c2b3878c1c7a8f5f,
version261009-1/UTC2026-10-09T16:28:46.000Z; not a user release. User HEAD still
287d4bef540dff761c129cdc7fcb001bac92de96. Later content-test identity assertions and
handoff/results docs do not change runtime behavior. Source stat/reviewed patch,
clone relation, reports and actual build logs retained under ignored .browser-spike/io;
clones themselves removed. Main lock/versions/src/Compose/env unchanged.

Final image96c48928eef60f8f0ca7404ca9178964ee98a08e04a267492307f3924dcbe995
(Podman); Docker build/loadfc573d26… / Podman→Docker3436c8ab… engine index IDs.
Exact source/platform/Node/npm/native identities and all component/performance values
are in RESULTS.md. Matched Podman default-reference raw280,161,280B vs612,746,240B
(**54.28%**); Node canonical gzip6 92,421,571B vs181,377,850B (**49.04%**).
Actual GNU gzip6 90,823,530B vs179,033,507B (**49.27%**). Dependency payload339,857,318
→78,549,536B; maps102,554,129→0 in every runtime layer. Build/client compression
preserved (metadata-only byte differences), no additive overlapping savings claim.
Docker compressed-blob raw92,836,864B/actual gzip92,404,631B and engine .Size402,031,779B
are separate, not substituted into that matched comparison. Targets met.

Commands actually run with N/C/PATH/TLS1 (public setup in IO00; owned socket is now
cleaned, do not source its old engine settings for future builds):

- `"$N" .browser-spike/io/build-clone.mjs final` then `build-docker.mjs final`:
  actual clean-source wrapper/native installs/builds PASS, no dirty/shallow bypass.
- Podman final save/raw/gzip/report + fresh baseline report; Docker final save/gzip/
  report; engine inspect, actual `gzip -t`/SHA-256 PASS. Reporter5 synthetic tests
  also pass (gzip/zstd/aliases/multi-image/invalid/bounds/exclusive output).
- Final host `run check`, `run lint`, `run test:unit`, `run test:integration`,
  `run build`, `run test:e2e`: **PASS0 diagnostics/142unit/211integration+7 explicit
  Linux-only skips/98full Chromium**, no snapshot updates. Final post-identity-test
  common close rerun also PASS with the same counts.
- `podman build -f ops/Dockerfile.alpine-validation -t pn-io-final-alpine-validation .`
  and `podman run --rm --cpus=2 --memory=4g --name pn-io-final-alpine-run ...`:
  **PASS142unit/all218integration, zero skips/exclusions/check/lint/build**. Rebuilt
  post-identity-test `pn-io-close-alpine-validation` and complete common rerun also
  PASS. Initial final validation imageb571a6e8…; all images removed with owned storage.
- Fresh `ops/Dockerfile.browser-validation` final build/run2CPU/4GiB:
  **92nonvisual Chromium PASS**; unreviewed Windows-only Linux shell visuals excluded
  explicitly, not passed.
- External `tests/release/image.test.ts` with final IMAGE_UNDER_TEST/isolated PTY
  argv: **2 PASS** real pristine inventory/natives/deferred/identity/negative/live
  MFA reset/revocation/no echo/stopped reindex. Copied-root `deployment.test.ts`
  with final DEP_IMAGE, owned synthetic upgrade, actual Docker transport: **5 PASS
  (3.5min)**, including final **1,208,340,295-byte TLS restore/all file hashes**,
  interruption/recovery/old-copy SQL+data upgrade and immediate rollback.
- `bash ops/release-drill.sh` with final image/DRILL_DIR=.drill/io: **3+1 PASS**.
  `content.test.ts` with image-inspected IMAGE_EXPECTED_LABELS: **1 PASS**, actual
  source after restart and restored destination SSR/sidebar/mobile/no-JS About
  match OCI/build-info; lazy Mermaid/deferred SQL/browser sanitizer assertions pass.
- Full `bash ops/release-benchmark.sh` final image through supported Linux driver:
  **9 PASS (6.8min)** on fresh10k/2CPU/3GiB app,2CPU/4GiB driver. Current render/API/
  media/backup/restore/RSS and slower samples in RESULTS; prior matched9+9 and3+3
  native repeats retained. No target/assertion relaxation. Windows stalled runs
  remain failures; final Linux full workload is not an excluded subset.
- Brand-new owned Docker daemon: final Docker + Podman gzip load/retag/actual root
  Compose/native/identity/zero caps/health/exit0 and corrupt integrity+actual load
  safety **PASS**; final load5842/5522ms, prior running image/data intact.
  `podman load -i ...final-podman-transfer.tar.gz` **PASS**.
- `npm audit --json`: expected exit1, **2low/no moderate/high/critical**;
  `npm --prefix ops/runtime audit --omit=dev --omit=peer --json`: **exit0/0 findings**.
  No force repair or dependency upgrade. Dirty user tree `run image:build --
--platform linux/amd64`: **expected exit1/dirty refusal before engine**, not pass
  for a user release. `runtime:check` PASS; `git diff --check` PASS.

Cleanup: actual owned pna/pnb/pnc stacks and CA volumes/networks down -v; Docker
and Linux-driver containers/anonymous volumes removed; owned Podman ps empty.
Stopped only the service whose argv names /var/tmp/pandanote-io-engine, removed only
its storage/socket; stopped three recorded SSH forwards. Removed only .drill/io,
.drill/io-bench and owned .browser-spike/io/clones, all e2e fixtures absent. Generated
NUL removed via extended-path unlink. Shared latest still exact e7a173be…; supplied
archive SHA-256 stillc4cd2bfc…; no user commit/data removal. Cleanup diagnostic
`ps -o` unsupported in Git Bash (no state change); subsequent process/absence checks
confirm forwards gone. Shared engine has new unrelated other-session images: left
all untouched. Initial two owned prerequisite pulls (Node Alpine/Docker dind) retained
as shared cache to avoid interference, not deployed/temp app aliases. Ignored image
archives/reports/logs/current code patch retained as evidence; synthetic credential/
backup/browser data under owned drill binds removed. No broad prune.

Files: production Dockerfile; runtime manifest/lock/contracts/drift and size CLIs;
Alpine/fallback harness; size/unit/hygiene + typed image/native/content/deployment/
benchmark gates; README/ops/tests/main architecture/plan/acceptance, dated
RELEASE_RESULTS and all image-change/current progress docs. No placeholder marked
complete. Final docs-only formatting/hygiene/link/whitespace close recorded below.

All mandatory local AMD64 IMG groups pass. Independent SS01/S18/user-commit/ARM64
and Windows-emulation limitations remain open exactly as stated. Next task: review
with user, approve a real commit only if requested, then exact clean-release build/
identity/transfer/production gates; resolve SS01 separately and perform S18 manual
VPS/device checks. First safe command: `npm run runtime:check && npm run check &&
npm run test:integration -- image-size release-hygiene` on supported Node/PATH/TLS1.

Final review/doc close: V8 malformed-JSON SyntaxError can echo an image metadata
fragment. Reporter now replaces it with structural-only `Invalid image metadata
JSON`; new synthetic private-marker regression proves no fragment disclosure.
Tooling-only, not shipped runtime/COPY. Repeated full host check/lint/build
**142unit/212integration+7 Linux skips PASS**; fresh isolated Alpine rebuilt/run:
**142unit/all219integration, zero skips/exclusions/check/lint/build PASS**. Its owned
close service/storage/socket removed again; shared latest/archive unchanged.
Earlier218 counts remain accurate history, not final current counts. Full browser/
production/native/transfer results are unchanged by this reporter error-only edit.
Final formatting/links/whitespace/runtime:check/check and focused image-size6+hygiene7
PASS. No runtime/source identity or measured-size change, no implementation blocker.

Final repository close commands (supported N/C/PATH, TLS1, old isolated socket env
unset): `npm run runtime:check`, `npm run check`, `npm run lint`, `npm run
 test:integration -- image-size release-hygiene`, `git diff --check` **PASS**,
zero diagnostics/**13 focused tests**. Final status/artifact review PASS: only reviewed
code/docs/runtime-lock changes, no private/generated archive/database/profile file
tracked. `git diff --quiet -- src package-lock.json docker-compose.yml .env.example`
PASS; user HEAD287d4bef…/original lateste7a173be…/archive hashc4cd2bfc… unchanged;
no containers/e2e/NUL/owned drill/clone resources remain. Git CRLF notices are
informational, no whitespace failure. Cold-stage timings/final cached-build timings
added to RESULTS without claiming unmeasured total wall time. Session finished with
IO local completion only; no commit/deploy/manual/ARM64/SS01/S18 claim.
