# PandaNote — Acceptance and verification matrix

## 1. Verification rules

These are expected tests, not claims that tests already exist or pass. Add cases alongside implementation; keep a mapping from these IDs to actual test files in PROGRESS or the test README.

- Unit: pure query/tag/timezone/state-machine/validation behavior.
- Integration: real production SQLite tokenizer, transactions, native image processing, private filesystem, auth and archive operations in isolated temporary directories.
- Browser: real reloads, IndexedDB/localStorage, network failures, dialogs, scrolling, downloads/uploads and two-context conflicts with Playwright.
- Manual: mobile virtual keyboard/gestures, geolocation permission UX, contrast/visual review and actual VPS restore drill.

All fixtures are synthetic. Never commit personal notes, actual credentials, GPS histories, production backups or secrets. Test MFA seeds/recovery codes are deliberately disposable and must not reach production initialization.

## 2. Test fixtures

Maintain deterministic fixtures with expected matches/statuses/dates:

- English prose, Markdown code and symbols; mixed case; typo examples.
- Written Cantonese in Traditional characters: `今日食咗點心，之後去香港。`.
- Simplified Chinese: `今天学习数据库，也喝了咖啡。`.
- Japanese: `今日は図書館に行った。日本語のメモ。`.
- Mixed scripts, emoji, combining marks, full-width Latin characters, punctuation.
- Inline/fenced code containing hashtag-like text; escaped hashtags; headings; links/URLs; hostile HTML/Markdown/Mermaid.
- Notes with same timeline instant but different IDs; month/year boundary and DST examples.
- Published, server draft, Trash-from-published, Trash-from-draft notes.
- Static JPEG/PNG/WebP with orientation/EXIF, small screenshot, transparency, malformed image, animation, too-large input/decoded resolution.
- Unchanged PDF/ZIP/text plus HTML/SVG active files as download-only attachments.
- Archive fixtures: valid current format, supported older schema, incompatible newer schema, missing file, wrong checksum, path traversal, symlink/hardlink, duplicate entries, excessive expansion.

## 3. Authentication/security

### AUTH-01 — First-account setup

Empty deployment cannot be claimed without the operator-held one-time token. Token can create only one account, then is consumed. No public registration endpoint. Reusing setup token fails; no predictable production password.

### AUTH-02 — Optional TOTP

Password-only login works when disabled. With TOTP enabled, password creates pending challenge only; note/file routes remain inaccessible until code succeeds. QR enrollment must be confirmed before activation. Wrong/expired/replayed code fails. Disable/change requires fresh authentication. Authenticator clock drift handling is explicit and bounded.

### AUTH-03 — Recovery codes

Exactly 10 initially generated, available to save at generation only, stored hashed. A code substitutes for the second factor, never the password. Concurrent consumption permits one success. Regeneration invalidates old codes. Codes/seeds never appear in routine DTOs/logs.

### AUTH-04 — Sessions and fresh authentication

Default lifetime seven days, configurable; expiry/revocation/security revision enforced. HttpOnly/Secure/SameSite verified in production mode. Fresh-auth grant expires and is scoped; backup/security/restore action cannot reuse ordinary login indefinitely. Sign out all devices invalidates all sessions. Restore invalidates even sessions whose database rows existed in the source.

### AUTH-05 — Abuse and CSRF

Login/password/MFA attempts rate-limited with bounded storage and sensible restart behavior. Wrong password response does not disclose state. Cross-origin mutation/upload/restore fails; Origin/proxy trust cannot be spoofed to gain privilege. SQL inputs parameterized. Sensitive endpoints and files are not public/cacheable. Referrer/CSP/frame/nosniff policies verified without breaking legitimate Mermaid/code rendering.

## 4. Local drafts and post reliability

### DRAFT-01 — Multiple local drafts

Create two new drafts with distinct text/date/location/files. Reload/restart and resume independently. Text/metadata present in localStorage; binary blobs present in IndexedDB. No separate note title. Discard one leaves the other intact.

### DRAFT-02 — No premature upload

Intercept requests while typing, adding image/file, switching preview, setting location/date and navigating away. No new-draft body/blob is uploaded. Background fetching existing server data is allowed; do not confuse it with draft sync.

### DRAFT-03 — Quota and missing blobs

Force localStorage/IndexedDB failure, persistent-storage denial and missing blobs. Visible recoverability warning; no false “saved” state. Missing image references require repair/removal; broken note never silently publishes. Browser-data deletion is not presented as recoverable from server backups.

### DRAFT-04 — Local recovery and tabs

