# Verification coverage (S00–S18, simplify setup and image optimization)

## Current editor/year-calendar change

Old draft/recovery cases described later are superseded. Browser draft storage
modules and their tests are removed, not skipped. `unit/editor-session.test.ts`
covers session fingerprints, full snapshot checks and AST image remove/remapping.
Posting protocol retains only memory-held frozen attempts and receipt-first retries.
Calendar integration verifies full year/month equivalence, leap/DST, bounds/revocation.

`e2e/editor-session`, `posting`, `detail`, `storage`, `status-notes`,
`tag-management` exercise memory-only writing, browser Leave/Stay, Post/Discard/Cancel,
lost responses, remapped retries, optimistic races, media/date and Trash.
`calendar` covers 12 miniature monthly heatmaps in 4 × 3 with whole-tile navigation.
Shell screenshots seed real current-month notes for dataset-independent geometry;
no extra masks/relaxed assertions. SS01/S18/manual/exact-release limits stay open.

Current contracts: browser two-step setup, username login, complete en/zh-CN UI and site title,
automatic startup SQL/data migrations and private pre-upgrade DB copy, format-v2
archives and live-safe interactive reset. [Change progress](../docs/simplify-setup/PROGRESS.md)
records actual commands/blockers; expected coverage below is not a pass claim.

S00 tests are capability probes, not completed product features. S01 tests
exercise the actual persistence foundation. S02 tests exercise real setup,
password/MFA sessions, recovery codes, fresh-auth/security changes, operator recovery
and private route protection. S07 exercises real note mutation/lifecycle endpoints.
All fixtures are synthetic and generated at runtime. No personal data or fixed
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

## Image packaging coverage (IMG-SIZE/DEP/NATIVE/PKG/RUN/UI/DATA/XFER)

- `integration/image-size.test.ts`: read-only streaming Docker tar/gzip, alias
  deduplication and explicit multi-image/overlap accounting, bounded metadata,
  checksum/truncation/unsupported-format/corrupt-gzip refusal, exclusive report
  output. Docker containerd gzip/zstd layer blobs are distinguished from decoded
  tar payload; actual engine exports are also measured in the image handoff.
- `unit/runtime-dependencies.test.ts`: exact allowed roots/versions/reasons, explicit
  Svelte runtime peer, absent scripts/dev/workspaces, engine/override/integrity and
  stale-lock rejection. `runtime:check` is read-only and a build prerequisite.
- `ops/Dockerfile.native-probe` + `release/native-probe.ts`: fresh minimized musl
  install and genuine SQLite source rebuild; WAL/FULL/FK/transaction/trigram/CJK/
  backup, configured Argon2, static Sharp formats/orientation/animation/limit/deferred
  subprocesses, shared-library resolution, CA/DST, real privilege drop/native TS/execve.
- `ops/Dockerfile.alpine-validation`: complete common/native/Git/PTY/fsync/archive/
  process-kill suite without platform exclusions. Debian browser-validation remains
  supported nonvisual coverage, not musl-native proof or approved Linux snapshots.
- `release/image.test.ts` + `image-probe.ts`: externally supplied final production
  inventory/native/worker/deferred grammar/ESM/licenses/WASM/precompression/identity,
  missing-module negative control, live PTY session/MFA reset and stopped reindex.
- `release/content.test.ts`: built Alpine SSR/browser initially unloaded grammar,
  lazy Mermaid and hostile-policy isolation after the two-domain TLS drill.
- Existing `release/deployment.test.ts`/`large-restore.ts`/drill/benchmark cover real
  default/non-default IDs/private modes/zero capabilities/readiness/shutdown/XFF,
  SQL/data migration/copy/rollback, interruption, two-domain archived auth/private
  files and >1 GiB TLS restore under unchanged root Compose/minimal Caddy.
- Actual two-engine build/save/gzip/fresh-Docker-load/namespace retag/native/default
  Compose/corrupt safety is required in addition to unit tests. Matched sizes and
  exact commands/results/remaining manual/ARM64/release limits:
  [image progress](../docs/image-optimization/PROGRESS.md). Runbook and external-image
  command details: [release README](release/README.md).

## SS01 migration baseline/core (common gates pass / directory clarification open)

- `integration/data-migrations.test.ts`: real SQL-before-data registry execution,
  fixed timestamp/ledger identity, repeat no-op, changed step/hash/downgrade/
  pre-release refusal, all-pending SQL/data/FK rollback and no cause/content leaks.
- `integration/pre-upgrade.test.ts`: fresh/no-op skip, WAL-consistent old-schema
  snapshot, manifest/replacement/key preservation, injected low-space budget,
  actual shared-startup upgrade/low-space safe log, Linux modes, malformed/unsafe
  staging refusal, four actual process kills across durable rotation boundaries.
- `integration/build-metadata.test.ts`: actual adapter-generated immutable startup
  identity agrees with embedded SSR identity. `integration/search-migration.test.ts`
  verifies baseline v1→v2 SQL/data backfill and isolated staging with live state intact.
  Fixtures use the generated two-file baseline; username/email are required and the
  setup-token table is absent.
- MIG-01–07 core tests pass, including actual fresh startup (SS02) and staged
  archive SQL/data migration (SS05). SS03 uses real account creation; SS05 clears
  the former archive integration failures without skipping/removing safety cases.
  Directory replacement is recoverable rotation, not a portable single atomic
  exchange; see `docs/simplify-setup/PROGRESS.md`.

## SS02 startup/environment/proxy coverage (implemented / common gates pass)

- `integration/startup.test.ts`: shared fresh/repeat/default-data initialization,
  known-v1 data-step rollback/upgrade and pre-upgrade copy, actual adapter-node
  and Vite dev starts, local origins, safe missing-production-origin/corrupt-key
  refusal before listen, scrubbed legacy values and durable restart.
- `integration/container-bootstrap.test.ts`: token-free empty initialization,
  no account seeding, preserved settings/keys, restore recovery ordering;
  Linux root filesystem/drop-capability tests plus maintenance ownership refusal
  and no child traversal/chown. These root cases explicitly skip on Windows.
- `unit/auth-policy.test.ts`: local origin defaults/production validation and
  forwarding override prohibition; private/public IPv4/IPv6/mapped-v4 range edges,
  missing/empty/invalid/chain XFF, public spoof ignoring, unchanged CSRF/allowlist.
- `unit/container-user.test.ts`: only default server and argument-free named tools,
  bounded positive non-root IDs. `integration/runtime-server.test.ts` fresh-health
  case tests automatic startup; SS03 integrates its account/preferences HTTP flow.
