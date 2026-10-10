# Image optimization — decisions and risk register

**Status: implemented packaging decisions; exact gate evidence is in PROGRESS.** User authorization is distinguished from agent
engineering defaults. Update this file when implementation discovers contrary
upstream behavior; keep an append-only record of material changes.

## 1. User request and authorization

1. Analyze why the saved `pandanote-image.tar` is approximately 585 MiB.
2. Provide a solution; the user explicitly said the base image may use Alpine.
3. Create a detailed plan in `docs`, following the simplify-setup folder structure,
   plus a prompt for another agent to implement the complete change in a long session.

The user did not request removing features, lowering security, deploying the image,
committing the repository, deleting data or resolving unrelated product blockers.

## 2. Proposed decisions

| ID     | Decision                                                                 | Rationale / required verification                                                                                                                          |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IO-D01 | Alpine/musl for all three production stages, one verified digest pin     | Authorized direction; no mixed-libc native copies. Resolve actual published tag and test native/runtime behavior.                                          |
| IO-D02 | Preserve supported Node 24 baseline; no unrelated major upgrade          | Native TS stripping and execve are existing contracts. Verify minimum/patch/npm compatibility and registry availability.                                   |
| IO-D03 | Separate small `ops/runtime` manifest/lock, without npm workspaces       | Main manifest serves build and dev; Kit peer metadata currently retains build tools. A locked smaller graph is more deterministic than directory deletion. |
| IO-D04 | Exact runtime roots track main direct pins, with automated drift guard   | Prevent a future dependency update from silently splitting versions. Review transitive differences and applicable overrides.                               |
| IO-D05 | Runtime install omits peers, with necessary runtime peers explicit       | Keep Kit/Svelte APIs without installing Vite/Rolldown/TypeScript for production. Verify actual npm 11 output and execution.                                |
| IO-D06 | Preserve optional platform dependencies                                  | Sharp's musl/libvips packages must remain available; optional does not mean unused.                                                                        |
| IO-D07 | Mermaid/DOMPurify stay in client bundles, not runtime roots              | Current imports are browser-only. Prove dynamic rendering and security behavior in the built app.                                                          |
| IO-D08 | Keep Kit, Svelte and Shiki runtime code                                  | Actual server imports them. Moving Kit wholesale to dev or dropping grammars would be unsafe.                                                              |
| IO-D09 | Preserve final main package ESM/imports mappings and source tools        | Runtime staging manifest must not break `#lib`, native TS CLIs, worker paths or immutable build-info.                                                      |
| IO-D10 | Prune only dependency source maps initially, before COPY                 | Large measurable saving, low execution risk. Avoid arbitrary package/source/WASM/license pruning.                                                          |
| IO-D11 | Keep client precompressed assets and supported content features          | Raw image size is not a reason to worsen network delivery or remove Mermaid/highlighting capabilities.                                                     |
| IO-D12 | Keep Debian browser driver; add actual Alpine native/production gates    | Playwright's supported browser dependencies need not share the app libc. Host or Debian-native passes do not prove production musl.                        |
| IO-D13 | Preserve clean-source wrapper and image metadata                         | Use isolated synthetic committed clones during dirty-tree implementation. Never weaken provenance or call that an exact user release.                      |
| IO-D14 | Prefer gzip level 6 for ordinary transfer, retain raw export alternative | Existing archive measured 70.4% transfer reduction. Avoid introducing a zstd/pigz requirement or new export service.                                       |
| IO-D15 | Relative targets are engineering defaults, not user promises             | 25% raw / 20% gzip targets need matched-source/platform measurements. Investigate and document adjustments rather than fabricate a final size.             |
| IO-D16 | Long-session batching with sequential gates and per-step handoff         | User wants all IO steps implemented together. This does not waive tests, state preservation or honest blocked status.                                      |

## 3. Rejected shortcuts

- **Alpine only:** leaves the 340 MiB dependency layer substantially unchanged.
- **Gzip only:** solves transfer cost, not loaded image size.
- **Move Kit entirely to dev:** generated server uses its exported/internal modules.
- **Main-lock omit flags alone:** root/dev/peer metadata can still retain unwanted
  packages; inspect the actual installed graph, not just the install command.
- **Blanket optional omission:** can remove Sharp's required native payload.
- **Recursive runtime deletion after COPY:** earlier layers retain the bytes.
- **Copy Debian prebuilds into Alpine:** glibc ABI is not musl ABI.
- **Ship a compiler to repair dependencies at startup:** bloats and makes runtime
  operation network/toolchain dependent.
- **Turn off TLS or audit controls to finish installs:** unacceptable workaround.
- **Change Compose privileges/stop timeout to make Alpine tests pass:** violates the
  unchanged simplify-setup contract.
- **Treat a fresh database or health-only smoke as full validation:** misses existing
  data, worker loading, PTY tools and interruption/restore paths.

## 4. Risk register

