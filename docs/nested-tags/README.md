# Change: Nested tags

**Status:** planned (planning session only). **Not approved.** No code written.
`docs/PRODUCT_SPEC.md` §2 currently lists "nested tags" as **out of scope** and §7 says
"Flat tags only"; ARCHITECTURE §9 says "Slash is not a nested-tag operator". This
change reverses those decisions and therefore needs explicit user approval of the
open questions below before NT01 starts.

**Type:** user-requested post-S18 feature. Does not close S18's open release gates.

## Goal

Notes can use hierarchical hashtags such as `#work/meeting/2026`. A parent tag
(`#work`) acts as a group: filtering by it shows notes tagged with it or with any
subtag. The left sidebar keeps a **count-ordered** tag list (most-used first), now
shown as a collapsible tree in which every level is ordered by count.

## Documents

| File                                       | Purpose                                     |
| ------------------------------------------ | ------------------------------------------- |
| [SPEC.md](SPEC.md)                         | Agreed/proposed behavior and data contracts |
| [PLAN.md](PLAN.md)                         | Ordered steps NT01–NT07 with done gates     |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Verification cases NT-*                     |
| [PROGRESS.md](PROGRESS.md)                 | Status, decisions, handoff for this change  |

Authority for this change once approved: user answers > SPEC.md > main
`PRODUCT_SPEC.md`/`ARCHITECTURE.md` where they conflict. NT01 reconciles the main
documents so they do not contradict each other.

## Open questions (defaults proposed; confirm or change)

1. **Sidebar shape.** Default: collapsible tree; roots and each level of children are
   sorted by subtree count descending, ties by tag name. Alternative: keep a flat
   list of full paths (`#work/meeting`) sorted by count. _Note: the current sidebar
   actually sorts alphabetically by normalized key (`publishedTags` in
   `src/lib/server/notes/timeline.ts`) and shows the first 6. This plan switches it
   to count order either way._
2. **Parent counts.** Default: a node's count is the number of distinct published
   notes tagged with it **or any subtag** (a note with `#work` and `#work/meeting`
   counts once for `work`).
3. **Parent filter.** Default: selecting `#work` includes all subtags. No separate
   "exact only" filter.
4. **Management.** Default: rename/merge always move the whole subtree
   (`work` → `job` turns `#work/meeting` into `#job/meeting`); remove asks for scope:
   "this tag only" or "this tag and all subtags".
5. **Limits.** Default: separator `/`; at most 5 levels; each level 1–64 codepoints;
   whole path ≤ 128 codepoints (source and normalized).
6. **Existing data.** Default: a schema-v3 migration re-derives tags from note bodies
   (bodies untouched), so text like `#a/b` that used to yield tag `a` now yields
   `a/b`. Alternative: fresh-baseline update without migration, as in the no-drafts
   change (refuses current development DBs).