- Standard Playwright fixtures start empty via automatic initialization and real
  account/preferences endpoints. SS05 resolves archive integration failures and
  tests functional reset-password; none of those former failures are excluded.
- Linux production-image/minimal-Caddy/browser/rate-key evidence and exact commands
  are in the change handoff; that diagnostic probe is not the ordinary e2e suite.

## SS03 accounts/setup/login coverage (implemented / common gates pass)

- `unit/setup.test.ts`: identity/password/codepoint/confirmation/preferences boundaries,
  exact language registry/browser defaults and every setup routing cell.
- `integration/auth.test.ts`: real Argon2/SQLite, two-connection account race, window
  and hash-time expiry/restart, session/preferences rollback, generic username/password
  timing, stale-username/revision login, session bounds/expiry/restart, exact fresh scope,
  retained sessions, eight-character password change and persistent bounded abuse limits.
- `integration/setup-server.test.ts`: actual built server, child-only injected clock,
  expired page/API/restart, every page/API/file state, direct validation/confirmation,
  setup and login limits, race/CSRF/private headers and post-completion setup refusal.
- `integration/auth-mfa.test.ts`: existing full MFA/challenge/recovery/security suite
  uses real account creation; account-update requires the enabled factor and one-use grant.
- `e2e/auth.test.ts`: full first-run/resume/new-device/mobile/keyboard/field retention,
  default language/timezone, production cookies/CSRF, unchanged MFA/security interactions,
  account editor/new username/no session revocation. Both setup screens pass axe at
  390/1440 light/dark. Fixture launcher has no token/CLI initialization or seeded hash;
  cached synthetic sessions are always issued through real setup/login.
- SET-01–09/ACC-01–05 pass on Windows and Linux. SS04 covers language/title rendering;
  SS05 integrates format-v2 archives/interactive reset and clears former archive
  failures. Exact commands/native-image results: simplify-setup PROGRESS.

## SS05 backup/restore and maintenance coverage (BAK-01–03, OPS-01–03, MIG-07)

- `unit/backups.test.ts`: strict format-v2 manifests/path/byte/scope bounds; rejects
  format 1/unknown versions and arbitrary extra fields.
- `integration/backups.test.ts`: existing real WAL/SQLite/file/key/MFA/concurrency/
  streamed-upload/disk-full/crash/archive-attack tests now assert format/schema 2,
  account username/email, absence of the removed table, excluded pre-upgrade bytes.
- `integration/restores.test.ts`: independent source/destination with non-default
  archived username/email/title/language/timezone, portable MFA/keys/files/receipts,
  completed setup and revoked sessions; destination archives/copy untouched. Format
  1 explicitly refused before extraction; known baseline v1 migrates on staging
  with registered data-step identity and rebuilt FTS before confirmation. Every
  original schema/image/path/checksum/injected-failure/process-kill case remains.
- `integration/auth-mfa.test.ts`: second-connection live reset, final-delete fault
  proving full rollback, uncached credential/revision checks, MFA/grant/session erasure.
- `integration/reset-password.test.ts` + `helpers/terminal.ts`: no-TTY/argv/pipes
  refuse on all hosts; Linux util-linux `script` supplies a genuine pseudo-TTY (no
  runtime PTY dependency). No-echo Unicode/eight-character/max-bound/backspace,
  mismatch retries, cancellation, no-account/setup URL, pending/new restore journal
  refusal and actual built HTTP old-session/challenge rejection/new-password login
  without restart. PTY cases explicitly skip on Windows and must actually pass on Linux.
- `e2e/zzrestore.test.ts`: downloaded archive uploaded/confirmed in Settings restores
  zh-CN/title/timezone/account metadata, returns to archived username/password login,
  retains destination archives; real auth/CSRF/invalid uploads.
  Synthetic per-suite client buckets keep production abuse limits unchanged.
- No CLI starts migrations/recovery. Existing stopped-app reindex regression still
  proves notes/revisions unchanged; production Docker COPY already ships named
  reset/reindex scripts plus the server-only terminal module.

## Commit-derived versioning coverage (VER-01–08)

- `unit/build-info.test.ts`: strict public metadata, UTC date, positive daily sequence,
  complete hash/time, development defaults, partial/invalid production failure and
  restricted image-build arguments.
- `integration/release-version.test.ts`: actual temporary Git commits/branches/merge,
  author-versus-committer date, UTC midnight, backward clocks, daily reset/multi-digit
  counts, detached old hash/later descendants, repeated host-timezone independence,
  staged/unstaged/untracked/shallow/missing failures and ignored-file exclusion.
  An injected engine boundary inspects the real committed tar and exact build args;
  dirty CLI rejection and error propagation are exercised without mocking Git.
- `integration/build-metadata.test.ts`: actual production metadata-validation CLI
  and isolated adapter-node build/server: release SSR keeps its embedded identity
  despite spoofed runtime environment values.
- `e2e/version.test.ts`: actual app desktop sidebar/mobile drawer, Settings About,
  full hash/time for release builds, explicit Development otherwise, no-JS SSR and
  mobile wrapping. Run with all three `PANDANOTE_*` build variables to test a
  synthetic release build; normal full suite tests Development. Existing axe,
  short-screen/zoom/theme/focus and visual tests remain regression gates.
- Linux validation images install Git **as test tooling** for the temporary-history
  tests. The production image still has no Git/history. Actual clean synthetic
  snapshot image validation is recorded in PROGRESS, not claimed as a release commit.

## S17 coverage (RESTORE-01–04, AUTH-04/05, BACKUP-01/02)

- `integration/restores.test.ts`: independent real SQLite/filesystem/account
  replacement with published/server-draft/Trash, tags/date, processed
  images/unchanged files, settings, password/MFA/recovery/portable keys and included
  receipts. Both old source/destination credentials fail; restored MFA login works,
  source-derived search is rebuilt and unrelated destination archives/catalog remain.
  Known baseline-v1 SQL/data migration, unexpected views/triggers/virtual modules/altered schema,
  newer version, altered FTS configuration/oversized shadow cells, bad counts/keys/
  password/settings/tag references, checksum-consistent
  corrupted WebP bitstreams/missing variants, wrong grants,
  disk-full and unconfirmed/discard checks preserve live state. Nine injected-error
  boundaries and ten real killed-child boundaries assert coherent DB/files/keys,
  rollback usability, durable commit behavior, idempotent startup recovery and archive
  preservation (including differing old/new keys and old-only file bytes).
