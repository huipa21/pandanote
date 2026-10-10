# PandaNote — Product specification

## 1. Status and priorities

This document consolidates the user's final choices. It is intended to carry the project across sessions and agents without reopening settled decisions.

Priority order:

1. Protect note content and prevent accidental loss.
2. Fast, simple everyday writing and reading.
3. Stable operation and low maintenance on a small VPS.
4. Consistent responsive UI and good multilingual support.

Deployment: one user, one application instance, a 2-core/4 GB RAM VPS with 60 GB storage. Mostly text notes, some images, rare other files. Internet access is acceptable; reliable offline operation and cross-device offline synchronization are not required.

**Settled stack:** SvelteKit + TypeScript, SQLite + Drizzle + better-sqlite3, remark/rehype, Shiki, Mermaid, Sharp, plain CSS, private local filesystem storage. Search stays inside SQLite. No Meilisearch or equivalent separate service.

## 2. Scope boundaries

Included in the first complete release:

- Single account with username/password authentication; required private email metadata,
  optional TOTP MFA and recovery codes.
- Two-step browser setup (account, then site title/language/timezone); automatic
  startup initialization and SQL/data migrations with a latest pre-upgrade DB copy.
- Markdown notes without separate titles.
- Local drafts and server draft status; browser recovery of unpublished work.
- Timeline cards; tags; literal multilingual search; month activity calendar.
- Backdating; optional geolocation; image and file attachments.
- Markdown preview, Mermaid, highlighted code with copy buttons.
- Responsive layout, theme/density/collapse preferences.
- Tag management; Trash; conflict detection.
- Manual full backup, web download, uploaded-archive restore.

Not included:

- Collaboration, public notes/sharing, public registration, roles.
- AI or semantic search, fuzzy/typo search, reading/romanization conversion.
- Automatic Traditional/Simplified conversion.
- Rich-text/block editor, nested tags, folders, embedded maps, reverse geocoding.
- Automatic backups, separate backup password, original-image retention.
- Full-text extraction from PDF/Office/files.
- Automatic conflict merging or automatic publication of drafts.
- PWA/offline sync infrastructure. It can be reconsidered after the agreed app works.

## 3. Visual language

### 3.1 Agreed appearance

- Warm, quiet personal-notebook feel, not an admin dashboard.
- Light theme: warm off-white page, white cards, subtle borders.
- Muted green accent for primary actions, links, selected filters, calendar activity.
- Light, Dark, Follow system. Initial setting: Follow system.
- Comfortable density by default, with Compact available in Settings.
- Long cards collapsed by default; preference can fully expand them.
- System fonts with native Chinese/Japanese fallback; no remote font dependency.
- Minimal motion, respecting reduced-motion preferences.

### 3.2 Implementation defaults, not additional user requirements

Use these as an initial design baseline and check them visually:

- Desktop sidebar initially about 272 px, adjustable by dragging its right edge; note column maximum about 760 px.
- Body text 16 px, line-height around 1.6; code smaller only if still readable.
- Cards about 10 px corner radius; subtle 1 px borders; little or no shadow.
- Comfortable card padding around 20 px; compact around 12–14 px.
- Collapsed card content height around 420 px desktop / 320 px mobile.
- Breakpoint around 900 px, chosen by layout needs rather than device detection.
- Ordinary interactive targets around 44 px on touch; visible keyboard focus.
- Theme colors must pass WCAG AA contrast where applicable. Pale green is not a justification for low-contrast text.

These values may be tuned without changing the product behavior. Keep them centralized in CSS tokens.

Suggested starting palette (implementation defaults; verify actual contrast):

| Token               | Light     | Dark      |
| ------------------- | --------- | --------- |
| Page background     | `#FAF9F6` | `#171C18` |
| Card/panel surface  | `#FFFFFF` | `#202822` |
| Primary text        | `#242B25` | `#EDF2ED` |
| Secondary text      | `#626C64` | `#A1B0A4` |
| Subtle border       | `#E2E6DF` | `#3D493F` |
| Primary accent      | `#3F6B4D` | `#88B695` |
| On-accent text      | `#FFFFFF` | `#132117` |
| Soft accent surface | `#EAF1E9` | `#293D2E` |

Use several lighter/darker accent tints for calendar heat; date numerals must remain readable at every level. Use semantic danger/warning colors for destructive/errors rather than green for everything.

