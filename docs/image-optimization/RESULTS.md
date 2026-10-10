# Image optimization — measured local results (2026-10-09/10)

**Packaging is locally validated; this is not a PandaNote release/deployment claim.**
Exact commands, failures/retries and cleanup: [PROGRESS.md](PROGRESS.md). SS01 literal
atomic exchange, S18 VPS/public certificates/device/IME/screen-reader/Linux visual
and exact user-release-commit gates remain open. ARM64 is not executed.

## Identity and method

- Supplied archive preserved: `pandanote-image.tar`, SHA-256
  `c4cd2bfcc3b92eafb6878531b3e259f10b55815899862c8bcf2f8cb9376c24a3`.
  Its source **matches user HEAD/application/dependency state**
  `287d4bef540dff761c129cdc7fcb001bac92de96`, version261007-7;
  Podman image `e7a173be0b7c32d8a5944735760d8431e0ddaa1fc6270817167d07035f9be4e7`.
- Final reviewed code built in an isolated full-history synthetic clone only:
  `3fd5b7dffb4da2d39aac2c41c2b3878c1c7a8f5f`, version261009-1,
  committed-at2026-10-09T16:28:46.000Z. It includes reviewed user-tree changes;
  later changes add test-only UI identity assertions, tooling JSON-error redaction
  and documentation, not runtime/application/packaging behavior. **Not a user release.**
- Final Podman image:
  `96c48928eef60f8f0ca7404ca9178964ee98a08e04a267492307f3924dcbe995`.
  Actual Docker build/load index ID:
  `sha256:fc573d2626ef490704f6c618fb143bcd30eb183a66767def105c37383c7bdb10`.
  Podman-built archive loaded on Docker:
  `sha256:3436c8ab4e4c95eeb7b871fbe8846d087398e3642fa47cb10250ff8199c27b58`.
  Engine/index/config identities differ; immutable version/full hash/time agree,
  and each running default-Compose container matches its loaded engine reference.
- Both Node24.21.0/npm11.19.0/Linux AMD64. Control Debian bookworm/glibc;
  candidate Alpine3.23.6/musl, verified Node Alpine3.23 index
  `sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2`.
  SQLite3.53.2/Sharp0.35.5/libvips8.18.7 unchanged. Main dependency pins/lock and
  application source/schema/Compose/env unchanged; runtime graph and libc differ.
- Same Podman5.8.4 **legacy Docker-archive, uncompressed layers**, same reporter
  Node gzip6 for the matched comparison. Actual GNU gzip6 is also measured separately.
  Reporter is read-only, streaming, bounded, never extracts/logs payload contents.

## Before/after size

| Measurement                                 |             Debian control |                 Final Alpine |                         Reduction |
| ------------------------------------------- | -------------------------: | ---------------------------: | --------------------------------: |
| Raw matched Podman archive                  | 612,746,240 B (584.36 MiB) |   280,161,280 B (267.18 MiB) |                        **54.28%** |
| Canonical reporter gzip6                    | 181,377,850 B (172.98 MiB) |     92,421,571 B (88.14 MiB) |                        **49.04%** |
| Actual GNU gzip6 transfer                   | 179,033,507 B (170.74 MiB) |     90,823,530 B (86.62 MiB) |                        **49.27%** |
| Original/final Podman engine `.Size`        |              612,706,544 B |                280,121,937 B |        engine accounting, not RSS |
| Dependency COPY layer tar                   |                 340.16 MiB |                    81.61 MiB |      tar includes headers/padding |
| Dependency regular-file payload             |                 324.11 MiB |                    74.91 MiB |          cumulative layer payload |
| Dependency maps (overlap above)             |                  97.80 MiB | **0 in every runtime layer** |              not additive savings |
| Base + runtime-library layer tar            |                 224.38 MiB |                   165.75 MiB |       Node/base/library packaging |
| Built app payload                           |              18.080897 MiB |                18.080910 MiB | preserved; metadata changes bytes |
| Client gzip/Brotli payload (overlaps build) |               4.574620 MiB |                 4.574633 MiB |                     **preserved** |

