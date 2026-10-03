# Foundation verification (S00/S01)

S00 tests are capability probes, not completed product features. S01 tests
exercise the actual persistence foundation; authentication and note endpoints
are not implemented yet. All fixtures are synthetic and generated at runtime. No personal data or fixed
production credential is committed.

| Suite                         | Scope / acceptance foundations                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unit/markdown.test.ts`       | remark source-offset feasibility; excluded code/escaped markers/block HTML/destinations; safe GFM; NFKC baseline (TAG-01, MD-01, SEARCH-02 foundations)                              |
| `unit/archive-path.test.ts`   | Portable strict path subset (RESTORE-03 foundation)                                                                                                                                  |
| `integration/sqlite.test.ts`  | Real SQLite WAL/FULL, Drizzle query, online backup including uncheckpointed WAL, FTS5 trigram English/CJK candidates and short/punctuation oracle fallback (SEARCH-01/02 foundation) |
| `integration/images.test.ts`  | Real Sharp orientation/EXIF stripping, WebP/alpha/no upscale, animated GIF/WebP rejection, corrupt/pixel-limit failures (IMAGE-01 foundation)                                        |
| `integration/archive.test.ts` | Real streamed tar.gz on temporary private files; no-write validation, checksums, duplicate/missing/unsafe entries, raw PAX/GNU rejection, byte/count bounds (RESTORE-03 foundation)  |
| `integration/shiki.test.ts`   | Lazy highlighter/resource disposal and escaped code (MD-01 foundation)                                                                                                               |
| `e2e/smoke.test.ts`           | Built adapter-node application, health, mobile overflow, no shipped probe route                                                                                                      |
| `e2e/mermaid.test.ts`         | Actual Chromium SVG, lazy import, flow/sequence/syntax errors, malicious click/SVG suppression and no external fetch under CSP (MD-02 foundation)                                    |

## S01 coverage

| Suite                                    | Scope / acceptance foundations                                                                                                                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/domain.test.ts`                    | UUID/UTC/revision/location/status transitions, strict DTOs and bounded validated settings                                                                                                                                                                              |
| `unit/coordinator.test.ts`               | Async draining, maintenance refusal, timeout/failure release, exclusive-capability expiry and idempotent shutdown                                                                                                                                                      |
| `integration/migrations.test.ts`         | Real fresh/repeated/forward migrations, failed-upgrade/fresh rollback, modified/unknown/newer history rejection, read-only integrity/FKs/index order, empty account/content, settings restart                                                                          |
| `integration/domain-persistence.test.ts` | Single account, SQLite location/status/revision/immutable creation checks, stale revision predicates, ready/FK/shared/Trash references, transactional cleanup/receipt/search/joins, retry mismatch, maintenance-gated settings (NOTE-01/02/03, POST-02/03 foundations) |
| `integration/private-storage.test.ts`    | Production path/symlink/ID checks, random stable/lost/corrupt keys, Linux permissions, bounded durable journals, startup recovery blocking and real repeated migration CLI                                                                                             |
| `integration/server-boundary.test.ts`    | Actual SvelteKit production builds reject direct/indirect client imports of persistence, with inherited test-mode bypass disabled                                                                                                                                      |

`tests/helpers/persistence.ts` is test-only seeding/isolated cleanup; product code
never imports it. Cleanup enqueueing and journal primitives are tested, **not**
full attachment deletion or restore/crash rollback. Linux checks execute POSIX
permission/fsync assertions; Windows uses operator ACLs instead. No existing
schema is pushed or runtime database migration hidden in a page request.

## Run

Use Node from `.node-version` and npm 11. Do not disable TLS verification.

```sh
npm ci
npx playwright install chromium
npm run check
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Unit/integration suites are separate; integration runs serially against isolated
OS temporary SQLite/files/archive paths and removes them in `finally` blocks.
Sharp fixtures are tiny except a generated 2800x1400 resize test; no originals
are written to application storage. Test helpers live in `tests/spikes/`, not
`src/lib`, to avoid mistaking probes for the eventual production implementation.

Playwright owns ports 4173/4174 and refuses to reuse existing servers. It builds
and runs the adapter-node app with a fixture-only `.e2e-data/run-*` directory;
its teardown removes `.e2e-data`. Mermaid runs in a **separate test-only Vite
harness** with response CSP, never a debug route in the production application.
Browser profiles/downloads/traces are not tracked. Linux browser runs need
`npx playwright install --with-deps chromium`.

## Linux native gate

From the repository root with Docker or Podman:

```sh
podman build -f ops/Dockerfile.validation -t pandanote-s01 .
podman run --rm --cpus=2 --memory=4g pandanote-s01
```

Replace `podman` with `docker` if appropriate. This pins the Linux/glibc base
image by digest and installs native dependencies inside the image. It is an
initial validation image, **not production deployment instructions**. S18 will
add a minimal non-root runtime, persistent volume, HTTPS proxy and runbook.

## Probe limitations / later gates

- Search eligibility is deliberately conservative (letters/numbers/spaces and
  at least three codepoints). S10 must implement full all-term/phrase/field,
  randomized-oracle, pagination and benchmark contracts.
- The Markdown rewrite probe establishes source spans, not the complete tag
  grammar. Mixed inline HTML, entity/escape mappings, all URL forms and tag
  history remain S04/S14.
- Image probe is in-memory; streaming input caps, private storage, original
  cleanup, concurrency/deadlines, file detection and authorization remain S06.
- Mermaid permits inline **styles**, not inline script or eval. It disables
  HTML labels and removes active/external SVG constructs. Production policies,
  directive overrides, complexity bounds/timeouts and theme tests remain S04.
- Archive probe requires regular USTAR entries without PAX/GNU extensions:
  `tar-stream` otherwise hides those headers before entry callbacks. A raw
  bounded streaming guard rejects them first. Application-owned short ASCII
  paths fit this subset. S16/S17 must add the real manifest, DB schema/key/file
  validation, second-pass staged extraction and crash-safe replacement. Never
  use this probe alone as a restore feature.
- Authentication helpers are pinned but account/session/MFA behavior remains
  S02. S01 implements validated settings persistence only, not a settings UI.