### 3.3 Desktop shell

Fixed-height application shell; only the notes pane is the main scrolling surface.

Left sidebar:

1. App identity and search field.
2. All notes / Drafts navigation.
3. Month activity calendar.
4. Tags, with management access.
5. Trash and Settings at the bottom.

Main area:

- Compact composer above the timeline within the notes scroller; expands on focus and scrolls away with the notes.
- Back to Top button below the timeline returns the notes pane to the composer.
- Visible active filters and Clear all.
- Single-column chronological cards. Not masonry, despite the conversational use of “waterfall.” Reading order must be unambiguous.
- Sidebar, calendar, and search do not scroll away with notes. Drag the sidebar's right edge to adjust its desktop width; keyboard resizing is also available.

Large tag collections use a Show all/searchable panel. On unusually short screens, an independently scrollable sidebar section is permitted for accessibility; do not clip controls to preserve the fixed-shell appearance.

### 3.4 Mobile shell

- Compact fixed header with sidebar/search access.
- One note column with small outer margins; no horizontal page overflow.
- Sidebar becomes a drawer containing calendar/tags/navigation.
- A prominent compose button opens a full-screen editor.
- Note detail and image viewer use the available screen.
- Respect safe-area insets, dynamic viewport height, virtual keyboard, and touch targets.
- Do not rely on hover for any essential action.

## 4. Note content and composer

### 4.1 No titles

There is **no separate title field**. This supersedes the earlier optional-title choice. Markdown headings remain ordinary note content.

Draft/list labels use a safe content excerpt, or “Image note” / “File attachment” when text is absent. Do not persist a generated title as a product field.

### 4.2 Writing and preview

- Textarea-based Markdown editor initially; a heavyweight editor framework is unnecessary.
- Enter inserts a newline.
- Publishing happens only by activating the visible Post button. Do not register Ctrl/Cmd+Enter to publish.
- Write/Preview tabs in compact mode.
- Expanded desktop editor can optionally use side-by-side preview.
- Mobile uses Write/Preview tabs.
- Preview updates are debounced, particularly Mermaid.
- Image paste, drag/drop, and file picker supported.
- Images inserted at the cursor position in Markdown.
- Other files displayed as an attachment list below the rendered note.
- Image-only and file-only notes are valid; a completely empty note is not.
- Whitespace-only text and missing/failed attachments do not constitute content.

### 4.3 Post and save feedback

- Show upload progress and posting state; prevent double submission.
- Keep the draft until the server confirms the complete note save.
- On failure, show an actionable message and retain recoverable text/files.
- Retry must not create duplicate notes/files.
- On successful normal posting, insert the note without a full page reload. Position follows timeline date; a backdated note must not misleadingly become newest.
- Editing a published note uses Save changes, not Post. Drafts use Post.

## 5. Draft model and lifecycle

### 5.1 New local drafts

- Multiple unfinished drafts per browser are supported.
- Draft text and metadata persist in browser localStorage.
- New file/image blobs persist in browser IndexedDB.
- Before Post, no new-note content or attachment is uploaded to the server.
- Local drafts can be recovered after reload/browser restart on that browser/device.
- Other devices do not see them.
- Local drafts appear in the Drafts screen and are explicitly labeled local/device-only.
- Discard requires confirmation if content exists and removes associated local blobs.
- Clearing browser data, private browsing, quota eviction, or losing the device can remove them. The UI must not describe this as backup.
- Request persistent browser storage where supported and display storage errors. Failure to persist a blob must not look like success.

### 5.2 Server drafts

A published note may be moved to Drafts from its action menu:

- Database status changes to draft; contents, tags, location, and files remain.
- It disappears from published timeline, normal search, and calendar counts.
- It is available from Drafts on other devices.
- Editing it creates/updates a local recovery copy. **No Save draft button and no background server saving of edits.** This supersedes the earlier recommendation for explicit server draft saving.
- Existing server attachments remain referenced. Newly added files stay local until Post.
- Clicking Post saves edits and republishes it.
- Republishing keeps its original timeline date unless deliberately changed by the user.
- Recovered local edits on one device may be newer than the server draft; label that distinction.

### 5.3 Drafts screen

Separate sections for:

- Local drafts available on this browser, including local recovery edits where appropriate.
- Server drafts accessible from any authenticated device.

