# Templates — progress and handoff

Spec: [SPEC.md](SPEC.md). Plan: [PLAN.md](PLAN.md).

## Current state (session 1, 2026-10-15)

**Implemented and host-verified; Linux/Alpine image gate NOT run, so not release-complete.**

| Step | State                                                                                    |
| ---- | ---------------------------------------------------------------------------------------- |
| T01  | done: `src/lib/shared/templates.ts` + `tests/unit/templates.test.ts`                     |
| T02  | done: migration `0002_note_templates` (schema 3), tests updated                          |
| T03  | done: `TemplateService`, `/api/templates*` routes, `tests/integration/templates.test.ts` |
| T04  | done: `/templates` page, `TemplateEditor`, sidebar link, en + zh-CN strings              |
| T05  | done: `TemplatePicker`, toolbar button, insertion in `NoteEditor`                        |
| T06  | host done: restore/backup coverage, docs; Alpine image + real-device checks open         |

## Behavior delivered

See SPEC.md §2–§5. In short: `/templates` page like `/tags` (search over name and body,
select-all, multi-select delete with confirmation, New template button, click a row to edit),
unlimited templates, a toolbar icon in the editor that opens a searchable picker and inserts
at the caret.

## Touched files

- Server/shared: `src/lib/shared/templates.ts`, `src/lib/server/templates/service.ts`,
  `src/lib/server/db/schema.ts`, `src/lib/server/db/migrations.ts` (`SCHEMA_VERSION` 3),
  `src/lib/server/runtime.ts`, `src/lib/server/backups/trust.ts`,
  `migrations/0002_note_templates.sql`, `migrations/meta/*`, `src/routes/api/templates/**`.
- Client: `src/routes/(app)/templates/*`, `src/lib/client/templates/api.ts`,
  `src/lib/components/{TemplateEditor,TemplatePicker,EditorOptions,NoteEditor,Sidebar}.svelte`,
  `src/lib/shared/i18n/{en,zh-CN}.ts`.
- Tests: `tests/unit/templates.test.ts`, `tests/integration/templates.test.ts`,
  `tests/e2e/templates.test.ts`; updated `backups`, `migrations`, `release-hygiene`,
  `restores` (new template round-trip + schema-2 restore tests), `search-migration`
  integration tests, `tests/e2e/editor.test.ts` (toolbar now has 5 buttons) and the shell
  screenshot baselines `shell-light-1440x900` and `settings-dark-compact` (new sidebar link).

## Checks actually run (host, Windows)

- `npm run check`: 0 errors, 1 existing AppShell CSS warning.
- `npm run lint`: pass.
- `npm run test:unit`: 36 files / 254 tests pass.
- `npm run test:integration`: 44 files, 282 passed + 7 existing platform skips.
- `npm run build`: pass.
- Baseline before the change: integration 270 passed + 7 skipped.
- Full `npx playwright test` at a clean checkout of HEAD (git worktree): 132 passed, 1 failed
  (`detail.test.ts:256`, already failing).
- Full `npx playwright test` with this change applied in that same worktree: **134 passed,
  2 failed**: `detail.test.ts:256` (already failing at HEAD) and `shell.test.ts:54`, which was
  the stale-looking screenshot that my sidebar link legitimately changes; that baseline is
  updated and `shell.test.ts` then passes 8/8 in the main tree.
- `tests/e2e/templates.test.ts`: 3 pass, including an axe WCAG scan of the page.

## Issues found and how they were resolved

- Oversized template body threw a plain `Error` (parser limit) → size check moved before parse.
- Reusing `mutation_receipts` was not possible (note-shaped result schema) → added
  `template_mutation_receipts` and regenerated the not-yet-applied migration.
- Restore `inspect` bounded every cell to 16 KiB; template bodies got the same 1 MiB exemption
  as notes.
- Old tests pinned schema 2 / the v1 staging fixture / the reviewed route list; updated
  deliberately (the "newer schema" test now uses 4; the v1 fixture also drops later tables).
- **Windows-only restore flake, not caused by this change.** `zzrestore.test.ts` failed in 3
  of 3 full runs and several subsets in the checkout at `C:\other\pandanote` with
  `EPERM: rename ...\extracted\files -> ...\state\files` (found by temporary instrumentation,
  now removed). The same code, applied to a clean worktree in `%TEMP%`, passed that spec in
  the subset and in the full suite. Likely a handle on freshly written files at the repo path
  (file watcher/antivirus). Not diagnosed further. It passes alone in the repo path.
  `posting.test.ts:68` also failed once in one full run in the repo path and passed elsewhere.

## Known limitations / not done

- Linux/Alpine image run of the new migration, archive and restore tests (AGENTS.md requires
  it before release). Podman was not used.
- No component-level tests for `TemplateEditor`/`TemplatePicker` beyond the e2e flows; the
  restore trust check for template rows has no tampered-row test.
- Chinese layout of the new screens has not been visually reviewed; no real-device check.
- A template deleted in another tab after the picker opened can still be inserted once.
- `PRODUCT_SPEC.md`/`ARCHITECTURE.md` carry only a short pointer; their table list still says
  18 tables.

## Next session

- Read: this file, SPEC §5, `tests/release/README.md`.
- Do: run the Alpine image integration and the existing deployment drill with the schema-3
  migration; add a tampered-template restore test.
- Verify: `npm run test:integration` in the Linux image; `npx playwright test tests/e2e/templates.test.ts`.
