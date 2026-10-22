# PandaNote — Product specification

## Approved change — note templates

The user approved reusable note templates: a **Templates** page (sidebar link, laid out like Tags) with search, select-all, multi-select delete, a New template button and click-to-edit, with no limit on the count; and a template icon in the editor toolbar that opens a searchable picker and inserts the chosen text at the caret. Templates are private copies of text only (no attachments, no placeholders); notes made from them are independent. Adds schema version 3. Details: [templates/SPEC.md](templates/SPEC.md) and [PROGRESS](templates/PROGRESS.md).

## User-requested labels removal

The color/icon label feature and its note/template fields, management and API routes,
editor controls, filters, styling, translations and tests have been removed. Hashtags
remain the sole note-classification mechanism. The fresh-install baseline no longer
contains label tables or columns; no migration/importer or automatic data deletion is
provided. Existing databases from a build that included labels are rejected by trusted
migration-history validation and are left untouched.

## Approved change — voice clips

The user approved a microphone button in the editor toolbar that records audio clips;
a note may hold several (max 20, 10 minutes each, 50 MB file limit). Clips may sit
alongside text and up to 9 photos; a video stays exclusive. They stay in browser memory
until Post/Save changes, are stored unchanged in the browser's native format (no
transcoding, no speech-to-text), and play inline on cards and the note page. Clips can be
reordered and removed, not trimmed. Details: [voice-notes/README.md](voice-notes/README.md)
and [SPEC](voice-notes/SPEC.md). Implemented and automatically verified on the host and the
Alpine image (VN01–VN07); real-device microphone checks (Chrome/Firefox/Safari/iOS) are
still pending, see voice-notes/PROGRESS.md. Where section 4.2 says photos/video only,
this change takes precedence.

## Approved change — security hardening

From a security review the user approved: (1) known devices are not locked out by
anonymous sign-in floods, and operator `reset-password` clears sign-in limits;
(2) **a setup code is required for first setup** — it is printed once to the server
log at start (with a `/setup#code=…` link) and is valid only while no account exists
and within the 60-minute window; this supersedes "Approved first-visitor ownership:
no setup secret" in section 13; (3) stricter limits on second-factor guessing;
(4) optional `TRUSTED_PROXIES` for forwarded-address trust. Details, order and status:
[security-hardening/README.md](security-hardening/README.md) and
[PLAN](security-hardening/PLAN.md). Until each sub-task is done, the current
behavior below still describes the running code.

Review follow-up approved by the user: anonymous traffic must not spend a verified
browser's device/IP allowance or a correct setup code's code/IP allowance, including
shared NAT and IPv6 /64. Both retain a 30-attempt aggregate and 10-attempt isolated
IP cap per 15 minutes. This protects against rate-limit lockout, not all denial of
service or a stolen valid device cookie. Restore/rollback must refresh all auth key
consumers so device trust and MFA failure counters remain consistent across restart.

## Approved change — note card actions

The user approved a tidier card and direct note actions. Tags sit in their own row
under the card's date row. The top-right `•••` is borderless and opens a small
anchored dropdown menu (not a modal) with **Pin**, **Edit**, **Delete**. Pinned notes
appear at the top of the plain "All notes" timeline only and carry a one-click unpin
icon; no visible "Pinned" heading is needed (the section retains an accessible name).
Card dates have no resting underline or Edited label; dates, tags and header actions
use consistent pill geometry/soft hover backgrounds (tags underline on hover).
Created/Updated date tooltips use white backgrounds and dark text in light and dark
themes; date hover uses the same soft background treatment as other pills.
Trashing unpins. Edit
happens in place (in the card, or on the note page) instead of in the top composer.
On timeline and tag views, double-clicking a card's text also edits it, and
clicking anywhere outside the card saves the change (or closes an unchanged edit)
without a confirmation (2026-10-21 user request; supersedes the prompt below for
this case — see note-actions SPEC §5.2).
Delete moves to Trash immediately without confirmation, status text or Undo; from
the note page it returns to the timeline. Restore and permanent delete happen only
on the Trash page (permanent delete still confirms). Copy Markdown is removed; Archive, Share and Copy Link were considered and
rejected. The fresh-install baseline gains `notes.pinned_at` without migration.
Authoritative details: [note-actions/README.md](note-actions/README.md) and
[SPEC](note-actions/SPEC.md); they supersede conflicting lines in sections 6 and 12.

