# PandaNote — Acceptance and verification matrix

## Vault (approved change)

- VAULT-01: default-public composer lock toggle; private Post works while locked,
  clears the editor on receipt-confirmed save and does not appear in locked views.
  Privacy is revision/digest-bound and preserved by editing/copies/retries/Trash.
- VAULT-02: Vault between Templates/Trash on desktop/drawer/rail; password modal
  rejects wrong/invalid credentials, rate-limits attempts, accepts password without
  MFA, and opens only private notes. Refresh/other tabs share this session's unlock;
  another session does not. App-title Home shows mixed notes without relocking.
- VAULT-03: closed server views omit private bodies/snippets/pins, private-only
  tags/counts/autocomplete, calendar activity and Trash; direct note/file reads,
  conflicts, rename and attachment reuse cannot bypass it. Explicit public file
  references stay readable. Shared hidden-note tag changes require unlock.
- VAULT-04: Close Vault hides private content in every tab, invalidates cursors/
  history, clears private editors/conflicts and retains public unsaved work.
  Failed status refresh fails closed with retry. No private note history snapshots
  or Vault-open tag retry names are persisted to browser storage.
- VAULT-05: full archive includes private content with checked privacy values;
  independent restore preserves privacy but strips all sessions/unlock state.
  Old incompatible baseline data is refused without modification/deletion.

Mapped to `tests/integration/vault.test.ts`, extended backup/restore integration,
note/editor/tag canonical unit tests and `tests/e2e/vault.test.ts`. Run affected
posting/timeline/edit/detail/tag/editor/shell browser regressions plus actual
Alpine native/archive validation before declaring the change done.

## Security hardening (approved change)

Cases SEC-LOCK, SEC-SETUP, SEC-MFA and SEC-XFF in
[security-hardening/ACCEPTANCE_TESTS.md](security-hardening/ACCEPTANCE_TESTS.md).
SEC-SETUP-1 to -13 are in force: account creation requires the setup code printed to
the server log, so the old "first visitor owns the instance" wording no longer applies.

## Voice clips (approved change)

Cases VN-REC, VN-LIMIT, VN-POST, VN-SERVE, VN-PLAY, VN-BACKUP and VN-MANUAL in
[voice-notes/ACCEPTANCE_TESTS.md](voice-notes/ACCEPTANCE_TESTS.md).

## Note card actions (approved change)

Cases NA-LAYOUT, NA-MENU, NA-PIN, NA-EDIT, NA-DELETE in
[note-actions/ACCEPTANCE_TESTS.md](note-actions/ACCEPTANCE_TESTS.md). Card/note-page
Delete no longer asks for confirmation and shows no Undo; the note page has no
Restore/Permanently delete (NOTE-02 restore and confirmed permanent delete run from
the Trash page).

## Current change acceptance (supersedes DRAFT-01–05)

- EDITOR-01: no Drafts UI/status/actions or browser note/blob persistence; ordinary
  Post preserves unfinished writing as a note. Reload/crash has no recovery.
- EDITOR-02: internal navigation, mobile close, replacement edit and signout offer
  Post/Save changes, Discard, Cancel; empty/unchanged editor does not prompt.
  Cancel retains all work, Discard never changes an existing server note.
- EDITOR-03: actual browser unload Leave/Stay works; Stay retains memory, accepted
  reload loses unsaved text/files with no hidden upload or auto-post.
- EDITOR-04: failed/mid-upload/lost-commit responses retain mounted text/files and
  exact retry identity. Repeated save yields one note/file. New editable attempts
  remap IDs already bound to old batches; discard cannot undo an uncertain commit.
- EDITOR-05: complete server snapshots seed edits, same-revision restore identity
  checked, conflicts keep losing bytes; copy and newly observed replace remain
  revision-checked. Fresh schema rejects drafts, tag/Trash/archive contracts agree;
  no legacy migration/import or automatic development-data deletion.
