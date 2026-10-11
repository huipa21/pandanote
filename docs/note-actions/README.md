# Change: Note card actions (Pin, inline Edit, Delete)

**Status:** **approved by the user** (answers below). NA02–NA05 implemented. Implementation status: [PROGRESS.md](PROGRESS.md).

**Type:** user-requested post-S18 UI/feature change. Does not close S18's open
release gates.

## Goal

Make the timeline note card tidier and its actions direct:

- Tags move to their own row directly under the date row.
- The top-right `•••` has no hard border; it opens a small anchored dropdown menu
  (not a modal dialog) with **Pin**, **Edit**, **Delete**.
- **Pin** keeps a note at the top of the plain "All notes" timeline; a pinned note
  shows a one-click unpin icon.
- **Edit** edits in place: in the card on the timeline, or in the note page.
- **Delete** moves the note to Trash immediately, without a confirmation dialog,
  status text or Undo. Restore and permanent delete live only on the Trash page.
- The same menu look is used everywhere a `•••` appears (card, note page, tag view).

## Documents

| File                                       | Purpose                                    |
| ------------------------------------------ | ------------------------------------------ |
| [SPEC.md](SPEC.md)                         | Agreed behavior and data contracts         |
| [PLAN.md](PLAN.md)                         | Ordered steps NA01–NA06 with done gates    |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Verification cases NA-\*                   |
| [PROGRESS.md](PROGRESS.md)                 | Status, decisions, handoff for this change |

Authority for this change: user answers below > SPEC.md > main
`PRODUCT_SPEC.md`/`ARCHITECTURE.md` where they conflict. The main documents carry an
"approved change" note pointing here.

## Decisions (user answers, session 1)

1. **Edit location:** Edit is available on the timeline card and on the note page.
   Each edit stays in the view where it started: the card turns into the editor in
   place, and the note page edits inside the note page.
2. **Pin:** pinned notes appear at the top **only in the plain "All notes" timeline**.
   Deleting (moving to Trash) a note unpins it.
3. **Archive:** dropped — not implemented (adds complexity without much gain).
4. **Delete:** moves to Trash directly, with no confirmation. Trash restore is the
   recovery path. (Permanent delete from Trash keeps its confirmation.)
5. **Share as image/text:** dropped (screen capture is enough).
6. **Copy Link:** dropped (the site is private).
7. **Copy Markdown:** removed from the card. Use Edit and copy text without saving.
8. **Menu order:** Pin, Edit, Delete.
9. **Data:** edit the fresh-install baseline in place (as nested tags did), no
   migration; the user approves resetting the local development `data/` again.

## Later UI refinements (2026-10-11 session history)

Cards omit Edited and date underlines; dates/tags/header actions use consistent
soft pill hover shapes. Card bodies hide hashtag tokens, not stored source.
The plain pinned section has no visible heading but keeps its accessible name.
Desktop new-note editor is shown directly and hidden during inline edits, not
replaced by a collapsed button. See the updated SPEC and main PROGRESS for
partial validation evidence; these changes do not close NA06/S18.

## Session 2 decisions (user answers to the proposed defaults)

10. **Unpin icon:** a pinned note shows an **unpin icon button** in its date row;
    one click unpins it. The menu item also reads **Unpin** (pin-off icon).
11. **Card Delete:** the card simply disappears into Trash. No status text, no Undo.
12. **Note page Delete:** moves to Trash and returns to the timeline (same target as
    the page's "All notes" link). The note page offers **no** Restore or Permanently
    delete buttons; restore and permanent deletion happen only on the Trash page.
13. Accepted as proposed: pin limit 20; newest pin first (the originally approved
    "Pinned" heading was removed by the later user request);
    pinned notes keep their date position (with the unpin icon) in tag/search/day/
    month views; inline editing at every width with the focus button for full screen;
    the tag view's `•••` uses the same dropdown component.