Avoid showing two indistinguishable copies of an edited server draft. Indicate a local recovery copy and use it when reopening on that device.

### 5.4 Published edits

- Opening the editor does not unpublish the note.
- Unsaved changes are kept locally until Save changes.
- Saving does not move the note to the top merely because it was edited.
- Show an edited indicator when content was changed.
- No automatic merge on conflicts; see section 12.

## 6. Timeline dates and Trash

Separate timestamps:

- Immutable system creation timestamp.
- Editable timeline date/time used for card order and calendar grouping.
- Last modification timestamp; record content edit timing distinctly if necessary so status-only changes do not falsely imply a text edit.

Backdating is exposed in secondary editor options. Store instants in UTC and display/group using the configured app timezone, not the VPS timezone.

Implementation default: future scheduling is out of scope. Initially restrict an edited timeline instant to now or earlier; explain validation instead of silently clamping it. If future dates are later desired, discuss publication semantics first.

Trash:

- Delete is soft deletion into Trash.
- Preserve whether the note was published or draft before deletion.
- Restore returns it to the prior status, preserving dates/files.
- Permanent delete requires explicit confirmation.
- No automatic Trash emptying.
- Trash is excluded from normal search/calendar/timeline.
- Attachment bytes still in Trash count toward storage.

## 7. Tags

- Inline hashtags, with autocomplete of existing tags.
- Flat tags only; no parent/child behavior.
- Unicode Chinese/Japanese/Cantonese characters supported.
- English tag identity is case-insensitive: #Work and #work are the same tag.
- Ignore code blocks, inline code, raw HTML, URLs/link destinations, and escaped hashtag markers when extracting tags.
- Markdown heading markers are not tags.
- Deduplicate tags per note.
- Sidebar filtering with multiple selected tags means **match all**.
- A card's tag is clickable; filter state is visible/removable above the timeline.

Manage tags includes:

- Rename.
- Merge into an existing tag.
- Remove tag from notes without deleting those notes.
- Published-note usage counts.

Management edits actual hashtag spans in affected server-stored note bodies, not merely registry labels. Preserve all unrelated text/formatting; code is untouched. Server drafts and Trash also require consistent rewrites. Increment affected note versions for conflict detection.

Local drafts are not silently rewritten. Before posting, check tags against known rename/merge/removal history and offer an explicit resolution if needed. Do not reintroduce a retired tag accidentally without warning.

## 8. Exact multilingual search

Meaning: normalized literal substring matching, not whole-note equality, fuzzy search, or semantic similarity.

- Search published Markdown source, tags, and attachment filenames.
- Code content is searchable.
- Do not search inside files.
- Multi-term query: all terms must match somewhere in the note's searchable fields.
- Quoted text is one exact phrase.
- Terms without spaces, e.g. 香港 or 図書館, are literal substrings.
- English matching is case-insensitive.
- No automatic Traditional/Simplified equivalence, Japanese reading conversion, or Jyutping.
- Update after a short typing pause; cancel/ignore stale responses.
- Show safe highlighted snippets.
- Results are newest-first by timeline date, not relevance-ranked.
- Search and tag filters cover all months unless a day filter is selected.
- Calendar's active month is not an implicit search filter.
- Search, tags, and selected day combine using AND.
- Visible filter chips and Clear all.
- Cursor pagination/lazy loading for results, not a download of the whole collection.

Short Chinese/Japanese queries must work. Trigram acceleration applies only where suitable; one/two-character queries have a literal scan fallback. Measure performance rather than promising that all searches are index-only.

## 9. Month activity calendar and scrolling

### 9.1 Calendar appearance

- A conventional month calendar grid, not a year repository heatmap.
- One color varying light-to-dark reflects daily published note count.
- Zero-count days neutral; today marker distinct from selected-day outline.
- Counts use editable timeline date in the configured timezone.
- Counts include all published notes, regardless of current tags/search.
- Three-letter weekday labels (Mon, Tue, Wed, Thu, Fri, Sat, Sun).
- Month/year heading on the left with no obvious border; previous/next month arrows grouped on the right.
- Clickable heading opens a quick year/month picker.
- Today returns to current month and clears the selected-day filter; retain search/tags unless Clear all is chosen.
- Week-start preference can be placed in Settings; initial default Monday.

### 9.2 Continuous timeline mode

