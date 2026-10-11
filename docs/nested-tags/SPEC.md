# Nested tags — specification (proposed)

Follows the user decisions recorded in [README.md](README.md).

## 1. Syntax and identity

- A nested tag is a hashtag whose body is 1–5 **segments** separated by single `/`:
  `#work`, `#work/meeting`, `#旅行/香港/2026`.
- Segment grammar is unchanged: Unicode letters/numbers/marks, `_`, `-`.
  Regex sketch: `#[\p{L}\p{N}\p{M}_-]+(?:\/[\p{L}\p{N}\p{M}_-]+)*`.
- Boundaries unchanged (start, whitespace, opening punctuation; escapes, code, HTML,
  URLs/autolinks, link destinations, image alt, heading markers excluded).
- A trailing or doubled slash ends the tag: `#a/` → `a` followed by text `/`;
  `#a//b` → `a`. `#/a` is not a tag. Like today's over-long tag, a hashtag with
  more than 5 segments, a segment over 64 codepoints or a path over 128 is a
  validation error for the note (Post/Save is refused with a clear message; the
  editor keeps the text). Nothing is silently truncated.
- Identity: NFKC + lowercase of the **whole path** (existing `tagKey`). `#Work/Meet`
  and `#work/meet` are the same tag. Segments are compared after normalization.
- Limits: segment ≤ 64 codepoints; path ≤ 128 codepoints source **and** normalized;
  ≤ 100 unique tags/note (unchanged). Query filters accept normalized keys up to
  128 codepoints, at most 20 tags (unchanged).
- Each note stores only the tags literally written. Ancestors are **implicit**:
  `#work/meeting` does not create a `work` registry row or join.

## 2. Tree model

- Node path = any explicit tag key or any ancestor prefix of one.
- `ancestors("a/b/c") = ["a", "a/b"]`. `isWithin(k, p)` ⇔ `k === p || k.startsWith(p + "/")`.
- SQL subtree predicate (BINARY collation, uses the unique key index):
  `key = :p OR (key >= :p || '/' AND key < :p || '0')` (`'0'` is the code point after `/`).
  No `LIKE`, so `%`/`_` in keys are inert.
- **Count** of a node = distinct **published** notes whose tag set has at least one
  key within the node. Trash excluded (unchanged). Nodes with count 0 are hidden in
  the sidebar; management still lists Trash-only/unused nodes.
- **Display** of a node: explicit tag row display for that exact key if present;
  otherwise the corresponding prefix of the display of the lowest-key explicit
  descendant (deterministic). The sidebar shows the last segment; the link's
  accessible name is `#full/path (count)` and its title "#full/path, N notes".

## 3. Sidebar (desktop + mobile drawer)

- Tree of root nodes sorted by count **descending**, ties by normalized key (binary).
  Children of every node are sorted the same way. This is the "organized by counts"
  requirement.
- Each row: label link (`#meeting (12)`) that toggles the subtree filter, plus a
  disclosure button (`aria-expanded`, ≥ target size, keyboard) when the node has
  children. Leaves have no button. Indentation shows depth; long labels wrap.
- Collapsed by default; ancestors of active filter tags auto-expand. Expansion state
  is in-memory per page session (no localStorage, no setting).
- Compact list shows the top 6 roots (unchanged number); "Show all tags (N)" opens the
  existing modal, where N is the number of root nodes.
- Modal search matches the full path or any segment; matching nodes are shown with
  their ancestors expanded; non-matching branches hidden.
- `aria-current` on any node whose key is an active filter. Calendar counts remain
  independent of tags (unchanged).

## 4. Filtering, cards, search, autocomplete

- `?tag=work` matches notes having any tag within `work`. Multiple tags = AND of
  subtree predicates (unchanged semantics otherwise). Cursor fingerprints stay
  canonical; selecting both `work` and `work/meeting` is allowed (redundant).
- Card and detail chips show the full path `#work/meeting`; clicking toggles a filter
  on that exact path (subtree semantics). Filter chips show the full path.
- Search unchanged: tag field contains full keys, so `meeting` matches `work/meeting`.
- Autocomplete suggests every non-retired registry path (as before, including
  unused ones) **and** their implicit parents; retirement is subtree-aware (§6).
  Full-path prefix matches rank first, then later-segment matches (`#meet` →
  `work/meeting`); each group is ordered by published count descending, then key.
  Typing `#work/` lists the descendants of `work`.

## 5. Management (`/tags`)