- `e2e/zzrestore.test.ts`: actual manual create/native browser download, uploaded
  file/progress/validated summary/reload, explicit fresh destructive confirmation,
  return to Login, invalidated old sessions, archived note revision/source, preserved
  browser recovery and destination backups. Auth/CSRF/fresh-scope/invalid-archive and
  mobile dialog/overflow checks use production routes, never mock successful restore.
  Runs after other feature suites because successful restore revokes their sessions.
- The S16 format tests still exercise checksum/truncation/traversal/duplicate/link/
  device/PAX/GNU/size/expansion defenses used by uploaded restores. Linux runs actual
  native Sharp/SQLite and all process-kill/rename/fsync recovery cases. Windows has
  no directory-fsync guarantee; runtime data and archives remain ignored/private.
- See `ops/RESTORE_RUNBOOK.md` for recovery procedures and explicit bounds. Real
  independent-domain deployment/performance/maximum-bound drill remains S18.

## S16 coverage (BACKUP-01/02, AUTH-04/05, FILE-01)

- `unit/backups.test.ts`: strict manifest scope/version/path/count/size/duplicate
  contracts, confirmed commands and bounded unique native download-form fields.
- `integration/backups.test.ts`: actual WAL snapshot/SQLite integrity/FKs, referenced
  files across published/server-draft/Trash, retained note/tag receipts/history,
  excluded runtime/upload/search/catalog data, byte-identical protected download,
  wrong/reused scopes, revoked sessions, create retry, confirmed deletion and archive
  non-nesting. Copy and hardlink capture survive live last-reference deletion;
  actual streamed uploads drain, new mutations fail, reads remain available.
  Portable encrypted MFA/recovery state decrypts with archived keys; real Sharp
  variants match and originals are absent. Space/timeout/finalization/security-race
  failures preserve live data. A real child is killed after archive verification;
  restart fails its job/cleans artifacts and retains the usable live DB. The product
  no-write verifier rejects truncation/checksum/path/duplicate/PAX/GNU/link/device
  inputs; this does not claim S17 extraction/DB trust/restore/rollback.
- `e2e/backups.test.ts`: built Settings fresh-password failures/create/status,
  actual browser native POST download with exact server bytes, anonymous/ordinary/
  GET/cross-origin rejection, explicit deletion, lost-create-
  response/reload identity discovery, and mobile dialog/overflow. No mock success.
- `npm run backups:benchmark`: isolated synthetic 10k multilingual notes in all
  statuses plus 32 MiB incompressible file; hardlink and forced-copy timing, sampled
  logical/unique disk bytes, parent RSS/worker maxRSS and ongoing read/write probes.
  No deployment content/credentials are read or logged. Actual results in PROGRESS.

## S15 coverage (FILE-01, AUTH-04/05, UI-01/02/03)

- `unit/storage.test.ts`: strict settings bounds and activity-bound cleanup
  confirmation/ID/duplicate/path-injection rejection.
- `integration/storage.test.ts`: actual SQLite/settings merges, native Sharp outputs
  at configured edges/qualities, server byte/pixel limits, session revocation,
  distinct shared/Trash/pending bytes and private filesystem measurements. Explicit
  cleanup confirmation/quiet interval/activity/references, active streamed upload,
  all-or-none stale selection, queue-fault rollback, exact retry and real persistence
  restart after worker-admission failure. Files/integrity/FKs are actually inspected.
- `e2e/storage.test.ts`: protected recent uploads, confirmed quiet cleanup and
  actual private-byte deletion. Synthetic timestamps are aged for eligibility;
  uploads, measurement and deletion use real application endpoints/files.
- The complete security, drafts/posting/conflict/tag/search/calendar suites remain
  regression gates. Short keyboard/safe-area controls and a complete visible text
  line remain required with the new toolbar action; reviewed screenshots do not
  replace geometry assertions. Linux browser scope now includes S15. Physical
  device UX, IME/read-aloud, Linux shell baselines and real-VPS/full-restore
  release audits remain S18, not falsely claimed by browser overrides.

## S14 coverage (TAG-01/02/03, NOTE-03, SEARCH-03, DRAFT-02, UI-02/03)

- `unit/tag-management.test.ts`: chronological rename/merge/removal chains, cycles,
  case-only identity, generation-bound recreation, simultaneous exact CRLF source
  spans and backward-compatible/digest-bound note acknowledgements.
- `integration/tag-management.test.ts`: actual coordinated SQLite source rewrites
  across every status; version/edited-time/search/FTS/join/count consistency; case,
  merge collision/deduplication, removal/recreation, two-connection preview conflicts,
  receipt-first retry across reopen/later deletion, final-receipt injected rollback,
  session revocation, inventory/normalized/source-size bounds and integrity/FKs.
- `e2e/tag-management.test.ts`: actual management previews/confirmations on desktop
  and touch mobile, private/CSRF/transport boundaries, Back/filter invalidation,
  lost-response durable exact retry, local preflight before uploads, chain choices,
  recreation after reload, frozen-copy file retention/ID remapping, keyboard/touch
  autocomplete/excluded code and concurrent server editor conflict.
- Posting regression now expects stale-tag and expired-session rejection before a
  new frozen attempt/upload rather than the obsolete S08 fail-closed placeholder.
  Full existing posting/draft/detail/lifecycle/calendar/search tests remain real
  production-server regressions. Linux browser scope includes the tag tests.

## S13 coverage (DRAFT-02/05, NOTE-02/03/04, SEARCH-03, CAL-01, UI-02/03)

- `unit/status-notes.test.ts`: explicit status/query bounds, uniqueness, Unicode
  excerpts and image/file fallbacks without persisted titles or trusted HTML.
- `integration/status-notes.test.ts`: real SQLite timestamp-tie pagination/status
  binding/source/payload bounds, native image/file-only labels, prior published/
  draft restore with complete dates/attachments, published search/tag/calendar
  exclusion, malformed cursor/query and revoked-session denial, integrity/FKs.
- `e2e/status-notes.test.ts`: real private SSR/no-JS/anonymous access; local/server
  overlays; cross-device saved-version isolation; reload/new-file no-upload boundary;
  explicit Post with retained dates/server references; both Trash restores,
  mobile full detail and irreversible confirmation; downloaded unchanged files.
  Lost-response permanent deletion reloads and retries the identical receipt command
  after the note disappears. Stale lifecycle conflicts preserve local recovery;
  quota failure sends no mutation. Multiple losing copies remain distinguishable
  and the matching active recovery is preferred. Paging failure/retry deduplicates
  and retains older rows after mutation; timeline Back cannot revive a known draft,
  and global day counts/search update immediately.
