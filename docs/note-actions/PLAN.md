# Note card actions — implementation plan

One step per session normally. Every step ends with:

```sh
npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build
```

plus the affected Playwright specs (`npm run build` first; on Windows `openssl` must
be on PATH). Record exact commands and real outcomes in [PROGRESS.md](PROGRESS.md).
Read [README.md](README.md) and [SPEC.md](SPEC.md) first.

---

## NA01 — Approval and document reconciliation — done

Files: this folder, `docs/PRODUCT_SPEC.md` (approved-change note), `docs/ARCHITECTURE.md`
(override note), `docs/ACCEPTANCE_TESTS.md` (pointer), `docs/PROGRESS.md`.

Gate: docs only; `npx prettier --check docs/note-actions`.

## NA02 — Baseline schema and server pin commands — done

Files: `src/lib/server/db/schema.ts`, `migrations/0000_baseline.sql`,
`migrations/meta/*_snapshot.json`, `migrations/README.md`, `src/lib/shared/notes.ts`
(command enum), `src/lib/shared/domain.ts` (`pinnedAt`), `src/lib/server/notes/service.ts`
(pin/unpin, trash clears pin, limit 20), `src/lib/server/notes/timeline.ts`
(plain-view `pinned` list + `pinned_at IS NULL` stream), snapshot/DTO builders,
`src/lib/server/backups/trust.ts` if it validates columns, integration tests.

1. Add `pinned_at`, check and partial index to the baseline in place; run
   `drizzle-kit generate` to confirm no drift; schema version unchanged.
2. Commands `pin`/`unpin` through the existing mutation/receipt path (SPEC §4.2).
3. Timeline query: plain-view detection (no tag/query/day/month), pinned list on
   first page only, exclusion from the stream; other views unchanged.
4. Move local `data/` aside (user-approved reset) only when a manual run needs it.

Tests: pin/unpin revision + receipt replay, stale revision conflict, limit 21,
trash clears pin, restore unpinned, plain vs filtered timeline contents, cursor
pages never duplicate/skip pinned notes, backup round trip keeps `pinned_at`.
Gate also: schema/backup integration tests in the Linux image.

## NA03 — ActionMenu component and card header layout — done

Files: new `src/lib/components/ActionMenu.svelte` (+ small icon set), `NoteCard.svelte`,
`TagHeader.svelte`, `src/lib/client/editor/lifecycle.svelte.ts` (immediate run without
dialog; dialog only on error), `LifecycleDialog.svelte`, i18n `en.ts`/`zh-CN.ts`,
global styles if a shared `.icon-button` class is useful.

1. ActionMenu per SPEC §3 (positioning, flip, close rules, ARIA, keyboard).
2. Card: date row with borderless `•••` and, for pinned notes, the unpin icon
   button; tags row under it; remove the Note actions modal and Copy Markdown.
3. Menu items Pin/Unpin and Delete wired to lifecycle (`run(target, action)` that
   persists the retry record and sends immediately; no status text, no Undo).
   Edit item present but may temporarily use the existing composer edit until NA05.
4. TagHeader uses ActionMenu.

Tests: e2e menu open/close (click, Escape, outside, keyboard), Delete without dialog
or status text, pin toggle from the menu, unpin icon click; unit for lifecycle
immediate run/failure path;
axe at 390/1280 light/dark with the menu open.

## NA04 — Pinned section in the timeline — done

Files: `src/routes/(app)/+page.svelte`, `+page.server.ts`, `src/lib/shared/timeline.ts`,
timeline client paging/history code.

1. Render pinned cards above month separators in plain view, without a visible
   heading (later user request); retain the section's accessible name.
2. Keep pinned cards in paging/history snapshots and mutation filtering
   (pin/unpin/trash moves cards between sections after invalidation).

Tests: e2e pin moves a note to the top, unpin returns it to its date position, tag
and search views show it in place with the unpin icon, trash removes it from Pinned.

## NA05 — Inline editing (card and note page) — done

Files: new `src/lib/components/NoteEditor.svelte` (extracted from `Composer.svelte`),
`Composer.svelte`, `NoteCard.svelte`, `NoteDetail.svelte`,
`src/lib/client/editor/workspace.svelte.ts` (expose which note is being edited;
Cancel semantics), `src/routes/(app)/+page.svelte` (scroll anchoring on save).

1. Extract NoteEditor with no behavior change for the top composer; rerun existing
   editor/posting/editor-session e2e before going further.
2. Card inline edit, Cancel, focus-mode round trip, guard against other sessions.
3. Note page inline edit; replace detail buttons with the ActionMenu (+ unpin icon);
   Delete navigates to the timeline; Trash-note page loses Restore/Permanently
   delete (read-only, "In Trash", link back to Trash). Update the Trash e2e flows
   that used the note page buttons to use the Trash page.

Tests: e2e edit in card saves in place (no reorder, same scroll position), edit in
tag/search view, switching from composer text to card edit prompts, card→card
switch prompts, Cancel unchanged/changed, conflict keeps inline editor, note page
edit stays on page, mobile 390 px inline edit + focus mode.

## NA06 — Regression and handoff — in progress

Full `npm run test:e2e`, Linux image check/unit/integration/build, visual review in
light/dark at mobile/desktop, update main PROGRESS and this PROGRESS.