Text autosave survives reload without relying solely on unload. Editing same local draft in two tabs does not silently discard one version. Logout leaves data locally but hides authenticated UI; session expiry never drops unsaved work. Blob URLs do not persist/leak after views close.

### DRAFT-05 — Server draft semantics

Published note moved to draft keeps server body/attachments/dates/location. Normal search/calendar excludes it. Edit on device A, reload: local edits recover. Device B sees only last server version. New files on A remain local until Post. No Save draft/background server save. Republish preserves timeline date and clears only the confirmed local edit copy.

### POST-01 — Explicit publishing

Enter inserts newline. Ctrl/Cmd+Enter does not publish. Post starts upload/commit; double clicks produce one result. Keyboard activation of the focused Post button is valid explicit activation, not a global publish shortcut.

### POST-02 — Failure/retry/idempotency

Disconnect during first/second upload, image processing, before note commit, and after server commit but before response. Retain local body/blobs. Retry/reload produces exactly one note and reuses completed uploads. Same mutation ID with changed payload rejected. Canceling/restarting creates no published partial note. In-flight frozen payload cannot accidentally clear later unsent edits.

### POST-03 — Valid content

Text-only, image-only and file-only publish. Empty/whitespace-only with no ready files rejected. Unauthorized/unready/missing attachments cannot be referenced. Image IDs in Markdown stay valid after upload.

## 5. Notes, lifecycle, and conflicts

### NOTE-01 — Dates

System creation timestamp immutable. Backdating changes timeline ordering/day count. Normal edit does not reorder. Edited indicator reflects actual content edits. Timestamp ties cursor-paginate correctly. Local date entry respects app timezone; invalid/nonexistent time is handled deliberately. Future date default validation is documented, not silently clamped.

### NOTE-02 — Trash

Delete published/draft to Trash; restore returns each prior status/date/files. No automatic emptying. Permanent delete confirmed, no residual searchable note. Referenced attachments retained until last published/draft/Trash reference gone. Cleanup survives restart/failure safely.

### NOTE-03 — Concurrency

Two authenticated contexts load same revision and edit differently. First saves; second gets conflict with its local edits/files intact. Load server, save as separate note and explicit replace each work. Replace races a third save and conflicts again. Tag rename/status/trash/date actions also invalidate stale revisions.

### NOTE-04 — Detail/history

Open detail from timeline, close/Escape/Back, recover filters/scroll/focus. Deep private URL loads/refreshes correctly and requires auth. Mobile detail full-screen. Full content shown regardless of card collapse preference. Deleted/inaccessible note has safe not-found state.

## 6. Tags

### TAG-01 — Extraction/identity

English case-insensitive identity; Unicode Cantonese/Chinese/Japanese tags and marks supported. Flat only. Duplicate tags collapse. Heading `# Heading`, inline/fenced code, escaped `\#tag`, HTML/URLs/link destinations do not become tags. Grammar/punctuation/source-offset edge cases have fixtures.

### TAG-02 — Filtering/autocomplete

Existing-tag autocomplete accessible with keyboard/touch. Selecting two tags requires both; clicking card tag updates visible filters. Published usage counts exclude draft/Trash. Large tag list remains usable without scrolling the entire desktop page.

### TAG-03 — Management

Rename, case-only rename, merge, remove across server statuses. Modify hashtag source spans only, preserve code/escapes/prose formatting. Update joins/search/versions/counts atomically. Target exists => merge confirmation, not surprise duplicate. Local draft is unchanged until explicit stale-tag resolution at posting; chain of history changes does not silently resurrect retired tag.

## 7. Literal search correctness

### SEARCH-01 — Required examples

| Content                        | Query           | Expected                             |
| ------------------------------ | --------------- | ------------------------------------ |
| `Learning TypeScript today`    | `typescript`    | Match                                |
| same                           | `typescrpt`     | No match                             |
| `今日食咗點心`                 | `點心`          | Match                                |
| `去香港飲茶`                   | `香港`          | Match (two-character fallback)       |
| `猫が好き`                     | `猫`            | Match (one-character fallback)       |
| `今天学习数据库`               | `数据库`        | Match                                |
| same                           | `資料庫`        | No match                             |
| `今日は図書館に行った`         | `図書館`        | Match                                |
| same                           | `としょかん`    | No match                             |
| `coffee at a new shop`         | `coffee shop`   | Match (all terms)                    |
| same                           | `"coffee shop"` | No match                             |
| `visited a coffee shop`        | `"coffee shop"` | Match                                |
| Body `coffee`; file `shop.pdf` | `coffee shop`   | Match across fields                  |
| same                           | `"coffee shop"` | No artificial phrase spanning fields |