- Card/detail/list actions share durable browser lifecycle state; existing calendar/
  timeline/detail/posting regression suites remain real-server tests. Posting's old
  Resume selector is scoped to local rows now that server rows also offer Resume.
  Screenshots cover Drafts desktop and Trash mobile confirmation. Linux scope includes
  all S13 tests; physical-device/assistive-technology/full-backup gates remain later.

## S12 coverage (NOTE-03/04, IMAGE-02, DRAFT-04/05, UI-02/03)

- `unit/drafts.test.ts`: full-snapshot recovery metadata/base identity, published
  versus server-draft kinds, rejection of Trash/incomplete descriptors, separate
  conflict forks with preserved original bytes, parsed local-image ID remapping,
  reusable server references and newly observed replacement revision.
- `e2e/detail.test.ts`: actual private SSR/direct/no-JavaScript/refresh, safe 404 and
  auth redirect, full content beyond card bounds, shallow Back/Forward/Escape with
  exact filters/scroll/opener return, failed/late GET retry and cancellation. Actual
  local published/server-draft edit entry, no premature upload/autosave, reload
  recovery, unchanged dates/creation, explicit Save changes and Post.
- Two independent browser contexts exercise losing-file retention (exact IndexedDB
  and downloaded bytes), publish separate with shared server images, load current
  server while keeping original recovery, explicit replace and a third-edit race
  that must conflict again. All uploads/mutations use real SQLite/files/Sharp APIs.
- Viewer tests verify selected-only larger WebP requests, keyboard image entry,
  navigation, zoom/pan, processed-WebP download, nested Escape/focus, full-screen
  mobile geometry, real CDP touch swipe and no horizontal overflow. Mobile editing
  checks focused full-screen entry, short-keyboard controls, safe Escape/file
  retention and explicit Save changes. Physical device/IME, pinch and read-aloud
  release review are not claimed by controlled Chromium gestures.
- Existing posting conflict assertions now target the actual comparison dialog.
  History fixtures are backdated to avoid changing other suites' loaded-range
  assumptions; large preview pages still obey the 192 KiB budget.

## S11 coverage (CAL-01–04, SEARCH-03, UI-02/03)

- `unit/calendar.test.ts`: leap/week/six-row grids, year shifts, literal date/month
  URL validation, IANA versus fixed offsets, DST 23/25-hour and midnight-skipped
  boundaries, Hong Kong/Tokyo/year grouping, navigation/filter semantics and
  bounded 20-year selector windows at 1969/9998.
- `integration/calendar.test.ts`: real global counts/status/date/republish/restore
  updates, epoch-zero notes grouped into December 1969 in western zones, selected-day
  cursor locks, changed-zone/cross-month rejection, sparse
  manual empty month/older resume/all-date search, strict session-rechecked settings
  merge and a counts-only dense 10k-month warm latency measurement.
- `e2e/calendar.test.ts`: SSR without JavaScript, global counts despite filters,
  day toggle/chip/locked bottom paging, arrows/picker/Today/empty-month explicit
  resume, Back ID/offset/calendar restoration, tall/Mermaid/year crossings without
  scroll reset or history spam, held stale/error/retried counts, explicit timezone
  detection/save/error retention and a browser in a different zone, private/CSRF
  gates, lifecycle invalidation, posting from Drafts and delayed-image anchoring,
  mobile drawer controls. Monthly date heat tiles, bold heading, 4 × 3 picker
  geometry, one-year/window arrows, scroll/focus/direct-year limits, immediate
  selection/filter retention and nested mobile picker layout are also verified.
  `e2e/zzzaccessibility.test.ts` scans month/quick-year dialogs in light/dark at
  phone/desktop sizes. Fixtures use actual note/upload APIs, not mock successes.
- `unit/appearance.test.ts` checks actual calendar numeral/background AA contrast
  in both themes. Shell screenshots mask variable calendar dates/counts as well as
  the existing notes-pane mask; fixed-month unmasked desktop/mobile calendar images
  are attached/reviewed separately. Existing layout/focus/overflow assertions remain.

## S01 coverage

| Suite                                    | Scope / acceptance foundations                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/domain.test.ts`                    | UUID/UTC/revision/status transitions, strict DTOs and bounded validated settings                                                                                                                                                                              |
| `unit/coordinator.test.ts`               | Async draining, maintenance refusal, timeout/failure release, exclusive-capability expiry and idempotent shutdown                                                                                                                                             |
| `integration/migrations.test.ts`         | Real fresh/repeated/forward migrations, failed-upgrade/fresh rollback, modified/unknown/newer history rejection, read-only integrity/FKs/index order, empty account/content, settings restart                                                                 |
| `integration/domain-persistence.test.ts` | Single account, SQLite status/revision/immutable creation checks, stale revision predicates, ready/FK/shared/Trash references, transactional cleanup/receipt/search/joins, retry mismatch, maintenance-gated settings (NOTE-01/02/03, POST-02/03 foundations) |
| `integration/private-storage.test.ts`    | Production path/symlink/ID checks, random stable/lost/corrupt keys, Linux permissions, bounded durable journals, startup recovery blocking and real repeated shared startup                                                                                   |
| `integration/server-boundary.test.ts`    | Actual SvelteKit production builds reject direct/indirect client imports of persistence, with inherited test-mode bypass disabled                                                                                                                             |

`tests/helpers/persistence.ts` is test-only seeding/isolated cleanup; product code
never imports it. S06 adds real queued attachment-byte cleanup; S07 covers note
lifecycle. S17's separate restore suite covers full archive replacement/crash
rollback; foundation tests alone do not. Linux checks execute POSIX
permission/fsync assertions; Windows uses operator ACLs instead. No existing
schema is pushed or runtime database migration hidden in a page request.

## S02 coverage (AUTH-01–05)

| Suite                                | Scope                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/auth-policy.test.ts`           | Bounded exact Unicode credentials, configured/default HTTPS/loopback origin, private-network proxy trust and ignored public-peer spoofed headers, same-origin mutation and method-aware public route allowlist (AUTH-05)                                                                           |
| `integration/auth.test.ts`           | Actual Argon2id salts/bounds; account race/setup-window expiry/restart/transaction retry; username equal-work login; hashed/expired/revoked/security-revision sessions/lifetime/logout; persistent IP/account limits; fresh account editing (AUTH-01, AUTH-04/05)                                  |
| `integration/runtime-server.test.ts` | Actual production build + two sequential deployments with different runtime origins on one artifact; private routes, cookie flags, both Kit/form and JSON CSRF, durable password restart and Linux graceful shutdown (HTTP transport simulates a TLS-terminating proxy; not an actual HTTPS drill) |
| `integration/auth-http.test.ts`      | JSON-only authentication body, actual streamed byte limits, generic internal error responses and rate-limit retry headers                                                                                                                                                                          |
| `e2e/auth.test.ts`                   | Built adapter app setup/login/logout, no plaintext credentials in ordinary DTOs/SSR, private API/file/backup paths, production cookie flags, CSRF failures and input retention on wrong password                                                                                                   |