- Begin at the current month; load a small page, then older notes as needed.
- Scrolling down can load previous months; two months can briefly be visible at a boundary.
- Calendar tracks the month of the top visible note in the notes scroller.
- The calendar must not lag by whole pages or flicker between months on minor layout changes.
- Use visible month separators and stable scroll anchoring.
- Skip empty matching months during ordinary scrolling; do not fetch every intervening empty month one by one.
- Manual month navigation positions the timeline at that month's newest matching notes.
- A manually selected empty month shows an empty state; do not immediately auto-jump away. Provide Load older notes/return to Today.
- Backward navigation and browser Back should preserve filters and useful scroll position.

### 9.3 Day-filter mode

- Click day: show only that day's matching notes.
- Scroll never escapes to other days/months in this mode.
- Click selected day again or remove its chip: return to continuous timeline.
- Month navigation clears the selected day before jumping.
- Choosing another day replaces the prior day filter.

## 10. Markdown, images, and files

### 10.1 Rendering

- Markdown rendered safely through remark/rehype.
- No unsafe raw HTML execution.
- Highlighted code blocks have language label, horizontal scrolling, Copy button, and confirmation feedback.
- Copy uses original code, not HTML or line labels.
- Mermaid fenced code supported, syntax errors shown cleanly.
- Load Mermaid only when required; render visible diagrams on demand and debounce preview.
- Strict Mermaid security, sanitized output, no diagram click scripts/external assets.
- Long-card collapse must not trigger huge offscreen diagram work unnecessarily.

### 10.2 Image lifecycle

- Static images only. Reject animation with a clear error; do not silently discard frames.
- Uploaded originals exist only temporarily for processing and are not retained after successful posting.
- Local unposted drafts may temporarily retain their selected original image blobs.
- Correct orientation; strip EXIF/GPS metadata.
- Generate WebP display image and WebP thumbnail.
- Initial configurable defaults: display max long edge 2560 px / quality ~85; thumbnail max long edge 480 px / quality ~75. Never upscale.
- Image input limit 20 MB, decoded limit 50 megapixels; configurable.
- Process one image at a time initially.
- Store output dimensions to avoid layout shift.
- Cards use appropriately sized/lazy-loaded images; viewer loads the larger image.
- Viewer supports zoom/pan, previous/next images in that note, mobile swipe, and display-WebP download.
- No original download option.

### 10.3 Other attachments

- Files kept unchanged, with original filename, MIME information, size, stable identifier.
- Initial configurable limit 50 MB per file.
- Render as download rows below content.
- No arbitrary HTML/SVG inline preview; active files download with safe response headers.
- Authenticated routes only. Uploads, files, thumbnails, and backups are never public static assets.
- Removing one file reference must not delete bytes still used elsewhere/in Trash.
- Storage usage visible; protect disk reserve rather than treating all 60 GB as available app data.
- Implementation safety default: unused-upload cleanup explicitly abandons whole
  posting attempts only after 24 hours without server activity. Resume/upload
  renews protection; cleanup rechecks active uploads and all note references.
  Nothing expires automatically. Local drafts/files remain, but an abandoned
  frozen attempt needs a separate editable copy before posting again.

## 11. Optional location

- Off by default; no tracking on page load.
- Add location explicitly requests browser permission.
- Failure/denial does not prevent posting.
- Support current location and manually entered latitude/longitude.
- Store latitude, longitude, reported accuracy when available, optional manually entered label.
- Manual coordinates need no invented accuracy.
- Location chip in editor can be edited/removed.
- No location: no card row, empty space, or placeholder.
- Card location opens a small popover with label, coordinates, accuracy if known, copy action, and Open map link.
- External map is opened only by explicit action; no embedded map/reverse geocoder.
- Browser geolocation requires HTTPS outside localhost; accuracy is not guaranteed.

## 12. Detail, edits, and conflicts

- Show more expands an individual card.
- Open note uses a centered detail dialog on desktop and full-screen view on mobile.
- Stable private URL for each note; direct navigation/refresh works.
- Closing returns to prior timeline filters and scroll position.
- Detail always shows full content and metadata.
- Dialog focus is trapped appropriately, Escape closes where safe, focus returns to opener.

Concurrent edit handling:

