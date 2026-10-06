# S18 release verification results

Linked from `docs/ACCEPTANCE_TESTS.md` section 13. **These are measurements on a
developer workstation using Linux containers, not on a real VPS.** The release gate is
therefore **not fully passed**; see "Not performed / explicit limitations".

## Revision, runtime and environment

| Item             | Value                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base commit      | `123aec8` (S17) plus the uncommitted S18 working tree; no commit was created by this session                                                         |
| Runtime          | Node 24.21.0, npm 11.19.0 (Linux image) / 11.12.1 (Windows host); SQLite 3.53.2; Caddy 2.11.6-alpine                                                 |
| Production image | `localhost/pandanote:local`, 612 MB, built cold with `npm ci` (native sqlite/argon2/sharp installed in-image); Podman 5.8.2 on WSL2 (kernel 6.6.87)  |
| Container limits | **2 CPUs / 3 GiB** (compose defaults) on an i7-11850H host (16 logical CPUs, 32 GB); browser/driver ran on the Windows host                          |
| Network          | Loopback through Caddy HTTPS (internal CA); one CDP-"throttled" series (10 Mbps / 40 ms) that did **not** visibly slow loads — informational         |
| Dependencies     | Lockfile committed; `npm audit` (all and `--omit=dev`): 0 vulnerabilities; one new **dev-only** dependency `axe-core@4.13.0` (MPL-2.0, test tooling) |

## Gate results

| Gate                                                                                                       | Result                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows `check`, `lint`                                                                                    | PASS (0 errors/warnings, Prettier clean)                                                                                                                                   |
| Windows `test:unit`                                                                                        | PASS 21 files / 95 tests                                                                                                                                                   |
| Windows `test:integration`                                                                                 | PASS 26 files / 167 tests (adds release-hygiene, readiness, task-checkbox label tests)                                                                                     |
| Windows `build`                                                                                            | PASS                                                                                                                                                                       |
| Windows `test:e2e` (full)                                                                                  | PASS **94** Chromium tests (86 previous + 8 new accessibility)                                                                                                             |
| Linux image (pinned Node/bookworm), 2 CPU/4 GB: clean `npm ci`, check, lint, unit, integration, build, e2e | PASS 95 unit, 167 integration, **88** Chromium e2e. `tests/e2e/shell.test.ts` is excluded: its visual baselines exist only for Windows (Linux baselines remain unreviewed) |
| Production image build (cold download of native modules)                                                   | PASS; non-root `node`; read-only rootfs verified; no tests/docs/fixtures in image; `grep` of `build/` finds no fixture/debug strings                                       |
| Release drill (`ops/release-drill.sh`)                                                                     | PASS, see below                                                                                                                                                            |
| Benchmark (`ops/release-benchmark.sh`)                                                                     | PASS functional assertions; measurements below                                                                                                                             |

Intermediate failures that were fixed (not hidden): `.dockerignore` allowlist initially
omitted `compose.yaml` and then `.dockerignore` itself (hygiene test failed in the Linux
image, twice); a Prettier error in `ops/DEPLOYMENT.md`; the first benchmark run used an
over-large Mermaid fixture rejected by the product's documented limits; `*.localhost`
names do not resolve in Node on Windows (switched to `*.localtest.me`); and the restart
phase of the drill failed twice because Caddy's 30 s active-health interval kept the
restarted app marked down (`503`). Caddy now uses `health_interval 5s` and
`lb_try_duration 30s`; an app restart is then invisible apart from a ~2.4 s delayed
request. A content-visibility experiment to reduce DOM cost made scrolling worse and
was reverted.

## Independent deployment and restore drill (RESTORE-02)

Two production stacks (compose projects `pna`, `pnb`), separate volumes, **different
domains** (`a.localtest.me:8443`, `b.localtest.me:9443`), real HTTPS edge, no shared
state. Evidence from the passing run:

- A: `/setup` with the operator token (token single-use), TOTP enrolled through the UI,
  published/located/draft/trash/code+Mermaid notes, a three-file post (two images + a
  file) through the real composer, dark/compact settings, a browser-local draft,
  manual backup created and **downloaded through the UI** with fresh password+TOTP.
- Sensitive routes without a grant, and a cross-origin write, are refused at the edge.
  Anonymous probes of 20 paths (data/db/key/backup/source/config/debug/traversal) on both
  deployments return only 301/303/308/401/403/404 and never leak SQLite/key/source bytes.