- YEAR-01 (later user override): inline picker in the calendar's position, twelve
  Jan–Dec links in 4 × 3; year between arrows, click to enter 1969–9998 (Enter
  applies, Escape cancels, invalid input errors). Escape/outside click dismiss;
  no modal, miniature heatmaps, quick-year list or year-activity request. Browsing
  changes no filters; selection retains search/tag and clears day. Month heatmap
  counts still cover all ordinary notes with timezone/week-start/leap/DST handling.

Covered by editor-session/model/posting unit, calendar/notes/status/tags/archive
integration, editor-session/posting/detail/calendar browser tests. Common/full
browser and actual Linux native/archive gates remain required. Historical draft
acceptance cases below are superseded, not missing current functionality.

## 1. Verification rules

These are expected tests, not claims that tests already exist or pass. Add cases alongside implementation; keep a mapping from these IDs to actual test files in PROGRESS or the test README.

- Unit: pure query/tag/timezone/state-machine/validation behavior.
- Integration: real production SQLite tokenizer, transactions, native image processing, private filesystem, auth and archive operations in isolated temporary directories.
- Browser: real reloads, IndexedDB/localStorage, network failures, dialogs, scrolling, downloads/uploads and two-context conflicts with Playwright.
- Manual: mobile virtual keyboard/gestures, contrast/visual review and actual VPS restore drill.

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

Empty deployment redirects to browser setup. Account creation requires the setup code
printed to the server log (SEC-SETUP-1 to -13 in
[security-hardening/ACCEPTANCE_TESTS.md](security-hardening/ACCEPTANCE_TESTS.md)).
The correct code with username/email/password/confirmation creates exactly one
account/session within the 60-minute process-start window. Missing or wrong codes
create nothing. No default credential or registration after setup. Concurrent second
creation returns already_set_up; closed window returns setup_closed and restart issues
a new code and reopens only unclaimed setup. Step two saves title/language/
timezone atomically; unfinished setup resumes after login and blocks normal app APIs.
After completion, signed-out pages redirect to username login; setup cannot replace
an existing/restored account. SET-01–09/ACC-01–05 below extend this gate.

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

Create two new drafts with distinct text/date/files. Reload/restart and resume independently. Text/metadata present in localStorage; binary blobs present in IndexedDB. No separate note title. Discard one leaves the other intact.

### DRAFT-02 — No premature upload

Intercept requests while typing, adding image/file, switching preview, setting date and navigating away. No new-draft body/blob is uploaded. Background fetching existing server data is allowed; do not confuse it with draft sync.

### DRAFT-03 — Quota and missing blobs

Force localStorage/IndexedDB failure, persistent-storage denial and missing blobs. Visible recoverability warning; no false “saved” state. Missing image references require repair/removal; broken note never silently publishes. Browser-data deletion is not presented as recoverable from server backups.

### DRAFT-04 — Local recovery and tabs

Text autosave survives reload without relying solely on unload. Editing same local draft in two tabs does not silently discard one version. Logout leaves data locally but hides authenticated UI; session expiry never drops unsaved work. Blob URLs do not persist/leak after views close.

### DRAFT-05 — Server draft semantics

Published note moved to draft keeps server body/attachments/dates. Normal search/calendar excludes it. Edit on device A, reload: local edits recover. Device B sees only last server version. New files on A remain local until Post. No Save draft/background server save. Republish preserves timeline date and clears only the confirmed local edit copy.

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

English case-insensitive identity; Unicode Cantonese/Chinese/Japanese tags and marks supported. Flat only; `/` ends a tag. Duplicate tags collapse. Heading `# Heading`, inline/fenced code, escaped `\#tag`, HTML/URLs/link destinations do not become tags. Grammar/punctuation/source-offset edge cases have fixtures.

### TAG-02 — Filtering/autocomplete

Existing-tag autocomplete is a vertical, borderless list of at most five locally prefix-filtered options, with selected-row highlight and keyboard/touch access; typing narrows results without uploading content. Selection uses exactly one tag; repeated `tag` values are rejected. Card tags select the tag view without a redundant tag chip. Published usage counts exclude Trash. Large tag list remains usable without scrolling the entire desktop page.

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