| Risk                                   | Mitigation / evidence                                                                                              | Blocking condition                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Requested exact Alpine tag absent      | Verify registry tag/index/digest; choose compatible supported Node 24 patch only with recorded coordinated changes | No compatible base or need to relax engine/security requirements         |
| Native prebuild unavailable            | CA/Python/make/g++ in both installation stages; prove real musl rebuild/load and inspect linked libraries          | Any production native module fails or needs unexplained ABI shim         |
| Kit runtime peer not explicit          | Audit server API/internal imports and smoke whole server on the minimized graph                                    | Missing peer/module at startup, request or deferred operation            |
| Runtime lock differs unexpectedly      | Compare direct/transitive resolutions, relevant overrides and audits; record every necessary difference            | Unreviewed drift or unresolved high-severity runtime security defect     |
| CLI/worker source import graph omitted | Trace source entrypoints, embedded/forked workers and subprocess paths; test named tools after image load          | Missing source, loader, native binary or asset                           |
| BusyBox versus GNU tools               | Test actual runtime commands; add test-only packages to Alpine validation harness as needed                        | Production behavior requires an undocumented tool/option                 |
| Permission/signal regression           | Copied-root deployment tests, default/non-default IDs, mode checks, PID1/capabilities, idle and interrupted jobs   | Weakened protection, data corruption, hung shutdown or recovery          |
| TLS/timezone regression                | Actual HTTPS drill and non-UTC/DST probes using Alpine app                                                         | Certificate or timezone behavior differs incorrectly                     |
| Two-lock maintenance debt              | Small drift verifier, documented exact regeneration workflow and runtime smoke                                     | Ordinary update can silently leave stale runtime pins                    |
| Invalid comparison                     | Baseline source/platform/Node/npm identity, exact byte counts and same compression level                           | Claims of savings based on different architectures or missing components |
| Shared-engine state harmed             | Isolated engines/clones/tags, preserve aliases and resources, cleanup only owned objects                           | Need to overwrite/delete unrelated state or real data                    |
| Long session exhausts time/tools       | Append precise remaining steps and next command; do not mark unrun gates passed                                    | Missing mandatory dependency, engine, browser or disk capacity           |

## 5. Existing open decisions remain independent

The simplify-setup SS01 literal atomic directory-exchange question and S18 final
manual/release gates remain open. This plan does not approve an exchange deviation,
change archive compatibility or turn earlier Debian evidence into Alpine evidence.

## 6. Implementation decision history

### IO00–IO06 (2026-10-09/10)

- **Pin:** verified published Node24.21.0 Alpine3.23 index
  `sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2`.
  Node minimum unchanged; AMD64 runs Alpine3.23.6/npm11.19.0. ARM64 manifest exists,
  option retained, execution unvalidated.
- **Graph:** 18 exact runtime roots, explicit Svelte, peer omission but optional
  Sharp kept. Runtime lock seeded from main and npm regenerated: zero transitive
  version changes, no applicable esbuild-kit override. No root reclassification or
  unrelated upgrade needed. Actual final imports/workers/PTY/grammar gates pass.
- **Native:** fresh musl binaries select Argon2 musl/Sharp musl+bundled libvips;
  genuine SQLite CC/CXX fallback with base headers succeeds. Runtime CA/libstdc++
  plus base libgcc suffices; no glibc shim/system vips/SQLite/compiler/tzdata needed.
- **Pruning:** dependency maps only, before COPY. No grammar/WASM/license/source
  pruning; precompressed browser bytes stay present. Payload ownership and alias
  deduplication avoid additive map/package double-counting.
- **Docker export discovery:** Docker29's containerd image store saves compressed
  layer blobs in a Docker manifest. Reporter initially refused such a layer as tar;
  now streams referenced gzip/zstd blobs and separately reports stored/decoded tar
  bytes, with real Docker export plus synthetic tests. This is not an OCI graph
  parser. Raw saved tar sizes are engine-format-dependent; matched savings use the
  same Podman uncompressed-layer format and Node/npm/platform/application state.
- **Isolation:** custom Podman storage preserves user images but its systemd health
  timers incorrectly use default storage. Production copied-root/restore/health gates
  instead run on actual disposable Docker, without bypassing HEALTHCHECK/Compose.
  Test-only socket/transport bridges and monotonic Node timing support this safely.
- **Performance driver:** Windows Chromium CDP throttling produced150s stalls under
  both old/current APIs. Current per-rule API/cache-disabled cold workload retained;
  complete matched9-case benchmark passes on supported Debian/Linux Chromium driver.
  Windows stalled runs remain failures, not equivalent passes. Cookie reset fixes
  genuine-login test setup; app auth remains unchanged.
- **Measured tradeoffs:** all product budgets pass on the local2CPU/3GiB image;
  some single web backup/restore/render samples are slower, explicitly recorded.
  Repeated native backup medians2070→2017ms (hardlink),1965→2092ms (copy) do not show
  sustained47% native slowdown; memory is lower. No target/security/feature removed
  or relaxed. These are workstation evidence, not VPS performance guarantees.
- **Transfer:** actual Docker/Podman builds and gzip6 fresh Docker load/namespace
  retag/default root Compose/native/corrupt safety pass. Raw alternative preserved;
  gzip/checksum are not encryption/authenticity. Gzip input bytes and reporter's
  canonical recompression can differ slightly by gzip implementation/header.

No SS01 atomicity approval, new production config, user-repository commit, real-data
use, deployment or ARM64/exact-release/VPS/manual pass is implied.