## Approved change — miniature year heatmaps and no drafts

This user-approved contract supersedes all older draft/recovery references below.
The app has no Drafts screen/status, autosave, multiple-draft manager or local recovery.
One editor per tab holds unsaved text/metadata/files in memory only, never localStorage
or IndexedDB. Post creates an ordinary private note (including unfinished writing);
Save changes edits a saved note without reordering it. Nothing uploads before those
explicit actions. Failure retains the mounted editor and receipt-first retry identity.
Accepted tab exit/refresh/crash loses unsaved work; no background save or unload post.

Internal navigation, mobile editor closure, replacing an editor and signing out ask
Post/Save changes, Discard, or Cancel. Empty/unchanged editors do not prompt. Only
confirmed save permits proceeding; failure/conflict stays. Discard abandons unsaved
text/files, never deletes an existing note or undoes a possibly committed uncertain
save. Desktop focus X returns to the same compact editor. Actual tab close/refresh
uses the standard browser Leave/Stay warning.

**Superseded by the user's later request:** the bold month/year heading opens a
compact year/month picker in the calendar's own position (not a modal): a bold year
between ◀ ▶ arrows (previous/next year) above twelve month-name links (Jan–Dec) in
4 columns × 3 rows. Clicking the year turns it into a text box for entering a year
(1969–9998; Enter applies, Esc cancels, invalid input shows an error). Escape or an
outside click closes it. Browsing alone does not change filters; month selection
clears day and retains search/tags. Miniature heatmaps, the quick-year list and
year-activity loading were removed from the picker.

Trash restores to ordinary notes. Tags and full archives cover notes/Trash only;
unsaved editors are never backed up. Authorization, attachment staging, optimistic
revisions, no silent overwrite and idempotent retries remain mandatory.

User confirms no deployment/production data: update the fresh-install baseline,
without a migration/importer or deleting development data. Earlier development
DB/archives are incompatible and refused. This does not waive Linux/release gates.

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
- In-memory unsaved editor with explicit Post/Save changes, no draft status or recovery.
- Timeline cards; tags; literal multilingual search; month activity calendar.
- Backdating; image and file attachments.
- Markdown preview, Mermaid, highlighted code with copy buttons.
- Responsive layout, theme/density/collapse preferences.
- Tag management; Trash; conflict detection.
- Manual full backup, web download, uploaded-archive restore.

Not included:

- Collaboration, public notes/sharing, public registration, roles.
- AI or semantic search, fuzzy/typo search, reading/romanization conversion.
- Automatic Traditional/Simplified conversion.
- Rich-text/block editor, folders, embedded maps, reverse geocoding.
- Automatic backups, separate backup password, original-image retention.
- Full-text extraction from PDF/Office/files.
- Automatic conflict merging or automatic posting/saving.
- PWA/offline sync infrastructure. It can be reconsidered after the agreed app works.

## 3. Visual language

### 3.1 Agreed appearance

- Warm, quiet personal-notebook feel, not an admin dashboard.
- Light theme: warm off-white page, white cards, subtle borders.
- Muted green accent for primary actions, links, selected filters, calendar activity.
- Light, Dark, Follow system. Initial setting: Follow system.
- General offers three density levels: Compact, Comfortable (default), Spacious.
- Theme and language icon buttons sit to the right of the app title in the desktop
  sidebar/mobile header (and drawer). Theme initially follows the system; the button
  switches the effective theme to explicit Light/Dark. Language toggles English and
  Simplified Chinese. Both save immediately; there is no Appearance settings tab.
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
2. All notes navigation.
3. Month activity calendar.
4. Tags: the "Tags" heading links to the Tags page (no separate Manage link).
5. Trash and Settings at the bottom. Below them, show "Powered by Pandanote,"
   with only Pandanote linking to the project's GitHub repository. Keep this
   exact English text in every interface language; do not show the app version
   in the sidebar.

Main area:

- Desktop editor above the timeline within the notes scroller, shown directly with its buttons (no collapsed one-line "Write a note…" mode); scrolls away with the notes. The filter strip shows only search/day chips, and the duplicate "Saved on server." line under the editor is removed. The editor footer also omits "Saved on server."; other progress, error and edit guidance remains.
- Back to Top button below the timeline returns the notes pane to the composer.
- Visible active filters and Clear all.
- Single-column chronological cards. Not masonry, despite the conversational use of “waterfall.” Reading order must be unambiguous.
- Sidebar, calendar, and search do not scroll away with notes. Drag the sidebar's right edge to adjust its desktop width; keyboard resizing is also available.
  The width is kept in browser `sessionStorage` across navigation and refresh in
  the same tab. Sign-out (arrival at sign-in) clears only this width preference;
  closing the tab ends its browser storage session. Other tabs are independent.

The sidebar lists the most-used tags as borderless flowing chips a "+N" link and the heading open the Tags page for the rest. All search fields share one slim look: magnifier first, a help icon last that toggles a short syntax note (AND/OR/NOT, parentheses, `tag:`), and no placeholder. On unusually short screens, an independently scrollable sidebar section is permitted for accessibility; do not clip controls to preserve the fixed-shell appearance.

### 3.4 Mobile shell

- A persistent 52px icon rail replaces the Menu & search header button. From top
  to bottom: rightward expand arrow, panda favicon linking home, Search, Calendar,
  Tags, Templates, Trash and Settings. Icon controls have accessible names,
  keyboard focus and 44px touch targets; the rail scrolls independently on short screens.
- The arrow opens the full sidebar with a leftward collapse arrow instead of a
  text Close button. Search and Calendar open the same sidebar and focus their
  corresponding control. Escape collapses it and returns focus to its opener;
  page navigation also collapses it. Desktop resizing remains unchanged.
- Compact fixed header retains the site title and theme/language controls.
- One note column with small outer margins; no horizontal page overflow.
- Sidebar becomes a drawer containing calendar/tags/navigation.
- A prominent compose button opens a full-screen editor.
- Note detail and image viewer use the available screen.
- Respect safe-area insets, dynamic viewport height, virtual keyboard, and touch targets.
- Do not rely on hover for any essential action.

Expanded and desktop sidebar text shares one left edge: title, Tags,
Templates, Trash and Settings (no extra inset for the bottom utilities).

## 4. Note content and composer

### 4.1 No titles

There is **no separate title field**. This supersedes the earlier optional-title choice. Markdown headings remain ordinary note content.

List labels use a safe content excerpt, or “Image note” / “File attachment” when text is absent. Do not persist a generated title as a product field.

### 4.2 Writing and preview

