# Note card actions — specification

Decisions and defaults: [README.md](README.md). Unchanged rules from
`PRODUCT_SPEC.md`/`ARCHITECTURE.md` still apply (single editor session, receipt-first
retries, revision checks, no silent overwrite, private data).

## 1. Card layout

Order inside a published-note card (timeline):

1. **Date row:** date link (opens `/notes/<id>`), no "Edited" label, and at the
   far right the **unpin icon button** (pinned notes only) followed by the `•••`
   trigger. The unpin button shows a pin icon in the accent colour (pin-off on
   hover/focus), uses the same borderless style as `•••` (section 2), has the
   accessible name/tooltip "Unpin note", and one click sends `unpin` (section 4.2)
   without a menu or confirmation. It is disabled while an action for the note is in
   flight. It is shown wherever the pinned note appears (Pinned section and other
   views).
2. **Tags row:** directly under the date row, before search excerpts and content.
   Soft-background pill links (`selectTag`), no resting underline and underline
   on hover, wrapping onto several
   lines; `aria-current` on the active tag. Omitted entirely when the note has no tags
   (no empty row or spacing).
3. Search excerpts (search views only), content, photo grid, Show more,
   files, feedback — unchanged order. Eligible hashtag tokens are hidden in the
   card body because the chip row already shows them. Source, editor preview,
   note detail and search excerpts retain the tokens; tag management still rewrites
   source spans rather than removing hashtags on Post.

Spacing: the date row and tags row read as one compact header block (small gap
between them, the existing larger gap before content). The tags row must not reduce
tag tap targets below `--target` height on touch devices; on desktop it may be
visually tighter as long as the hit area stays.

## 2. `•••` trigger

- Icon: three dots (SVG, same as the tag-header icon), muted colour.
- **No border and no resting background.** Hover and keyboard focus show a soft
  pill background (`--accent-soft`) and a visible focus ring. Card date, tag,
  unpin and `•••` controls share pill radius/padding and 1.75rem fine-pointer
  height; touch keeps full `--target` height. Date has no underline and its text
  is optically nudged upward 1px to align with the dots. Other shared menus are
  not forced to adopt the card-specific geometry.
- Accessible name "Note actions"; `aria-haspopup="menu"`, `aria-expanded`,
  `aria-controls` the menu. Disabled until hydrated.

## 3. Shared `ActionMenu` dropdown

A new reusable component used by the card, the note page and the tag header.

- Opens directly below the trigger, right-aligned to it; flips above when there is
  not enough room below, and stays within the viewport horizontally. Not a modal:
  no backdrop, page remains scrollable; it closes on item activation, Escape
  (focus returns to the trigger), outside pointer down, trigger click, scroll of the
  notes pane, or resize.
- Small surface: card background, 1 px `--border` hairline, ~8 px radius, light
  shadow; minimum width ~9 rem; items are full-width rows with a leading 16–18 px
  icon and a label, `--target` minimum height, hover/focus highlight matching the
  trigger. Destructive items use `--danger` text/icon and are last.
- ARIA menu pattern: `role="menu"`, items `role="menuitem"`; focus moves to the
  first item on open; ArrowUp/ArrowDown wrap, Home/End, typeahead not required.
  Tab closes the menu and continues normal tab order.
- Works by touch without hover; only one ActionMenu open at a time.
- Light/dark themes, 390 px mobile and desktop widths, and axe must be clean.

### 3.1 Card / note-page items (published notes)

| Order | Label       | Icon          | Action                        |
| ----- | ----------- | ------------- | ----------------------------- |
| 1     | Pin / Unpin | pin / pin-off | Toggle pin (section 4)        |
| 2     | Edit        | pencil        | Inline edit (section 5)       |
| 3     | Delete      | trash         | Move to Trash now (section 6) |

Removed from the card: the "Note actions" modal, **Copy Markdown**, and the modal's
"Move to Trash" button. No Archive, Share or Copy Link actions exist.

Items are disabled (not hidden) while the workspace/lifecycle is not ready or the
note has an in-flight action. Edit is disabled while a save of another session is
in flight (existing `workspace.busy/posting` rule).

### 3.2 Tag header items

Rename Tag, Merge Tag, Remove Tag (danger) — same dropdown; each still opens its
existing form dialog. Behavior of tag operations is unchanged.

## 4. Pin

### 4.1 Data

- `notes.pinned_at INTEGER NULL` (UTC ms). Fresh baseline edited in place, schema
  version unchanged, no migration (README decision 9). Check:
  `pinned_at IS NULL OR (status = 'published' AND pinned_at BETWEEN 0 AND 8640000000000000)`.
- Partial index for the pinned list, e.g.
  `notes_pinned (pinned_at DESC, id DESC) WHERE pinned_at IS NOT NULL`.
- `NoteSnapshot`/`TimelineCard` gain `pinnedAt: number | null`. Backups carry the
  column automatically; restore/trust validation accepts it.

### 4.2 Commands

- New lifecycle commands `pin` and `unpin` on `POST /api/notes/<id>/actions`, same
  strict shape as `trash`: mutation ID, note ID, expected revision. They go through
  the existing receipt/idempotent-retry path and `LifecycleState` retry records.
- Success increments revision exactly once, updates `updated_at`, never sets
  `content_edited_at`, never changes timeline order or tags.
- `pin` requires a published, currently unpinned note; `unpin` a pinned one.
  Stale revision → normal 409 conflict. Pinning when 20 notes are already pinned →
  validation error "You can pin at most 20 notes. Unpin one first."
- `trash` clears `pinned_at` in the same transaction; `restore` returns the note
  unpinned. Permanent delete is unaffected.