The 25% raw/20% gzip defaults are exceeded without feature deletion or target relaxation.
Mermaid's former116.6MiB installed payload overlaps its maps; it remains in the
client bundle, not the runtime graph. Do not add map/package savings together.

Docker29/containerd exports **already-compressed layer blobs** in its Docker manifest:
final raw archive92,836,864B, actual outer GNU gzip92,404,631B. Its engine `.Size`
is402,031,779B (loaded control self-reports1,289,937,020B); these engine-format
numbers are not the matched legacy-tar comparison or allocated disk/RSS. Reporter
separates stored gzip/zstd blobs from decoded layer tar. GNU gzip and Node canonical
recompression differ by implementation/header; never mix them for a savings claim.

Final Podman default-reference raw archive SHA-256:
`6a3512f80a038c13c3298d3f08c7e6eb1d68957132d2b764126e09964f61e15e`.
Actual gzip transfer SHA-256:
`4e745cde62e9b05391918806a67019a103e42ff8f578bd74b3de3e3d58c93db7`.
Docker actual gzip SHA-256:
`a3f8319796a44a57e8bd0cdc8887e417869a7dd6733352de7d080634729ef4cb`.

## Validation actually run

| Gate                                                                                                                              | Actual outcome                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Final host check/lint/build                                                                                                       | PASS, zero diagnostics                                                                                                          |
| Final host unit/integration                                                                                                       | **142 / 212 PASS + 7 explicit Linux-only host skips**                                                                           |
| Final host full Chromium                                                                                                          | **98 PASS**, no snapshot updates                                                                                                |
| Final fresh Alpine common/native/Git/PTY/fsync/archive/fault/kill                                                                 | **142 unit / all219 integration PASS**, zero skips/exclusions, check/lint/build PASS                                            |
| Fresh supported Debian nonvisual Chromium                                                                                         | **92 PASS**; Windows-specific shell visuals remain unreviewed on Linux                                                          |
| Minimal Alpine native/fallback                                                                                                    | Fresh locked ci + real SQLite CC/CXX rebuild PASS; root/minimal/non-root/drop/execve/linkage/CA/DST/static formats/workers PASS |
| Final external production inventory/native/grammar/identity/live PTY/reindex                                                      | **2 PASS**, including missing-module negative control                                                                           |
| Final copied-root default/non-default UID/private modes/PID1/zero caps/XFF/restart/shutdown/interrupted backup/upgrade/rollback   | **5 PASS** on real disposable Docker; no root Compose/env/Caddy changes                                                         |
| Final large TLS restore                                                                                                           | **1,208,340,295 bytes**, all three384MiB file hashes retained                                                                   |
| Final two-domain TLS setup/MFA/private download/upload/restore/restart drill                                                      | **3 + 1 PASS**                                                                                                                  |
| Final built Alpine lazy/sanitized Mermaid, deferred grammar and source/restarted/restored SSR/sidebar/mobile/no-JS About identity | **1 PASS**                                                                                                                      |
| Matched fresh10k full benchmark                                                                                                   | **9 control +9 initial candidate +9 final candidate PASS** on supported Linux browser driver                                    |
| Actual Docker and Podman clean-source build/save/gzip/fresh Docker load/retag/native/default Compose/corrupt safety               | PASS; final loads5842ms/5522ms; prior running image/data unchanged after corrupt load                                           |
| Actual Podman gzip load                                                                                                           | PASS                                                                                                                            |
| Current audit                                                                                                                     | Runtime0; full root2 low, no moderate/high/critical; no force fix                                                               |
| Dirty current-user-tree build                                                                                                     | Expected exit1 before engine: provenance refusal, not a release build pass                                                      |

