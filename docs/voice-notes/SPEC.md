# Voice clips — specification

## 1. Behavior

### 1.1 Toolbar and recorder

- `EditorOptions.svelte` gets a microphone icon button after Photos/video. Same
  disabled rules as the other buttons (not ready, busy, conflict, frozen, posting).
- Pressing it requests the microphone (`getUserMedia({ audio: true })`) and opens a
  **recorder strip** inside the editor container, above the toolbar: a record state dot,
  elapsed `m:ss` timer, a level meter, **Pause/Resume**, **Stop (add clip)** and
  **Cancel (discard this take)**. No modal dialog.
- Stop adds one clip to the session. The strip closes; pressing the microphone again
  records another clip. Cancel discards only the current take and asks nothing.
- **Minimum take (VN04 follow-up, default):** a user Stop with less than 0.5 s of recorded
  time (paused time excluded) adds nothing and shows "The recording was too short, so no
  clip was added." Reason: Chromium returns an empty blob for a take stopped within ~60 ms
  and a header-only blob with no audio frames (~175 bytes) at ~90 ms; without the rule
  the latter would be uploaded as a useless clip. Automatic ends (10:00, size, failure)
  are unaffected. Constant: `MIN_VOICE_MS` in `uploads/file-kind.ts`.
- Recording stops automatically at 10:00 and keeps what was recorded (the clip is added,
  with a short notice). Recording never starts automatically.
- Only one recorder is active per tab. The focus-mode dialog and the compact editor share
  the same session; opening/closing focus mode must not stop an active recording
  (recorder state lives in the workspace, not in a component).
- While recording or paused: Post/Save changes is disabled with an explanatory label
  ("Stop recording first"); text editing remains possible.
- The microphone track is released (indicator off) on Stop, Cancel, error, session
  discard/replace, route change confirmed with Discard, sign-out and page unload.
- An active take counts as unsaved work: the existing Post/Save changes–Discard–Cancel
  guard and the browser Leave/Stay warning apply while recording or when clips exist.
  Discard stops and drops the take.

### 1.2 Clips as attachments

- A stopped clip becomes a local, in-memory attachment: `kind: 'audio'` in
  `EditorAttachment` (client-only), filename `voice-YYYYMMDD-HHMMSS.<ext>` using the
  configured app timezone, MIME from the recorder (`audio/webm`, `audio/mp4`,
  `audio/ogg`). Duration (seconds) is kept client-side for the editor row only.
- Nothing uploads until Post/Save changes, through the existing receipt-first,
  retry-safe protocol. A failed/retried post must not duplicate clips.
- The editor shows clips as **rows below the photo grid** (play button, name/duration,
  remove X), in attachment order. Rows are draggable and Alt+Arrow-reorderable with the
  same rules as thumbnails. Preview plays from the in-memory blob via an object URL
  that is revoked when the clip is removed or the session ends.
- Limits enforced in the editor: at most 20 clips per note; a video excludes clips (and
  photos); clips do not count toward the 9 photos; the per-note attachment cap
  (`maxAttachmentsPerNote`, 100) and the 50 MB file limit still apply. Violations show
  a clear error and add nothing.
- Photos stay in the 3-column grid and clips in their own list, but the stored
  `attachmentIds` order is the single source of truth for both.
- Pasting/dropping/picking audio files is **not** added (recording only).

### 1.3 Display

- Timeline cards and the note page show clips as compact native
  `<audio controls preload="none">` elements in a list below the photo grid, with the
  filename (a download link remains as a secondary action). Only one clip plays at a
  time (starting one pauses the others).
- Clips are not rendered inside Markdown. Search covers the filename as for any
  attachment. A clip-only note is valid content.
- Collapsed long cards must not mount audio elements for hidden content unnecessarily.

### 1.4 Errors (localized en + zh-CN, shown in `EditorFeedback`)

Permission denied; no microphone found; microphone in use; take too short (§1.1);
insecure context (not HTTPS/localhost); `MediaRecorder`/`getUserMedia` unsupported; recording failed mid-way
(keep what was captured if possible); clip would exceed limits. Browsers without any
supported recording MIME type disable the button with a reason.

### 1.5 Naming, compact clips and level feedback (user request, post-VN07)

- **Naming step.** After a user Stop the clip is added with the generated name
  (`voice-YYYYMMDD-HHMMSS`) and its row opens a name field: base name selected and focused,
  fixed extension shown beside it, a Save-name button. Enter or Save applies, Escape keeps
  the current name, leaving the field (blur, e.g. pressing Post) applies what was typed. An
  empty or unusable name keeps the current one. Typed names are cleaned: control/format
  characters removed, `/  : * ? " < > |` become `-`, leading dots dropped, a typed copy of
  the extension is not doubled, at most 255 characters. Focus then returns to the microphone
  button. Automatic ends (10:00/size/failure) add the clip without opening the field.
- **Rename later, saved clips too.** A pencil on every clip reopens the field: in the editor
  (unsaved and saved clips) and on cards/note page (saved clips). Unsaved clips are renamed in
  the draft. A saved clip is renamed at once on the server (it is not part of the draft, so a clean
  edit session stays clean); Enter/Save applies, Escape or leaving the field cancels, a failure keeps
  the field open with the message. Names are cleaned the same way and also validated server-side.