`integration/auth-mfa.test.ts` adds real encrypted enrollment/confirmation, expiry/
cancellation/session binding, drift/replay, parallel TOTP/recovery consumption on two
SQLite connections, restart/rollback retry, ten hashed generation-only codes,
regeneration/secret change, single-use exact fresh scopes/session/revision/expiry,
password races, security revocation, lifetime changes and live atomic operator
reset (interactive CLI/PTY covered separately). `unit/auth-factors.test.ts` covers RFC 6238 vectors and strict request
schemas. AUTH-02/03/04 are implemented and tested, not fail-closed placeholders.

`e2e/auth.test.ts` also exercises the full security UI on a separate built deployment
behind a generated-cert HTTPS proxy: real TLS and Secure/HttpOnly/Strict cookies,
local QR, confirmation failure/retry, recovery file download and generation-only
display, password→MFA login, unauthorized pending access, replay, fresh scope failure,
recovery regeneration, password/authenticator change, MFA disable, session lifetime
and revoke-all. Test contexts trust only the synthetic self-signed certificate.
OpenSSL is required to generate it; no private TLS key is tracked. The second fixture
keeps actual persistent rate limits enabled without consuming other suites' budgets.
Target-VPS load and real-domain deployment/certificate audits remain S18.
`npm run auth:benchmark` performs five synthetic hash/verify samples, records
10 ms sampled RSS and confirms concurrent rejection without printing credentials.

## S03 coverage (UI-01/02 foundations)

| Suite                            | Scope                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/appearance.test.ts`        | Strict small appearance DTO/SSR attribute substitution; WCAG AA text and 3:1 control/focus contrast measured from actual light/dark CSS tokens                                                                                                                                                                                                                                                                                  |
| `integration/appearance.test.ts` | Real SQLite updates/reopening, appearance-only merge without changing security/storage, invalid/extra-key rejection and maintenance write refusal                                                                                                                                                                                                                                                                               |
| `e2e/shell.test.ts`              | Built private shell and API auth/CSRF/validation, no-JavaScript dark SSR, preference save/reload/system changes/failure retry; 360/390/768/1440 widths, short screens, drawer/editor/nested-dialog focus/Escape/return, reduced motion, explicit-only Post, editor retention, homepage composer/note scrolling and bottom Back to Top, pointer-captured/keyboard sidebar resizing and viewport bounds, searchable 200-tag panel |

Three reviewed Windows/Chromium screenshot baselines live in
`e2e/shell.test.ts-snapshots/`; viewport-matrix images are also attached to each
browser result. Regenerate only after visual review with
`npm run test:e2e -- --update-snapshots`, then run normally to verify comparisons.
Native system fonts make these platform-specific: Linux baselines have **not**
been generated/reviewed. Linux nonvisual browser gates are recorded in PROGRESS;
missing Linux snapshots are not counted as passed.

`browser/ShellFixture.svelte` imports the real shell with 60 synthetic cards and
200 tags through the separate Vite browser harness. It is not a product renderer,
public app route, database seed or completed timeline/tag filtering. The real app
has no seeded notes. The synthetic shell fixture intentionally has no account or
storage workspace; its composer stays in memory. The built authenticated app uses
S05 recovery storage and S08 posting. The real timeline exercises collapse/full
cards separately; fixture-only in-memory text is not falsely called persisted work.

Keyboard-shrink tests exercise mobile content heights 390/320/260 with nonzero
safe-area insets set through Chromium's `Emulation.setSafeAreaInsetsOverride`.
Controls must fit fully inside the safe area and the textarea must retain at least
one full visible line. A touch-capable mobile context navigates exclusively by taps;
its accessibility-tree snapshot verifies dialog/control names and Post state (enabled for valid content since S08).

A separate temporary MV3 test extension calls `chrome.tabs.setZoom(..., 2)` for
**actual native 200% browser zoom**. The test verifies CSS viewport 720x450,
`devicePixelRatio=2` and pinch scale 1 on a 1440x900 browser viewport, then checks
drawer/editor/focus/overflow. The extension/profile are temporary synthetic fixtures,
cleaned on exit and never added to application code or a user's browser. This is
not CSS zoom, pinch zoom or just a viewport-size approximation.

S03's shell gate is complete. Physical phone/OS IME, VoiceOver/NVDA read-aloud and
cross-platform browser audits remain part of the integrated S18 release review,
not claims made by these automated scenarios. No physical-device pass is claimed;
S05/S08 separately test real draft recovery and working posting.

## S04 coverage (MD-01/02, TAG-01 and TAG-03 parsing foundations)

| Suite                                 | Scope                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/tags.test.ts`                   | Unicode/NFKC/case/deduplication, literal source offsets/UTF-16/CRLF, excluded code/HTML/escapes/URLs/destinations, precise rename/remove and length/count limits                                                                                                                                                                                                                                                  |
| `unit/diagram-policy.test.ts`         | Ordinary flow/sequence arrows, pre-import directive/encoded-HTML/asset/CSS rejection and complexity limits                                                                                                                                                                                                                                                                                                        |
| `integration/markdown-render.test.ts` | Actual production remark/rehype/Shiki, GFM, sanitized HTML/links/images, descriptor-backed direct/reference-style images, nested/reordered footnote code, unknown language and inert Mermaid metadata                                                                                                                                                                                                             |
| `e2e/markdown.test.ts`                | Built private composer under production CSP with zero upload/mutation requests; exact clipboard write plus native clipboard round trip; real highlighted code and flow/sequence SVG geometry/theme, visible-only import, stale preview suppression, hostile asset no-fetch, separate SVG sanitizer, size/syntax errors, deadline/denied-copy recovery, desktop/mobile Preview switch without premature publishing |

