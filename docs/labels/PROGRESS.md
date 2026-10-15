# Labels — progress and handoff

Spec: [SPEC.md](SPEC.md). Plan: [PLAN.md](PLAN.md). Decisions: [README.md](README.md).

## Current state (session 2, implementation)

**Status: L01–L07 implemented and host-verified. Linux/Alpine image gate, a manual
real-device/screen-reader pass and full visual-baseline review are NOT done, so this is
not yet release-complete.**

| Step | State                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| L01  | done — `src/lib/shared/labels.ts`, unit tests                                                                               |
| L02  | done — baseline schema edit (folded into `migrations/0000_baseline.sql`, no new file)                                       |
| L03  | done, simplified — `LabelService`, `/api/labels*`; note assignment via `content.labelId`, not separate commands (see below) |
| L04  | done — `/labels` management page, `LabelEditor`, sidebar link                                                               |
| L05  | done — editor toolbar picker (`LabelPicker`), `LabelChip` on card/detail                                                    |
| L06  | done — sidebar `LabelList`, `label` URL filter, timeline/cursor plumbing                                                    |
| L07  | host done — backup/restore coverage, docs; Alpine image + real-device checks open                                           |

## Behavior delivered

One label per note; user-named labels with a color from a fixed 8-swatch palette and an
optional icon from a fixed 12-icon set; managed on `/labels` (create/edit/delete, no
search/bulk-select — capped at 40, lightweight list); picked from an editor toolbar button
("Choose a label"); shown as a chip (icon + name text + color tint, name always literal
text for accessibility) on cards and the note detail page; filters the timeline from a
sidebar "Labels" section via a `label` URL parameter, combinable with `tag`/`day`/`month`/
`q`, not part of free-text search; carried through pin/Trash/restore; deleting a label
clears it from notes via `ON DELETE SET NULL` without deleting any note; not reflected on
the calendar. The schema change is folded directly into the baseline (SCHEMA_VERSION stays
3, no new migration file) per the "treat as new setup" decision.

## Design deviation from the original SPEC draft (recorded, not hidden)

The original plan had label assignment as separate `setLabel`/`clearLabel` note commands
(mirroring pin/unpin). While implementing, a simpler and more consistent design was used
instead: `labelId` is a field inside `noteContentSchema` (`src/lib/shared/notes.ts`),
alongside `attachmentIds`/`tagAcknowledgements` — local-only in the editor until Post/Save,
submitted with the note's create/update mutation. This matches the already-agreed UI
contract ("nothing posts until Post/Save") exactly, needs no extra note-receipt handling,
and removes an entire class of planned code (two new mutation variants, HTTP wiring,
tests) without losing any required behavior. `SPEC.md` §3 was updated in place to describe
and justify this. One consequence: a Trash note's label cannot be changed except by editing
the note, and Trash notes aren't edited through the composer in this app — so a trashed
note's label is effectively fixed until restored. This was not a requirement either way and
is consistent with how every other content field already behaves for Trash notes.

## New architecture decisions (beyond the original SPEC), with rationale