- Textarea-based Markdown editor initially; a heavyweight editor framework is unnecessary. No writing placeholder or "New note · publish with Post." guidance is shown.
- The compact timeline textarea grows with its content, then scrolls at a height cap. Current sizing defaults: 10rem minimum and `min(24rem, 60vh)` maximum; focus mode keeps its full-screen layout.
- Enter inserts a newline.
- Publishing happens only by activating the visible Post button. Do not register Ctrl/Cmd+Enter to publish.
- One text-area-style container holds writing/preview, save feedback and all editor controls.
- A bottom toolbar shows Templates, Photos/video, Attach file, Voice and Date as icon buttons (bottom-left), with Post at the right. There is no hashtag insertion button; type `#` directly to use tag autocomplete.
- The Date icon opens a borderless Timeline date popup showing only the text bar and the themed calendar (no title, help text, close button, time fields, or Done). Clicking outside the popup closes it; Escape also closes it.
- One Preview switch toggles rendered Markdown and raw text without losing content.
- A bottom-right focus icon (next to Post) enters focus mode; the same button shows an X to leave it. Closing desktop focus mode retains the editor session and returns focus to its opener.
- Mobile uses the same integrated controls in its full-screen editor.
- Preview updates are debounced, particularly Mermaid.
- Image paste, drag/drop, and the media picker are supported. The media picker is filtered to `image/*,video/*` (paste/drop/picker all validated), WeChat-Moments style: at most 9 photos, or exactly one video. A video cannot be combined with photos or another video. Violations show a clear editor error and add nothing. A separate **Attach file** icon (and plain drag/drop/paste of anything else) accepts any other file type as a generic, unprocessed attachment — no count limit of its own beyond the per-note attachment cap, mixable with photos/video, shown as removable rows below the photo/video grid and voice clips with an icon guessed from the filename extension (brand-coloured Word/Excel/PowerPoint/PDF/archive icons with the app's monogram, pictographic for other common audio/video/code/text/image extensions, else the uppercase extension as a short label). See 10.3.
- Photos are not inserted into the Markdown text. Attached media appears as square thumbnails in a **3-column grid (up to 3 × 3)** below the text box, in attachment order. While editing, a thumbnail can be dragged onto another to move it (Alt+Arrow keys do the same from the keyboard) and a small **X** on each thumbnail removes it. Nothing is uploaded when files are added: picked files stay in browser memory until Post/Save changes. Timeline cards and the note detail show the same thumbnails as a 3-column grid (opening the image viewer); photos referenced inline by older notes still render in place and are not duplicated in the grid.
- A video is stored unchanged as an ordinary file (see 10.3) and shown as a named tile in the editor and in the attachment list below the rendered note. Existing notes with other file types remain viewable/editable. Limits are enforced in the editor, not by the server.
- Image-only and file-only notes are valid; a completely empty note is not.
- Whitespace-only text and missing/failed attachments do not constitute content.

### 4.3 Post and save feedback

- Show upload progress and posting state; prevent double submission.
- Keep in-memory text/files until the server confirms the complete note save.
- On failure, show an actionable message and retain recoverable text/files.
- Retry must not create duplicate notes/files.
- On successful normal posting, insert the note without a full page reload. Position follows timeline date; a backdated note must not misleadingly become newest.
- After confirmed posting, restore the composer to a fresh empty session, including Preview off and cleared date, files and transient picker state. Failed saves retain the current editor and preview state for retry.
- Confirmed posting from focus mode closes the editor overlay and returns to the timeline, on desktop and mobile, including after a successful retry. Failed or uncertain saves stay in focus mode with their content intact.
- Editing a saved note uses Save changes, not Post. New notes use Post.

## 5. Unsaved editor lifecycle

The approved change above replaces the former draft lifecycle completely.

- One memory-only editor session per tab, with text, metadata and new file blobs.
- Post creates a note; Save changes updates a note. Post unfinished writing to keep it.
- No Drafts page/status, autosave, localStorage/IndexedDB content or reload recovery.
- Post/Save changes–Discard–Cancel guards internal navigation, mobile closure,
  replacement edits and signout. Empty/unchanged sessions do not prompt.
- Standard browser Leave/Stay protects actual close/refresh. Accepted exit/crash
  loses unsaved work. Desktop focus X returns to the same compact editor.
- Failure keeps mounted work for receipt-first retry. Discard never deletes an
  existing server note or undoes an uncertain commit. Conflict resolution stays
  explicit and revision-checked; no automatic merge or forced overwrite.
- Editing preserves creation/timeline date, does not reorder, and marks content edits.

## 6. Timeline dates and Trash

Separate timestamps:

- Immutable system creation timestamp.
- Editable timeline date/time used for card order and calendar grouping.
- Last modification timestamp; record content edit timing distinctly if necessary so status-only changes do not falsely imply a text edit.

Backdating is exposed in secondary editor options. Store instants in UTC and display/group using the configured app timezone, not the VPS timezone.

Implementation default: future scheduling is out of scope. Initially restrict an edited timeline instant to now or earlier; explain validation instead of silently clamping it. If future dates are later desired, discuss publication semantics first.

Trash:

- Delete is soft deletion into Trash, sent immediately from the card/note menu without a confirmation dialog (see note-actions).
- Preserve note contents, dates and files.
- Restore returns it to ordinary notes, preserving dates/files.
- Permanent delete requires explicit confirmation.
- No automatic Trash emptying.
- Trash is excluded from normal search/calendar/timeline.
- Trash page search: a search field sits directly under the Trash title (Enter to search, like the Tags page). It matches trashed notes only, with the same boolean grammar as note search (§8). The sidebar search still covers active notes only.
- Trash list: 30 notes first; scrolling lazy-loads 30 more. Each entry is a compact list row (checkbox, date, tag chips, one-line excerpt) spanning the full column width at one fixed height; long text clamps to one line. The checkbox sits inside the row. The list header has a select-all checkbox, then Restore and Delete Permanently icons; with nothing selected the icons are disabled. The date opens the note detail. Rows have no per-note buttons.
- Selection: a checkbox before each row and a text-free Select all icon that selects the displayed notes. With a selection, a restore icon and a delete-permanently icon appear on the Select all row. Each bulk action asks for confirmation first and runs the per-note lifecycle one note at a time; a failure stops the batch and opens the usual dialog.
- Attachment bytes still in Trash count toward storage.

## 7. Tags

- Inline hashtags, with autocomplete of existing tags: at most five prefix-filtered options in a vertical, borderless list, with selected-row highlighting and existing keyboard/touch interaction. Suggestions narrow as text is typed, without sending the prefix or note content to the server.
- Flat tags only; no parent/child behavior. A `/` ends a hashtag (`#work/meeting` is the tag `work` followed by ordinary text).
- Sidebar tags are flowing chips ordered by published-note count (descending). Tags page: title "Tags", search directly below (Enter to search), flat list of every tag as soft chips with counts, loaded lazily 60 at a time. Tags-page search uses the §8 boolean grammar over tag names: a bare term matches part of a tag name, `tag:name` an exact tag, and a leading `#` is ignored.
- Unicode Chinese/Japanese/Cantonese characters supported.
- English tag identity is case-insensitive: #Work and #work are the same tag.
- Ignore code blocks, inline code, raw HTML, URLs/link destinations, and escaped hashtag markers when extracting tags.
- Markdown heading markers are not tags.
- Deduplicate tags per note.
- Tag selection is single: clicking a tag opens that tag's view (search/day filters are kept) and replaces any other tag; clicking the selected tag again clears only that tag filter. A tag view shows the tag's summary (notes, Trash) with a three-dot menu: Rename Tag, Merge Tag, Remove Tag. The tag is named by the view's header (no filter chip repeats it), which has an "All notes" link that leaves the tag view and keeps search/day filters; the filter strip shows only search/day chips. A URL or API call with more than one `tag` value is refused with "Select only one tag."
- A card's tag is clickable; filter state is visible/removable above the timeline.

Tag management (from the tag view menu) includes:

- Rename.
- Merge into an existing tag.
- Remove tag from notes without deleting those notes.
- Published-note usage counts.

Management edits actual hashtag spans in affected server-stored note bodies, not merely registry labels. Preserve all unrelated text/formatting; code is untouched. Trash also requires consistent rewrites. Increment affected note versions for conflict detection.

Unsaved editors are not silently rewritten. Before posting, check tags against known rename/merge/removal history and offer an explicit resolution if needed. Do not reintroduce a retired tag accidentally without warning.

## 8. Exact multilingual search

Meaning: normalized literal substring matching, not whole-note equality, fuzzy search, or semantic similarity.

- Search published Markdown source, tags, and attachment filenames.
- Code content is searchable.
- Do not search inside files.
- Multi-term query: all terms must match somewhere in the note's searchable fields (adjacent terms mean AND).
- Quoted text is one exact phrase.
- Boolean operators (approved change): uppercase `AND`, `OR` and `NOT` and parentheses `( )` (full-width `（ ）` too) combine terms, phrases and `tag:name`. Precedence is NOT, then AND, then OR; adjacent operands are an implicit AND, e.g. `coffee (tea OR milk) NOT sugar`.
- Operators are recognised only when unquoted and exactly uppercase. Lower-case `and`/`or`/`not`, `NEAR`, `%`, `_`, `*`, `-` and every other punctuation character stay literal text. Quote a phrase or a word to make operators or parentheses literal (`"a OR b"`, `"f(x)"`).
- `NOT term` excludes a note when any searchable field contains the term. A query of only NOTs is allowed and scans all published notes.
- `tag:name` (also `tag:#name`, `tag:"name"`) matches the exact normalized tag, unlike a bare term which matches part of the body, any tag or a file name. It is a search term; the single `tag` filter and tag view are unchanged and still combine with the search by AND.
- Malformed syntax (dangling operator, empty or unbalanced parentheses, `tag:` without a name, over 8 levels of nesting, over 40 operators, plus the existing quote/length/20-unit limits) shows a clear validation message and does not change the results. Only terms that must be present (not under NOT) are highlighted.
- Terms without spaces, e.g. 香港 or 図書館, are literal substrings.
- English matching is case-insensitive.
- No automatic Traditional/Simplified equivalence, Japanese reading conversion, or Jyutping.
- Update after a short typing pause; cancel/ignore stale responses.
- Show safe highlighted snippets.
- Results are newest-first by timeline date, not relevance-ranked.
- Search and tag filters cover all months unless a day filter is selected.
- Calendar's active month is not an implicit search filter.
- Search (including its own boolean logic), the selected tag, and the selected day combine using AND.
- Visible filter chips and Clear all.
- Cursor pagination/lazy loading for results, not a download of the whole collection.

Short Chinese/Japanese queries must work. Trigram acceleration applies only where suitable; one/two-character queries have a literal scan fallback. Measure performance rather than promising that all searches are index-only.

## 9. Month activity calendar and scrolling

### 9.1 Calendar appearance

- A conventional month calendar grid styled as a monthly heatmap, not a year repository heatmap.
- Each date numeral sits on a compact square background; one color varying light-to-dark reflects daily published note count.
- Zero-count days neutral; today marker distinct from selected-day outline.
- Counts use editable timeline date in the configured timezone.
- Counts include all published notes, regardless of current tags/search.
- Three-letter weekday labels (Mon, Tue, Wed, Thu, Fri, Sat, Sun) in English.
  When the calendar itself is at most 280 CSS px wide, Simplified Chinese weekday
  labels use only their numeral character, regardless of density or viewport.
  Wider calendars show full Chinese weekday names. Labels never wrap; full
  weekday names remain available as abbreviation titles.
- Bold month/year heading on the left with no obvious border; previous/next month arrows grouped on the right.
- Clicking the heading opens an inline year/month picker over the calendar (see the approved-change note at the top): 12 month names in **4 columns × 3 rows** under a year header with previous/next-year arrows; clicking the year allows typing a year. Clicking a month jumps immediately and clears the selected day while retaining search/tags.
- Browsing the picker alone never changes timeline filters.
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

- Markdown rendered safely through remark/rehype. Single newlines in ordinary text display as line breaks (not spaces), consistently in preview, cards and detail; stored Markdown and code-copy bytes remain unchanged.
- Heading spacing is compact; current h1–h4 margin default is `0.6em 0.2em`, without changing heading font sizes.
- Timeline cards show hashtags as chips without repeating their tokens in rendered body text. Note detail shows the same layout as a card: date at top left, tag chips under it, no tag list at the bottom, and the body hides hashtag tokens. Source, editor preview and search excerpts retain hashtag text; this is a display change, not tag removal from stored notes.
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
- Unposted editors retain selected original image blobs in memory only.
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
- Picked via the editor's **Attach file** icon (any file type, no `accept` restriction), or plain drag/drop/paste of anything that is not a recognized image/video. Render as download rows below content (and, while still editing, as removable rows below the photo/video grid and voice clips).
- Each row shows an icon guessed from the filename extension, purely for presentation (never trusted for validation/processing): Word/Excel/PowerPoint/PDF/archive extensions get a brand-coloured document icon with the application's monogram (W/X/P/PDF/ZIP), like the native app icons; other common audio/video/code/text/image extensions get a pictograph; anything else shows the uppercase extension itself as a short label.
- No arbitrary HTML/SVG inline preview; active files download with safe response headers.
- Authenticated routes only. Uploads, files, thumbnails, and backups are never public static assets.
- Removing one file reference must not delete bytes still used elsewhere/in Trash.
- Storage usage visible; protect disk reserve rather than treating all 60 GB as available app data.
- Implementation safety default: unused-upload cleanup explicitly abandons whole
  posting attempts only after 24 hours without server activity. Resume/upload
  renews protection; cleanup rechecks active uploads and all note references.
  Nothing expires automatically. A still-open editor retains files, but an abandoned
  frozen attempt needs a new editable attempt before posting again.

## 11. Location removed (user request)

Notes have no location field, toolbar action, browser permission request, coordinate
entry, popover or map link. Location is not part of editor state, API payloads,
SQLite or backups. Image processing still strips all EXIF/GPS metadata.

This follows the existing pre-release fresh-install baseline policy: no importer or
automatic data deletion. Earlier development databases and archives require their
matching build; they are refused by the changed baseline's trust checks.

## 12. Detail, edits, and conflicts

- Show more expands an individual card.
- The date at the top left of each card (short form `Mon, Jul 21`, plus the year when it is not the current year; no timezone text) is a link that opens the note as a normal page. There is no Open note button and no popup detail window.
- Stable private URL for each note; direct navigation/refresh works.
- Closing returns to prior timeline filters and scroll position.
- Detail always shows full content and metadata.
- Dialog focus is trapped appropriately, Escape closes where safe, focus returns to opener.

Concurrent edit handling:

- Every server note has a revision/version.
- Update requires expected revision, including status changes, tag management, date edits, and deletion.
- Conflict never silently overwrites the newer server version.
- Keep current in-memory edits and new file blobs until explicit choice or accepted exit.
- Offer Load server version, Save local version as a separate note, or Explicitly replace current version after confirmation.
- Explicit replace still checks the newly observed revision; another race must produce another conflict.

## 13. Authentication and configuration

- One account, no registration after setup. An empty deployment redirects to
  `/setup`: username, required email, password and confirmation, then
  `/setup/preferences`: site title, language and timezone (browser defaults,
  explicit Finish setup, no skip/theme/week-start). Leaving after account creation
  resumes preferences after login; normal data APIs are blocked until completion.
- **Setup code (approved in the 2026-10 security review; supersedes "no setup
  secret"):** account creation requires a one-time setup code. The server generates
  it in memory at process start while no account exists and prints it once to the
  server log, with a `/setup#code=…` link (`docker compose logs pandanote`). Entry
  ignores case, spaces and hyphens. The code is never stored in SQLite, files or
  environment variables, and it is shown only until an account exists. Account
  creation is open for 60 minutes from process start while no account exists; a
  restart prints a new code and reopens that window only for an unclaimed instance.
  Wrong or missing codes count toward the setup limits, and a flood of wrong codes
  does not block the correct one. A concurrent second creation cannot replace the
  singleton account. Claim promptly or restrict access until ready.
- Username is trimmed/lowercased, 3–32 ASCII letters/digits/`.`/`_`/`-`; login is
  case-insensitive with generic credential errors and equivalent unknown-name work.
  Email is trimmed, required, basic `local@domain` syntax and at most 254 characters;
  private metadata only, no verification/sending/email recovery.
- Password is exact 8–128 Unicode characters and at most 1024 UTF-8 bytes, without
  trimming/normalization/complexity rules. Settings → Account username/email edits
  require fresh authentication but do not revoke sessions.
- Settings → General saves plain-text site title (trimmed 1–60 characters, no
  controls), optional tagline (0–60 characters; empty uses the translated default),
  density and long-note collapse with one Save. Language is changed only by the
  title-row language icon (and the initial setup language picker). Title appears escaped in tabs, sidebar/mobile
  header and login, with visual ellipsis and accessible full text. English and
  Simplified Chinese are both complete for every screen and client message. Before
  a language is saved, browser language is used; afterwards saved language controls
  all pages, date/number formats and `<html lang>`. Notes are never translated.
  Server-originated API/SSR error text and shared schema messages are localized only
  when they match a catalog English string (`localizeMessage`); other server text
  stays English until error codes are translated client-side (tracked gap).
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
- Existing-Caddy deployment uses only root `docker-compose.yml`:
  one app service on external `proxynet`, canonical ORIGIN set directly in Compose,
  fixed `localhost/pandanote:latest` image, host bind (default `./data`) and
  PUID/PGID (1000:1000). No `.env` file is required. No ports/bundled proxy/
  static IPs/resource or hardening overrides/ops services. Image HEALTHCHECK remains.
  Root briefly prepares private data then permanently drops privileges before DB/server.
  PID 1 Node has no capabilities; default idle SIGTERM exits 0 within 10 seconds.
  Interrupted backups fail safely on restart; journaled restore recovers.
- Minimal Caddy site needs only `reverse_proxy pandanote:3000`. Optional
  `TRUSTED_PROXIES` restricts XFF to listed peer IPs/CIDRs; `none` ignores XFF.
  Unset/blank retains private/loopback/link-local peer trust for compatibility.
  Trusted peers may supply exactly one valid XFF; absent uses peer and
  malformed/chained returns 400. Untrusted peers ignore XFF. Adapter forwarding
  overrides remain forbidden; narrow-Caddy guidance is in `ops/DEPLOYMENT.md`.
- Domain/origin configurable through deployment environment.
- Password securely hashed; secure sessions. Sign-in limits are fixed 15-minute windows:
  untrusted callers share 30 password attempts per account and 10 per IP address.
  Second-factor codes: 10 MFA attempts per account per 15 minutes (untrusted), at most
  5 wrong codes per sign-in challenge (then "Enter your password again."), and at most
  30 wrong second-factor codes per account per 24 hours on the untrusted path (then
  "Too many incorrect codes today…" until the day window ends). Trusted devices skip the
  account caps and the daily cap.
  Owner notice (security-hardening SH3.4, user-approved): while the count is live,
  Settings → Security shows "N incorrect second-factor codes since your last sign-in.
  Someone may know your password — change it." It counts every wrong sign-in or
  fresh-authentication code (trusted device or not) in a 30-day fixed window from its
  first failure, and the next successful sign-in clears it. The count never blocks sign-in.
  A browser that signed in before holds an HttpOnly `pandanote_device` cookie (180
  days, reissued after security changes) that moves it to its own 30-attempt bucket
  and a separate 10-attempt device/IP bucket per 15 minutes. Correct setup codes
  also have separate aggregate and code/IP buckets (30 and 10). Anonymous requests
  cannot consume those allowances, even behind shared NAT or an IPv6 /64. A stolen
  valid device cookie can still exhaust its device's allowance; connection floods
  and password-worker contention are not eliminated. The cookie never authenticates
  a request. Restore and rollback reload auth keys with the database, preserving
  device trust, daily MFA limits and owner-notice counters across subsequent restart.
  Operator `reset-password` clears every sign-in limit. A new device during an attack
  gets "Too many attempts. Try again in 15 minutes." until the window ends.
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
  and revoke sessions/challenges and clear sign-in rate limits, without changing
  notes/files/settings. Live-app safe,
  pending recovery journal/no-account refusal; never a public bypass.

## 14. Settings and manual full backup/restore

Settings sections:

- General: site title, tagline, three-level density and long-note collapse; one Save.
- Account: username/email with fresh authentication.
- No Appearance tab or General language selector. Title-row theme/language icons
  save those preferences immediately without discarding staged General fields.
- Calendar: app timezone, week start.
- Security: password, optional MFA/recovery codes, session lifetime, revoke sessions.
- Storage: usage, configurable upload/image limits, unused-upload cleanup.
- Backup & Restore: create/list/download/delete backup; upload/restore.

### 14.1 Backup

- Only user-triggered backups. No timers/automatic backup service.
- Create saves a consistent full archive in a private server directory. Create, download and delete ask for no password (owner decision: session + same-origin only); restore still requires the account password (plus MFA when enabled). Delete keeps a plain confirmation.
- List creation time, size, completion state; allow web download and explicit deletion.
- No separate backup password or passphrase encryption.
- Format-v2 archive contains private application/authentication data, including
  username/email and completed title/language/timezone settings. Explain protected
  handling in the UI. Format-1 pre-release archives are explicitly refused.
- Include notes, Trash, tags, files, settings, authentication/MFA configuration and needed portable key material, schema/version manifest.
- Exclude unsaved editors, old backup archives, temporary/uncommitted uploads, active
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