`browser/MarkdownFixture.svelte` reuses the product renderer and SVG sanitizer, not
spike implementations. Its stalled-render injection exercises only the timeout
branch; ordinary diagram tests run the unmodified library. No debug/fault-injection
route ships in the built application. Clipboard denial and Windows-native newline
conversion are tested explicitly. Rendering/tag management are separate: the parser
is complete; transactional note tag joins are S07 and management/history is S14.

## S05 coverage (DRAFT-01–04, POST-01 pre-posting boundary)

- `unit/drafts.test.ts`: strict schema/version/account identity and UTF-8 limits,
  independent metadata, authoritative-record/index rebuilding, preserved corrupt/
  unknown records, lock-held revision races, blob-first quota/orphan consistency,
  missing/wrong-size bytes, safe discard/tombstones and cleanup retry, conflict-copy
  bytes, server recovery revision/snapshot checks and precise image-span removal.
  Memory adapters test failure paths only; browser tests below use actual storage.
- `e2e/drafts.test.ts`: actual built private app, localStorage + IndexedDB under CSP,
  two independent image/file drafts, exact bytes on reload and full Chromium process
  restart, confirmed scoped discard, file picker/paste/drop, zero premature mutation
  requests, Enter/Ctrl/Cmd+Enter without publication (Post enabled since S08), URL revocation, text/blob quotas,
  actual transaction abort after request success, persistence denial, missing-file
  repair/removal, two-tab conflicts/separate-copy/tombstone safety (including a
  losing edit with evicted files kept as repairable text), signout/relogin,
  account/unsupported-schema preservation and unsupported Web Locks warnings.
  Mobile tests use the real file chooser and a 260px keyboard-shrunken viewport.
- Test sessions are real server-issued credentials reused across isolated draft
  test browser contexts. Revoked credentials are reauthenticated. Production rate
  limits remain unchanged; the expanded suite must not spend a new login per draft
  scenario and exhaust the legitimate ten-attempt/IP window.

Metadata/recovery capabilities are tested here; S08/S12/S15 suites cover date/base
rechecking, full server recovery entry. No upload/note endpoint is
simulated as completed posting, and no test-only draft route ships. Physical device/IME,
full assistive technology and cross-platform shell baselines remain S18.

## S06 coverage (IMAGE-01, FILE-01, AUTH-05, POST-02 upload boundary)

- `unit/attachments.test.ts`: strict manifest/filename/checksum/ID bounds, disk
  reservation accounting, queue overload/deadline/recovery, expiring async-write
  leases that can finish while exclusive maintenance drains.
- `integration/attachments.test.ts`: product services with real SQLite/private files
  and native Sharp subprocesses, frozen manifest/receipt-first resume, exact variant
  checksums/orientation/metadata/alpha/no upscale/static GIF, animated GIF/WebP/APNG,
  corrupt/pixel/streamed-byte/MIME failures, failed SQLite commit rollback/retry,
  unchanged active-file download headers, identity/revocation checks, receive bound
  and native concurrency=1, hard killed-worker/receive deadlines, disk reserve,
  restart temporary/crash-output cleanup, preserved ready retries and last-reference
  deletion with cloned/Trash references and interrupted durable cleanup jobs.
- `e2e/uploads.test.ts`: built authenticated routes, same-origin and anonymous
  gates, retry/mismatch/readiness, actual processed image bytes, HEAD/variant checks,
  browser download of hostile HTML without execution, Unicode download names,
  zero-byte files and a >512 KiB file proving the transport configuration, and
  unchanged no-upload-before-Post local selection. The Linux browser image sets
  `LANG/LC_ALL=C.UTF-8`; an ASCII locale makes Chromium fall back to “download”
  despite a valid UTF-8 response header. The upload test runs after first-account
  setup (`uploads.test.ts`), preserving the real auth test's empty-deployment gate.
  Delayed actual entry modules assert initial compose/file controls cannot swallow
  a pre-hydration action; route teardown waits for held handlers to finish.
- `tests/helpers/images.ts` creates a genuine two-frame APNG with valid CRC/deflate
  payloads; no real photos are fixtures.
- `npm run images:benchmark` measures the production worker with three synthetic
  jobs, 50 MP orientation plus 20 MP high-entropy JPEG, sampled parent/peak worker
  RSS and timings. The Linux 2-CPU/4-GB image and actual values are in PROGRESS.

S07 integrates these primitives with real note commits; S08 covers posting,
S12 the full viewer, S15 unused-attempt cleanup/inventory.
Sharp subprocesses avoid cached private open-file handles and provide a hard
wall-clock deadline, not a fake Promise timeout over still-running native work.

## S07 coverage (POST-02/03, NOTE-01–03, FILE-01, AUTH-05)

- `unit/notes.test.ts`: strict commands/confirmation/revision/UTF-8 limits,
  versioned canonical digest input including action/target/revision/file order,
  actual AST image/reference checks (not code), normalized tag-expansion bound,
  streamed JSON cap and safe internal-error responses.
- `integration/notes.test.ts`: real coordinator/SQLite/private files and Sharp,
  lost-response and concurrent two-connection creates, receipt replay after edits,
  settings changes and deletion, mismatch binding, body/tags/search/join/receipt
  atomicity with failure injection at the final receipt write, file/batch readiness,
  committed batch receipt-first resume, zero-byte file-only and image-only notes,
  missing physical bytes, file-as-image rejection, omitted manifest item and limits,
  immutable dates/meaningful edited indicator, both draft/published Trash
  restores, full two-connection 409 snapshots and stale lifecycle/replace races,
  clone/Trash reference reuse and last-reference cleanup, deletion rollback,
  read-only integrity/FK inspection, revocation/maintenance and restart recovery.
- `integration/runtime-server.test.ts`: one actual production build at two runtime
  origins; real GET/create/update/publish/draft/trash/restore/permanent-delete HTTP
  endpoints, expected revisions/409 snapshots, lost-response receipt retry across
  app restart, path/command binding, anonymous/CSRF/no-store gates and no private
  content in logs. Existing password/cookie/Kit form-CSRF/graceful shutdown checks
  remain. No mock API or test-only note route is shipped.

S07 was backend-only. The full existing browser regression suite ran at Milestone A;
Post was disabled at that backend-only gate. Frozen browser posting/loss recovery is S08,
timeline/search is S09/S10, conflict/detail UI S12 and draft/Trash screens S13.
S10 adds transactional FTS and the production search list API. S14 supplies
retired-tag history resolution, not silent local rewriting. S17 separately covers
full restore; backend-only tests cannot substitute for its gate.

## S08 coverage (POST-01–03, DRAFT-02/04/05, NOTE-01/03, UI-02/03)