1. **`notes_update_guard` trigger extended.** Deleting a label fires SQLite's own
   `ON DELETE SET NULL` on `notes.label_id`, a raw `UPDATE` outside application code that
   does not bump `revision`. The pre-existing trigger required every note update to bump
   revision by exactly 1, which blocked this case entirely (`SqliteError: immutable note
identity or invalid revision/time`, caught by an integration test). Fixed by extending
   the trigger (edited in place in `migrations/0001_guards_and_search.sql`, same "new
   setup" latitude as the baseline) to allow a same-revision update only when every column
   except `label_id` is identical and `label_id` actually changed — i.e. exactly the FK
   cascade case, nothing broader. Verified with the existing untrusted-schema attack suite
   (`tests/integration/restores.test.ts`) plus new label-specific tests.
2. **`labelId` is optional, not required, in `NoteSnapshot`/`noteContentSchema`.** Making
   it a required field would have forced edits to dozens of unrelated test fixtures across
   the codebase that build partial `NoteSnapshot`/content literals. Making it
   `idSchema.nullable().optional()` keeps every existing call site compiling and passing
   unchanged while production code paths (service/timeline/snapshot) always populate it
   from the real column. Documented in `shared/domain.ts` and `shared/notes.ts` comments.
3. **Canonical mutation/snapshot versions bumped** (`pandanote-note-mutation-v2` → `v3`,
   `pandanote-note-snapshot-v2` → `v3`) because `labelId` was added to both tuples. This
   only affects digests computed going forward; no stored data depends on the version
   string. One existing unit test asserting the literal v2 string was updated.
4. **Sidebar/card label registry via a small Svelte context** (`src/lib/client/labels-context.ts`,
   `LABELS` symbol, `Map<string, LabelSummary>`), populated once in the root layout from
   `data.availableLabels` (added to `+layout.server.ts`) and kept in sync via an `$effect`.
   Consumed by `EditorOptions` (toolbar swatch), `NoteCard`/`NoteDetail` (chip) and
   `LabelPicker`/`/labels` (their own fetch, for freshness after CRUD). This avoids a
   second network round trip just to resolve `labelId` → name/color/icon on every card.
5. **No dedicated "label view" header component.** Unlike tags (`TagHeader.svelte`, with
   rename/merge/remove inline), a label filter shows a small inline strip ("Label: Name,
   Remove label filter") directly in `(app)/+page.svelte`, because label management lives
   entirely on `/labels` — there is no per-label action menu needed in the timeline view.

## Touched files (non-exhaustive, by area)

- **Shared:** `src/lib/shared/labels.ts` (new), `src/lib/shared/domain.ts` (`labelId` on
  `NoteSnapshot`), `src/lib/shared/notes.ts` (`labelId` in content/canonical forms),
  `src/lib/shared/timeline.ts` (`label` filter, `selectLabel`), `src/lib/client/editor/model.ts`
  (`EditorSession.labelId`), `src/lib/client/labels-context.ts` (new).
- **Server:** `src/lib/server/db/schema.ts` (`labels`, `labelMutationReceipts`,
  `notes.labelId`), `src/lib/server/labels/service.ts` (new, `LabelService` +
  `assertLabelExists`), `src/lib/server/notes/service.ts` (labelId validate/persist in
  the content path, `snapshot()`), `src/lib/server/notes/timeline.ts` (label predicate,
  plain-view/anchor/cursor updates), `src/lib/server/backups/trust.ts` (labels row
  validation + dangling-reference check + `labelId` in `noteMetadataSchema.parse`),
  `src/lib/server/runtime.ts` (`labels: LabelService`).
- **Migrations:** `migrations/0000_baseline.sql` (labels/label_mutation_receipts tables,
  `notes.label_id` column + index, edited in place), `migrations/0001_guards_and_search.sql`
  (`notes_update_guard` extended, edited in place), `migrations/meta/000{0,1,2}_snapshot.json`
  (hand-synced, `drizzle-kit generate` confirms no drift).
- **Routes:** `src/routes/api/labels/{+server.ts,[labelId]/+server.ts,[labelId]/delete/+server.ts}`
  (new), `src/routes/(app)/labels/{+page.server.ts,+page.svelte}` (new),
  `src/routes/(app)/+layout.server.ts` (`availableLabels`), `src/routes/(app)/+layout.svelte`
  (`LABELS` context), `src/routes/(app)/+page.server.ts` (`labelSummary`),
  `src/routes/(app)/+page.svelte` (label filter plumbing, inline label strip).
- **Components:** `LabelEditor.svelte`, `LabelPicker.svelte`, `LabelChip.svelte`,
  `LabelList.svelte` (all new), `Icon.svelte` (12 new icon names), `EditorOptions.svelte`
  (label button), `NoteEditor.svelte` (`LabelPicker` wiring), `NoteCard.svelte`,
  `NoteDetail.svelte` (chip), `Sidebar.svelte` (Labels section + nav link),
  `AppShell.svelte` (labels prop, hasFilters/showStrip, removable filter chip).
- **Styles:** `src/lib/styles/tokens.css` (8 `--label-*-bg`/`-fg` pairs, light/dark/system).
- **i18n:** `src/lib/shared/i18n/{en,zh-CN}.ts` (`labels.*`, `shell.labels`,
  `editor.addLabel`/`labelTitle`, `err.label*`, `shell.removeLabel`,
  `err.selectOnlyOneLabel`/`invalidLabelFilter`, `labels.color.*`/`labels.icon.*`).
- **Client API:** `src/lib/client/labels/api.ts` (new).
- **Tests:** `tests/unit/labels.test.ts` (new), `tests/unit/tag-management.test.ts`
  (canonical-mutation v3 fixture update), `tests/integration/labels.test.ts` (new),
  `tests/integration/restores.test.ts` (labels backup/restore round trip + tamper case),
  `tests/integration/release-hygiene.test.ts` (route inventory), `tests/e2e/labels.test.ts`
  (new), `tests/e2e/editor.test.ts` (toolbar button count 5 → 6),
  `tests/e2e/zzzaccessibility.test.ts` (`/labels` added to the generic screen scan),
  `tests/e2e/shell.test.ts-snapshots/{settings-dark-compact,shell-light-1440x900}-chromium-win32.png`
  (regenerated: new sidebar link/section change the baseline layout, same as the templates
  sidebar-link precedent).

## Commands run and actual results (host, Windows)

- `npm run db:generate`: "No schema changes, nothing to migrate" (confirms the baseline
  edit matches `schema.ts` with zero drift).
- Manual fresh-DB check (`applyMigrations` against `:memory:`): `labels`,
  `label_mutation_receipts` tables and `notes.label_id` column present after migration.
- `npm run check`: 0 errors, 1 pre-existing `AppShell.svelte` CSS warning (unrelated).
- `npm run lint`: ESLint clean; `prettier --check .` clean after `prettier --write` on all
  touched files (including the 3 regenerated migration snapshot JSON files).
- `npm run test:unit`: 258 passed (0 failed).
- `npm run test:integration`: 289 passed, 7 platform-only skips (0 failed); one run hit a
  single intermittent `tests/integration/startup.test.ts` Windows worker crash under full
  parallel load (exit code 3221226505), confirmed non-reproducing when run standalone —
  same class of flake previously documented in `docs/PROGRESS.md` ("voice clips" session).
- `npm run build`: succeeds (large-chunk warning is pre-existing, unrelated to this change).
- `playwright test labels`: 3/3 passed (CRUD + axe on the New-label dialog + composer
  pick/post/chip/sidebar-filter round trip).
- `playwright test editor templates tags-page shell zzzaccessibility detail calendar
tag-management status-notes zsearch`: all passed after the editor toolbar-count fix and
  the two regenerated shell screenshot baselines.
- Full `npx playwright test` (139 tests): 135 passed outright; 4 failed on the first full
  sequential run (`detail.test.ts:256`, `editor.test.ts:205` — worker crash,
  `voice-naming.test.ts:161`, `zzrestore.test.ts:24`) and **all 4 passed when re-run
  standalone**, consistent with pre-existing timing/flakiness already noted for these
  specs in earlier sessions (not a regression introduced by labels).

## Not run / explicitly open

- Linux/Alpine image gate (native migration/backup/restore/search tests in that
  environment, per AGENTS.md) — not run this session.
- Manual screen-reader pass and physical-device check of the swatch/icon radio groups and
  the editor label picker (automated axe scans pass; no human assistive-technology pass
  was done).
- `npm run search:benchmark` / large-dataset label-filter performance was not specifically
  measured (the `notes_label` partial index exists and mirrors `notes_pinned`'s proven
  shape, but no dedicated 10k-note label-filter benchmark was run).
- Visual design review of swatch/icon/chip aesthetics beyond functional/contrast/axe checks
  (no human designer pass).

## Next step

User review. If approved as release-complete for this feature, run the Linux/Alpine image
gate (`npm run test:integration` natively there, per AGENTS.md) before calling S18-adjacent
work done; otherwise treat remaining gaps above as the next task list.