- Every server note has a revision/version.
- Update requires expected revision, including status changes, tag management, date edits, and deletion.
- Conflict never silently overwrites the newer server version.
- Keep local edits and new file blobs.
- Offer Load server version, Save local version as a separate note, or Explicitly replace current version after confirmation.
- Explicit replace still checks the newly observed revision; another race must produce another conflict.

## 13. Authentication and configuration

- One account, no registration after setup. An empty deployment redirects to
  `/setup`: username, required email, password and confirmation, then
  `/setup/preferences`: site title, language and timezone (browser defaults,
  explicit Finish setup, no skip/theme/week-start). Leaving after account creation
  resumes preferences after login; normal data APIs are blocked until completion.
- **Approved first-visitor ownership:** no setup secret. Account creation is open
  for 60 minutes from process start while no account exists; restart reopens that
  window only for an unclaimed instance. Claim promptly or restrict access until
  ready. A concurrent second creation cannot replace the singleton account.
- Username is trimmed/lowercased, 3–32 ASCII letters/digits/`.`/`_`/`-`; login is
  case-insensitive with generic credential errors and equivalent unknown-name work.
  Email is trimmed, required, basic `local@domain` syntax and at most 254 characters;
  private metadata only, no verification/sending/email recovery.
- Password is exact 8–128 Unicode characters and at most 1024 UTF-8 bytes, without
  trimming/normalization/complexity rules. Settings → Account username/email edits
  require fresh authentication but do not revoke sessions.
- Settings → General edits plain-text site title (trimmed 1–60 characters, no
  controls) and registry language. Title appears escaped in tabs, sidebar/mobile
  header and login, with visual ellipsis and accessible full text. English is
  complete; Simplified Chinese is explicitly partial (setup/login/MFA/navigation/
  General/Account), per-key English fallback. Before completion use browser language;
  afterwards saved language controls all pages and `<html lang>`. Never translate notes.
- Every start (container/dev/built start) recovers interrupted restores before
  key/DB reads, creates private storage/keys/schema/settings and applies trusted
  SQL + synchronous registered DB-only data steps before listening. All pending
  SQL/data/ledger/integrity changes commit in one transaction or roll back fully.
  No manual migration command or request-time migration.
- Pending upgrades of existing DBs first save a private, WAL-consistent online DB
  copy + manifest (from/to schema, upgrading app version, time) to `pre-upgrade/`.
  Latest only, no keys/files, excluded from archives/restores; shown in Storage.
  Fresh/current DBs skip it; insufficient space prevents migration/startup. This
  rollback aid is not an automatic full backup. **Open SS01 clarification:** current
  directory replacement is crash-safe journaled rotation with a brief path-absence
  window, not the originally requested single atomic exchange. Do not close that
  requirement without approval; [change progress](simplify-setup/PROGRESS.md).
- Newer/unknown/modified/pre-release schemas refuse startup; pre-release archives
  are refused, not retrofitted. Full details: [simplify-setup SPEC](simplify-setup/SPEC.md).
- Existing-Caddy deployment uses only root `docker-compose.yml` and `.env.example`:
  one app service on external `proxynet`, ORIGIN required; configurable image,
  host bind (default `./data`) and PUID/PGID (1000:1000). No ports/bundled proxy/
  static IPs/resource or hardening overrides/ops services. Image HEALTHCHECK remains.
  Root briefly prepares private data then permanently drops privileges before DB/server.
  PID 1 Node has no capabilities; default idle SIGTERM exits 0 within 10 seconds.
  Interrupted backups fail safely on restart; journaled restore recovers.
- Minimal Caddy site needs only `reverse_proxy pandanote:3000`. Private/loopback/
  link-local TCP peers may supply exactly one valid XFF; absent uses peer,
  malformed/chained returns 400. Public peers ignore XFF; adapter forwarding
  overrides remain forbidden.
- Domain/origin configurable through deployment environment.
- Password securely hashed; secure sessions and login rate limits.
- TOTP MFA optional, managed in Settings.
- MFA enrollment requires confirmation code before activation.
- Generate 10 single-use recovery codes when MFA is enabled; show/download at generation only.
- Recovery codes substitute for TOTP, not password; store hashes; regenerating invalidates old set.
- Password/MFA changes require fresh authentication; no SMS/email service dependency.
- Session lifetime 7 days by default; configurable. No repeated login while valid unless sensitive action requires fresh authentication.
- Sign out all devices supported.
- Sensitive actions include security changes, backup creation/download/deletion, and restore; require password and TOTP/recovery code if MFA is enabled.
- Lost password/MFA requires VPS access: `docker compose run --rm pandanote
reset-password` (local `npm run reset-password`). Interactive terminal/no echo,
  double prompt, no arguments/pipes; atomically reset password, disable MFA/codes
  and revoke sessions/challenges without changing notes/files/settings. Live-app safe,
  pending recovery journal/no-account refusal; never a public bypass.

