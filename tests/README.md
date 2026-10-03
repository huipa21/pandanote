# Foundation and shell verification (S00/S01, partial S02 and S03)

S00 tests are capability probes, not completed product features. S01 tests
exercise the actual persistence foundation. Partial S02 tests exercise real
setup, password sessions and private route protection; MFA/fresh-auth and note
endpoints are not yet implemented. All fixtures are synthetic and generated at runtime. No personal data or fixed
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

## Partial S02 coverage (step remains in progress)

| Suite                                | Scope                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/auth-policy.test.ts`           | Bounded exact Unicode credentials, configured HTTPS/loopback origin, exact proxy trust and ignored spoofed headers, same-origin mutation and method-aware public route allowlist (AUTH-05)                                                                                                                                          |
| `integration/auth.test.ts`           | Actual Argon2id salts/verification/concurrency cap; operator token issue/reissue/expiry/reuse, racing setup and transactional failure retry; hashed/expired/revoked/security-revision sessions, configured lifetime/logout; persisted IP/account rate limits and cap; real native-TS operator CLI (AUTH-01, AUTH-04/05 first slice) |
| `integration/runtime-server.test.ts` | Actual production build + two sequential deployments with different runtime origins on one artifact; private routes, cookie flags, both Kit/form and JSON CSRF, durable password restart and Linux graceful shutdown (HTTP transport simulates a TLS-terminating proxy; not an actual HTTPS drill)                                  |
| `integration/auth-http.test.ts`      | JSON-only authentication body, actual streamed byte limits, generic internal error responses and rate-limit retry headers                                                                                                                                                                                                           |
| `e2e/auth.test.ts`                   | Built adapter app setup/login/logout, no plaintext credentials in ordinary DTOs/SSR, private API/file/backup paths, production cookie flags, CSRF failures and input retention on wrong password                                                                                                                                    |

MFA-enabled account rows are tested to **fail closed**. This does not claim
AUTH-02/03 completion. TOTP, recovery codes, fresh-auth scope/expiry, security
changes/revoke-all and operator recovery remain the next S02 slice. The production
cookie flags are tested on Chromium's loopback HTTP Secure-cookie exception;
a real HTTPS deployment/browser drill still belongs to the full S02/S18 gate.
`npm run auth:benchmark` performs five synthetic hash/verify samples, records
10 ms sampled RSS and confirms concurrent rejection without printing credentials.

## S03 coverage (UI-01/02 foundations)

| Suite                            | Scope                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/appearance.test.ts`        | Strict small appearance DTO/SSR attribute substitution; WCAG AA text and 3:1 control/focus contrast measured from actual light/dark CSS tokens                                                                                                                                                                                              |
| `integration/appearance.test.ts` | Real SQLite updates/reopening, appearance-only merge without changing security/storage, invalid/extra-key rejection and maintenance write refusal                                                                                                                                                                                           |
| `e2e/shell.test.ts`              | Built private shell and API auth/CSRF/validation, no-JavaScript dark SSR, preference save/reload/system changes/failure retry; 360/390/768/1440 widths, short screens, drawer/editor/nested-dialog focus/Escape/return, reduced motion, disabled Post, editor content retention, notes-only keyboard scrolling and searchable 200-tag panel |

Three reviewed Windows/Chromium screenshot baselines live in
`e2e/shell.test.ts-snapshots/`; viewport-matrix images are also attached to each
browser result. Regenerate only after visual review with
`npm run test:e2e -- --update-snapshots`, then run normally to verify comparisons.
Native system fonts make these platform-specific: Linux baselines have **not**
been generated/reviewed and Linux browser verification is not claimed.

`browser/ShellFixture.svelte` imports the real shell with 60 synthetic cards and
200 tags through the separate Vite browser harness. It is not a product renderer,
public app route, database seed or completed timeline/tag filtering. The real app
has no seeded notes. Composer text is in-memory only until S05; no recovery/post
completion is claimed. Collapse is preference plumbing, not card functionality.

Keyboard-shrink tests exercise mobile content heights 390/320/260 with nonzero
safe-area insets set through Chromium's `Emulation.setSafeAreaInsetsOverride`.
Controls must fit fully inside the safe area and the textarea must retain at least
one full visible line. A touch-capable mobile context navigates exclusively by taps;
its accessibility-tree snapshot verifies dialog/control names and disabled state.

A separate temporary MV3 test extension calls `chrome.tabs.setZoom(..., 2)` for
**actual native 200% browser zoom**. The test verifies CSS viewport 720x450,
`devicePixelRatio=2` and pinch scale 1 on a 1440x900 browser viewport, then checks
drawer/editor/focus/overflow. The extension/profile are temporary synthetic fixtures,
cleaned on exit and never added to application code or a user's browser. This is
not CSS zoom, pinch zoom or just a viewport-size approximation.

S03's shell gate is complete. Physical phone/OS IME, VoiceOver/NVDA read-aloud and
cross-platform browser audits remain part of the integrated S18 release review,
not claims made by these automated scenarios. No physical-device pass is claimed;
S05/S08 will separately test real draft recovery and working posting.

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
it explicitly migrates storage and issues a disposable operator token before
serving. Its teardown stops the test-owned adapter child before removing `.e2e-data`
(Windows SQLite handles cannot be removed while open). Mermaid runs in a **separate test-only Vite
harness** with response CSP (also hosting the synthetic shell), never a debug route in the production application.
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
- Setup/password sessions are implemented in partial S02, but MFA/fresh-auth and
  security settings/recovery are unfinished. S01 implements validated settings
  persistence only; S03 now adds the appearance subset of the settings UI.
