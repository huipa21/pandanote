# PandaNote — Ordered implementation plan

## How to use this plan

Read PRODUCT_SPEC and ARCHITECTURE first. Use PROGRESS as the actual state tracker.
S00–S17 are implemented; S18 is locally verified with manual/release gates open.
This ordered plan now reflects the approved simplify-setup contracts; implementation
and validation history remain in PROGRESS, not obsolete deployment instructions.

Each step has an outcome, tasks, acceptance gate, and next-step hint. Complete the gate, then update PROGRESS. A step can span multiple sessions. Never skip a failed gate because the UI appears to work.

### Common gate for every step

After S00 establishes tooling:

```text
npm run check
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

For user-facing steps also run affected Playwright tests. At milestones run `npm run test:e2e` in full. Exact scripts are created in S00; do not invent passing results before they exist.

Every completed step must record changed files, tests actually run, blockers/known issues, and the precise next task in PROGRESS. Commit-sized units are preferable; only commit if the user's/session's repository workflow permits it.

## S00 — Bootstrap and validate technical assumptions

**Depends on:** planning documents only.

**Outcome:** a buildable, tested SvelteKit skeleton and verified native/library capabilities, not a prematurely implemented product.

### Tasks

1. Inspect the repository and documentation. Do not scaffold over existing docs. Initialize git if appropriate; add ignores for secrets, data, staging, browser artifacts, and archives.
2. Choose supported Node LTS and compatible stable SvelteKit/Svelte/TypeScript versions. Add adapter-node, npm lockfile, runtime version declaration, strict TypeScript.
3. Create check/lint/unit/integration/e2e/build scripts. Vitest suites must be separated so integration tests use isolated temporary real files/SQLite. Playwright must manage a deterministic test app and clean test data.
4. Add a tiny health/shell page and smoke tests, not fake product screens.
5. Run short technical spikes with committed tests:
   - better-sqlite3 supports WAL, online backup, FTS5 `trigram`; English/CJK substring candidates and one/two-character fallback work.
   - Sharp produces WebP, rejects/identifies animation, corrects orientation and strips metadata.
   - remark source offsets can support hashtag rewrites without touching code.
   - Mermaid can be dynamically loaded, sanitized, and used under a feasible CSP.
   - Streaming archive library can reject unsafe entries and validate before extraction.
6. Record exact chosen versions, notable API findings, and any needed default adjustments in PROGRESS/ARCHITECTURE. Keep spike fixtures small and reusable.
7. Verify native tests in an initial Linux container/image as well as the development host.

### Acceptance gate

- All common commands and smoke Playwright test pass.
- SQLite search spike passes with 香港, 数据库, 図書館, one-character queries and literal punctuation.
- Image/archive capability checks use real libraries, not mocks.
- No unresolved blocker requiring a stack substitution. If one exists, stop and ask rather than quietly introducing a service.

**Next hint:** S01 defines the durable schema and typed server contracts. Do not start visual feature work before migrations/storage invariants exist.

## S01 — Database, domain schema, and persistent storage foundation

**Depends on:** S00.

**Outcome:** isolated, migratable SQLite/filesystem persistence with tested invariants.

### Tasks

1. Implement server-only connection initialization: foreign keys, WAL, FULL synchronous baseline, busy timeout, controlled shutdown.
2. Create versioned migrations for the tables/indexes in ARCHITECTURE. FTS may be added here or finalized in S10; reserve its derived-data contract.
3. Add validated settings defaults, generated private IDs/key material, safe data-root resolution and permissions. Never put production data in `static/`.
4. Define DTO/error contracts, expected-revision semantics, note status transitions, timeline UTC representation, nullable location validation, and mutation receipts.
5. Implement a small maintenance/write coordinator contract, used by domain mutations as they are added. Add a filesystem cleanup/journal foundation for later restore/deletion.
6. Add seed/fixture helpers for tests only; production has no demo account/content.
7. Write migration tests for empty DB, repeat startup, forward upgrade, rollback/error behavior, and foreign-key/index guarantees.

### Acceptance gate

- Fresh/migrated test DB passes integrity/foreign-key checks.
- No title field or multi-user role model appears.
- Bad latitude/status/reference values are rejected at appropriate validation boundaries.
- Runtime key/data paths are private and environment-configurable.
- Server modules cannot be imported into the browser bundle.

**Next hint:** S02 uses this foundation for secure first-account setup and password/TOTP sessions.

## S02 — Single-user authentication and optional MFA

**Depends on:** S01.

**Outcome:** all application/data routes are private, with usable secure setup/login/recovery.

### Tasks

1. Implement first-visitor browser account setup in the 60-minute process-start
   window: username, email, password/confirmation, then title/language/timezone.
   Account/session and preference completion are atomic; singleton/race/expiry and
   unfinished-setup routing must hold. No setup secret or registration after setup.
2. Implement measured Argon2id password hashing, generic failed-login messaging, bounded persistent rate limiting and trusted-proxy handling.
3. Implement 7-day default secure cookie sessions, hashed tokens, logout and revoke-all.
4. Implement optional TOTP enrollment, confirmation, encrypted secret storage, disable/change flow, replay protection, and short-lived pending MFA challenges.
5. Generate 10 single-use recovery codes, store hashes, allow view/download only at generation; regeneration invalidates previous codes.
6. Implement fresh-auth grants, password changes, and security revision/session invalidation.
7. Gate pages and API/file routes centrally while preserving endpoint-specific authorization. Document operator-only recovery requiring VPS access.
8. Build functional, minimal login/security UI that later uses design tokens.

### Acceptance gate

- Password-only login works when TOTP disabled.
- Password alone never creates full access when TOTP enabled.
- Wrong/expired/replayed TOTP fails; recovery code works once under concurrent attempts.
- CSRF/cross-origin attempts, expired/revoked sessions, second-account creation,
  closed setup windows and unauthenticated file calls fail.
- Cookie flags/origin behavior verified in production-like configuration.
- No secrets/session hashes/TOTP seeds in responses/logs.
- Fresh-auth grant expiration and scope tested.

**Next hint:** S03 builds the real visual shell around authenticated routes. Keep authentication tests running as features add endpoints.

## S03 — Design tokens and responsive fixed shell

**Depends on:** S02.

**Outcome:** agreed visual language and accessible navigation layout.

### Tasks

1. Implement warm off-white/white light theme, dark theme, muted-green accent, typography, borders, spacing, focus states; centralize CSS tokens.
2. Implement Light/Dark/System, comfortable/compact density and collapse preference plumbing without theme flash.
3. Build a fixed desktop sidebar with a draggable/keyboard-resizable right edge, expandable composer/filter region inside the homepage notes scroller, and bottom Back to Top control. Use placeholders only where a later step explicitly owns functionality.
4. Mobile: header, drawer, compose action/full-screen editor shell, safe areas/dynamic viewport handling.
5. Navigation for All notes, Drafts, Tags/manage, Trash, Settings; accessible drawer/dialog primitives.
6. Establish screenshot/viewports and keyboard tests. Test constrained height, many tags, 200% zoom and virtual-keyboard scenarios.

### Acceptance gate

- Desktop document does not scroll with timeline; actual note scroller does.
- No horizontal overflow at 360/390/768/1440 px widths.
- Controls remain reachable on short screens and by keyboard.
- Theme/density settings visibly apply, contrast/focus passes, reduced motion respected.
- No masonry, rich editor, external fonts, or oversized component framework.

**Next hint:** S04 fills the content renderer/editor preview. Reuse tokens rather than adding per-component colors.

## S04 — Markdown rendering, code copy, Mermaid, and tag parser

**Depends on:** S03 (pure parsing tests can start earlier).

**Outcome:** one safe Markdown pipeline and reliable source-span tag extraction.

### Tasks

1. Support standard Markdown/GFM, links, lists, headings, tables, code, and internal attachment references.
2. Establish HTML/URL sanitization policies and shared rendered content styles.
3. Add lazy/cached Shiki highlighting, language labels and original-code copy controls.
4. Add Mermaid only for fenced mermaid blocks; dynamic import, strict security, safe SVG sanitization, visible-only rendering, syntax errors/size limits/debounced preview.
5. Implement hashtag AST parser/source offsets with Unicode grammar, case normalization, deduplication and excluded contexts.
6. Add a single Preview switch; integrate bottom-left + secondary options and top-right focus/close icons into the textarea-style container (user-approved editor simplification). No publish keyboard shortcut.
7. Test sanitizer attack fixtures and actual browser SVG output. Do not trust library “strict” mode as the only protection.

### Acceptance gate

- Copy yields exact code including whitespace/newlines, not markup.
- XSS/unsafe URL/code/Mermaid payloads do not execute or fetch attacker assets.
- Diagrams load only when required; invalid diagram does not break a note/editor.
- Tag extraction ignores inline/fenced code, heading markers, escapes and link destinations.
- Unicode tags and source-span rewrite tests preserve unrelated Markdown.

**Next hint:** S05 adds local draft persistence around this editor. Attachment placeholders are not uploads yet.

## S05 — Browser-local draft repositories and recovery

**Depends on:** S04.

**Outcome:** multiple recoverable local drafts, including blobs, without server uploads.

### Tasks

1. Versioned localStorage draft records/index and IndexedDB binary repository with account/draft identity.
2. Implement autosave text/metadata, add/remove blobs, reconciliation, persistence request and quota error UX.
3. Add local draft list/excerpts, resume, create another, confirmed discard.
4. Support recovery copies for existing server IDs/revisions as a typed capability; server drafts integrate in S13.
5. Coordinate cross-tab draft edits; avoid silent overwrite using draft revisions and storage/BroadcastChannel events.
6. Generate internal image IDs/placeholders, preview local blob URLs, revoke URLs on cleanup.
7. Flush text where reasonable and retain blobs on reload; document private-browsing/clear-site-data limitations.

### Acceptance gate

- Create two drafts with images/files; reload and resume both with identical content/blobs.
- Network interception proves selecting/pasting files and autosaving a new draft sends no content/upload request.
- Quota failures produce visible errors and do not leave falsely successful references.
- Discard removes only that draft's data; signing out does not silently destroy drafts.
- Two tabs cannot silently overwrite the same local draft.
- Enter and Ctrl/Cmd+Enter never publish; Post remains explicit.

**Next hint:** S06 implements server upload/private download primitives. They must be invoked only by posting orchestration, not file selection.

## S06 — Private attachments and bounded image processing

**Depends on:** S01/S02/S05.

**Outcome:** retryable upload batches and ready attachments, with private authenticated access.

### Tasks

1. Initialize/resume batches keyed by client mutation ID; validate stable client attachment IDs and ownership.
2. Receive uploads with streaming byte caps and safe staging paths; detect image format/animation/pixel dimensions.
3. Sharp orientation correction/WebP outputs/metadata stripping with configurable limits, concurrency=1 and bounded queue/deadlines.
4. Implement authenticated image variants and file download routes with safe headers/names.
5. Track ready metadata/checksums; reject reused IDs with mismatched input rather than overwrite.
6. Clean temporary originals on every outcome/startup; surface abandoned ready retry files for later explicit cleanup.
7. Implement disk reserve/free-space checks and filesystem reference-safe deletion foundation.

### Acceptance gate

- Static image results have correct dimensions/orientation and no EXIF/GPS; original is absent after processing.
- Animation, MIME spoofing, oversized bytes/pixels, corrupt files and resource overload fail cleanly.
- Retry recognizes completed uploads; original filename never controls path.
- Unauthenticated/unauthorized image/file access fails; malicious HTML/SVG files download safely.
- Parallel upload tests verify image-processing concurrency=1.
- Linux resource measurements recorded.

**Next hint:** S07 atomically attaches ready uploads to actual notes. Pending files alone are not published content.

## S07 — Note mutation service and idempotent lifecycle

**Depends on:** S06.

**Outcome:** trustworthy backend create/update/draft/trash operations.

### Tasks

1. Implement create, optimistic update, move-to-draft, publish-draft, trash, restore and permanent-delete services/endpoints.
2. Validate body/content presence, timeline/backdating, location, tags and attachment references.
3. Commit note, extracted tags, attachment links, derived-search hooks and mutation receipt in one transaction.
4. Revision-check every edit/state change; prepare safe 409 snapshots.
5. Retries with the same mutation ID return original success; payload mismatch rejected.
6. Preserve immutable creation date, explicit timeline date, prior Trash status and meaningful edited indicator.
7. Enqueue file cleanup only when no live/draft/Trash references remain. Reusing attachments for conflict-copy is supported safely.
8. Use maintenance coordinator for every persistent mutation and file-affecting operation.

### Acceptance gate

- Lost-response/repeated-create simulation creates exactly one note.
- Failure before commit leaves no published partial note; local caller can retry.
- Draft/trash transitions preserve data/date/files and expected revision.
- Empty text rejected, image/file-only valid, unready/broken image references rejected.
- Concurrent updates: one wins, one receives conflict; no silent overwrite.
- Deleting one cloned/reference-sharing note does not break another.

**Milestone A:** backend persistence/security/attachment invariants pass a full integration suite.

**Next hint:** S08 connects the composer to this protocol and verifies real browser failure recovery.

## S08 — Composer posting orchestration and upload UX

**Depends on:** S07/S05.

**Outcome:** complete browser draft-to-published-note flow.

### Tasks

1. Implement frozen post attempt state machine, progress, retry/resume and batch readiness map.
2. Upload only after Post/Save changes; existing server attachments are references.
3. Preserve local data until confirmed receipt; handle lost response, canceled navigation, reloaded in-progress attempt, changed payload and repeated clicks.
4. Wire image insertion at cursor and other-file rows, remove/reorder references, Preview switch/focus modes.
5. Correctly clear only submitted draft data; prevent edits during frozen submission or retain later edits separately.
6. Surface stale-tag validation and conflict errors without discarding work; richer conflict UI arrives in S12.
7. Update list state without full reload and without pretending a failed save was successful.

### Acceptance gate

- Post note with text/two images/file; outputs and content match, local data clears only after success.
- Break network mid-upload and after commit; reload/retry recovers with no duplicates.
- New files added to an existing server draft remain local before Post.
- Backdated post appears in correct sorted position, not artificially newest.
- Errors, upload progress and button state are usable on mobile.

**Next hint:** S09 makes published notes a bounded, stable timeline. Keep posting e2e tests as regression tests.

## S09 — Timeline cards, lazy pagination, and filter state

**Depends on:** S08.

**Outcome:** fast chronological reading with bounded initial payload.

### Tasks

1. SSR initial page, then cursor-based older loading in the actual notes scroller.
2. Build note cards with timestamps, optional edited/location/attachment sections, action menu and clickable tags.
3. Apply long-card collapse preference, Show more/less and density modes; note detail comes later.
4. Canonical filter state/query params and chips; multiple tags use AND.
5. Dedupe IDs/revisions, cancel stale responses, preserve scroll anchors during image load/edit/post and Back navigation.
6. Month separators/top-visible observer foundation for S11.
7. Empty/loading/error/retry states. Measure DOM growth before adding page trimming or virtualization.

### Acceptance gate

- 10k-note fixture does not cause whole-collection fetch/render.
- Equal timestamps paginate without duplicates/skips in an unchanged dataset.
- Filter changes invalidate stale cursors/results; clear/removal predictable.
- Long content/code/images do not overflow or shift scroll unexpectedly.
- Sidebar remains stationary; homepage composer scrolls with notes, and Back to Top returns to it. Tags actually narrow by all selected tags.

**Next hint:** S10 supplies exact multilingual search on the same list contract, not a parallel result system.

## S10 — SQLite exact multilingual search and snippets

**Depends on:** S09; S00 search spike.

**Outcome:** exact search in all agreed languages, including short queries, no service.

### Tasks

1. Implement NFKC/lowercase normalization and quoted-phrase/all-term query parser.
2. Create derived search fields/FTS5 trigram index and transactional update/reindex path.
3. Use safely quoted candidate queries where valid; literal post-filter oracle and short-query fallback define correctness.
4. Combine status/tags/day/cursor predicates; newest-first sorting and bounded pagination.
5. Safe highlighted snippets, debounced search, request cancellation; malformed query feedback.
6. Benchmark realistic mixed-language data and compare indexed/fallback results to a straightforward literal oracle.
7. Add repair/reindex command and migration tests for existing notes.

### Acceptance gate

- All multilingual cases in ACCEPTANCE_TESTS pass, including single Chinese/Japanese characters.
- Misspellings/readings/Han variants do not falsely match unless literal text exists.
- `%`, `_`, quotes, FTS keywords and punctuation are literal-safe and cannot inject SQL/FTS behavior.
- Quoted phrase does not span unrelated fields; terms can match different fields.
- Update/tag/attachment-name/status changes reflect search immediately after commit.
- Recorded latency/resource results meet budget or have explicit outstanding remediation.

**Next hint:** S11 adds calendar/date navigation using the same filters and cursor contract. Calendar month must not silently limit search.

## S11 — Month activity calendar and scroll synchronization

**Depends on:** S10.

**Outcome:** Memos-like month calendar linked predictably to timeline scrolling.

### Tasks

1. Build calendar grid, activity shades, today/selection distinctions, accessibility labels and month counts.
2. Implement IANA timezone setting/detection and correct half-open UTC day/month boundaries.
3. Month arrows, bold heading, compact date heat tiles, 4 × 3 year/month picker with year arrows/scrollable quick-year/direct entry, Today and manually selected empty month behavior.
4. Connect top-visible card to displayed calendar month; continuous older loading skips empty matching months.
5. Day-filter mode locks results to selected day; clicking selected day/chip clears it.
6. Search/tags cover all dates by default; counts remain all published notes.
7. Invalidate counts after all relevant mutations and timezone changes. Use navigation-source flags to prevent observer/fetch loops.

### Acceptance gate

- Scrolling across month/year boundaries updates calendar without resetting scroll.
- Tall/collapsed/image/Mermaid cards do not cause repeated month flicker.
- Day filtering does not escape on bottom scroll.
- Month/year jump, empty month, Today and Back behave as specified.
- DST/month boundaries and server-versus-app timezone tests pass.
- Search finds older notes regardless of calendar month; filtered counts stay global.

**Milestone B:** daily write/read/search/calendar workflow passes full browser suite on desktop/mobile.

**Next hint:** S12 finishes full-note viewing/editing and usable conflict resolution.

## S12 — Addressable detail dialog, edits, conflicts, image viewer

**Depends on:** S11.

**Outcome:** private permalink/detail and safe editing from every screen.

### Tasks

1. Detail dialog on desktop/full-screen mobile, stable private URL, direct refresh/deep link support, full note content/metadata.
2. Closing/Back returns to original filters/scroll; focus management, Escape and browser history semantics.
3. Published edit local recovery and Save changes; server draft Post flow hooks.
4. Conflict dialog: server version, keep/copy local, explicit replace with newly observed revision; preserve local blobs throughout.
5. Full-screen image viewer with larger WebP, zoom/pan, previous/next, mobile swipe and WebP download.
6. Content and image-viewer keyboard/accessibility handling; no duplicate background expensive renders.

### Acceptance gate

- Direct link and timeline-open routes both work behind authentication.
- Closing detail preserves timeline context and focus.
- Two browser contexts edit same note: conflict shown, losing text/files preserved; copy and replace paths verified.
- Replace racing a third edit conflicts again rather than force-overwriting.
- Viewer download is processed WebP only, swipe/zoom do not conflict with ordinary page scrolling.

**Next hint:** S13 exposes the complete draft/trash lifecycle in navigation and resolves local-versus-server recovery labels.

## S13 — Drafts and Trash screens

**Depends on:** S12.

**Outcome:** clear local/server draft separation and recoverable deletion.

### Tasks

1. Local/new/edit-recovery section and server draft section; excerpts/image/file labels, no title field.
2. Reconcile local edit overlays with server entries, show device-only/recovered distinction.
3. Move published note to draft; open/edit locally; Post republishes preserving timeline date.
4. No Save draft button or autosaved draft edits on server. Existing server files stay available; new blobs stay local.
5. Trash list/detail, restore to prior status, confirmed permanent delete and explicit empty-Trash if implemented.
6. Remove draft/trash notes from normal search/calendar/timeline and invalidate counts consistently.

### Acceptance gate

- Other device sees server draft's last saved version but not unfinished local changes.
- Server draft edit survives reload locally; republish persists files/date and removes recovery copy.
- Trash restore returns correct status and data; no automatic cleanup timer.
- Local drafts absent from server backup source queries and normal search/counts.

**Next hint:** S14 implements tag administration with exact source-span edits and revision invalidation.

## S14 — Tag management and stale local tags

**Depends on:** S13/S04.

**Outcome:** rename/merge/remove with safe content consistency.

### Tasks

1. Manage-tags UI with usage counts, preview affected notes and confirmations.
2. Transactional source-span rewrites across server statuses, preserving Markdown/code/URLs.
3. Rename normalization/case-only behavior, merge collision semantics, duplicate joins, removal semantics.
4. Revision/search/cache updates for affected notes; in-progress editors conflict instead of overwrite.
5. Record tag change history and surface resolution before a stale local draft posts. Do not silently rewrite browser drafts.
6. Test chain of renames/merges and removal/recreation behavior; document chosen history-resolution rules.

### Acceptance gate

- Rename/merge/remove changes intended hashtags only and correct counts.
- Code/escaped tags/URLs/prose formatting byte-identical where unaffected.
- Server drafts/Trash remain consistent; browser draft remains local and receives clear stale-tag choice.
- Concurrent editing sees conflict; no old join/search residue after transaction.

**Next hint:** S15 finalizes location and settings/storage controls. Backup actions remain a later step, not nonfunctional buttons marked complete.

## S15 — Geolocation and complete settings/storage UI

**Depends on:** S14.

**Outcome:** optional location and all non-backup configuration are usable.

### Tasks

1. Explicit Add location dialog: browser request, manual coordinates, optional label, remove/edit; validate ranges/accuracy.
2. Card/detail location popover with copy/accuracy/OpenStreetMap (or documented provider) link opened only on explicit action.
3. Appearance/calendar/security/storage settings, persisted defaults, timezone picker and session configuration.
4. Configurable image quality/dimensions and byte/pixel limits with safe bounds; prohibit arbitrary path/config injection.
5. Storage breakdown (files/Trash/pending uploads/backups/free space) and explicit unused-ready-upload cleanup with confirmation and reference checks.
6. Security actions use fresh-auth UI; all-device signout; MFA optional flow polished.
7. Check all empty/error/saving states, localization-ready date formatting and mobile layout.

### Acceptance gate

- Geolocation never requested automatically; permission denial still allows posting.
- No location means no card row; manual accuracy remains absent unless genuinely known.
- No map/network call before Open map click.
- Settings survive login/device changes appropriately; app timezone does not follow travel automatically.
- Cleanup cannot delete referenced or actively posting files; limits apply server-side, not merely UI.

**Milestone C:** all product features except backup/restore pass integrated UI/security tests.

**Next hint:** S16 captures consistent manual full archives with no passphrase and no automatic scheduler.

## S16 — Manual full backup creation/list/download

**Depends on:** S15; maintenance coordinator integrated throughout prior steps.

**Outcome:** complete portable archive saved on server and downloadable securely.

### Tasks

1. Format-v2 `.pnb` manifest/streaming archive; include DB/account identity/completed
   preferences, referenced files and portable auth keys; exclude sessions/local
   drafts/old archives/staging/pre-upgrade copies. Refuse pre-release format 1.
2. Fresh-auth create action, disk reserve and peak-space estimate, crash-aware manual job/progress.
3. Consistent SQLite online snapshot plus immutable file/key capture under real write gate; avoid live-WAL copy errors.
4. Strip transient credentials/upload batches/unreferenced attachment rows/derived backup catalogs from staged DB; retain successful receipts for included notes, clear pending associations, checksum payload entries, verify archive, finalize by rename.
5. Backup & Restore settings list with create time/size/error; protected download/delete; warning that archives are unencrypted and server-only backups do not protect against VPS loss.
6. Failed/incomplete job cleanup and restart recovery; no scheduled/automatic backups.
7. Concurrent mutation/upload/security-change tests during snapshot.

### Acceptance gate

- Completed archive has a single consistent state, integrity checks and all referenced files.
- Existing archives/local drafts/pending uploads/sessions absent.
- Saved archive downloadable byte-identically only after authentication/fresh-auth.
- Failure/full disk/process interruption never produces an apparently complete archive or harms live data.
- Backup creation does not indefinitely block reading/writing; actual timings/peak disk/RAM recorded.

**Next hint:** S17 validates uploaded archives and restores safely. A successful archive creation alone is not proof of backup correctness.

## S17 — Uploaded full restore and rollback

**Depends on:** S16.

**Outcome:** Settings can restore the whole application safely from a downloaded archive.

### Tasks

1. Private upload with size/free-space controls; validate manifest, paths, archive types/checksums/counts, SQLite schema/integrity and references.
2. Restore summary and explicit destructive confirmation; support current deployment and fresh replacement deployment.
3. Trusted migration on staged copy where supported; reject unknown/newer formats safely.
4. Maintenance/journaled swap with old-state rollback, DB handle closure/WAL safety, key reload and startup crash recovery.
5. Rebuild search, reset derived catalogs, invalidate sessions/challenges; return to login with restored account/MFA.
6. Keep destination domain configuration and existing unrelated completed backups; rebuild the destination backup list from their validated manifests. Local browser drafts stay excluded/untouched and must recheck server revision/receipt state.
7. Add operator runbook and fault-injection tests at each swap boundary.

### Acceptance gate

- Restore archive into independent empty instance: notes/statuses/tags/dates/location/files/settings/authentication match; previous sessions fail.
- Password/TOTP/recovery state restored correctly without a separate backup password.
- Invalid/corrupt/path-traversal/symlink/bomb/incompatible archives fail before replacement.
- Injected mid-restore error/crash returns to old usable state or documented deterministic startup recovery; no mixed DB/files/keys.
- Restore works through web upload, not only a developer CLI.

**Next hint:** S18 is the release gate: real Linux deployment, performance/security audit and restore drill. Do not declare done based on unit tests alone.

## S18 — Deployment, measured performance, accessibility, release gate

**Depends on:** S17 and all previous gates.

**Outcome:** reproducible VPS operation with verified product behavior and a useful operator README.

### Tasks

1. Production Dockerfile and minimal root docker-compose.yml + single ORIGIN env
   template: one app on existing Caddy external network, private bind/default UID,
   native libraries, automatic startup migrations/copy and image healthcheck.
   No bundled proxy/ports/static IPs/hardening/ops services.
2. Document environment/initialization, upgrade, explicit operator recovery, log/space inspection, graceful shutdown and manual backup/restore.
3. Run full acceptance matrix, accessibility/keyboard/mobile checks and dependency/security review.
4. Seed documented realistic 10k-note benchmark plus short-CJK search, multi-image post, long Mermaid/code note, backup and restore workloads.
5. Measure API latency, first useful rendering, bundle/Mermaid loading, browser memory/DOM growth, process RAM/disk peak. Fix major bottlenecks without stack expansion.
6. Perform actual downloaded-backup restore onto an independent deployment with a different domain. Verify auth/MFA and local draft non-inclusion.
7. Remove dev accounts/fixtures/debug routes from production, verify private storage and sensitive-action gates.
8. Update README from planning-only status to actual installation/testing instructions. Mark verified release state with any explicit remaining limitations.

### Final acceptance gate

- All common commands and full e2e suite pass on release commit.
- Linux image native/search/archive tests pass; restart preserves DB/files/settings and clears no valid local drafts.
- No high-severity unresolved auth/XSS/restore/data-loss defects.
- Performance budgets measured and met, or any revised target explicitly approved/documented.
- Backup/download/upload-restore drill passed outside the original app instance.
- Documentation/progress agree with actual code; no required feature remains mocked or TODO.

**S18 status (2026-10-06):** artifacts, accessibility/security review, drills and 10k benchmarks are implemented and locally verified; the real-VPS, physical-device and screen-reader parts of this gate remain open. See `docs/RELEASE_RESULTS.md`.

**Next hint:** only after this gate, collect actual usage feedback. Treat new features as separately approved scope, not reasons to destabilize the completed core.

## Approved enhancement — Commit-derived release versioning

User explicitly approved implementation before the outstanding S18 deployment/manual
gate is closed. This does not mark that gate done. Follow
[VERSIONING_PLAN.md](VERSIONING_PLAN.md) in order: V01 typed metadata/Git derivation,
V02 immutable clean-source image build, V03 embedded sidebar/drawer/About display,
V04 documentation and host/browser/Linux verification. Apply the common gate and
VER-01–08 acceptance cases; do not create a user-repository commit without approval.

## Approved change — Simplify setup and deployment

User-approved on 2026-10-06. Shared container/dev/built startup now prepares private
storage, recovers restores before keys/DB, applies SQL + registered data steps,
saves a latest pre-upgrade DB copy for pending upgrades and initializes settings
before HTTP. Container permanently drops to PUID/PGID and execs PID 1 Node. Browser
claims a sole account within 60 minutes, then finishes preferences. Interactive
reset-password is live-safe; reindex remains stopped-app-only. Manual full backup
before upgrade and clean-source image provenance remain required. Follow [simplify-setup/PLAN.md](simplify-setup/PLAN.md)
in order: SS01 migration baseline/data steps/pre-upgrade copy, SS02 one startup path
and proxy trust, SS03 accounts/setup flow/login, SS04 language and site title, SS05
backup format v2 and `reset-password`, SS06 deployment files/image, SS07 documentation
and full regression. Acceptance: [simplify-setup/ACCEPTANCE_TESTS.md](simplify-setup/ACCEPTANCE_TESTS.md).

## Approved change — Image optimization

User permits Alpine and a long sequential IO00–IO07 session. The implemented
packaging preserves application/schema/security/provenance/root-Compose behavior:
verified Node24.21.0 Alpine stages, dedicated runtime lock with drift/peer control,
optional musl natives and conservative dependency-map pruning before COPY, streaming
size reports and gzip/checksum transfer with raw alternative. Follow the per-step
[IO plan](image-optimization/PLAN.md), [acceptance](image-optimization/ACCEPTANCE_TESTS.md)
and [actual evidence](image-optimization/PROGRESS.md). Common/full browser, actual
musl/native/fallback/production/PTY/upgrade/restore/large-TLS/cross-engine gates are
required; host/Debian-native passes cannot substitute. SS01 literal exchange and
S18 manual/VPS/ARM64/exact-user-release limitations remain independent.