## 14. Settings and manual full backup/restore

Settings sections:

- General: site title and registry language, with partial-translation notice.
- Account: username/email with fresh authentication.
- Appearance: theme, density, long-note collapse.
- Calendar: app timezone, week start.
- Security: password, optional MFA/recovery codes, session lifetime, revoke sessions.
- Storage: usage, configurable upload/image limits, unused-upload cleanup.
- Backup & Restore: create/list/download/delete backup; upload/restore.

### 14.1 Backup

- Only user-triggered backups. No timers/automatic backup service.
- Create saves a consistent full archive in a private server directory.
- List creation time, size, completion state; allow web download and explicit deletion.
- No separate backup password or passphrase encryption.
- Format-v2 archive contains private application/authentication data, including
  username/email and completed title/language/timezone settings. Explain protected
  handling in the UI. Format-1 pre-release archives are explicitly refused.
- Include notes, server drafts, Trash, tags, files, settings, authentication/MFA configuration and needed portable key material, schema/version manifest.
- Exclude local drafts, old backup archives, temporary/uncommitted uploads, active
  sessions, runtime caches, pre-upgrade DB copies, OS, DNS, TLS certificates and binaries.
- Search index can be rebuilt.
- Never stream a half-created backup as if complete.
- Insufficient disk space results in a clear failure, not a broken app.

### 14.2 Restore

- User uploads an archive created by PandaNote through Settings.
- Validate format, compatibility, contents, checksums, and safe paths before replacing anything.
- Show summary and destructive confirmation.
- Replace application data; do not merge.
- Successful restore invalidates active sessions and returns to login using the restored account.
- Failure must leave the prior application usable; provide rollback/recovery instructions.
- On a new VPS: deploy compatible app, configure destination origin, complete
  temporary two-step browser setup, upload/validate/confirm in Settings, then sign
  in with archived username/password/MFA. Exact known older baseline schemas migrate
  via trusted SQL/data steps only on isolated staging; unknown/newer schemas fail.
  Destination pre-upgrade copy is untouched and is not a copy of the restored data.
- Domain and deployment origin stay environment-configurable, not overwritten by the source machine's domain.
- Manual server-local backups do not protect against losing the VPS until downloaded elsewhere. State this plainly, without adding automatic backup infrastructure.

### 14.3 Application release identity (approved post-S18 enhancement)

- Release versions use `YYMMDD-N`: the commit's UTC **committer date** and a daily sequence starting at 1, counting same-date first-parent ancestors including the target commit. Merges count once; documentation commits count. Builds of the same commit never use build time to renumber it.
- Releases are versioned after feature branches merge into the main development line. Full commit hash is retained as the authoritative identity; the readable format is not globally unique across branches/rebased histories.
- Release image builds reject staged/unstaged changes, non-ignored untracked files and incomplete/shallow Git history. Final images contain committed source only, not ignored data or Git history.
- Image builds always update the mutable `pandanote:latest` tag and also retain a commit-derived version tag for pinning/rollback. OCI metadata agrees with the build-time version embedded in the web app; `latest` is not the application version. The build wrapper automatically detects a usable Docker or Podman engine (Docker preferred), with an explicit engine override available. Sidebar/mobile drawer footer shows the version; Settings → About shows version, full hash and UTC commit time. Local development is explicitly labeled Development.
- Runtime environment, app timezone, domain changes, restarts and data restores do not change the embedded version. This is independent of note revisions, schema and archive compatibility versions.
- Detailed implementation and verification: [VERSIONING_PLAN.md](VERSIONING_PLAN.md).

## 15. Definition of complete

The product is complete only after the integrated acceptance suite, Linux deployment checks, performance measurements, and backup/restore drill pass. Each implementation step has a separate done gate in IMPLEMENTATION_PLAN. Planning documents alone do not count as implemented features.
