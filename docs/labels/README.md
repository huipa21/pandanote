# Change: Color or icon labels

**Status:** approved by the user (answers below); planned, **no code written yet**.
Implementation status: [PROGRESS.md](PROGRESS.md).

**Type:** user-requested post-S18 feature. Does not close S18's open release gates.

## Goal

Give each note at most one visual label — a user-named classifier with a color and an
optional icon, picked from a small user-managed list — separate from the existing
free-text hashtag system (PRODUCT_SPEC §7). A label is shown as a small chip (icon/color +
name) on the card and note detail page, and can filter the timeline the same way a tag does.

## Documents

| File                                       | Purpose                                 |
| ------------------------------------------ | --------------------------------------- |
| [SPEC.md](SPEC.md)                         | Agreed behavior and technical contracts |
| [PLAN.md](PLAN.md)                         | Ordered steps L01–L07 with done gates   |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Verification cases LBL-\*               |
| [PROGRESS.md](PROGRESS.md)                 | Status, decisions, handoff              |

Authority: user answers below > SPEC.md > main `PRODUCT_SPEC.md`/`ARCHITECTURE.md` where
they conflict. The main documents carry an "approved change" pointer.

## Decisions (user answers, session 1)

1. **Cardinality:** one label per note (question 1a). A note's `label_id` is a single
   nullable foreign key; assigning a new label replaces the old one.
2. **Label shape:** user-named labels with a chosen color and an optional icon (question
   2c/3b) — a small `labels` management list (create, rename, recolor, re-icon, delete),
   not a fixed built-in set.
3. **Everything else defaults to the suggested default from the proposal:**
   - Fixed accessible color palette (no free color picker); fixed icon set (no upload).
   - Picked from an editor toolbar button; shown as a small chip (icon/color + name text,
     never color alone) on the card and note detail page.
   - Filterable from the sidebar the same way Tags are (a "Labels" list with counts,
     single-select filter); **not** part of free-text search (`shared/search.ts`).
   - Carried through pin, Trash and restore unchanged; deleting a label clears it from any
     note that had it (no cascade delete of notes).
   - Not reflected on the month calendar in v1.
   - Reasonable small cap: **40 labels total**, name 1–40 code points, unique
     case-insensitively.
   - Additive trusted migration, following the templates precedent, **except**:
4. **"Treat as new setup":** the `nested-tags` precedent applies — this is still
   pre-release, single-developer, no real user data to protect. The `labels` table and
   `notes.label_id` column go **directly into the baseline** (`migrations/0000_baseline.sql`
   edited in place, `schema.ts` updated in place), not a new `000N_labels.sql` migration.
   `SCHEMA_VERSION` and the migration ledger stay as they are (3 entries); no upgrade path,
   no compatibility code. Existing local `data/` folders created before this change are
   refused by the migration hash/journal check and must be deleted or moved aside to get a
   fresh baseline. This is recorded here and in PLAN.md/PROGRESS.md so it is not mistaken
   for a skipped migration step.

## Not in this change

- No multi-label notes, no nested/grouped labels, no free color picker or custom icon
  upload, no calendar integration, no free-text search participation, no bulk re-label
  tooling beyond deleting a label (which clears it everywhere).