- Inventory shows the tree in path order (indented by depth) with published/Trash
  subtree counts, direct usage for groups, and "group only" for implicit parents.
  Search matches the normalized path (any segment) and includes ancestors of matches;
  the 100-row cap applies to nodes. Implicit nodes can be managed.
- **Rename** `P → Q` (subtree): every span whose key is within `P` becomes
  `Q + suffix`, keeping the original spelling of the suffix. `Q` within `P`'s subtree
  (or equal after normalization, except case-only display change of `P` itself) is
  refused. Any resulting key that already exists is a collision → the operation is a
  **merge** and requires merge confirmation (preview lists collisions). Case-only
  rename rewrites spelling without retiring identity (unchanged).
- **Merge** `P → Q` where `Q` exists: same rewrite; collided keys deduplicate joins;
  target display wins.
- **Remove** with explicit scope: `exact` removes only `#P` tokens (subtags stay);
  `subtree` removes every token within `P`. Never deletes notes (unchanged).
- Every resulting key must satisfy §1 limits; otherwise preview refuses with a clear
  message naming the offending path. No partial rewrite.
- Preview token additionally binds scope and the sorted list of affected source keys
  and resulting keys. Existing transaction, revision +1, FTS, receipt, 10,000-note /
  32 MiB bound and retry contracts are unchanged.

## 6. History and stale tags

- `tag_changes` gains `scope` (`exact` | `subtree`, default `exact` for existing rows).
  Rename/merge record one `subtree` event `P → Q`; remove records its chosen scope.
- `staleTags(key)`: an event matches `key` if `scope = exact` and `oldKey = key`, or
  `scope = subtree` and `key` is within `oldKey`. Start at the latest matching event
  (ignoring case-only self events), map `key` → `targetKey + suffix` (or removal),
  then follow only later events matching the mapped key. Chronological rule still
  terminates cycles; sticky history and `{key, generation}` acknowledgements
  unchanged. Example: after `work → job`, a local `#work/new` warns and offers
  `#job/new`.
- `StaleTag` gains `targetPrefix` (current display of the final mapped prefix) and
  `suffixStart` (number of leading source segments replaced). The editor rewrites a
  stale span to `targetPrefix` + the span's own remaining segment spelling, so
  local casing of the unchanged suffix is kept.
- Suggestions exclude keys that `staleTags` reports as retired.

## 7. Storage and fresh baseline

- User decision 6: **no migration**. `migrations/0000_baseline.sql` and its
  snapshot are edited in place (schema version stays 2, like the no-drafts change):
  `tags` length checks become 1–128 characters (`length()` counts characters for
  TEXT); `tag_changes` gets `scope text NOT NULL DEFAULT 'exact'` with a check
  `scope IN ('exact','subtree')` and "remove may be either scope, rename/merge are
  subtree".
- The baseline hash changes, so databases and archives created before this change
  are refused by the existing hash check (no wipe, no importer). Developers start a
  fresh `DATA_DIR`; the user approved dropping the local development database.
- Backup format stays 2; restores accept only archives from this baseline.

## 8. Implementation notes (as built)

- `shared/markdown/tags.ts`: segment grammar/limits; `shared/tag-tree.ts`: path
  helpers, `buildTagTree`, `filterTagTree`, `tagPathDisplays`; `shared/tags.ts`:
  scoped actions, subtree `staleTags`, function replacer for `rewriteTagKeys`,
  `tagSuggestionList`.
- `publishedTags` reads the registry and published (note, tag) pairs once and
  aggregates distinct subtree counts in memory. A first SQL `json_each` range-join
  version measured ~550 ms (then ~190 ms) for 10k notes/360 tags; the in-memory
  version measured p50 37.6/p95 62.3 ms on Windows and p50 40.3/p95 46.2 ms in
  Alpine. Subtree timeline filters use the BINARY range predicate.
- `TagService` management resolves registry rows within the source path, maps them
  to resulting paths (collisions = merge), rewrites spans with one right-to-left
  pass, inserts resulting registry rows before rewriting, deletes retired source
  rows only when no join remains, and records one scoped history event.
- UI: `TagTree.svelte` (recursive, disclosure buttons, `aria-expanded`),
  `Sidebar.svelte` (top 6 roots, Show all modal, in-memory expansion that reveals
  active filters), `TagAutocomplete.svelte` (slash-aware probe), `/tags` page
  (indentation, remove-scope radios, mapping list in the confirmation).

## 9. Non-goals

Folders; tag colors/icons/pinning; drag-and-drop reordering; manual sort; "exact only"
filters; a tag-tree persistence table; automatic ancestor tagging; data migration
of pre-change databases.
