# Note card actions — progress

## Current state

- **2026-10-11 documentation reconciliation:** later user changes supersede the
  original round hover/Edited/Pinned-heading/collapsed-composer requirements.
  Card date/tag/actions use consistent pills; no Edited/date underline; hashtags
  hidden in card body only. No visible Pinned heading, accessible section retained;
  direct desktop composer hidden while inline editing. SPEC/acceptance/plan now
  agree. Implementation validation is partial; NA06 remains open. Exact reviewed
  pi commands/results and source/index preservation are in main PROGRESS's latest
  handoff; historical Session 3 counts below are not fresh validation.

- **NA02–NA05 implemented in one session; NA06 (full regression) partly done.**
  Every behavior in [SPEC.md](SPEC.md) is implemented except items listed under
  "Remaining" below. Checks: `npm run check` (0 errors), `npm run lint`,
  `npm run test:unit` (152 passed), `npm run test:integration` (225 passed, 7
  skipped, incl. new `tests/integration/pinning.test.ts`), `vite build`, and
  Playwright (see Session 3). Six e2e failures also fail on the untouched HEAD
  (calendar:612, detail "card date" depends on data order, language, shell:41,
  shell:166 screenshots, zzrestore:7); they are not caused by this change.
- **Remaining:** Linux-image run of the schema/backup integration tests (not run;
  Windows only), manual device check of the 390 px virtual keyboard, visual review in
  light/dark, axe scans of the open menu in dark mode and the `zzzaccessibility`
  suite (its "authenticated screens" cases time out at the month picker; confirm it
  against HEAD), resetting the local development `data/` folder (user-approved; the
  baseline changed, so an existing `data/` is refused with the migration-history
  message).

## Session 1 — planning (NA01)

- Reviewed `NoteCard.svelte` (bordered `•••` opening a `Modal` with Copy Markdown /
  Move to Trash; tags below content), `TagHeader.svelte` (same modal pattern),
  `NoteDetail.svelte` (Edit navigates to the timeline composer),
  `lifecycle.svelte.ts`/`LifecycleDialog.svelte` (confirmation then durable retry),
  `schema.ts` (`notes.status` published/trash only, no pin field) and the timeline
  query.
- Proposed archive/share/copy-link options; the user declined them.
- Wrote `docs/note-actions/*`; added approved-change notes to `PRODUCT_SPEC.md`,
  `ARCHITECTURE.md`, `ACCEPTANCE_TESTS.md`, and a current-state entry in
  `docs/PROGRESS.md`.
- Commands: `npx prettier --check docs/note-actions docs/PRODUCT_SPEC.md
docs/ARCHITECTURE.md docs/ACCEPTANCE_TESTS.md` → SPEC.md table formatting warning;
  fixed with `prettier --write`; recheck passes. No code changed; no tests run.

## Session 2 — user refinements (NA01 docs)

- User answers: (3) add an unpin icon on pinned notes; (4) card Delete just moves
  to Trash, no text or Undo; (5) note-page Delete returns to the timeline and the
  note page has no Restore/Permanently delete — permanent delete only from Trash;
  all other proposed defaults accepted.
- Updated README (session 2 decisions), SPEC §1, §3.1, §4.3, §5.3, §6–8, PLAN
  NA03–NA05, ACCEPTANCE_TESTS NA-LAYOUT/NA-PIN/NA-DELETE, and the approved-change
  notes in PRODUCT_SPEC, ARCHITECTURE, ACCEPTANCE_TESTS and main PROGRESS.
- Interpretation recorded: the unpin icon sits in the card's date row next to
  `•••` and also appears on the note page; the menu item still toggles Pin/Unpin.
- Commands: `npx prettier --write docs/note-actions` then `npx prettier --check
docs/note-actions docs/PRODUCT_SPEC.md docs/ARCHITECTURE.md docs/ACCEPTANCE_TESTS.md`
  → all files pass. No code changed; no tests run.

## Session 3 — implementation (NA02–NA05)

- **Schema/server (NA02):** `notes.pinned_at` + `note_pinned_check` + partial index
  `notes_pinned` edited into `0000_baseline.sql` and both snapshots (`drizzle-kit
generate` reports no drift). `pin`/`unpin` commands (shared `noteMutationSchema`,
  `NoteService.mutate`, limit `MAX_PINNED_NOTES = 20` in `shared/notes.ts`); `trash`
  and `restore` clear the pin; updates keep it. `NoteSnapshot.pinnedAt`,
  `noteMetadataSchema` (+ Trash rows are never pinned), backup trust accepts the
  column. `timelinePage` returns `pinned` on the first page of the plain view only
  and excludes pinned notes from that stream; `hydrate()` shared by both lists.
- **UI (NA03–NA05):** `ActionMenu.svelte` (+ `Icon.svelte`, `.icon-button`) used by
  `NoteCard`, `NoteDetail` and `TagHeader`; menu positioned `fixed`, flips upward,
  closes on Escape/outside/scroll/resize/Tab, one open at a time. `LifecycleState.run`
  sends pin/unpin/trash immediately (retry record first); `LifecycleDialog` only opens
  for failures (`selected.silent`). `NoteEditor.svelte` extracted from `Composer`
  (variants `composer`/`inline`, own focus-mode dialog, Cancel with Discard/Keep
  editing); the Unsaved-changes dialog moved to `UnsavedChangesDialog.svelte` in the
  layout so it works where the composer is not mounted. Timeline page renders the
  "Pinned" section and keeps pinned/unpinned cards in place on save/mutation.
- **Decisions:** (1) `workspace.editOrigin` records which card/page hosts the single
  session; it survives "Save local as separate note" so that view keeps showing the
  editor and its errors. (2) `workspace.startNew()`/`releaseEdit()` implement the
  composer guard and drop a clean edit session when its view disappears. (3) A saved
  card that still matches the view stays mounted until its re-rendered replacement
  arrives (keeps focus/position). (4) Note-page Delete goes to `/` via the layout's
  saved-result effect; the note page shows "Saved on server." after an edit.
  (5) `openEditor`/`reveal` were removed from the workspace.
- **Tests:** new `tests/e2e/note-actions.test.ts` and `note-edit.test.ts` (+
  `note-actions-helpers.ts`); updated calendar, timeline, detail, nested-tags,
  tags-page e2e for the menu/inline flows; restores integration test now pins a note
  and round-trips `pinned_at`; domain/editor-session unit fixtures gain `pinnedAt`.
- **Commands and results:** `npx playwright test` full suite after the change:
  6 failed (the HEAD-baseline set above), the rest passed, including all NA-* tests.
  The HEAD baseline was measured with `git stash -u` + rebuild on calendar, detail,
  language, shell and zzrestore specs (same six failures). A bug found by the new
  e2e (menu items were `visibility:hidden` when first focus ran) is fixed.
- **Next:** finish the "Remaining" list above, then close NA06.

## Session 2026-10-11 — Later UI contract reconciliation (docs only)

Reviewed actual staged pinned-heading change and committed NoteCard styles against
pi user requests. Updated README/SPEC/PLAN/ACCEPTANCE_TESTS and this current summary:
no visible heading/Edited, matched pill hover geometry, card-only hidden hashtag
spans and no collapsed top composer. No code/index/data edits or commit. Main
PROGRESS records partial prior-session checks, insecure-TLS browser warning and
ambiguous full integration output; no new NA06/Linux/release pass implied.
Next: fresh sequential build/affected/full-browser and Linux validation, visual
pills/header review, plus compact-editor geometry regression. First command:
`npm run check && npm run lint && npm run test:unit` on supported Node/PATH/TLS1.
