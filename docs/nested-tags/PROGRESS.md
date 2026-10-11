# Nested tags — progress

## Current state

- **Steps NT01–NT06 done; NT07 regression done locally with pre-existing,
  unrelated e2e failures (below).** User approved the change and answered all six
  questions (see [README](README.md)). Not committed by the agent; no deployment or
  release claim.
- **Behavior:** `#a/b/c` nested hashtags (≤5 levels, 64/level, 128/path); parents
  implicit and include subtags in counts and filters; sidebar is a collapsible tree
  ordered by count at every level (top 6 roots + Show all with search); card/filter
  chips show full paths; autocomplete is slash-aware; management renames/merges whole
  subtrees, merges collisions, removes with explicit scope; tag history is scoped,
  so stale local subtags map to their new prefix.
- **Data:** fresh baseline edited in place (no migration, schema version 2):
  `tags` checks 1–128, `tag_changes.scope`. The local development `data/` folder
  was deleted with user permission; the next start performs fresh setup. Earlier
  development DBs/archives are refused by the existing hash check.
- **Next task:** user review and commit. Optional follow-ups: decide whether to
  refresh the three pre-existing failing screenshot/language baselines and fix the
  calendar "Choose year" accessibility walk (both caused by commits before this
  change, not by nested tags). Re-run `npm run test:e2e` afterwards.

## Session 2 — implementation (NT01–NT07)

Touched files:

- Docs: `docs/nested-tags/*`, `docs/PRODUCT_SPEC.md` (approved-change note, §2,
  §7), `docs/ARCHITECTURE.md` (override note, §9), `docs/ACCEPTANCE_TESTS.md`
  (TAG-01), `docs/PROGRESS.md`.
- Schema: `src/lib/server/db/schema.ts`, `migrations/0000_baseline.sql`,
  `migrations/meta/0000_snapshot.json`, `0001_snapshot.json` (only `tags` and
  `tag_changes` entries changed; `drizzle-kit generate` reports no drift).
- Shared: `src/lib/shared/markdown/tags.ts`, new `src/lib/shared/tag-tree.ts`,
  `src/lib/shared/tags.ts`, `src/lib/shared/timeline.ts`, i18n `en.ts`/`zh-CN.ts`.
- Server: `src/lib/server/notes/timeline.ts` (subtree predicate, in-memory tree),
  `src/lib/server/notes/content.ts` (128 bound/messages),
  `src/lib/server/tags/service.ts` (tree inventory, scoped subtree operations,
  stale mapping), `src/routes/(app)/+layout.server.ts` (tree + suggestions).
- UI: new `src/lib/components/TagTree.svelte`, `Sidebar.svelte`, `AppShell.svelte`,
  `TagAutocomplete.svelte`, `src/lib/client/editor/workspace.svelte.ts` (stale-tag
  suffix-preserving rewrite), `src/routes/(app)/tags/+page.svelte`.
- Tests: new `tests/unit/nested-tags.test.ts`, `tests/integration/nested-tags.test.ts`,
  `tests/e2e/nested-tags.test.ts`; updated `tests/unit/{tags,tag-management,timeline,notes}.test.ts`,
  `tests/integration/{tag-management,backups}.test.ts`,
  `tests/e2e/tag-management.test.ts`, `tests/browser/ShellFixture.svelte`.

Commands and real results (Windows host unless stated):

| Command                                                                                                              | Result                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                                      | PASS, 0 errors / 0 warnings (after fixing one unused-selector warning and missing `scope` in old tests)                                                               |
| `npm run lint`                                                                                                       | PASS (ESLint + Prettier)                                                                                                                                              |
| `npm run test:unit`                                                                                                  | PASS 147 tests / 29 files (first run: 2 failures from old 64-character expectations, updated to the 128 bound)                                                        |
| `npm run test:integration`                                                                                           | PASS 220 + 7 existing Linux-only skips / 37 files                                                                                                                     |
| `npx vitest … tests/integration/nested-tags.test.ts` (NT-PERF)                                                       | First SQL `json_each` tree: p50 550 ms; CROSS JOIN variant 190 ms; final in-memory aggregation p50 37.6 / p95 62.3 ms; subtree filter page p50 46.9 / p95 71.8 ms     |
| `npm run build`                                                                                                      | PASS                                                                                                                                                                  |
| `npx playwright test tests/e2e/nested-tags.test.ts`                                                                  | First runs failed (test assumed a Show all button; sr-only path split the accessible name). Fixed the test and switched to an `aria-label`; final PASS incl. axe scan |
| `npm run test:e2e` (full)                                                                                            | 64 PASS / 5 FAIL (11.7 min): language zh-CN "全部笔记" link, two screenshot comparisons, two axe walks timing out at the calendar "Choose year" button                |
| Same 3 language/shell tests and the light axe walk on a clean `HEAD` worktree                                        | Same failures (identical 390×844 pixel diff; settings diff 55 275 vs 55 226 px) → pre-existing, caused by earlier calendar/editor commits                             |
| `podman machine start`; `podman build -f ops/Dockerfile.alpine-validation`; `podman run --rm --cpus=2 --memory=4g …` | PASS in Alpine: check, lint, 147 unit, **227 integration (zero skips)**, build; NT-PERF tree p50 40.3 / p95 46.2 ms. Image removed, machine stopped afterwards        |

Known limitations / decisions:

- The `/tags` management page remains English-only (as before).
- Old browser-local pending tag retries without `scope` are reported as unreadable
  (fresh restart; no compatibility code).
- Screenshot baselines were **not** regenerated: the failures predate this change
  and need visual review by the user.
- Physical-device/screen-reader review of the tree is not done.

## History

- Session 1 (planning): created README/SPEC/PLAN/ACCEPTANCE_TESTS/PROGRESS in
  `docs/nested-tags/`. Read-only inspection only; no tests run (docs only).