### SEARCH-02 — Literal safety/oracle

Test `%`, `_`, quotes, `OR`, `NEAR`, asterisks, apostrophes, hyphens, emoji, width variants and combining forms. Unsupported malformed query syntax has clear validation. Compare FTS candidate/fallback results to a direct normalized literal oracle on randomized fixtures; no false negatives allowed from acceleration. Unicode length measured by codepoints, not UTF-16 length alone.

### SEARCH-03 — Filters/pagination/updates

Published-only. Search AND all tags AND selected-day range. Sort timeline descending, not relevance. Calendar month never silently bounds search. Cursor from another filter rejected. Edit/publish/draft/trash/restore/tag/file-name changes reflected immediately. Reindex yields equivalent results. Stale browser responses cannot replace newer search query results.

### SEARCH-04 — Snippets

Matches visibly highlighted, snippets escaped and safe. Unicode normalization cannot corrupt saved body or misapply HTML ranges. Malicious source text/snippet does not execute. Long note/result payloads remain bounded.

## 8. Calendar and scrolling

### CAL-01 — Month UI/navigation

Correct weekday/day count/leap years, optional week-start setting. Heat shades correspond to note counts; zero/today/selection distinguishable and accessible. Arrows, quick month/year picker, Today work across years. Counts always all published notes, independent of search/tags.

### CAL-02 — Continuous scrolling

Start at current month. Lazy older loading can show two months at a boundary. Top visible note controls month. Tall cards/images/Mermaid/Show more do not cause loops/flicker. Empty matching months skipped during scroll; manually selected empty month remains visible with clear action. Only notes pane is primary page scroll; sidebar/composer stationary.

### CAL-03 — Day mode

Click day filters to it. Scroll never leaves day. Clicking selected day/removing chip returns continuous timeline. Month jump clears day; Today clears day but retains search/tags. Search with day works within that day's local timezone boundaries.

### CAL-04 — Timezones

Examples around Hong Kong/Tokyo midnight, leap day, year boundary and America/New_York DST spring/fall. UTC storage with app-local `[start,end)` grouping. VPS/browser timezone changes do not override saved app timezone. Changing setting updates all counts/date filters predictably.

## 9. Markdown and media

### MD-01 — Rendering/code

Representative GFM renders consistently in preview/card/detail. Code copy is original code including whitespace, with language label and feedback. Code scrolls within block, not page. Unsupported code language has safe readable fallback. Unsafe HTML/links/schemes do not execute.

### MD-02 — Mermaid

Valid flow/sequence diagram, invalid syntax, large diagram and malicious SVG/click/link payloads. Lazy dynamic load only when needed, visible rendering/debounce, no attacker network fetch/callback, no crash of the editor/note. Light/dark diagram contrast acceptable. Sanitization preserves safe diagrams while blocking unsafe constructs.

### IMAGE-01 — Processing

Orientation corrected, no upscale, correct output limits/quality, transparent static image supported, metadata absent. Only display/thumbnail WebP retained after success, original absent even after restart. Animation rejects clearly; corrupt/spoofed/too-large input rejects. Multiple concurrent inputs respect one processing job.

### IMAGE-02 — Viewer

Click opens larger WebP, zoom/pan, image navigation/swipe, download outputs WebP. Dimensions prevent layout shift; unloaded large images do not all download on initial view. Small screenshot text judged manually for readability at chosen quality.

### FILE-01 — Privacy/download

Original bytes unchanged, filename/size correct, safe Content-Disposition and nosniff. HTML/SVG download-only. No path traversal via filename/ID; unauthorized access denied to thumbnail/display/file/backup. Last-reference deletion correct for cloned notes and Trash.

### GEO-01 — Explicit optional location

No automatic permission request. Current/manual coordinates validate; denial/timeout not blocking. Optional label and accuracy preserved, manual accuracy nullable. Remove leaves no card row. Popover copy works; external map only opens after explicit click, no reverse-geocoding/embed requests.

## 10. UI/accessibility

### UI-01 — Appearance

Warm quiet light theme, usable dark theme, muted-green accent. System theme default; explicit theme overrides. Comfortable/compact and collapsed/full preferences persist and apply across views. No separate title fields or masonry.

### UI-02 — Responsive/keyboard

At least 360x800, 390x844, 768x1024, 1440x900 and short desktop viewports. No clipped essential action/horizontal overflow. Drawer/detail/image/editor keyboard focus and return, Escape safety, screen-reader labels, reduced motion, 200% zoom and AA contrast reviewed. Mobile keyboard does not hide Post or destroy draft. Touch-only workflow works.

