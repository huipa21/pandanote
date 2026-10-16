# Color or icon labels — technical specification

**Status: implemented** (L01–L07, plus a 2026-10 follow-up round: expanded icon set,
optional header-color/background/font formatting, masonry management page, redundant
nav-link removal — see [PROGRESS.md](PROGRESS.md) for exact commands/results and
remaining gaps — Linux/Alpine image gate and full visual/manual review).

Read [README.md](README.md) first for the goal and user decisions; this file is the
authoritative contract for implementation.

## 1. Data model

### 1.1 `labels` table

| Column         | Type                                       | Notes                                                               |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `id`           | text primary key                           | same `id()` helper as other tables                                  |
| `name`         | text, 1–40 code points                     | display text as typed (NFC, trimmed, internal whitespace collapsed) |
| `name_key`     | text, unique index                         | NFKC + case-fold of `name`, for case-insensitive uniqueness         |
| `color`        | text enum                                  | one of the fixed palette keys (§2.1); CHECK constrains the set      |
| `icon`         | text enum, nullable                        | one of the fixed icon keys (§2.2) or `NULL` for color-only; CHECK   |
| `header_color` | text enum, nullable                        | note card/detail header tint override (§2.3); `NULL` = unstyled     |
| `background`   | text enum, nullable                        | note card/detail surface tint override (§2.3); `NULL` = default     |
| `font`         | text enum, nullable                        | note body font override (§2.3); `NULL` = default `--font-body`      |
| `revision`     | integer, default 1                         | +1 per update, optimistic concurrency like templates                |
| `created_at`   | integer (UTC ms)                           |                                                                     |
| `updated_at`   | integer (UTC ms), monotonic ≥ `created_at` |                                                                     |