Per-step common gates and all intermediate failures are retained in PROGRESS.
Earlier successful runs are not substituted for the final listed code gates.
Cold Alpine production install logs: full root511packages/17s, minimized237packages/9s;
initial native-only minimized ci7s. Final rebuild uses those verified native layers
(cached, not another cold-install claim); Vite server/client build1.15/2.27s in
Podman and5.07/2.56s in Docker. Final compressed Docker load5842ms/Podman-import5522ms.
These are observed stage/operation timings, not total reproducible end-to-end build
or registry-independent startup performance. Archive load/build/source relationships
and failed attempts remain in the exact handoff.

## Performance (not a VPS guarantee)

Actual image on Docker29, app **2CPUs/3GiB**, supported Debian Chromium driver
**2CPUs/4GiB**, same WSL workstation/i7-11850H. Fresh deterministic10k multilingual
~2KiB notes,300tags,297drafts/197Trash, long code/diagrams, media/backup/restore;
real minimal Caddy HTTPS. Warm API samples and seven cache series, not OS-cold disk.
Numbers are client-observed; RSS sampling is not exact simultaneous allocated-memory accounting.

| Scenario                     |   Control | Initial optimized candidate | Final candidate confirmation |
| ---------------------------- | --------: | --------------------------: | ---------------------------: |
| List p95 ms                  |      50.9 |                        31.2 |                         58.0 |
| Coffee trigram p95 ms        |      74.0 |                        70.8 |                        110.6 |
| 香港 p95 ms                  |      55.9 |                        45.1 |                         56.6 |
| Absent short scan p95 ms     |      37.6 |                        39.2 |                         51.3 |
| Warm first-card p95 ms       |     448.5 |                       532.0 |                        587.3 |
| Four12MP photos + file s     |       5.0 |                         6.0 |                          6.9 |
| 49MP post s / OOM            |  0.9 / no |                    0.9 / no |                     1.4 / no |
| Full web backup s            |       8.0 |                        11.8 |                         11.9 |
| Restore validate + replace s | 23.2 +2.3 |                   30.0 +2.4 |                    31.3 +3.5 |
| Final idle RSS MiB           |     338.2 |                       289.1 |                        305.9 |
| Restore sampled peak RSS MiB |     538.5 |                       403.6 |                        390.3 |

Slower web/render/seed samples are **not hidden**, and this does not claim equal
speed. Bulk single-run wall times include browser polling/sampling/shared-workstation
variability; all actual functional/budget assertions pass with lower memory.
To investigate the apparent47% web-backup slowdown, ran three direct native
10k+32MiB backups per image at the same app limits: median hardlink2070→2017ms,
copy1965→2092ms, worker~105–119→73–80MiB. No sustained47% native backup slowdown
was reproduced; no exact environmental root cause is claimed. Remeasure mixed
loads on the real VPS; no budget/feature/security weakening was approved.

Windows Chromium network emulation repeatedly stalled CSS for150s under legacy
and current CDP APIs. Those full benchmark attempts **failed**, not passed; the
same full current per-rule/cache-disabled workload passed on supported Linux,
including final confirmation. This remains a Windows measurement limitation.

## Remaining limits

- No user repository commit, deployment, real application-data use/deletion or
  exact-user-release validation; synthetic commits/images must not be promoted.
- ARM64 manifest/build option retained, but no usable native/QEMU execution setup
  validated (binfmt probe reported a symlink-loop error).
- Real VPS/public certificates/independent host and physical device/IME/pinch/
  screen-reader/Linux visual review remain S18. Large single-session DOM growth
  and optional100k/max64GiB stress remain separate approved-scope work.
- SS01 literal atomic directory exchange is still open; crash-safe journaled
  rotation is not silently accepted as that exchange.
- Root2 low browser-chain advisories remain; runtime audit0 is dated evidence,
  not a permanent security guarantee. Existing upstream install-script/compiler/
  lazy-bundle warnings are recorded rather than suppressed.
