# Foundation, authentication, shell, renderer, drafts, attachments, timeline, search, calendar, detail and tags (S00–S14)

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
  explicit Post with retained dates/location/server references; both Trash restores,
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
  boundaries, Hong Kong/Tokyo/year grouping, navigation/filter semantics.
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
  mobile drawer controls. Fixtures use actual note/upload APIs, not mock successes.
- `unit/appearance.test.ts` checks actual calendar numeral/background AA contrast
  in both themes. Shell screenshots mask variable calendar dates/counts as well as
  the existing notes-pane mask; fixed-month unmasked desktop/mobile calendar images
  are attached/reviewed separately. Existing layout/focus/overflow assertions remain.

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
never imports it. S06 adds real queued attachment-byte cleanup; S07 covers note
lifecycle. Full archive restore/crash rollback remains S17, not these tests. Linux checks execute POSIX
permission/fsync assertions; Windows uses operator ACLs instead. No existing
schema is pushed or runtime database migration hidden in a page request.

## S02 coverage (AUTH-01–05)

| Suite                                | Scope                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/auth-policy.test.ts`           | Bounded exact Unicode credentials, configured HTTPS/loopback origin, exact proxy trust and ignored spoofed headers, same-origin mutation and method-aware public route allowlist (AUTH-05)                                                                                                                                          |
| `integration/auth.test.ts`           | Actual Argon2id salts/verification/concurrency cap; operator token issue/reissue/expiry/reuse, racing setup and transactional failure retry; hashed/expired/revoked/security-revision sessions, configured lifetime/logout; persisted IP/account rate limits and cap; real native-TS operator CLI (AUTH-01, AUTH-04/05 first slice) |
| `integration/runtime-server.test.ts` | Actual production build + two sequential deployments with different runtime origins on one artifact; private routes, cookie flags, both Kit/form and JSON CSRF, durable password restart and Linux graceful shutdown (HTTP transport simulates a TLS-terminating proxy; not an actual HTTPS drill)                                  |
| `integration/auth-http.test.ts`      | JSON-only authentication body, actual streamed byte limits, generic internal error responses and rate-limit retry headers                                                                                                                                                                                                           |
| `e2e/auth.test.ts`                   | Built adapter app setup/login/logout, no plaintext credentials in ordinary DTOs/SSR, private API/file/backup paths, production cookie flags, CSRF failures and input retention on wrong password                                                                                                                                    |

`integration/auth-mfa.test.ts` adds real encrypted enrollment/confirmation, expiry/
cancellation/session binding, drift/replay, parallel TOTP/recovery consumption on two
SQLite connections, restart/rollback retry, ten hashed generation-only codes,
regeneration/secret change, single-use exact fresh scopes/session/revision/expiry,
password races, security revocation, lifetime changes and stdin-confirmed operator
CLI recovery. `unit/auth-factors.test.ts` covers RFC 6238 vectors and strict request
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
has no seeded notes. The synthetic shell fixture intentionally has no account or
storage workspace; its composer stays in memory. The built authenticated app uses
S05 recovery storage. Posting is not implemented. Collapse is preference plumbing,
not card functionality.

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

| Suite                                 | Scope                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/tags.test.ts`                   | Unicode/NFKC/case/deduplication, literal source offsets/UTF-16/CRLF, excluded code/HTML/escapes/URLs/destinations, precise rename/remove and length/count limits                                                                                                                                                                                                                                            |
| `unit/diagram-policy.test.ts`         | Ordinary flow/sequence arrows, pre-import directive/encoded-HTML/asset/CSS rejection and complexity limits                                                                                                                                                                                                                                                                                                  |
| `integration/markdown-render.test.ts` | Actual production remark/rehype/Shiki, GFM, sanitized HTML/links/images, descriptor-backed direct/reference-style images, nested/reordered footnote code, unknown language and inert Mermaid metadata                                                                                                                                                                                                       |
| `e2e/markdown.test.ts`                | Built private composer under production CSP with zero upload/mutation requests; exact clipboard write plus native clipboard round trip; real highlighted code and flow/sequence SVG geometry/theme, visible-only import, stale preview suppression, hostile asset no-fetch, separate SVG sanitizer, size/syntax errors, deadline/denied-copy recovery, desktop/mobile Write/Preview and disabled publishing |

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

Metadata/recovery repository capabilities are tested; S08 adds date UI and base
rechecking. Location and full server recovery entry screens remain later steps. No upload or note endpoint is simulated as
completed posting, and no test-only draft route is shipped. Physical device/IME,
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
  payloads; no real photos or precise location data are fixtures.
- `npm run images:benchmark` measures the production worker with three synthetic
  jobs, 50 MP orientation plus 20 MP high-entropy JPEG, sampled parent/peak worker
  RSS and timings. The Linux 2-CPU/4-GB image and actual values are in PROGRESS.

