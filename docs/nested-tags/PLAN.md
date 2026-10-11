# Nested tags — implementation plan

One step per session normally. Every step ends with:

```sh
npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build
```

plus the affected Playwright specs. Record exact commands and real outcomes in
[PROGRESS.md](PROGRESS.md). Read [README.md](README.md) and [SPEC.md](SPEC.md) first.
Do not start NT01 until the README open questions are answered.

---

## NT01 — Approval and document reconciliation

Files: `docs/PRODUCT_SPEC.md` (§2 scope, §3.3 sidebar, §7 tags),
`docs/ARCHITECTURE.md` (§9, §9.1, §10.3 tag query bounds, §11.2 grammar),
`docs/ACCEPTANCE_TESTS.md` (TAG-01..03), this folder.

1. Record the user's answers in README/PROGRESS; adjust SPEC.
2. Replace "flat only"/"slash is not a nested-tag operator" with pointers to this
   change; keep history (approved-change note at top, like the no-drafts change).

Gate: docs only; `npm run lint` (Prettier on Markdown).

## NT02 — Shared grammar and path utilities

Files: `src/lib/shared/markdown/tags.ts`, `src/lib/shared/tags.ts`, new
`src/lib/shared/tag-tree.ts`, `tests/unit/*tags*`.

1. Parser regex with segments; trailing/double slash and depth handling (SPEC §1);
   `validateTag` with segment/path limits; `MAX_TAG_PATH_LENGTH`, `MAX_TAG_DEPTH`.
2. `tagKeySchema`/`tagSpellingSchema` bounds 128; reject leading/trailing/double `/`.
3. Pure helpers: `segments`, `ancestors`, `isWithin`, `replacePrefix` (keeps suffix
   spelling), `subtreeRange(key)`.
4. `buildTagTree(rows)`: input explicit `{key, display, noteIds|counts}`; output nodes
   with subtree distinct counts, displays, children sorted count desc / key binary.
5. `rewriteTagKeys` accepts a key→replacement function so subtree rewrites are one
   right-to-left pass.

Tests: all TAG-01 fixtures still pass; NT-PARSE cases; tree ordering/tie/dedup cases.

## NT03 — Schema v3 migration and re-derivation

Files: `src/lib/server/db/schema.ts`, `migrations/0002_*.sql` + snapshot/journal,
`src/lib/server/db/migrations.ts` (`SCHEMA_VERSION = 3`),
`src/lib/server/db/data-migrations.ts`, `migrations/README.md`,
`tests/integration/migrations.test.ts`, archive restore tests.

1. Generate/review migration: tag length checks 128, `tag_changes.scope`.
2. Data step `rederive-nested-tags-v1` (SPEC §7) reusing the note content/tag
   extraction and `refreshNoteSearch`; revision +1 only when key set changes.
3. Tests: v2 DB with `#a/b`, `#a`, code-span `#x/y`, Trash note → v3 joins/search/
   revisions correct; unchanged notes untouched; failure rolls back whole migration;
   pre-upgrade copy written; schema-2 archive restores into v3 instance.

Gate also: run the migration integration tests in the Linux image (native SQLite).

## NT04 — Server queries: filter, counts, suggestions

Files: `src/lib/server/notes/timeline.ts` (`publishedTags`, tag predicate),
`src/lib/shared/timeline.ts` (key bound 128), `src/routes/(app)/+layout.server.ts`
(`availableTags` tree, `tagSuggestions`), `src/lib/server/search/*` (verify only),
integration tests.

1. Subtree `exists` predicate via `subtreeRange`; AND across tags; cursor/fingerprint
   unchanged.
2. `publishedTags` returns tree data: one read of published `(note_id, key)` joins,
   aggregated with `buildTagTree`; measure with the 10k-note/hundreds-of-tags fixture
   (target p95 < 100 ms server-side). Switch to per-node SQL ranges only if needed.
3. Suggestions include implicit parents, exclude subtree-retired keys.

Tests: NT-FILTER, NT-COUNT; existing timeline/search/calendar suites unchanged.

## NT05 — Sidebar, chips and autocomplete UI

Files: `src/lib/components/Sidebar.svelte` (+ new `TagTree.svelte`),
`AppShell.svelte`, `NoteCard.svelte`, `NoteDetail.svelte`,
`TagAutocomplete.svelte`, `src/lib/shared/i18n/{en,zh-CN}.ts`, e2e tests.

1. Count-ordered tree with disclosure buttons, auto-expand of active filters,
   top-6 roots + Show all modal with path/segment search (SPEC §3).
2. Full-path chips; autocomplete behavior after `/`.
3. Keyboard, screen-reader names (full path + count), touch targets, 200% zoom,
   short-height sidebar scrolling, mobile drawer; light/dark.

Tests: NT-SIDEBAR, NT-UI e2e; affected existing tag/accessibility specs.

## NT06 — Management and stale-tag history

Files: `src/lib/server/tags/service.ts`, `src/lib/shared/tags.ts`,
`src/routes/api/tags/**`, `src/routes/(app)/tags/+page.*`,
`src/lib/components/StaleTagDialog.svelte`, client tag command persistence, tests.

1. Inventory as tree incl. implicit nodes; subtree rename/merge with collision →
   merge confirmation; remove with scope; limit checks on resulting keys.
2. Preview token binds scope + affected/resulting keys; receipts include scope.
3. `staleTags` subtree matching and suffix mapping; check API and dialog show mapped
   targets (`#work/new` → `#job/new`).
4. UI: scope radio for remove; preview lists collisions and resulting paths.

Tests: NT-MANAGE, NT-STALE; all existing TAG-03 integration/e2e cases.

## NT07 — Regression and close

1. Full `npm run test:e2e`, full integration, performance fixture with nested tags.
2. Linux image: check/lint/build/unit/integration (migration + archive restore).
3. Update main PROGRESS current state and this PROGRESS; no release claim.
