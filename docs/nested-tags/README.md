# Change: Nested tags

**Status:** **approved by the user.** This reverses the former "nested tags" non-goal,
"Flat tags only" (PRODUCT_SPEC §2/§7) and "Slash is not a nested-tag operator"
(ARCHITECTURE §9). Implementation status: [PROGRESS.md](PROGRESS.md).

**Type:** user-requested post-S18 feature. Does not close S18's open release gates.

## Goal

Notes can use hierarchical hashtags such as `#work/meeting/2026`. A parent tag
(`#work`) acts as a group: filtering by it shows notes tagged with it or with any
subtag. The left sidebar keeps a **count-ordered** tag list (most-used first), now
shown as a collapsible tree in which every level is ordered by count.

## Documents

| File                                       | Purpose                                    |
| ------------------------------------------ | ------------------------------------------ |
| [SPEC.md](SPEC.md)                         | Agreed behavior and data contracts         |
| [PLAN.md](PLAN.md)                         | Ordered steps NT01–NT07 with done gates    |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Verification cases NT-\*                   |
| [PROGRESS.md](PROGRESS.md)                 | Status, decisions, handoff for this change |

Authority for this change: user answers below > SPEC.md > main
`PRODUCT_SPEC.md`/`ARCHITECTURE.md` where they conflict. NT01 reconciled the main
documents so they point here instead of contradicting this change.

## Decisions (user answers)

1. **Sidebar shape:** collapsible tree; roots and each level of children sorted by
   subtree count descending, ties by tag key. The previous sidebar sorted
   alphabetically by key; it now sorts by count.
2. **Parent counts:** distinct published notes tagged with the node **or any
   subtag** (a note with `#work` and `#work/meeting` counts once for `work`).
3. **Parent filter:** selecting `#work` includes all subtags. No "exact only" filter.
4. **Management:** rename/merge always move the whole subtree (`work` → `job` turns
   `#work/meeting` into `#job/meeting`); remove asks for scope: "this tag only" or
   "this tag and all subtags".
5. **Limits:** separator `/`; at most 5 levels; each level 1–64 codepoints; whole
   path ≤ 128 codepoints (source and normalized).
6. **Existing data:** no migration. The fresh-install baseline is updated in place
   (as in the no-drafts change); development databases/archives created before
   this change are incompatible and refused. The user permitted dropping the local
   development database for a fresh restart.