These are ready upload/download primitives. S07 integrates note commits; browser
posting is S08 and full image viewing remains S12. Unused-ready inventory/storage cleanup UI remains S15.
Sharp subprocesses avoid cached private open-file handles and provide a hard
wall-clock deadline, not a fake Promise timeout over still-running native work.

## S07 coverage (POST-02/03, NOTE-01–03, FILE-01, AUTH-05)

- `unit/notes.test.ts`: strict commands/confirmation/revision/location/UTF-8 limits,
  versioned canonical digest input including action/target/revision/file order,
  actual AST image/reference checks (not code), normalized tag-expansion bound,
  streamed JSON cap and safe internal-error responses.
- `integration/notes.test.ts`: real coordinator/SQLite/private files and Sharp,
  lost-response and concurrent two-connection creates, receipt replay after edits,
  settings changes and deletion, mismatch binding, body/tags/search/join/receipt
  atomicity with failure injection at the final receipt write, file/batch readiness,
  committed batch receipt-first resume, zero-byte file-only and image-only notes,
  missing physical bytes, file-as-image rejection, omitted manifest item and limits,
  immutable dates/location/meaningful edited indicator, both draft/published Trash
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
retired-tag history resolution, not silent local rewriting. Full restore remains S17.

## S08 coverage (POST-01–03, DRAFT-02/04/05, NOTE-01/03, UI-02/03)

- `unit/posting.test.ts`: frozen phase transitions/readiness/progress, receipt-first
  response-loss retries without blob reads, readiness reuse, changed-byte/digest
  rejection, upload and local-persistence failures, server error propagation,
  restored missing receipts, create/update/publish/date contracts, additive v1
  draft decoding, parsed image destination remapping and DST/future validation.
- `unit/drafts.test.ts`: frozen command/manifest immutability and stale-tab checks,
  separate-copy new local IDs/exact blobs, no removal before confirmation, scoped
  confirmed cleanup. Existing quota/cross-tab/tombstone tests remain unchanged.
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
Full server edit/detail/draft entry points and conflict resolution remain S12–S14.
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

- `unit/timeline.test.ts`: canonical/toggle/clear filters, NFKC-expanded identities,
  bounded query validation, timezone month/year/DST boundaries, UTF-8 preview
  boundaries, revision-aware deduplication and backdated ordering.
- `integration/timeline.test.ts`: real 10k multilingual SQLite fixture, first-page
  and UTF-8 source budgets, indexed query plan and warm timings; equal-time paging
  with no skips/duplicates, canonical filter/cursor binding, all-tag AND semantics,
  NFKC compatibility ligatures, safe SSR HTML, published-only counts and lifecycle,
  content revisions/location metadata and revoked-session denial.
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

Search acceleration/snippets, interactive calendar, detail/viewer, full lifecycle
screens and location popovers remain their later steps. `ops/Dockerfile.browser-validation`
includes auth/draft/posting/timeline/upload suites; native common gates also exercise
actual SQLite/Sharp/archive probes. Performance samples are synthetic, not VPS p95
or proof of unbounded-session memory stability. Virtualization remains deferred.

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

Playwright owns ports 4173/4174/4175/4176 and refuses to reuse existing servers. It builds
and runs the adapter-node app with a fixture-only `.e2e-data/run-*` directory;
it explicitly migrates storage and issues a disposable operator token before
serving. The separate security fixture uses `.e2e-data/security/run-*`, a generated
HTTPS certificate on 4175 and private upstream on 4176. Teardown stops both test-owned
adapter children before removing `.e2e-data`
(Windows SQLite handles cannot be removed while open). Separate **test-only Vite
harnesses** host the legacy Mermaid probe, production renderer attack fixtures and
synthetic shell under response CSP. The built private composer also renders real
Markdown/Mermaid in the browser; no debug route ships in the product.
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

That image runs `e2e/auth.test.ts`, `e2e/drafts.test.ts` and `e2e/uploads.test.ts`
(including actual browser restart and binary persistence); it does not claim Linux shell screenshot
baselines. S18 will add a minimal non-root runtime, persistent volume,
real-domain HTTPS proxy and runbook.

## Probe limitations / later gates

- Search eligibility is deliberately conservative (letters/numbers/spaces and
  at least three codepoints). S10 must implement full all-term/phrase/field,
  randomized-oracle, pagination and benchmark contracts.
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
  paths fit this subset. S16/S17 must add the real manifest, DB schema/key/file
  validation, second-pass staged extraction and crash-safe replacement. Never
  use this probe alone as a restore feature.
- S02 implements authentication/security/lifetime settings and operator recovery;
  S03 adds appearance. Calendar/storage/backups and their sensitive handlers are
  later steps. Fresh-auth primitives alone do not implement backup/restore.