### UI-03 — Context/error states

Loading/empty/no-match/storage-full/permission-denied/upload-failed/conflict/maintenance/invalid-backup states show recovery action. No full-screen spinner for routine tag switch/post. Browser Back restores useful timeline state. A failed action never displays irreversible success.

## 11. Full backup and uploaded restore

### BACKUP-01 — Scope/consistency

Manual create only, stored privately on server, complete archive listed/downloadable/deletable. Includes published/server-draft/Trash/tag/date/location/attachment/settings/account/MFA/portable keys. Excludes browser drafts/files, prior archives, pending uploads, sessions/challenges/transient catalogs. Concurrent note/tag/status/security changes produce a coherent snapshot, not mismatched files/DB. Live SQLite WAL changes preserved through online snapshot.

### BACKUP-02 — Protection/failure

Fresh authentication for create/download/delete; no passphrase prompt. UI warns archive unencrypted/sensitive and server copy alone not disaster protection. Full disk/timeout/restart never marks a half-archive complete. Streaming process has bounded RAM. Checksums catch corruption but are not claimed as authentication/encryption.

### RESTORE-01 — Round trip

Create/download archive, modify/delete live data, upload original archive through Settings, inspect summary, confirm restore. All included state restored. Account/password/MFA/recovery-code state restored; old sessions revoked and login required. Domain/environment stays destination-configured. Rebuilt search equals original. Local browser drafts not included/overwritten; stale edits checked when reopened.

### RESTORE-02 — Independent replacement instance

Deploy separate compatible app with new data dir and different domain, securely initialize temporary access, upload backup in Settings, restore. Sign in with archived account/TOTP, view/download all expected files. Confirms required key material really portable; original server not needed.

### RESTORE-03 — Malicious/corrupt input

Traversal including Windows paths/PAX normalization, absolute paths, symlink/hardlink/device/duplicate entries, wrong sizes/checksums, excess expansion/count, unsupported newer schema, corrupt DB, unexpected triggers/views/virtual-table modules despite matching version, missing key/files all rejected before replacement. Old app still usable. Validation never executes untrusted SQL or loads SQLite extensions.

### RESTORE-04 — Rollback/crash drill

Inject failure and process kill before capture, during staged validation, after old state moved, after DB swap before files/keys, before/after reopen/reindex. Startup journal results in complete old or complete restored state, never mixture. Recovery procedures documented/tested. Restore cannot leave write gate locked forever or delete unrelated completed backups.

## 12. Initial performance budgets and measurement

These are engineering targets, not previously measured promises. Record hardware, dependency versions, fixture sizes and network conditions with results. If a target is missed, investigate before changing the architecture or silently relaxing it.

### Dataset

10,000 synthetic notes, average about 2 KB text, multilingual distribution, hundreds of tags, date spread across several years, small image/file sample. Include some very long code/diagram notes separately. Optional 100k-note stress run is informative, not the initial release scale guarantee.

### Targets on roughly 2-core/4 GB Linux VPS

- Typical indexed list/tag/calendar queries: aim p95 under 100 ms server-side.
- Typical trigram search: aim p95 under 150 ms; short literal scan on 10k notes under 300 ms.
- Initial useful timeline visible around 1 second on a warm reasonably nearby connection; separate network/SSR/browser timings.
- Interactions visibly respond immediately; do not wait for save to show progress/feedback.
- Initial list about 30 notes, never whole dataset; keep typical compressed page payload around a few hundred KB and measure actual bundle separately.
- No Mermaid payload on pages without diagrams.
- Aim idle application RSS below about 500 MB; realistic uploads/backup peak below about 2 GB. Worst-case allowed images must not OOM the VPS; tune bounded caches/queues/limits if needed.
- Image/backup jobs may take seconds; progress and retryability matter more than an unrealistic instant-processing promise.
- Repeated scrolling, preview and viewer open/close must not leak blobs/observers/timers or grow unbounded caches.

Use warm/cold runs and p50/p95; report short queries explicitly rather than hiding them in averaged English results. Verify useful writing/search remains responsive during bounded processing/backup operations.

## 13. Final verification record

At S18, record in PROGRESS or a linked results file:

- Release/repository revision and runtime/dependency/container versions.
- Check/lint/unit/integration/e2e/build outputs or concise actual summaries.
- Browser/device/accessibility review results.
- Benchmark methodology and measurements.
- Linux restart and independent uploaded-restore drill evidence.
- Explicit remaining limitations, if approved.

No required feature may remain mocked, manually untested, or described as done solely because code was generated.