- `unit/posting.test.ts`: frozen phase transitions/readiness/progress, receipt-first
  response-loss retries without blob reads, readiness reuse, changed-byte/digest
  rejection, upload and local-persistence failures, server error propagation,
  restored missing receipts, create/update/publish/date contracts, additive v1
  draft decoding, parsed image destination remapping and DST/future validation.
- Browser draft storage and its `unit/drafts.test.ts` were removed (see the banner at
  the top); there is no draft-storage coverage in this section.
- `e2e/posting.test.ts`: real built composer + actual SQLite/Sharp/files, text/two
  images/file with cursor insertion and renamed-image detection, repeated clicks,
  upload progress and editor locks, unchanged download/WebP/metadata bytes, only
  submitted-draft cleanup, no-navigation/date-sorted session insertion/backdating,
  second-upload disconnect/readiness reuse across reload, response dropped after
  real server commit/receipt-first retry, active-upload reload with no automatic
  posting, local confirmation-storage quota after commit, file/image-only/empty
  validation on mobile, animation rejection/separate editable copy, server-draft
  local-file boundary/date retention, published Save changes/base digest conflict,
  actual retired-tag history rejection, expired-session feedback/safe retry.
  SQLite read-only receipt inspection asserts one committed mutation; synthetic
  history insertion is test setup, never a production debug route.
- `helpers/browser-session.ts` shares only verified real server-issued synthetic
  sessions across posting/upload workers through a private ignored fixture file,
  removed at teardown. Production login limits remain unchanged. The fixture
  launcher retries transient Windows file locks after child exit with a bounded
  limit; persistent cleanup failures are reported, not silently treated as success.
- Existing full auth/draft/Markdown/shell/upload tests continue to assert no
  premature upload, CSP/CSRF/privacy, reload/tab/quota retention and mobile/native
  zoom/safe areas. Two light-shell baselines changed only for the intentionally
  updated product status text; reviewed images are still Windows-only baselines.

S09 replaces the historical session list with the paginated SSR timeline. Posting
assertions now include previously saved cards rather than assuming a blank session.
Full server edit/detail/draft entry and conflict choices are covered by S12–S14.
Linux browser validation includes the actual posting test file in addition to
security/draft/upload regressions. Physical-device/IME and release audits remain S18.

## S10 coverage (SEARCH-01–04, TAG-02, AUTH-05, UI-02/03)

- `unit/search.test.ts`: literal AND/whole phrases, quote/backslash/unknown escapes,
  malformed syntax and bounds, codepoint lengths, NFKC/case/combining forms without
  readings/Han/accent conversions, conservative trigram eligibility, canonical
  query/tag/day identities and bounded normalized highlight segment unions.
- `integration/search.test.ts`: actual product SQLite trigram and literal field
  predicates, required English/Cantonese/Simplified/Japanese examples, code/operator/
  punctuation/emoji/XSS text, cross-body/filename terms but no joined-field phrase,
  far-source snippets, 240 deterministic Unicode fixtures and 100 derived randomized
  substrings with both acceleration and fallback compared to the literal oracle.
  Search AND tags/day with tied-date cursors, wrong-context rejection, immediate
  edits/status/publication/Trash/restore/deletion, receipt-failure rollback of FTS,
  corrupt-index repair and real operator reindex CLI leaving source revisions intact.
- `integration/{migrations,search-migration}.test.ts`: existing notes are atomically backfilled using
  the normalizer into separate fields and usable trigram rows, in addition to the
  fresh/repeat/rollback/history/integrity gates.
- `e2e/zsearch.test.ts`: built private SSR/API/cursor search, short CJK, phrase/all
  terms/variants, safe escaped normalized marks, invalid query feedback, chips/clear,
  stale older-page cancellation, Back, all-tag AND and mobile drawer search/overflow.
  Synthetic search fixtures run after the shell screenshot tests, not production seeds.
- `e2e/search-navigation.test.ts`: held real SSR search response superseded by newer
  malformed input, retained input/error, IME composition gating and canceled scheduled
  search on navigation away. No simulated search-success endpoint.
- `npm run search:benchmark`: isolated native 10k mixed-language ~2 KiB notes / 300
  tags, common/rare/no-match indexed and one/two-character fallback queries, all results
  compared to a direct literal oracle; first-query and warm p50/p95, reindex time,
  disk/RSS and real bounded SSR payload. Host/Linux measurements are in PROGRESS.

Only derived search data is rebuilt; no query/note text is logged outside the explicitly
synthetic benchmark. Linux browser scope now includes all three search cases; shell
baselines remain Windows-only. Real hardware/OS IME and target-VPS release audits remain S18.

## S09 coverage (NOTE-01, TAG-02, SEARCH-03/CAL-02 foundations, UI-01–03)

- `unit/sidebar-size.test.ts`, `unit/timeline-scroll.test.ts`: sidebar width bounds
  and top-versus-card scroll restoration with the scrolling composer.
- `unit/timeline.test.ts`: canonical/toggle/clear filters, NFKC-expanded identities,
  bounded query validation, timezone month/year/DST boundaries, UTF-8 preview
  boundaries, revision-aware deduplication and backdated ordering.
- `integration/timeline.test.ts`: real 10k multilingual SQLite fixture, first-page
  and UTF-8 source budgets, indexed query plan and warm timings; equal-time paging
  with no skips/duplicates, canonical filter/cursor binding, all-tag AND semantics,
  NFKC compatibility ligatures, safe SSR HTML, published-only counts and lifecycle,
  content revisions and revoked-session denial.
- `e2e/timeline.test.ts`: actual no-JavaScript first-page SSR, 30-card initial DOM,
  private list API, filter chips/card tags, query changes and stale response rejection,
  older loading/retry in the fixed shell, tall-card expand/collapse, top-month marker,
  Back restoration, 300-card DOM/heap measurement, revision-conflicted action refresh
  outside the first page, actual Trash action, mobile overflow, exact SSR code copy,
  disabled partial-code copy, full/compact preferences and visible-only full reads.
  Synthetic unmasked light/desktop and dark/compact/mobile screenshots are saved in
  test results for visual review. No product fixture route or production seed.
- Shell screenshot baselines mask only the now-variable timeline pane (private note
  timestamps/content); layout/focus/overflow/scroll checks remain real and unmasked.
  New timeline screenshots separately review the actual cards. Windows baselines
  are still platform-specific; Linux browser runs do not regenerate them.

Search/calendar/detail/lifecycle suites cover their integrated features.
Performance samples are synthetic, not VPS p95 or proof of unbounded-session memory
stability. Non-virtualized long-session DOM growth remains a documented limitation.