- **Server contract.** `PATCH /api/attachments/<id>` with `{ "filename": "..." }` (JSON, same-origin,
  signed in, body <= 4 KiB) renames a **ready voice clip that a note references**; anything else is
  404/400. It changes `attachments.original_filename` only: bytes, digest, MIME and the note
  revision are untouched, and the note's filename search is refreshed in the same transaction
  (`AttachmentService.rename`). The name must be 1-255 characters without control/format characters,
  `/  : * ? " < > |`, surrounding spaces or a leading dot. The schema guard
  `attachments_referenced_guard` now fires on every column of a linked attachment **except**
  `original_filename` (edited in the `0001` baseline: the user treats this as a new instance with an empty data
  folder, per the pre-release fresh-baseline policy; an existing data folder from an earlier build
  needs removing because the migration hash changed). A page keeps showing a renamed clip's new
  name through `savedClipNames` until reload, and a note opened for editing picks it up.
- **Compact chip.** Clips are small pill chips (play/pause icon, name, duration, rename,
  remove) in a wrapping row, in the editor and on cards/note page (icon, name, download). The
  display chip drives a control-less `<audio preload="none">`; one plays at a time.
- **Volume feedback.** The meter is dB scaled (-65 dB..-10 dB), taller, and its
  `AudioContext` is resumed. If a running meter hears nothing for 3 s of recording, the strip
  shows "No sound detected. Check that your microphone is not muted." (`QUIET_AFTER_MS`,
  `SOUND_LEVEL` = 0.25). A take whose loudest reading stayed below `SOUND_LEVEL` gets a warning
  icon on its row. Without a meter nothing is claimed either way.

## 2. Technical contracts

### 2.1 Capture (client)

- New module `src/lib/client/recording/recorder.ts` (testable behind a small interface)
  and recorder state owned by `workspace.svelte.ts` (or a sibling store it owns).
- MIME selection via `MediaRecorder.isTypeSupported`, in order: `audio/webm;codecs=opus`,
  `audio/mp4`, `audio/ogg;codecs=opus`. Strip codec parameters for the stored MIME.
  `timeslice` about 1000 ms so data survives an abnormal stop; chunks are held in
  memory only (never localStorage/IndexedDB).
- Enforce 10:00 by timer, and a safety byte cap equal to the file limit.
- The level meter uses `AudioContext` + `AnalyserNode`, closed on stop. Respect
  reduced motion (no animated pulsing).
- Chrome's MediaRecorder webm has no duration header: never trust `audio.duration`
  (it may be `Infinity`); use the recorder's own timer for the editor display.

### 2.2 Upload and storage (server)

- Clips use the existing file path (`attachments.kind = 'file'`, `attachment.bin`);
  **no schema change** and no baseline edit.
- `fileMime(head)` (`attachments/images.ts`) gains audio container detection by magic
  bytes: EBML `1A 45 DF A3` → `audio/webm`; `ftyp` with an audio-capable brand
  (`M4A `, `isom`, `mp42`, `iso*`) → `audio/mp4`; `OggS` → `audio/ogg`. Because
  webm/mp4 can also hold video, a file is stored as `audio/*` **only** when the upload
  item carries a new optional `voice: true` flag (added to `uploadItemSchema` and
  covered by the request digest). **Persistence (VN02):** with no schema change the flag
  lives in the existing `detectedMime` column: a flagged item is inserted with the
  provisional `audio/x-voice-pending` and gets the real container MIME when ready; the
  frozen-manifest comparison on retry checks flag equality. The EBML check also requires
  the `webm` DocType (generic Matroska is rejected). Otherwise it keeps today's `application/octet-stream`
  behavior. A `voice` item whose bytes match no container is rejected (new `err.*` key)
  rather than stored unclassified. The server never trusts the client MIME.
- Size/limits unchanged server-side (50 MB file limit, per-note count).

### 2.3 Serving

- `GET /api/attachments/:id/file` (authorization unchanged):
  - Rows whose `detectedMime` is in `{audio/webm, audio/mp4, audio/ogg}` and **without**
    `?download=1` are served inline with that exact `content-type` and
    `accept-ranges: bytes`. A single-range `Range` request gets 206 with
    `content-range`; unsatisfiable gets 416; multi-range is ignored (full 200). `HEAD`
    is consistent.
  - `?download=1` and every non-audio file keep today's `application/octet-stream` +
    `content-disposition: attachment`.
  - Keep `x-content-type-options: nosniff` and the sandboxed CSP. Verify `<audio>` still
    loads; `cache-control: private, no-store` may need relaxing for audio only (see
    risks).
- The page CSP (`hooks.server.ts`) gains `media-src 'self' blob:` where pages are
  served (not on attachment responses). `Permissions-Policy` becomes
  `geolocation=(), microphone=(self)`.
- Backups/restore: unchanged (ordinary attachments; `detectedMime` already stored).
  Trash and permanent-delete lifecycle unchanged.

### 2.4 Security and privacy

- No microphone data leaves the browser before Post/Save. Never log audio or
  durations beyond existing logs.
- Recording requires a secure context; the domain stays environment-configurable and
  HTTP remains development-only (`localhost` works).

## 3. Risks and open technical points

- **Safari/iOS:** `audio/mp4` recording and Range/seek behavior cannot be tested in
  this environment; record as untested and verify manually.
- **`cache-control: no-store` with media:** some browsers re-fetch or refuse to seek.
  Spike done in VN02 (Chromium 1243): play, forward/back seek and Range requests work with
  both `private, no-store` and `private, max-age=0, must-revalidate`, so **`no-store` is
  kept** (the global `protect()` hook also forces it). Revisit only if Safari testing fails.
- **Chrome webm without duration/cues:** seeking can be coarse; accepted (no
  transcoding).
- **Disk:** about 0.5–1 MB/min (opus), well under the limits; Settings storage usage
  already counts clips.