Test `%`, `_`, quotes, lower-case `or`/`and`/`not`, quoted `"OR"`, `NEAR`, asterisks, apostrophes, hyphens, emoji, width variants and combining forms. Unsupported malformed query syntax has clear validation. Compare FTS candidate/fallback results to a direct normalized literal oracle on randomized fixtures; no false negatives allowed from acceleration. Unicode length measured by codepoints, not UTF-16 length alone.

### SEARCH-03 — Filters/pagination/updates

Published-only. Search AND the single selected tag AND selected-day range; several `tag` values are rejected. Sort timeline descending, not relevance. Calendar month never silently bounds search. Cursor from another filter rejected. Edit/publish/draft/trash/restore/tag/file-name changes reflected immediately. Reindex yields equivalent results. Stale browser responses cannot replace newer search query results.

### SEARCH-04 — Snippets

Matches visibly highlighted, snippets escaped and safe. Unicode normalization cannot corrupt saved body or misapply HTML ranges. Malicious source text/snippet does not execute. Long note/result payloads remain bounded.

### SEARCH-05 — Boolean operators and tag terms

- `a OR b`, `a AND b`, `a NOT b`, `NOT a`, `(a OR b) c`, nested groups and chained NOT return exactly the notes the literal oracle expects across body, tag and file-name fields; precedence is NOT > AND > OR; adjacent terms are AND.
- Lower-case `and`/`or`/`not`, quoted `"OR"`/`"(x)"`/`"tag:x"`, `NEAR`, `%`, `_`, `*` and hyphens are literal. Full-width parentheses group.
- `tag:work` matches only the exact tag (not `work-log`, not body text); `NOT tag:old`, `tag:a OR tag:b` work and combine with the single `tag` filter and day by AND. Several `tag` params are still rejected.
- Malformed input (`a AND`, `OR a`, `()`, `(a`, `a)`, `tag:`, >8 nesting, >40 operators, >20 units) gives a localized validation message, keeps the typed text, leaves the URL/results unchanged and never reaches SQL as syntax.
- Randomized SQL (FTS candidates on and off) equals the oracle with no false negatives, including NOT-only, OR with short CJK units and OR branches that cannot be indexed. Canonical forms are order/redundancy independent, idempotent and keep the old pure-AND form; a cursor from another expression is rejected.
- Only positive terms are highlighted; pure-negative queries show no snippets. Trash search uses the same grammar. Tags-page search accepts the grammar over tag names (`#` ignored, `tag:` exact) and shows invalid input beside the field. The search help control toggles the syntax note (keyboard operable, `aria-expanded`).
- Short-term/OR/NOT-only scans are measured in the search benchmark and reported with the other short-query timings.

## 8. Calendar and scrolling

### CAL-01 — Month UI/navigation

Correction to the earlier compact-density implementation: narrow means calendar
container width <= 280 CSS px, not the density setting. At 240px sidebar width,
Chinese headers must show only `一 二 三 四 五 六 日` on one line at every density.
At 480px sidebar width, full Chinese names return. Check visible text and actual
label geometry, not merely the existence of hidden short-label markup.

Correct weekday/day count/leap years, optional week-start setting. Weekdays use three-letter English abbreviations with full-name titles; in narrow calendars, Simplified Chinese labels show only their numeral character while retaining the full-name title. Bold borderless month/year heading is left-aligned; previous/next arrows are grouped on the right. Compact square backgrounds behind date numerals form a monthly heatmap; heat shades correspond to note counts, with zero/today/selection distinguishable and accessible. Heading opens 12 month links in 4 columns × 3 rows; clicking the year enables direct text entry, and arrows on either side move years. The picker is inline, not a modal, and has no quick-year list or year-activity fetch. Browsing does not change filters; month selection clears day but retains search/tags. Verify 1969/9998 bounds, keyboard focus/Escape/return, four-column mobile targets and light/dark contrast. Arrows, quick month/year picker, Today work across years. Counts always all published notes, independent of search/tags.

