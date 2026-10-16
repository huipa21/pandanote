# Change: Note templates

**Status:** approved by the user and implemented (T01–T06 on the host). Linux/Alpine image
gate not yet run, see [PROGRESS.md](PROGRESS.md). Plan: [PLAN.md](PLAN.md).

**Type:** user-requested feature (post-S18). Does not close S18's open release gates.

## 1. Goal

1. Create, search, edit and delete reusable note templates (a name plus a Markdown body).
2. Pick a template from the editor toolbar and insert it into a note.

A template is a starting text, not a live link. Notes keep their own copy; later template
edits or deletions never change existing notes.

## 2. Decisions (user answers)

| #   | Decision                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O1  | Templates live on a `/templates` page, laid out like `/tags` (title, search, list). A **Templates** link sits in the sidebar utilities (desktop and drawer). |
| O2  | The page has a search bar, select-all, multi-select **delete**, a **New template** button, and clicking a template opens it for editing.                     |
| O3  | **No limit** on the number of templates (single user).                                                                                                       |
| O4  | The note editor toolbar gets a **template icon** that opens a picker with a search field; choosing a template inserts it.                                    |
| —   | Delete is permanent after a confirmation (templates are not notes, no Trash). Names are unique ignoring case.                                                |
| —   | Not in this change: placeholders (`{{date}}`), "save current text as template", photos/files inside templates.                                               |

## 3. Behavior

### 3.1 `/templates` page

- Title "Templates", a search box (same slim look as other pages) with a **New template**
  button beside it, then a bulk row and the list.
- Search is literal and case-insensitive over name **and** body; every whitespace-separated
  term must match. No operators. It filters as you type (the whole list is loaded, there is
  no paging).
- Each row has a checkbox, the name and a one-line excerpt. The row opens an edit dialog.
- Bulk row: select-all checkbox (selects the templates currently shown, indeterminate when
  partial), a delete-selected icon, and a count. Delete asks for confirmation, then deletes
  one template at a time; a failure stops the batch and keeps the rest selected. A template
  changed elsewhere shows "This template changed somewhere else…" and the list reloads.
- New/Edit dialog: name, text, a Preview toggle (safe Markdown), Save and Cancel. Cancel,
  Escape or Close with unsaved changes asks Discard / Keep editing. A stale save shows the
  server's message and keeps the user's text in the dialog so it can be copied.
- Template editing is independent of the note editor session and never touches it.

### 3.2 Using a template in the editor

- A document icon (**Insert template**) sits after the Tags button in the editor toolbar
  (composer, focus mode, mobile full-screen editor, in-place edit).
- It opens a "Template" dialog with a search field and a list (name + excerpt). The list is
  fetched each time it opens, so deleted templates do not appear. Empty states explain
  "No templates yet" / "No templates match".
- Choosing one inserts its body at the remembered caret/selection of the note text:
  non-blank text on a side is separated by one blank line, newlines at the template's edges
  are dropped, and the caret ends after the inserted text. Preview mode is switched off.
- Nothing posts. The editor becomes dirty and the usual Post/Save and unsaved-change rules
  apply. Insertion is refused with an editor error if the result would exceed the Markdown
  byte limit. The button is disabled while the editor is locked (busy, frozen, conflict,
  recording).
- Hashtags in a template are ordinary text until a note is posted; the existing
  retired-tag check applies then.

### 3.3 Default label (revised)

- A template may carry one optional **default label** (`note_templates.label_id`, FK to
  labels, ON DELETE SET NULL; edited into migration 0002 in place, schema version stays 3).
  The New/Edit dialog has a label control that reuses the label picker (including create on
  the spot). Template lists and the picker show the label chip.
- Inserting a template sets the note's label to the template's label **only if the note has
  none yet**; an explicit choice is never overridden. Tags need no new field: `#hashtags` in
  the template body are inserted as text and become tags when the note posts (§3.2).
- Commands carry optional `labelId` (null/omitted = none); an unknown label is refused
  (`err.labelNotFound`). Backup restore validates template `label_id` against restored labels.

## 4. Data and contracts

- Table `note_templates`: `id`, `name` (1–60 code points), `name_key` (unique; NFKC, trimmed,
  whitespace-collapsed, lowercased), `body_markdown` (non-blank, ≤ configured Markdown byte
  limit, LF line endings), `revision` (+1 per update), `created_at`, `updated_at`
  (monotonic). SQLite CHECKs mirror the length/revision/time rules. No foreign keys.
- Table `template_mutation_receipts` (mutation ID, account, request digest, result JSON).
  Notes' receipt table is not reused because its result schema describes note mutations.
- Template bodies may not contain `attachment:` image/link references (they would point at
  per-note files). Plain Markdown, code and Mermaid are allowed. The size check runs before
  parsing because the Markdown parser refuses over 1 MiB.
- Endpoints (session + same-origin like other mutations; shared `noteErrorResponse`):
  `GET /api/templates` (full list with bodies, sorted by `name_key`),
  `POST /api/templates` (create), `PATCH /api/templates/<id>` (update with
  `expectedRevision`), `POST /api/templates/<id>/delete` (`expectedRevision`, `confirmed`).
  Path and payload IDs must match; the payload `action` must match the route.
- Receipt-first retries: a repeated mutation ID with the same canonical content returns the
  original result even after later edits or deletion; different content fails with
  `mutation-mismatch`. The mutation ID is not part of the digest. The client keeps one ID per
  unchanged form content, so a lost response cannot create a second template.
- Stale `expectedRevision` → `conflict`; missing template → `not-found`; duplicate name →
  validation error. Never an overwrite. Session identity is rechecked inside the write
  transaction. Template text is never logged or put into error messages.
- Error and UI text use catalog keys (`err.template*`, `templates.*`, `shell.templates`) in
  English and Simplified Chinese.

## 5. Migration, backup and restore

- Additive trusted migration `0002_note_templates.sql`, **schema version 3**. Existing
  databases upgrade through the normal startup path with the pre-upgrade copy. No importer.
- Format-v2 backup archives include both new tables (they copy the whole database). Restore
  validation compares the trusted schema (so it requires the tables), applies the 1 MiB
  cell bound to template bodies (like notes), and validates template rows when the archive is
  schema 3 (ID, name/`name_key` identity, normalized non-blank body, revision, times).
- A schema-2 archive restores through the staged trusted migration with zero templates.
  Newer/unknown schemas remain refused (the "newer schema" test now uses schema 4).

## 6. Security and privacy

Private authenticated routes only; never a public asset; bodies rendered by the same safe
Markdown pipeline as notes; templates are not in `note_search`, the calendar, tags, Trash or
the timeline.

## 7. Known limitations

- The picker lists what existed when it opened; if a template is deleted in another tab after
  that, its text can still be inserted once (it is only a copy). No special message.
- Template editing has no cross-tab live update; a stale save is caught by the revision check.
- The Linux/Alpine image gate, real-device checks and a visual review of Chinese layouts have
  not been done.