- B: temporary account created via its own token; the A archive uploaded through
  Settings, validated, confirmed, B returned to login. The temporary session and password
  no longer work; **A's password + A's TOTP** sign in; a one-time **archived recovery
  code** also works; notes, timeline date, tags, location, server draft, Trash, exact image
  display/thumbnail and file SHA-256, rebuilt short-CJK search and dark/compact settings
  match. B did not contain A's browser-local draft (it is not in the archive); A kept its
  draft and was unaffected.
- Graceful `SIGTERM`: both app containers exited **0**. After restart A kept its session and
  local draft, and B kept restored data, files, settings and health `ok`.
- Operator security reset through the documented `recover-auth` compose task was verified
  separately (new password accepted, old rejected).

## Measured workloads (10,000 synthetic notes, 2 CPU / 3 GiB container)

Dataset: 10,000 notes created through the real HTTP API (100 notes/s), ≈2 KB mean,
English/Cantonese/Simplified/Japanese/mixed text, 300 tags, four-year spread, 297
drafts, 197 Trash, 5% located, 40 long code notes, 12 long Mermaid notes. Latency is
client-observed through Caddy over keep-alive HTTPS, 40 warm samples (first request
cold); server-side time is slightly lower.

| Scenario                                    | first |             p50 ms |             p95 ms |      max ms | Budget (p95)             |
| ------------------------------------------- | ----: | -----------------: | -----------------: | ----------: | ------------------------ |
| Timeline first page (30 notes, 91 KB)       |  38.3 |               27.6 |               30.8 |        32.1 | <100 ✔                   |
| Next page by cursor                         | 256.7 |               31.8 |               37.6 |        56.4 | <100 ✔ (first call cold) |
| Tag filter / two-tag filter                 |  23.7 |        25.1 / 19.0 |        27.4 / 21.0 | 33.9 / 22.7 | <100 ✔                   |
| Calendar month activity                     |   8.7 |                6.5 |                8.5 |         9.2 | <100 ✔                   |
| Month-filtered timeline                     |  28.0 |               28.9 |               33.3 |        36.4 | <100 ✔                   |
| Drafts / Trash lists                        |  10.6 |                6.2 |                7.2 |         8.1 | <100 ✔                   |
| Single note detail                          |   6.8 |                5.5 |               10.3 |        12.0 | <100 ✔                   |
| Search English trigram `coffee`             |  73.1 |               60.5 |               66.6 |        70.7 | <150 ✔                   |
| Search phrase `"coffee shop"`               |  62.7 |               52.4 |               57.6 |        64.9 | <150 ✔                   |
| Search CJK 2 chars `香港`                   |  40.2 |               40.8 |               44.1 |        49.0 | <150 ✔                   |
| Search CJK 1 char `猫` (short literal scan) |  42.1 |               41.3 |               49.9 |        65.7 | <300 ✔                   |
| Search absent 1 char `龘` (full-scan worst) |  36.2 |               35.9 |               39.2 |        46.5 | <300 ✔                   |
| Search `咗心`, `%`, rare needle             |     — | 37.4 / 42.3 / 23.1 | 40.0 / 50.7 / 26.5 |       ≤58.6 | ✔                        |

First useful rendering (home timeline, 30 cards, authenticated, Chromium on the host):

| Run (7 each)                    | TTFB p50 | FCP p50 | first card p50 / p95 | transfer | JS decoded |
| ------------------------------- | -------: | ------: | -------------------: | -------: | ---------: |
| Cold cache                      |    72 ms |  216 ms |         377 / 382 ms |  233 KiB |    639 KiB |
| Warm cache                      |    62 ms |  204 ms |         362 / 386 ms |  233 KiB |    639 KiB |
| "Throttled" (12-run supplement) |        — |  260 ms |         293 / 327 ms |        — |          — |

One of five initial throttled runs reported a 150 s DOMContentLoaded/LCP while its first
card appeared at 319 ms; it did not recur in 12 further runs and is recorded as an
unexplained measurement outlier. Budget (≈1 s useful timeline, a few hundred KB payload)
is met. SSR payload for 30 cards is 91 KB uncompressed JSON-equivalent.

Mermaid: the home timeline requested **no Mermaid chunk** (largest script 392 KiB
decoded, unrelated). Opening a diagram note lazily loaded 2,183 KiB decoded / 506 KiB
compressed of additional script and rendered the SVG (page first content 1.1 s). The
product's own diagram limits (12,000 chars/160 lines/300 connections/160 shapes) reject
larger diagrams with a clear message.