### CAL-02 — Continuous scrolling

Start at current month. Lazy older loading can show two months at a boundary. Top visible note controls month. Tall cards/images/Mermaid/Show more do not cause loops/flicker. Empty matching months skipped during scroll; manually selected empty month remains visible with clear action. Only notes pane is primary page scroll; sidebar stationary, homepage composer/filter region scrolls with cards. Back to Top below the timeline returns that pane to zero without changing filters/history, retains draft text and restores composer access.

### CAL-03 — Day mode

Click day filters to it. Scroll never leaves day. Clicking selected day/removing chip returns continuous timeline. Month jump clears day; Today clears day but retains search/tags. Search with day works within that day's local timezone boundaries.

### CAL-04 — Timezones

Examples around Hong Kong/Tokyo midnight, leap day, year boundary and America/New_York DST spring/fall. UTC storage with app-local `[start,end)` grouping. VPS/browser timezone changes do not override saved app timezone. Changing setting updates all counts/date filters predictably.

## 9. Markdown and media

### MD-01 — Rendering/code

Representative GFM renders consistently in preview/card/detail. Single newlines in ordinary text become visible breaks, including around hashtag spans, without changing stored Markdown or code bytes. h1–h4 use compact spacing. Cards hide eligible hashtag tokens in their body while showing chips; preview/detail/search retain those tokens. Code copy is original code including whitespace, with language label and feedback. Code scrolls within block, not page. Unsupported code language has safe readable fallback. Unsafe HTML/links/schemes do not execute.

### MD-02 — Mermaid

Valid flow/sequence diagram, invalid syntax, large diagram and malicious SVG/click/link payloads. Lazy dynamic load only when needed, visible rendering/debounce, no attacker network fetch/callback, no crash of the editor/note. Light/dark diagram contrast acceptable. Sanitization preserves safe diagrams while blocking unsafe constructs.

### IMAGE-01 — Processing

Orientation corrected, no upscale, correct output limits/quality, transparent static image supported, metadata absent. Only display/thumbnail WebP retained after success, original absent even after restart. Animation rejects clearly; corrupt/spoofed/too-large input rejects. Multiple concurrent inputs respect one processing job.

### IMAGE-02 — Viewer

Click opens larger WebP, zoom/pan, image navigation/swipe, download outputs WebP. Dimensions prevent layout shift; unloaded large images do not all download on initial view. Small screenshot text judged manually for readability at chosen quality.

### FILE-01 — Privacy/download

Original bytes unchanged, filename/size correct, safe Content-Disposition and nosniff. HTML/SVG download-only. No path traversal via filename/ID; unauthorized access denied to thumbnail/display/file/backup. Last-reference deletion correct for cloned notes and Trash.

## 10. UI/accessibility

### UI-01 — Appearance

Warm quiet light theme, usable dark theme, muted-green accent. System theme default;
title-row theme icon toggles the effective mode to explicit light/dark. Title-row
language icon toggles English/Simplified Chinese and persists across reload/SSR.
No Appearance tab or General language selector. General's single Save covers
site title/tagline, Compact/Comfortable (default)/Spacious density and collapsed/full
preferences. Header updates never overwrite staged General choices, and General
saves never revert header language/theme. Network/validation failures retain current
preferences/staged fields and offer retry. Icons are named, keyboard/touch accessible,
right of the ellipsized title without overflow on desktop, mobile header or drawer.
No separate note title fields or masonry.

### UI-02 — Responsive/keyboard

Sidebar width survives same-tab refresh/navigation through `sessionStorage`,
reclamps to viewport bounds, and resets after sign-out or in a new tab opened
without an opener. Do not clear it on refresh or clear unrelated browser data.
Blocked session storage must show a localized warning while resizing still works.

