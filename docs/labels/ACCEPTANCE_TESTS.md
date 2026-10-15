# Labels — acceptance tests

**Status: cases below verified on the host** (Windows dev machine); Linux/Alpine image
and a manual screen-reader/real-device pass are not done — see
[PROGRESS.md](PROGRESS.md).

Existing TAG, SEARCH, NOTE-02 (Trash), NOTE-03 (conflicts), EDITOR-01..05 and archive cases
must keep passing unchanged; labels are additive and must not alter tag/search/trash
behavior for notes that have no label.

## LBL-SCHEMA — Baseline and migration (integration)

Fresh database creates `labels` and `notes.label_id` with the documented CHECKs; invalid
color/icon/name/revision/time rows are rejected; `drizzle-kit generate` against the edited
baseline reports no drift; a local `data/` directory created before this change is refused
by the trusted-migration check (manual verification, documented in PROGRESS.md, not an
automated case since it requires a pre-change fixture).

## LBL-CRUD — Label management (integration + e2e)

- Create/rename/recolor/re-icon/delete round trip; duplicate name (case/width-insensitive)
  refused; 41st label refused with the limit message; stale `expectedRevision` → conflict
  with current summary; deleting a missing label → not-found; mutation-ID receipt replay
  returns the original result after a later edit or after deletion; reused ID with
  different content fails.
- `/labels` page: New label dialog (swatch row, icon row incl. "no icon", live preview),
  Edit dialog, Delete confirm, conflict dialog with copyable text, unsaved-changes guard on
  Cancel/Escape/Close, keyboard navigation of the swatch/icon radio rows, mobile drawer
  link, axe clean light/dark at 390 and 1280 px.

## LBL-ASSIGN — Assigning a label to a note (e2e + integration)

- Editor toolbar button opens a picker (No label + up to 40 labels); choosing one is
  local-only until Post/Save (no network write before that, verified the same way as the
  tag/template no-premature-write checks); replacing/clearing works; button disabled while
  the editor is locked.
- Label assignment travels inside the note's own `content.labelId` (not a separate
  command, see SPEC.md §3); revision/receipt behavior matches every other content edit
  (stale revision 409, replay-safe); an unknown/deleted `labelId` → not-found; a note's
  label survives pin/trash/restore and a backup → restore round trip (the label field is
  simply left unchanged by every non-content action, same pattern as other metadata).
- Deleting a label clears `label_id` on every note that had it in one transaction (SQLite
  `ON DELETE SET NULL`); an open note view reflects the cleared label on next fetch (no
  stale display).

## LBL-DISPLAY — Card/detail chip (e2e + visual + accessibility)

- Card and note-detail page show a chip with the label's name text always visible, plus its
  icon when set and its color as a background tint; a color-only label (no icon) still
  shows the name as real text in the accessible tree — verified by querying the rendered
  text content, not just an `aria-label`.
- Chip is visually distinct from tag chips in the same row (own background tint/shape,
  listed first); no resting underline; AA contrast of chip text against its own tint in
  both themes (computed, see SPEC.md §2.1); axe clean (verified via the generic
  authenticated-screens axe scan, `tests/e2e/zzzaccessibility.test.ts`).
- The chip has no click behavior; the sidebar list is the filter entry point (SPEC.md §4.3).

## LBL-FILTER — Sidebar filter and timeline (integration + e2e)

- Sidebar "Labels" list shows note counts, ordered by count then name, with a "+N" link to
  `/labels` when more than the visible rows exist (mirrors `TagList.svelte` behavior).
- Clicking a label filters the timeline via a `label` URL parameter; combinable with
  `tag`/`day`/`month`/`q` (AND semantics); cursor pagination with a label filter never
  duplicates or skips notes across pages; clearing the filter restores the previous view.
- `label:` is not a recognized search grammar term (a literal query containing it is treated
  as plain text, consistent with how any other unrecognized prefix is handled).

## LBL-BACKUP — Backup and restore (integration)

Full backup → restore round trip preserves `labels` rows and every note's `label_id`;
restore validator rejects a tampered color/icon enum, an out-of-range length/revision/time,
or a name/`name_key` identity mismatch (a dangling `label_id` was attempted directly via
raw SQL as a tamper case and turned out to be unconstructible — SQLite's own `FOREIGN KEY`
enforcement already refuses it before the application-level check would even run, a
stronger guarantee than planned; the JS-level `labelIds.has(...)` check in
`backups/trust.ts` remains as defense in depth for an archive built by a future version
without that constraint).

## Known gaps to close before release

- Linux/Alpine image gate for the schema/backup integration tests (native environment).
- Real-device/screen-reader manual pass for the swatch/icon radio rows and the chip's
  accessible name/text (automated axe scans pass; a manual screen-reader pass was not done).
- Full project e2e suite run: done once this session (139 tests); 4 failed on the full
  sequential run and passed standalone (known pre-existing Windows flakiness unrelated to
  labels — `detail.test.ts:256`, `editor.test.ts:205` intermittent worker crash,
  `voice-naming.test.ts:161`, `zzrestore.test.ts:24`), consistent with prior sessions'
  documented flakiness for the same specs.