## SS04 coverage (LANG-01–04, SET-06)

| Suite                                  | Scope                                                                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/i18n.test.ts`                    | Registry = pickers (English, 简体中文), complete zh-CN (every key), every translated key exists in English with identical placeholders, per-key fallback, tag and `Accept-Language` matching, strict General schema                                         |
| `integration/general-settings.test.ts` | Real SQLite title/language saves merge without touching other settings or being reverted by appearance writes, survive reopening, strict rejection and live-session requirement                                                                             |
| `integration/setup-server.test.ts`     | Built server: `Accept-Language` decides `<html lang>`/text before setup completes (zh-CN, zh-Hans, zh-TW/unknown/q=0 → en); saved language/title win afterwards and are public on `/login`; escaped title; `PATCH /api/settings/general` validation/401/403 |
| `e2e/language.test.ts`                 | Settings General picker, zh-CN screens (no partial notice; tabs and sidebar translated), title in tab/sidebar/mobile header/drawer/sign-in, hostile and 60-character titles, axe light/dark phone/desktop                                                   |
| `e2e/auth.test.ts` (updated)           | zh-CN browser sees the Chinese sign-in/preferences screens before setup completes; unsaved language preview on the preferences page; SET-06 prefill                                                                                                         |

## SS06/SS07 deployment and documentation coverage

- `integration/release-hygiene.test.ts`: DOC-01 scans all current Markdown outside
  preserved PROGRESS history for deleted config/commands/paths; local links resolve;
  DOC-03 pins canonical operations/reset/reindex/copy rollback, one Compose/env,
  reviewed routes, private runtime and native install tools. Intentional legacy
  scrub/refusal code and negative test assertions are not deployment configuration.
- `release/deployment.test.ts`: copied real root Compose + ORIGIN-only env in a
  fresh Linux folder, real minimal TLS Caddy/setup, private modes, default/non-default
  UID/capabilities/PID1, real-client rate buckets, restart/recreate/default idle stop,
  interrupted backup, >1 GiB streamed archive restore, synthetic SQL/data upgrade
  and copy rollback (DEP-01–08). SS07 reruns the copied-folder install for DOC-02;
  complete DEP/cross-engine evidence is recorded in SS06, not falsely rerun here.
- DEP-09 requires actual Docker and Podman image build/save/load/retag/labels/native
  probes; an injected engine is not a transfer pass. See
  [release harness](release/README.md) and change PROGRESS for real engine outcomes.
- `e2e/auth.test.ts`: SS07 delayed entry modules prove Sign out is disabled before
  hydration, then logout revokes this test's own real session. The deterministic
  assertion failed before the fix; suite session and production limits remain intact.
- `ops/release-drill.sh`: independent synthetic HTTPS domains, setup/MFA/manual
  downloaded archive/uploaded restore/private-surface/session/local-draft/restart
  gates. Test-only Caddy and `.drill/` state are never production install artifacts.

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
Sharp fixtures are synthetic; originals are not retained in ready app storage.
Capability probes live in tests/spikes, reusable fixtures in tests/helpers;
production code never imports either.

Playwright owns ports 4173/4174/4175/4176 and refuses to reuse existing servers. It builds
and runs the adapter-node app with a fixture-only `.e2e-data/run-*` directory;
shared startup initializes before serving, then tests claim/complete setup through
real endpoints. It does not issue an operator secret or seed a password hash. The separate security fixture uses `.e2e-data/security/run-*`, a generated
HTTPS certificate on 4175 and private upstream on 4176. Teardown stops both test-owned
adapter children before removing `.e2e-data`
(Windows SQLite handles cannot be removed while open). Separate **test-only Vite
harnesses** host the legacy Mermaid probe, production renderer attack fixtures and
synthetic shell under response CSP. The built private composer also renders real
Markdown/Mermaid in the browser; no debug route ships in the product.

`e2e/editor.test.ts` covers the integrated editor container, + option popover and
keyboard dismissal, local hashtag insertion, Preview switch, focus-mode X/opener
return, retained text and zero note/upload mutations. Existing editor/shell
cases cover file/date actions and short mobile safe-area layout.
Browser profiles/downloads/traces are not tracked. Linux browser runs need
`npx playwright install --with-deps chromium`.

## Linux native gate

From the repository root with Docker or Podman:

```sh
podman build -f ops/Dockerfile.validation -t pandanote-validation .
podman run --rm --cpus=2 --memory=4g pandanote-validation
```

Replace `podman` with `docker` if appropriate. This pins the Linux/glibc base
image by digest and installs native dependencies inside the image. It is an
initial validation image, **not production deployment instructions**. For the
Linux authentication browser gate (fresh native modules, OpenSSL and Chromium):

```sh
podman build -f ops/Dockerfile.browser-validation -t pandanote-browser-validation .
podman run --rm --cpus=2 --memory=4g pandanote-browser-validation
```

That image runs all nonvisual e2e specs (including language and accessibility).
Windows-only shell visual snapshots are an explicit remaining Linux audit, not a
native/browser dependency skip. The production image/guide and independent-domain
TLS restore drill are implemented; real public VPS/device/AT gates remain open.

## Probe limitations / later gates

- S00 search eligibility is a probe; S10 product all-term/phrase/field, randomized
  oracle, pagination, fallback and benchmark contracts are tested separately.
- The legacy Markdown rewrite probe remains a feasibility test. Product S04
  parsing/rendering is tested separately; transactional tag management/history is S14.
- Image probe is in-memory; S06 separately implements and tests streaming input
  caps, private storage, original cleanup, bounded processing and authorization.
- Mermaid permits inline **styles**, not inline script or eval. It disables
  HTML labels and removes active/external SVG constructs. S04 separately tests
  production directive/asset rejection, SVG/CSS isolation, complexity/deadline and
  theme/geometry behavior. Main-thread deadlines are cooperative, not CPU preemption;
  target-device worst-case measurements remain S18.
- Archive probe requires regular USTAR entries without PAX/GNU extensions:
  `tar-stream` otherwise hides those headers before entry callbacks. A raw
  bounded streaming guard rejects them first. Application-owned short ASCII
  paths fit this subset. S16/S17 product suites separately test real manifest,
  DB schema/key/file trust, staged extraction and crash-safe replacement. Never
  use this probe alone as a restore feature.
- Fresh-auth primitives alone are not backup/restore evidence; actual handlers,
  streaming archives, replacement/crash tests and browser drill are required.
