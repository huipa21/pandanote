# Voice clips — acceptance tests

Existing EDITOR, NOTE, attachment, backup and security cases must keep passing.

## VN-REC — Recording (e2e, Chromium fake device)

- The mic button opens the recorder strip; the timer advances; Pause/Resume holds it;
  Stop adds a clip row; Cancel adds nothing. Two recordings give two clips in order.
- Stop pressed less than 0.5 s of recorded time after Start (paused time excluded) adds no
  clip and shows the localized "too short" message; the next normal take still works.
- Post is disabled while recording or paused and enabled after Stop. Entering and
  leaving focus mode keeps recording. The 390 px full-screen editor has the same control.
- Auto-stop at 10:00 (fake clock) keeps the clip and shows a notice.
- Permission denied, no device, insecure or unsupported browser: localized message, no
  clip, mic indicator off, editor still usable.
- The microphone track ends on Stop, Cancel, discard, sign-out and navigation with
  Discard.

## VN-LIMIT — Limits (unit + e2e)

21st clip refused; clips + 9 photos accepted; clip + video refused in both directions;
clips do not count toward the 9 photos; per-note cap and 50 MB file rule still apply;
a clip-only note can be posted; an empty note is still refused.

## VN-POST — Save and retry (integration + e2e)

Post a note with 3 clips + text + a photo: all persist in order and clips are classified
as audio. A forced upload failure then retry creates no duplicates. Editing a saved
note: add, remove and reorder clips; revision conflict detection unchanged. Discard never
deletes server clips. Trash, restore and permanent delete follow the file lifecycle.

## VN-SERVE — Serving (integration)

Inline `audio/*` 200 with `accept-ranges`; `Range: bytes=0-99`, open-ended and suffix
ranges give 206 with correct `content-range`; unsatisfiable gives 416; multi-range gives
200; `HEAD` matches; `?download=1` gives an attachment disposition; non-voice files are
unchanged; unauthenticated and uncommitted-batch access is unchanged; `nosniff` and CSP
headers are present; `Permissions-Policy` includes `microphone=(self)`.

## VN-PLAY — Playback (e2e)

Card and note page show one audio control per clip, in order, `preload="none"`; playing
one pauses another; keyboard operable; axe clean at 390/1280 px, light and dark; a
collapsed long card makes no hidden audio network requests.

## VN-BACKUP — Backup round trip (integration)

Full archive restore keeps clips, MIME classification and playback (also in the Linux
image).

## VN-MANUAL — Not automatable (record honestly)

Real microphone in Chrome, Firefox and Safari/iOS (mp4/aac recording and seeking); the
iOS permission prompt flow; playback of clips recorded in a different browser.