Browser memory/DOM (100 scroll-driven page loads, then reload, then 60 detail-dialog
open/close cycles):

- Loading cards grows the DOM linearly and is **not virtualized**: 630 cards → 97k DOM
  nodes / 41 MiB heap; 3,030 cards → 448k nodes / 176 MiB; the append latency of a next
  page rises from p50 95 ms (first ten pages) to 739 ms (pages 90–100). Memory returns
  to baseline (8.9 MiB, 12.7k nodes) on reload.
- 60 detail open/close cycles: heap 10.9 → 11.1 MiB, nodes 12.8k → 12.9k, listeners
  175 → 177: no leak. This is a **known limitation for extremely long single reading
  sessions** (thousands of cards); not a defect for normal use. Virtualization needs a
  separately approved scroll-sync/history redesign (README S09 deferred it pending this
  evidence).

Server resources (process RSS = sum of container node processes; cgroup includes page cache):

| Workload                                         | Time         | Peak process RSS | Peak cgroup | Notes                                                         |
| ------------------------------------------------ | ------------ | ---------------: | ----------: | ------------------------------------------------------------- |
| Idle after 10k seed                              | —            |          286 MiB |     345 MiB | budget <500 MiB ✔; data volume 102 MiB                        |
| Multi-image post (4×12 MP JPEG + file, 13.3 MiB) | 4.4 s        |          389 MiB |     407 MiB | concurrent search p95 440 ms during processing                |
| Worst-case allowed image (49 MP)                 | 1.4 s        |          384 MiB |     404 MiB | no restart, `OOMKilled=false`                                 |
| Full backup of the 10k dataset                   | 9.2 s        |          363 MiB |     556 MiB | archive 27.6 MiB; reads p95 392 ms, writes p50 16 / p95 25 ms |
| Uploaded restore (validate + replace)            | 22.0 + 2.9 s |          516 MiB |     661 MiB | data after restore 130.7 MiB; search results identical        |
| Idle afterwards                                  | —            |          336 MiB |     423 MiB | peak process HWM 400 MiB                                      |

All peaks are far below the ~2 GB upload/backup budget. Reads and writes remained
usable throughout image processing, backup and restore preparation.

## Accessibility and security review

- Automated axe-core WCAG 2.0/2.1/2.2 A/AA (incl. target size) on login, Timeline,
  Drafts, Trash, Tags, Settings, note detail, note dialog, composer with attachment,
  image card, image viewer and backup authorization dialog, in light and dark themes at
  360×800 and 1440×900: **0 violations after two fixes**. Fixed: unlabeled GFM
  task-list checkboxes; `aria-controls` pointing at a non-existent tag-suggestion
  listbox. Also asserted: language/title/one `main` landmark, zoom not disabled, no
  two-dimensional scrolling at 200 %/400 % (640/320 px), reduced-motion removes
  transitions, every Tab stop has a visible focus indicator, dialog focus contained and
  returned to the opener.
- Dependency review: 0 known vulnerabilities; exact pins; install-script warnings from
  npm 11.19 are informational (native modules built and are exercised by the Linux
  tests). Production image: non-root, read-only root, all capabilities dropped,
  `no-new-privileges`, app port unpublished, `.env`/data never in image or git.
- Auth/XSS/restore/data-loss: no unresolved high-severity defect found in this review;
  existing S02–S17 suites (CSRF/origin, fresh-auth grants, rate limits, sanitization,
  malicious archives, kill-point rollback) pass again on Windows and Linux.

## Not performed / explicit limitations (the gate is not fully closed)

1. **No real VPS or public domain**: Let's Encrypt issuance, public-DNS routing, real
   network latency/loss and a genuinely different host were not exercised. The drill used
   two stacks on one machine with Caddy's local CA.
2. **No physical-device, IME, pinch-zoom, or screen-reader (NVDA/VoiceOver/TalkBack)
   audit.** Only automated and scripted checks above.
3. Linux visual baselines for `shell.test.ts` are unreviewed (excluded on Linux).
4. Maximum configured bounds (500 MB files, 100k notes, 64 GB archives) and the
   optional 100k-note stress run were not measured; only the 10k release scale and a 49 MP
   image.
5. Very long single-session timelines grow DOM linearly (see above).
6. Browser-local drafts remain plaintext/evictable and outside backups; archives are
   unencrypted (settled product decisions).
7. Nothing was committed by this session; a release commit/tag and a rerun of the full
   suites on that exact commit are still required before declaring release.