### 4.3 Timeline

- **Plain view** = no `tag`, `query`, `day` and no `month` anchor. Only there:
  - The first page response includes `pinned: TimelineCard[]` (all pinned notes,
    at most 20, ordered `pinned_at DESC, id DESC`). Later cursor pages omit it.
  - The chronological stream excludes pinned notes (`pinned_at IS NULL`), so a
    pinned note appears **only** at the top. Cursors stay bound to filters as today.
  - UI: pinned cards above the normal month separators/cards, without a visible
    "Pinned" heading (later user request). The section retains its translated
    accessible name; the per-card pin icon identifies pinned notes visually.
- **Every other view** (tag, search, day, month jump): pinned notes appear in their
  normal chronological position with the unpin icon; no Pinned section.
- Calendar counts, tag counts, search and Trash are unaffected by pinning.
- After pin/unpin/trash receipts the timeline is invalidated as for other
  lifecycle actions; scroll anchoring keeps the reader's position.

## 5. Inline Edit

The workspace keeps exactly **one** in-memory editor session per tab (new note or
edit). This change only moves _where_ an edit session is rendered.

### 5.1 Shared editor component

Extract the editor body from `Composer.svelte` into a reusable `NoteEditor` (text
area, preview switch, tag autocomplete, toolbar icons, attachment grid, feedback,
focus button, primary button). `Composer` uses it for new notes; the card and note
page use it for edits. No duplicated editor logic.

### 5.2 Timeline card

- Edit calls `workspace.editNote(fullSnapshot)` (full snapshot fetched first when the
  card body is truncated). The existing unsaved-changes guard applies: if another
  session (the top composer or another card) has unsaved changes, the usual
  Save/Post – Discard – Cancel prompt appears first; Cancel keeps everything as is.
- While the session's `serverBase.noteId` equals the card's note ID, that card
  renders the editor in place of its date-row-to-files content (the card frame
  stays at the same position in the list). The editor shows **Save changes** and a
  **Cancel** text button; Cancel closes without prompting when unchanged, otherwise
  offers Discard / Keep editing.
- The top composer is hidden while an inline edit is open elsewhere. On the
  unfiltered main timeline it otherwise shows the editor directly, not a collapsed
  "Write a note…" button (later user request). Mobile compose triggers the guard.
- Save changes uses the existing receipt-first update. On success the session ends,
  the card re-renders read-only with the new revision in the same place and focus
  returns to its `•••` trigger. If the edited note no longer matches the view
  (e.g. tag removed or timeline date changed), the existing "outside the current
  filters" notice applies after refresh.
- Failure/conflict keeps the inline editor mounted with the existing feedback and
  conflict dialog.
- If the card is unloaded from the list (filter change, navigation) the normal
  navigation guard runs first, so unsaved edits are never silently dropped.
- Focus button opens the full-screen editor modal for the same session; its X
  returns to the inline card editor. Mobile uses inline editing too.
- Editing works in tag/search/day views even though the top composer is hidden there.
- **Double-click / click outside (2026-10-21 user request):** double-clicking a card's
  text opens the same inline edit (links, images and controls inside the text keep
  their own behavior). While a card edit is open, a primary-button press anywhere
  outside that card — not inside a dialog and not on a scrollbar — commits it with no
  prompt: a changed edit is saved (Save changes), an unchanged one just closes, and
  focus stays where the user clicked. If the edit cannot be saved (recording, empty
  body, missing file, conflict, failure, retired-tag choice) the editor stays open with
  the usual feedback. A link clicked outside navigates only after that save succeeds;
  editing another card waits for it. The note page (5.3) is unchanged.

### 5.3 Note page

- The note page header uses the same date (top left) and tag chips under it as
  the card. Its actions are three icon buttons, not a `•••` menu: **Pin** (shows
  pin-off on hover when pinned; unpins), **Edit** (pencil) and **Delete** (trash,
  immediate, as on the card). Shown for published notes only.
- The date and tags header stays visible while the note page is in edit mode.
- A Trash note's page (opened from the Trash list) shows the note read-only with an
  "In Trash" label and a link back to Trash, but **no** Restore, Permanently delete,
  Edit or action controls. Restore and permanent deletion happen only on the Trash
  page.
- Edit renders the editor inside the note page article, replacing the rendered body; it no longer navigates to the timeline. Save changes stays on the
  page and shows the updated note; Cancel follows 5.2.
- Leaving the page with unsaved changes uses the existing guard.

## 6. Delete

- Card or note page **Delete** immediately sends the existing `trash` lifecycle
  command (durable retry record first, as today) — no confirmation dialog.
- Success, card: the card simply disappears (scroll anchoring keeps the neighbouring
  cards in place). No status text and no Undo; restore is done from the Trash page.
- Success, note page: navigate back to the timeline, to the same target as the
  page's "All notes" link (currently `/`). No status text.
- Failure/timeout/conflict: open the existing `LifecycleDialog` in its error state
  (retry same action, inspect, refresh) — the confirmation step itself is skipped,
  not the retry safety.
- Restore and permanent delete exist only on the Trash page; permanent delete keeps
  its explicit confirmation there.

## 7. Text and i18n

New/changed UI strings go through `en.ts` and `zh-CN.ts`: Pin, Unpin, Unpin note,
Pinned, Edit, Delete, Cancel, In Trash, Back to Trash, the pin limit message.

## 8. Out of scope

Archive status/page, Share (image or text), Copy Link, Copy Markdown, Undo after
Delete, Restore/Permanently delete on the note page, drag-to-reorder pins, Pinned
section in tag views, bulk actions.
