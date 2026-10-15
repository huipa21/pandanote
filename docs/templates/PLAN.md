# Templates — ordered implementation plan

**Status:** T01–T06 implemented on the host (2026-10-15); see [PROGRESS.md](PROGRESS.md). The steps below were written before the user's decisions (no limit, search bar, select-all/multi-select delete, picker with search) — [SPEC.md](SPEC.md) is authoritative where they differ (for example the list endpoint returns bodies and there is no `GET /api/templates/<id>`).

Each step ends with the common gate: `npm run check`, `npm run lint`,
`npm run test:unit`, `npm run test:integration`, `npm run build`, plus the affected
Playwright specs. Record exact commands and results in `docs/templates/PROGRESS.md`.
Do not claim the migration done until the Linux/Alpine image gate passes.

## T01 — Shared contracts (pure, no server imports)

- `src/lib/shared/templates.ts`: zod schemas for create/update/delete commands,
  name normalization and `name_key`, body normalization (LF, trim), byte limit,
  `attachment:` reference detection, and the canonical request digest input.
- Unit tests: name limits and controls, case-insensitive key (incl. Chinese and
  accented names), blank body refused, attachment reference refused, byte limit,
  digest determinism.
- Done when unit tests pass and the module imports nothing from `server/`.

## T02 — Schema and migration 0002

- Add `noteTemplates` to `src/lib/server/db/schema.ts` with checks and the unique
  `name_key` index.
- Generate with `npm run db:generate -- --name=note_templates` (pinned Drizzle Kit);
  review SQL, snapshots and `meta/_journal.json` together. Update `SCHEMA_VERSION`
  to 3 in `src/lib/server/db/migrations.ts`. Never edit applied SQL.
- Integration tests: fresh DB reaches schema 3; an existing schema-2 DB upgrades
  with the pre-upgrade copy and keeps notes/settings; a schema-2 archive restores on
  staging with zero templates; checks reject blank or over-long rows (read-only
  inspection connection).
- Done when `npm run test:integration` passes and the migration history test
  covers the new step.

## T03 — Server service and HTTP API

- `src/lib/server/templates/service.ts` (`TemplateService`): list, get, create,
  update, delete. All writes via `Persistence.write`, `assertSessionIdentity`,
  `findReceipt`/`insertReceipt`, expected-revision predicates, 100-template cap,
  duplicate-name check. No body logging.
- Routes: `src/routes/api/templates/+server.ts`,
  `src/routes/api/templates/[templateId]/+server.ts`,
  `src/routes/api/templates/[templateId]/delete/+server.ts`, following the notes HTTP
  pattern (`ApiResult`, safe 409 with current summary).
- Integration tests (real SQLite, production handler): create/update/delete round trips;
  duplicate names; stale revision 409; receipt retry after later edits and after
  deletion returns the original result; reused mutation ID with different payload
  fails; expired/foreign session refused; body not present in logs or error text;
  `attachment:` reference refused.
- Done when the integration suite passes with the new tests.

## T04 — Template management UI (`/templates`)

- Route `src/routes/(app)/templates/+page.server.ts` and `+page.svelte`; sidebar link
  in `Sidebar.svelte` (desktop and drawer); page title, empty state, row list with
  `ActionMenu` (Edit, Delete).
- `TemplateEditor` modal: name, body, Preview switch, Save/Cancel with unsaved
  guard. Conflict dialog: show server version, keep local text copyable, explicit
  reload.
- Delete through the existing confirm dialog (O3).
- i18n: add all new keys to `en.ts` and `zh-CN.ts` with identical placeholders.
- Tests: unit for client state helpers; e2e `tests/e2e/templates.test.ts` covering
  create, duplicate name message, edit, conflict from a second tab, delete, keyboard
  path and mobile drawer link; axe check on the page and modal (light/dark, 390 and
  1280 px).

## T05 — Insert template into the editor

- Pure helper `insertTemplateText(source, selectionStart, selectionEnd, body)` in
  `src/lib/client/editor/` returning new text and caret; blank-line separation rules
  from SPEC §3.2. Unit tests: empty source, caret at start/middle/end, existing
  trailing newlines, CJK text, byte-limit refusal.
- `Template` toolbar button and anchored picker in `Composer`/`NoteEditor`
  (`EditorOptions`-style component). Fetch list on open; fetch body on choice; handle
  deleted-template message. Opens a new session first when none is open (through
  `workspace.startNew()` guards).
- Keep focus and caret correct in focus mode and after Preview toggle.
- E2E `tests/e2e/template-insert.test.ts`: insert into empty composer, into existing
  text, into in-place note edit; no network write request before Post/Save (same
  check as posting tests); deleted template shows message; mobile full-screen editor
  Post stays reachable; posted note contains the body and its hashtags are tags.

## T06 — Backup/restore coverage, documentation, release gate

- Confirm `note_templates` is in the format-v2 archive and restore path; add
  integration: backup → delete everything → restore → templates back; restore of a
  schema-2 archive yields zero templates.
- Update `docs/ARCHITECTURE.md` (table list, §13 included data, schema 3) and
  `docs/PRODUCT_SPEC.md` with an "Approved change — templates" pointer, after approval.
  Do not edit main requirements without approval.
- Update `docs/PROGRESS.md` handoff and `docs/templates/PROGRESS.md` with exact
  commands, results and any skipped checks.
- Final gate: full `npm run test:e2e` subset for affected areas plus the full
  Linux/Alpine image run (migration and archive tests run natively there, per AGENTS.md).
  Host-only passes are not release passes.

## Dependencies and order

T01 → T02 → T03 → T04 → T05 → T06. T04 and T05 can start after T03 passes. T05 needs
T03's body endpoint; it does not need the management page to be finished for its tests.
