# Labels — ordered implementation plan

**Status: L01–L07 implemented** in one session; see [PROGRESS.md](PROGRESS.md) for
exact commands and results. Read [README.md](README.md) and [SPEC.md](SPEC.md) first.
Each step ends with the common gate: `npm run check`, `npm run lint`,
`npm run test:unit`, `npm run test:integration`, `npm run build`, plus the affected
Playwright specs. Record exact commands and results in [PROGRESS.md](PROGRESS.md). Do
not claim a step done on a skipped/failed command.

## L01 — Shared contracts (pure, no server imports) — done

- `src/lib/shared/labels.ts`: `LABEL_COLORS` (8), `LABEL_ICONS` (12), zod schemas for
  create/update/delete, `normalizeLabelName`/`labelNameKey`, canonical mutation digest.
- `src/lib/shared/notes.ts`: extend the command enum with `setLabel` (`{ labelId }`) and
  `clearLabel`.
- Unit tests: name length/control-character rules, case/width-insensitive key (incl.
  Chinese/accented names), unknown color/icon rejected, digest determinism, existing
  note-command union tests extended.
- Done when unit tests pass and `labels.ts` imports nothing from `server/`.

## L02 — Baseline schema edit (no new migration file) — done

- Edit `src/lib/server/db/schema.ts`: add `labels` table and `notes.label_id` column +
  index, per SPEC §1.
- Edit `migrations/0000_baseline.sql` and `migrations/meta/*` **in place** (no
  `000N_labels.sql`); `SCHEMA_VERSION` unchanged. Run `npm run db:generate` to confirm
  **zero drift**; if it proposes any SQL, the manual edit is incomplete — fix the baseline,
  do not accept a generated migration for this change (SPEC §1.3).
- Move aside/delete any local `data/` created before this change (document in PROGRESS.md
  which path was removed).
- Integration tests: fresh DB creates `labels`/`notes.label_id`; CHECK constraints reject
  bad color/icon/name/revision/time rows; `notes_label` index used by an `EXPLAIN QUERY
PLAN` check (optional, mirror any existing index-usage test style if one exists);
  deleting a label clears `label_id` on notes that had it (ON DELETE SET NULL), inside one
  transaction, no note rows deleted.
- Done when `npm run test:integration` passes and the migration-ledger/journal test (if the
  release-hygiene suite enforces ledger-length == SCHEMA_VERSION) still passes unchanged.

## L03 — Server service and HTTP API — done (note label assignment simplified, see SPEC.md §3)

- `src/lib/server/labels/service.ts` (`LabelService`): `list`, `create`, `update`,
  `delete`, through `Persistence.write`, `assertSessionIdentity`,
  `findReceipt`/`insertReceipt` against a new `label_mutation_receipts` table.
- Routes: `src/routes/api/labels/+server.ts`,
  `src/routes/api/labels/[labelId]/+server.ts`,
  `src/routes/api/labels/[labelId]/delete/+server.ts`.
- Extend `src/lib/server/notes/service.ts` with `setLabel`/`clearLabel` handling (both
  published and Trash notes allowed; unknown `labelId` → `not-found`).
- Integration tests: create/update/delete round trips; 40-cap; duplicate name; stale
  revision 409 with current summary; receipt retry after a later edit/delete returns the
  original result; reused mutation ID with different payload fails; expired/foreign session
  refused; label name never appears in logs/error text; `setLabel` on a Trash note succeeds
  and survives restore; deleting a label while a note view is open is reflected on next
  fetch (no stale `label_id` returned by the API).
- Done when the integration suite passes with the new tests.

## L04 — Labels management UI (`/labels`) — done

- Route `src/routes/(app)/labels/+page.server.ts` + `+page.svelte`; sidebar link (desktop +
  drawer) near Templates/Tags.
- `LabelEditor` modal: name, 8-swatch radio row, 12-icon + "no icon" radio row, live chip
  preview, Save/Cancel with unsaved-changes guard, conflict dialog (current summary shown,
  local text copyable).
- Row list with `ActionMenu` (Edit, Delete); delete uses the existing confirm dialog.
- i18n: all new keys added to `en.ts` and `zh-CN.ts` with identical placeholders.
- Tests: unit for client state helpers; e2e `tests/e2e/labels.test.ts` (create, duplicate
  name message, edit, conflict from a second tab, delete clears notes' labels, 40-cap
  message, keyboard path, mobile drawer link); axe check (light/dark, 390 and 1280 px).

## L05 — Assign label in the editor; card/detail chip — done

- Toolbar label button + picker component (composer, focus mode, mobile full-screen
  editor, in-place edit), local-only selection until Post/Save, disabled while locked.
- Chip component (icon?+name+color tint, text always visible per SPEC §4.3) on
  `NoteCard.svelte` and the note detail page, placed in the tag-chip row but visually
  distinct.
- Screenshot review to finalize exact chip placement/shape; record the decision in
  PROGRESS.md if it differs from the draft description in SPEC §4.3.
- Tests: unit for picker state; e2e covering set/clear/replace a label on a new and an
  existing note, chip renders on card and detail, Trash note keeps its chip, restore keeps
  it, no network write before Post/Save (same check used for templates/tags), mobile
  full-screen editor Post stays reachable; axe check including a color-only perception
  check (verify the label name text is present in the accessible tree, not only `aria-label`
  on a colored dot).

## L06 — Sidebar filter and timeline plumbing — done

- `TagList.svelte`-style `LabelList.svelte` in the sidebar with note counts and a "+N" link
  to `/labels`.
- `labelId` filter threaded through `server/notes/timeline.ts`, `server/notes/status-list.ts`,
  `shared/timeline.ts`, the `(app)/+page.svelte` query-param handling, combinable with
  `tag`/`day`/`month`/`q`.
- Tests: integration (filter correctness, combination with tag/day/month/search, cursor
  pagination never duplicates/skips, Trash view behavior if labels are shown there); e2e
  (clicking a sidebar label filters the timeline, clearing it restores the prior view,
  combined label+tag+search works).

## L07 — Backup/restore coverage, documentation, release gate — host done; Linux/Alpine image gate not run

- Integration: backup → delete everything → restore → labels and `notes.label_id` back;
  restore validator rejects a tampered `color`/`icon` enum value or an orphaned
  `label_id`/bad length/revision/time row (mirrors the template-row validation style).
- Update `docs/ARCHITECTURE.md` (table list, included-in-backup data), `docs/PRODUCT_SPEC.md`
  (an "Approved change — color or icon labels" pointer, already added alongside this plan —
  keep it in sync if behavior changes), `docs/ACCEPTANCE_TESTS.md` (pointer to
  `labels/ACCEPTANCE_TESTS.md`), `docs/IMPLEMENTATION_PLAN.md` (status line).
- Update `docs/PROGRESS.md` handoff and `docs/labels/PROGRESS.md` with exact commands,
  results and any skipped checks.
- Final gate: full affected Playwright subset, then the Linux/Alpine image run (native
  migration/archive tests execute there per AGENTS.md) before calling this release-complete.
  A host-only pass is not a release pass.

## Dependencies and order

L01 → L02 → L03 → L04 → L05 → L06 → L07. L04 and L05 can start once L03 passes (L05 needs
the note `setLabel`/`clearLabel` commands from L03, not the management page). L06 needs L03
(label IDs/counts) and benefits from L04 existing (the "+N" link target) but does not require
L05.
