# Note card actions — acceptance tests

Existing NOTE-02 (Trash), NOTE-03 (conflicts), TAG, SEARCH, EDITOR-01..05 and
archive cases must keep passing, except that card/note-page "Move to Trash" no
longer asks for confirmation.

## NA-LAYOUT — Card header (e2e + visual)

Card with tags: date row (date, Edited, unpin icon if pinned, `•••`) then a tags row directly
beneath, before search excerpts/content. Card without tags: no empty row. The `•••`
has no border/background at rest; hover and focus-visible show the soft round
background and focus ring. 390 px and 1280 px, light and dark: no overflow, axe clean.

## NA-MENU — Dropdown behavior (e2e)

Click `•••` → a `role=menu` appears anchored under the trigger (no dialog/backdrop)
with Pin, Edit, Delete in that order; Delete styled as danger. First item focused;
ArrowDown/Up wrap, Home/End work; Escape closes and refocuses the trigger; outside
click and notes-pane scroll close it; opening another card's menu closes the first.
A card near the bottom of the viewport opens the menu upward. No "Copy Markdown",
Archive, Share or Copy Link item exists. Tag header menu uses the same component and
its Rename/Merge/Remove forms still work.

## NA-PIN — Pin (integration + e2e)

- Integration: `pin` increments revision once, no `content_edited_at` change; replay
  with same mutation ID returns the original receipt; stale revision → 409; pin on a
  Trash note or an already pinned note fails; 21st pin fails with the limit message;
  `trash` clears `pinned_at`; `restore` leaves it null; DB check rejects
  `pinned_at` on a Trash row; backup/restore round trip preserves `pinned_at`.
- Timeline: plain view first page has `pinned` (newest pin first) and the stream
  excludes them; second page never contains a pinned note; tag/search/day/month views
  include pinned notes in date order and have no `pinned` list.
- E2E: pin an old note → it appears under "Pinned" at the top and not in its month;
  menu now says Unpin and the card shows the unpin icon; clicking the unpin icon
  (no menu) → back in date position; pin again, open a tag view → note in date
  position with the unpin icon; delete a pinned note → gone from Pinned; restore it
  from the Trash page → it returns unpinned.

## NA-EDIT — Inline edit (e2e)

- Card Edit turns that card into the editor at the same list position; top composer
  stays collapsed. Change text, Save changes → card shows new text, same position,
  "Edited" label, focus returns to its `•••`; no navigation occurred.
- Truncated long note: Edit loads the full body before opening.
- Cancel with no change closes silently; with changes offers Discard / Keep editing.
- Unsaved text in the top composer, then card Edit → Post–Discard–Cancel prompt;
  Cancel keeps composer text and no card editor opens. Same for card A → card B.
- Edit in a tag view and a search view works and saves.
- Conflict: second tab saves first; this tab's Save shows the conflict dialog with
  the inline editor and text intact.
- Focus button opens the full-screen editor; X returns to the inline card editor
  with the same text/files. 390 px mobile inline edit works with the virtual
  keyboard area (manual check on a device).
- Note page: menu Edit edits within the page; Save changes stays on `/notes/<id>`
  with the new revision; leaving with unsaved text prompts.

## NA-DELETE — Delete (e2e + unit)

Card Delete: no dialog; card disappears; no status text or Undo; note present in
Trash. Note page Delete: no dialog; browser returns to the timeline (`/`) and the
note is absent. Opening a Trash note's page (from the Trash list) shows it
read-only with "In Trash" and a link back to Trash, and no Restore, Permanently
delete, Edit or `•••`. Restore and permanent delete work from the Trash page.
Simulated network failure on Delete opens the
lifecycle dialog in error state with "Retry same action"; retry uses the same
mutation ID and yields one Trash transition. Permanent delete still confirms.