Cap: at most 40 rows (checked in the service before insert, same style as the templates
100-cap and tags' 100-unique-per-workspace cap — the error is `err.labelLimitReached`).

### 1.2 `notes.label_id`

- New nullable column `label_id` on `notes`, `REFERENCES labels(id) ON DELETE SET NULL`.
- No CHECK ties it to `status`; a Trash note keeps its `label_id` (unlike `pinned_at`,
  which is published-only). Restoring a trashed note keeps the label unchanged.
- Index `notes_label` on `(label_id, timeline_at DESC, id DESC)` `WHERE label_id IS NOT
NULL`, mirroring the `notes_pinned` partial-index style, to support the sidebar filter
  query without a table scan.

### 1.3 Baseline-only change ("treat as new setup") — implemented

Per README.md decision 4: the `labels` table and the `notes.label_id` column, its
CHECKs and the `notes_label` index were added **directly in
`migrations/0000_baseline.sql`** and `src/lib/server/db/schema.ts`, edited in place. No
new numbered migration file, `SCHEMA_VERSION` unchanged at 3. `npm run db:generate`
reports **no drift** (the three meta snapshot files were hand-edited to match, then
reformatted with `prettier --write` to match drizzle-kit's own array-inlining style).

One additional in-place change was required and made for the same reason: the
`notes_update_guard` trigger (`migrations/0001_guards_and_search.sql`) required every
note update to bump `revision` by exactly 1. Deleting a label triggers SQLite's own
`ON DELETE SET NULL` foreign-key action, which issues a raw `UPDATE notes SET
label_id = NULL` outside application code and does not bump `revision`. The trigger was
extended to allow a same-revision update **only** when every column except `label_id` is
unchanged and `label_id` actually changed — i.e. exactly the FK-cascade case — otherwise
the original revision-must-advance-by-1 rule still applies. The `DROP TRIGGER
notes_update_guard` attack case in `tests/integration/restores.test.ts` still exercises
the untrusted-schema path independent of this change.

Any local `data/` directory created before this change fails the trusted-migration
hash/journal check on next start and must be deleted or moved aside — expected, not a bug.

## 2. Fixed palettes (no user-defined colors/icons)

### 2.1 Color keys (8)

`red`, `orange`, `amber`, `green`, `teal`, `blue`, `purple`, `gray`. Each key maps to a
light-mode and dark-mode CSS custom property pair (background tint + foreground text
color) chosen for ≥ 4.5:1 text contrast against its own tint in both themes, consistent
with the existing "lighter/darker accent tints" rule for calendar heat (PRODUCT_SPEC
§3.1). Values live beside the other theme tokens (global stylesheet), not per-component.

### 2.2 Icon keys (36), rendered by `Icon.svelte`

`star`, `heart`, `flag`, `bookmark`, `folder`, `briefcase`, `book`, `home`, `warning`,
`info`, `check-circle`, `camera`, `lightbulb`, `rocket`, `target`, `clock`, `calendar`,
`mail`, `phone`, `chat`, `code`, `lock`, `key`, `chart`, `trophy`, `coffee`, `price-tag`,
`car`, `plane`, `leaf`, `music`, `gift`, `cart`, `umbrella`, `compass`, `paw`. Same 24px
stroke style as the existing action icon set. A label with `icon: null` shows no icon
glyph, only the color tint and the name text (see §4.3 — text is never omitted, so
color-only labels remain accessible). **(2026-10 follow-up: expanded from the original
12 to 36 per user request — "more abundant icons". No change to the mechanism, only the
fixed set size.)**

### 2.3 Optional per-label formatting: header color, background, font (2026-10 follow-up)

User feedback: tags and labels read as near-duplicate features in the same sidebar area
with no visual distinction. In response, labels gained three independent, optional
visual overrides applied to every note carrying that label, on top of the identity chip
(`color`+`icon`+`name`, unchanged, §2.1/§2.2):

- `headerColor: LabelColor | null` — tints the note card/detail header row (date, pin,
  actions) with that color's background+foreground pair. `null` (default) leaves the
  header unstyled, as before this change.
- `background: LabelColor | null` — tints the whole card/detail surface background.
  `null` (default) keeps the normal `--surface` background.
- `font: LabelFont | null` where `LabelFont` is `'serif' | 'mono' | 'rounded'` — sets the
  note body's font-family (card content / detail body only, not UI chrome). `null`
  (default) keeps `--font-body`. New tokens `--font-serif`/`--font-rounded` added beside
  the existing `--font-body`/`--font-code` (the `mono` choice reuses `--font-code`).

All three are nullable columns on `labels` (§1.1), nullable fields on the create/update
command (§3.1/§3.3), edited from the same `LabelEditor` dialog as color/icon with their
own radio groups and a live card-shaped preview (chip + header tint + background tint +
sample body text in the chosen font). They do not affect the chip itself (`LabelChip`,
`LabelList`, `LabelPicker`): those keep using only `color`/`icon`/`name`, unchanged.
Trash/restore/pin carry them unchanged, same as every other label field (§5).

## 3. Server contracts

**Implementation note (deviates from the original draft below):** label assignment is
**not** a separate `setLabel`/`clearLabel` note command. It is a `labelId` field inside
`noteContentSchema` (`src/lib/shared/notes.ts`), alongside `attachmentIds` and
`tagAcknowledgements` — local-only in the editor until Post/Save, submitted with the
note's create/update mutation, exactly like tags and attachments already work. This is
simpler than the originally planned standalone commands and needs no extra receipt
handling for note-side assignment (the note's own receipt already covers it). A
consequence: a Trash note's label can only change by editing the note, and Trash notes
are not edited through the composer in this app, so in practice a Trash note's label is
fixed until restored — acceptable, consistent with how Trash notes already behave for
every other content field. The `labels` table still has its own CRUD (`LabelService`)
and its own `label_mutation_receipts` table, as planned.

### 3.1 Shared module `src/lib/shared/labels.ts` (pure)

- Zod schemas for create/update/delete commands: `{ name }`, `{ name?, color?, icon? }`
  (at least one field), `{ expectedRevision, confirmed }`.
- `normalizeLabelName`, `labelNameKey` (mirrors `templates.ts` name/`name_key` helpers).
- `LABEL_COLORS` and `LABEL_ICONS` as `readonly string[]` constants, the single source of
  truth shared by the server CHECK generation reasoning, the zod enum and the client picker.
- Canonical mutation digest input for receipt replay (same approach as templates/notes).

### 3.2 `LabelService` (`src/lib/server/labels/service.ts`)

- `list()`: all labels ordered by `name_key`, with a computed `noteCount` (published +
  Trash, for the sidebar list; a separate `publishedNoteCount` if the sidebar should only
  count published notes — follow the Tags sidebar convention, PRODUCT_SPEC §7).
- `create(name, color, icon)`: cap check (40), duplicate `name_key` → validation error.
- `update(id, patch, expectedRevision)`: rename/recolor/re-icon; stale revision → `conflict`
  with the current summary (same shape as template/tag conflict payloads).
- `delete(id, expectedRevision, confirmed)`: deletes the label row; the FK
  `ON DELETE SET NULL` clears `label_id` on every note that had it, in the same
  transaction. No note is deleted. Missing label → `not-found`.
- All writes via `Persistence.write`, `assertSessionIdentity`, `findReceipt`/
  `insertReceipt` (table `label_mutation_receipts`, its own result schema — do not reuse
  the notes or templates receipt tables, same reasoning as templates §4).
- Assigning/clearing a note's label travels inside the note's own `content.labelId`
  (see the implementation note above), validated by `NoteService`
  (`assertLabelExists` when non-null) in the same transaction as the rest of the content
  write. It is **not** a separate note command.

### 3.3 HTTP endpoints

- `GET /api/labels` — full list with counts (session required).
- `POST /api/labels` — create.
- `PATCH /api/labels/<id>` — update (`expectedRevision`).
- `POST /api/labels/<id>/delete` — delete (`expectedRevision`, `confirmed`).
- Note label assignment reuses the existing note create/update endpoints via
  `content.labelId` (see the implementation note above), not a new route.
- Same `noteErrorResponse`/`ApiResult` conventions, same-origin + session checks, path and
  payload IDs must match, as every other mutation endpoint in this codebase.

## 4. Client and UI contracts

### 4.1 `/labels` management page

- Sidebar entry point: the "Labels" section header in the sidebar (§4.4) links to
  `/labels`; **(2026-10 follow-up)** the duplicate link that used to also sit in the
  bottom utilities nav (next to Templates/Trash/Settings) was removed as redundant —
  Tags never had one either, and having both made Tags and Labels look like the same
  feature at a glance (user feedback). `/labels` is still reachable from the sidebar
  section heading, same as `/tags`.
- Layout: title "Labels", a **New label** button, then a **masonry grid** of label tiles
  (CSS multi-column flow, `columns: 16rem`, `break-inside: avoid` — no JS layout library;
  **(2026-10 follow-up, replaces the original plain list)** per user request. Each tile
  previews the label as it will actually render on a note: a header strip (header color
  tint + the identity chip + an `ActionMenu` for Edit/Delete) and a body strip (background
  tint + a sample sentence in the chosen font) plus the note count.
- New/Edit dialog: name field, a row of 8 color swatches (radio-group semantics, one
  selectable), a row of 36 icon buttons plus a "no icon" option (radio-group semantics),
  **(2026-10 follow-up)** a row of 8 header-color swatches plus "no header color", a row
  of 8 background swatches plus "no background", and a row of 4 font choices (default +
  serif/mono/rounded), live card-shaped preview (chip + header tint + background tint +
  sample body text in the chosen font), Save/Cancel. Unsaved-changes guard on
  Cancel/Escape/Close, same pattern as `TemplateEditor`.
- Delete: existing confirm dialog, text "Delete label? Notes keep their text but lose this
  label." Stale revision/not-found show the standard conflict/removed messages and reload
  the list.

### 4.2 Assigning a label in the editor

- **Header, not the toolbar (revised).** The label is a centered control in the editor's
  header row (above the text, never in the tags/options row): the label chip when one is
  set, a dashed "Choose a label" placeholder otherwise. It is shown in the composer, focus
  mode, mobile full-screen editor and in-place edit. Disabled while the editor is locked
  (busy, frozen, conflict). On short viewports (max-height 480px) the row is compacted so
  the footer stays reachable.
- Opens a small picker: "No label" plus the up-to-40 labels (swatch + icon + name, no
  search field). Choosing one sets `label_id` locally in the editor session; nothing is
  written to the server until Post/Save.
- **Create on the spot (revised).** The picker has a name field and a Create button. It
  creates a label (default color rotating through the palette, no icon/overrides — refine
  later on /labels) through the normal label API and selects it immediately; it is also added
  to the in-memory label cache so its chip renders without reload. Names follow the usual
  rules (1–40 chars, unique ignoring case); errors show in the picker.
- A "Manage labels" footer link in the picker opens `/labels` in a new tab/route without
  discarding the current draft.

### 4.3 Card and detail chip (accessibility-first; never color-only)

- Chip renders as: `[icon if set] name`, with the color used only as a background tint
  behind that icon+text (not as the sole differentiator) — this directly answers the
  accessibility open question (§8 of README's original questions): the label's name is
  always visible text, so color-blind or no-color (forced-colors/high-contrast) users
  still identify the label from the text, and screen readers read the name directly
  (no `aria-label`-only color swatch).
- Position: same row as tag chips, visually distinguished (e.g. leading position, slightly
  different chip shape) so it is not confused with a hashtag chip. Exact placement decided
  during L05 with a screenshot review, consistent with PRODUCT_SPEC §3's visual-language
  rules (no resting underline on non-interactive metadata, AA contrast).
- Clicking the chip on the card does nothing special (no quick-filter from the card) unless
  decided otherwise during implementation; the authoritative filter entry point is the
  sidebar list (§4.4). (Record the final decision in PROGRESS.md if this is revisited.)
- **(2026-10 follow-up)** `headerColor`/`background`/`font` (§2.3) are rendered by
  `NoteCard.svelte`/`NoteDetail.svelte` directly on the card's `<article>` (background)
  and `<header>` (header tint) and on the body/content container (font-family) — not by
  `LabelChip` itself, which keeps rendering only `color`+`icon`+`name` as before. A note
  with no label, or a label with all three overrides left at `null`, renders exactly as it
  did before this follow-up.

### 4.4 Sidebar filter

- A "Labels" section in the sidebar, structured like `TagList.svelte` (chips ordered by
  note count then `name_key`, a "+N" overflow link to `/labels`), each chip showing
  swatch+icon+name+count.
- Clicking a chip sets a `label=<id>` URL query filter alongside the existing `tag`/`day`/
  `month`/`q` filters; combinable with all of them (AND semantics, consistent with how
  `tag` already combines with `q`); not part of the `shared/search.ts` grammar — `label:`
  is **not** a recognized search term (distinct from `tag:name`, README decision — labels
  are structured metadata, not searchable text).
- Timeline/status-list/backup query layers (`server/notes/timeline.ts`,
  `server/notes/status-list.ts`, `shared/timeline.ts`) gain a `labelId` filter parameter
  using the `notes_label` partial index, parallel to the existing tag-id filter plumbing.

## 5. Backup and restore

- `labels` and `notes.label_id` are ordinary columns/tables in the single SQLite file, so
  the existing whole-database backup/restore path covers them with no special-casing other
  than the restore validator checking the new CHECKs (`color`/`icon` enum membership,
  `name`/`name_key` identity and length, revision/time bounds) — same shape as the template
  row validation added for schema 3, but gated on "this baseline" rather than a schema
  version compare (per §1.3, there is no older schema to distinguish: a restored archive
  either matches the current baseline trust hash or is refused like any other mismatch).
- No importer, no label merge-on-restore logic; a restore is a full database replacement
  like every other restore in this app.

## 6. Security and privacy

Private authenticated routes only, same `ApiResult`/session/same-origin conventions as
every other mutation surface. Label names are user content and must not be logged; the
40-row cap and short name length make this a low-risk surface, but it still goes through
`assertSessionIdentity` inside the write transaction like every other mutation.

## 7. Known limitations (expected, not defects)

- One label per note only; no multi-label, no nested/grouped labels.
- Fixed 8 colors / 12 icons; no custom color picker or icon upload.
- Not reflected on the month calendar or in free-text search in v1.
- Deleting a label is immediate (after confirmation) and clears it from every note with no
  undo beyond restoring from a backup.
- Pre-change local `data/` directories must be deleted/recreated (§1.3); this is a one-time
  development-environment cost, not a migration path for any real deployment (none exists
  yet for this feature).
