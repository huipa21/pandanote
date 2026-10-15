# Change: Voice clips in the note editor

**Status:** approved by the user (answers below); planned, **no code written yet**.
Implementation status: [PROGRESS.md](PROGRESS.md).

**Type:** user-requested post-S18 feature. Does not close S18's open release gates.

## Goal

Add a microphone button to the editor toolbar (composer, focus mode, mobile full-screen
editor and in-place edit). It records audio clips in the browser. One note may hold
several clips (recorded one after another). Clips are saved as private attachments and
play back on the card and note page.

## Documents

| File                                       | Purpose                                  |
| ------------------------------------------ | ---------------------------------------- |
| [SPEC.md](SPEC.md)                         | Agreed behavior and technical contracts  |
| [PLAN.md](PLAN.md)                         | Ordered steps VN01–VN07 with done gates  |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Verification cases VN-\*                 |
| [PROGRESS.md](PROGRESS.md)                 | Status, decisions, handoff for this work |

Authority: user answers below > SPEC.md > main `PRODUCT_SPEC.md`/`ARCHITECTURE.md`
where they conflict. The main documents carry an "approved change" pointer.

## Decisions (user answers, session 1)

1. **Mixing:** clips may be combined with text and up to 9 photos. A video stays
   exclusive (a video note cannot also hold photos or clips). Clips do not count toward
   the 9-photo cap.
2. **Limits:** 10 minutes per clip, the existing 50 MB per-file limit still applies,
   and at most 20 clips per note.
3. **Format:** the browser's native recording format is stored unchanged
   (webm/opus on Chrome/Firefox/Edge, mp4/aac on Safari). No transcoding, no ffmpeg.
   A clip recorded in one browser may not play in a much older browser; accepted.
4. **No speech-to-text.** No transcript, no AI. (Consistent with the spec's exclusions.)
5. **Editing clips:** reorder and remove only; no trimming.
6. **Meaning of "record voice":** saving audio clips, not dictation into the text area.
7. **Mobile:** same microphone button in the full-screen mobile editor.
8. **Existing notes:** clips can be added/removed when editing a saved note.