Mobile keeps a narrow icon rail (expand arrow, panda Home, Search, Calendar, Tags,
Templates, Vault, Trash, Settings). Expand/collapse arrows and Escape preserve
focus; Search/Calendar focus the corresponding expanded-sidebar control. Direct
links navigate through the existing unsaved-editor guard. Rail controls remain
reachable on short screens; 44px targets, no horizontal overflow. Expanded/desktop
title, Tags and utility text share the same left edge.
The desktop sidebar and expanded mobile drawer omit the app version and show
“Powered by Pandanote,” with only “Pandanote” linking to the project GitHub
repository. The full attribution stays in English when the app language is
Simplified Chinese.

At least 360x800, 390x844, 768x1024, 1440x900 and short desktop viewports. No clipped essential action/horizontal overflow. Desktop sidebar right edge supports pointer-captured mouse/pen/touch dragging and keyboard Left/Right/Home/End, with visible focus and width bounds preserving the main column. It disappears in mobile drawer mode. Drawer/detail/image/editor keyboard focus and return, Escape safety, screen-reader labels, reduced motion, 200% zoom and AA contrast reviewed. Mobile keyboard does not hide Post or destroy draft. Touch-only workflow works.

### UI-EDITOR — Concise integrated composer

Writing, preview, feedback and Post/Save changes share one textarea-style surface.
Only the bottom toolbar (Privacy/Templates/Media/File/Voice/Date icons at left, Preview switch, focus
icon and publishing control at right) holds permanent editor actions; nothing floats
in the top corner. Each icon has an accessible name and keyboard access, with no
premature upload. No hashtag insertion button is shown; typing `#` still uses local
autocomplete. Preview toggles raw/rendered text without loss. A confirmed post resets
to an empty text editor with Preview off and Post disabled; failure retains the
current editor and preview state.
After confirmed posting in focus mode, the overlay closes to reveal the timeline
on desktop and mobile; failed/uncertain saves retain the overlay and preview/content,
and a successful receipt-first retry closes it without duplicating the note.
Focus mode replaces the expand icon with X; close/Escape
retains text/files/metadata, returns focus and does not publish. Controls and at least
one text line remain reachable with mobile safe areas/keyboard-shrunken height.
Compact timeline text grows from its minimum to the cap, then internally scrolls;
verify long input, deletion/shrink, window resize and focus-mode open/return. Defaults
are 10rem minimum and `min(24rem, 60vh)` maximum. No writing placeholder, new-note
guidance or "Saved on server." footer text; errors/progress/edit guidance remain.
Save tests synchronize on cleared composer/server receipt, not hidden success text.
The grow/cap geometry still needs a dedicated browser regression; existing editor
and posting passes alone do not prove that behavior.

### UI-03 — Context/error states

Loading/empty/no-match/storage-full/permission-denied/upload-failed/conflict/maintenance/invalid-backup states show recovery action. No full-screen spinner for routine tag switch/post. Browser Back restores useful timeline state. A failed action never displays irreversible success.

## 11. Full backup and uploaded restore

### BACKUP-01 — Scope/consistency

Manual create only, stored privately on server, complete archive listed/downloadable/deletable. Includes published/server-draft/Trash/tag/date/attachment/settings/account/MFA/portable keys. Excludes browser drafts/files, prior archives, pending uploads, sessions/challenges/transient catalogs. Concurrent note/tag/status/security changes produce a coherent snapshot, not mismatched files/DB. Live SQLite WAL changes preserved through online snapshot.

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

## Release versioning enhancement

VER-01–08 in [VERSIONING_PLAN.md](VERSIONING_PLAN.md) define the approved additional
acceptance gate: deterministic UTC committer-date/first-parent numbering; clean and
complete Git history; immutable committed-source builds; latest/version alias identity
and OCI/SSR/browser version equality; automatic usable-engine detection with explicit
overrides and actionable missing-engine failures; native source-build prerequisites
in both install stages but not runtime;
no runtime override or restore coupling; responsive sidebar/drawer/About; explicit
Development builds and rejection of missing/invalid production metadata.

## Startup and minimal deployment

- Root docker-compose.yml with the canonical ORIGIN set, loaded
  `localhost/pandanote:latest` image and existing Caddy network start a fresh private
  bind with only docker compose up. No manual
  initialization. Recovery before key/DB reads, trusted SQL + registered data steps,
  default settings before listening; repeated current startup is a no-op.
- Existing pending migrations first make a private online WAL-consistent DB copy
  - from/to schema/app/time manifest; fresh/current DBs skip it. Space refusal and
    SQL/data failure prevent serving, preserve live DB/ledger, emit safe actionable logs.
    Known older archives migrate only on trusted staging; format-1 pre-release data
    and unknown/newer/altered histories refuse. The copy is excluded from archives/
    restore swaps, shown in Storage; literal atomic directory exchange remains open.
- Default/non-default positive PUID/PGID, owner-only modes, cleared supplementary
  groups and zero permitted/effective server capabilities must pass on Linux.
  Root inventory rejects links/external hardlinks/special files/nested filesystems;
  internal snapshot hardlinks remain supported. PID 1 is Node after execve.
- Default idle stop exits 0 within 10 seconds; interrupted backups fail on restart,
  no partial archive is listed complete. Restore replacement is journal-recovered.
- Minimal one-service external-Caddy topology: no bundled proxy, published app port,
  static IPs, hardening/ops services or resource overrides. Only one process/data tree.
  Private TCP peers use one XFF/absent peer fallback; malformed/chained 400, public
  spoof ignored; default Caddy replaces untrusted XFF and supports >1 GiB restore.
- Actual Docker and Podman build/export/Docker load/default reference must work;
  both archives load as `localhost/pandanote:latest` without post-load retagging.
- Interactive no-echo reset-password must revoke live sessions/MFA without restart
  or content changes, refuse pipes/args/no account/pending recovery. Reindex stopped.
  Latest DB-copy rollback is not full disaster protection: download manual backups.

## Simplify setup acceptance mapping

SET-_, ACC-_, LANG-_, MIG-_, BAK-_, OPS-_, DEP-* and DOC-* in
[simplify-setup/ACCEPTANCE_TESTS.md](simplify-setup/ACCEPTANCE_TESTS.md) are the current
extended gates. Actual evidence/blockers are in the linked change PROGRESS; no pass
is implied by this expected matrix or by the historical S18 measurement record.

## Image optimization acceptance mapping

IMG-SIZE/DEP/NATIVE/PKG/SEC/RUN/UI/DATA/XFER/PERF/DOC in
[image-optimization/ACCEPTANCE_TESTS.md](image-optimization/ACCEPTANCE_TESTS.md)
require actual Alpine production/native/worker/source-CLI/PTY/grammar/private-data/
upgrade/rollback/large-TLS restore plus Docker and Podman build/compressed transfer
and corrupt-load safety. The read-only reporter separates aliases, stored blobs,
decoded layer tar and overlapping package/maps; compare the same platform/source/
format/gzip level, not Docker containerd raw tar to legacy Podman tar. Runtime lock
roots/versions/peers/overrides and installed inventory must be verified, with maps
removed before COPY and browser precompression retained. Expected reduction defaults
25% raw/20% gzip, no feature/security/production-config loss. Actual counts/results
and unresolved manual/ARM64/exact-user-commit limits are in its PROGRESS; no overall
release or SS01 atomic-exchange approval is implied.

## 13. Final verification record

At S18, record in PROGRESS or a linked results file:

- Release/repository revision and runtime/dependency/container versions.
- Check/lint/unit/integration/e2e/build outputs or concise actual summaries.
- Browser/device/accessibility review results.
- Benchmark methodology and measurements.
- Linux restart and independent uploaded-restore drill evidence.
- Explicit remaining limitations, if approved.

S18 results are recorded in `docs/RELEASE_RESULTS.md` (including the explicit not-performed list).

No required feature may remain mocked, manually untested, or described as done solely because code was generated.
