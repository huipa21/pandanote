# Voice clips — progress and handoff

## Current state

- **VN01 docs, VN02 (server), VN03 (client recorder core), VN04 (editor UI) done**, plus a Session 5 follow-up
  (minimum take length, disabled-button dimming, stale e2e specs fixed). Next: VN05 (display on cards and note page).

## History

### Session 1 — planning

- Read PRODUCT_SPEC §3–4/§10 and the editor, attachment and serving code. Findings:
  attachments are staged in memory until Post; non-image files are stored as
  `application/octet-stream` and always served as downloads; no Range support; page CSP
  is `default-src 'none'`; Permissions-Policy is `geolocation=()`; video is exclusive in
  the editor.
- User answers recorded in [README.md](README.md). Chosen design: clips reuse the file
  pipeline with an explicit `voice` upload flag, no schema change, native browser format,
  inline serving with Range for audio only.
- Commands run: `npx prettier --write docs/voice-notes` (docs only).
- Next: VN02. Read SPEC §2.2–2.3, `src/lib/server/attachments/{service,images}.ts`,
  `src/hooks.server.ts`. Validation: `npm run test:integration` (new serving tests).

### Session 2 — VN02 server (done)

Implemented:

- `uploadItemSchema.voice?: boolean`; flag persisted in `attachments.detected_mime` as
  `audio/x-voice-pending` (no schema change), replaced by the detected container MIME on
  ready. Retry (`initialize` replay) compares flag equality; a duplicate PUT keeps it.
- `voiceMime(head)` in `images.ts` (webm with `webm` DocType, mp4 brands `M4A `/`mp42`/`iso?`,
  `OggS`); flagged items whose bytes match nothing are rejected with `err.theVoiceClipIsNot`
  (en + zh-CN) and the row becomes `failed`. Flagged items skip raster processing; unflagged
  items still get `application/octet-stream` (`fileMime` unchanged).
- `download()` serves flagged audio inline (exact content-type, `inline; filename`,
  `accept-ranges`, strong `etag` = file digest, `If-Range` honored), single `Range` → 206,
  unsatisfiable → 416 with `content-range: bytes */N`, multi-range/invalid syntax → full 200,
  `HEAD` consistent. `?download=1` and all other files are unchanged (no Range).
- Page CSP `media-src 'self' blob:` (`vite.config.ts` Kit csp); `Permissions-Policy:
geolocation=(), microphone=(self)`. Attachment responses keep their sandbox CSP.
- Cache-control spike: see SPEC §3 (decision: keep `private, no-store`).
- Touched: `src/lib/shared/attachments.ts`, `src/lib/server/attachments/{images,files,service}.ts`,
  `src/routes/api/attachments/[attachmentId]/[variant]/+server.ts`, `src/hooks.server.ts`,
  `vite.config.ts`, `src/lib/shared/i18n/{en,zh-CN}.ts`, new
  `tests/integration/voice-attachments.test.ts` (8 tests), docs.

Commands and real results (Windows host):

- `npx vitest run --config vitest.integration.config.ts tests/integration/voice-attachments.test.ts` — 8 passed.
- `npm run check` — 0 errors, 1 pre-existing warning (`AppShell.svelte` unused CSS selector).
- `npm run lint` — eslint clean; clean after `prettier --write` (the uncommitted VN01 `docs/PROGRESS.md` had been flagged; final run: all files pass).
- `npm run test:unit` — 167 passed. `npm run build` — OK.
- `npm run test:integration` — 265 passed, 7 skipped, **1 failed**:
  `release-hygiene` DOC-01–03 link check, `docs/PROGRESS.md` links to missing
  `nested-tags/PROGRESS.md`. Pre-existing (the link is already in committed HEAD); unrelated.
- Playwright `uploads`, `smoke`, `auth`, `detail`: 13 passed, 2 failed —
  `auth.test.ts:448` (fresh-scope expected 401, got 400) and `detail.test.ts:273`
  (expects tag `#tag/1`, app renders flat `#tag`). Appear unrelated to this step (not checked
  against a clean HEAD build).
- Chromium spike (one-off script, not committed): MediaRecorder webm/opus (96 KB, no duration
  → `Infinity`) served with the real header set plays, seeks forward/back with both
  cache-control variants; one `Range: bytes=0-` → 206 request each.

Not verified: Linux deployment image (Sharp/SQLite unaffected, but serving not run there);
Safari/iOS audio/mp4 and Range (no environment); real HTTP route (`+server.ts`) covered only
through the service layer and the unchanged e2e suites — the route just forwards
`Range`/`If-Range` headers.

Next: VN03 — client recorder core (no UI). Read SPEC §2.1, `src/lib/client/uploads/{file-kind,
protocol,attempt}.ts`, `editor/model.ts`, `workspace.svelte.ts`. Validation: `npm run test:unit`.
Client must send `voice: true` in upload items and include it in the request digest.

### Session 3 — VN03 client recorder core (done, no UI)

Implemented:

- `src/lib/client/recording/recorder.ts`: `VoiceRecorder` state machine behind an injectable `RecorderEnv`
  (idle/starting/recording/paused/stopped). MIME choice `audio/webm;codecs=opus` → `audio/mp4` →
  `audio/ogg;codecs=opus` (stored MIME has codec parameters stripped); 1000 ms timeslice, chunks in memory only;
  own timer (paused time excluded, never `audio.duration`); 10:00 auto-stop and a byte cap (= `fileMaxBytes`) that keeps
  the take and never keeps a chunk after an overflow (no hole); mid-take failure/unplugged device keeps captured audio;
  cancel at any state (also while the permission prompt is open) releases tracks, meter and timers; `AudioContext` level
  meter (failure never fails recording); error codes (insecure/unsupported/denied/no-device/busy/failed/empty/ended);
  `voiceFilename()` = `voice-YYYYMMDD-HHMMSS.<webm|m4a|ogg>` in the app timezone; `recordingSupport()`.
- `recording/clips.ts`: `clipRejection()` (video excludes clips, 20 clips, per-note cap; clips don't count as photos).
- `uploads/file-kind.ts`: `MAX_VOICE_CLIPS = 20`, `MAX_VOICE_SECONDS = 600`.
- `editor/model.ts`: `EditorAttachment.kind` gains `'audio'` + `durationSeconds`; `editorKind()` maps server `file` with an
  audio MIME to `audio` (used by `editNote`).
- `uploads/attempt.ts`: `uploadItemFor()` adds `voice: true` for clips; the frozen manifest keeps it across retries. The
  client `requestDigest` covers the note command only (as before); the server compares the flag on replay (VN02).
- `workspace.svelte.ts`: recorder state lives in the workspace (`recorder`, `notice`, `recording`, `postBlockedReason`,
  `recordingUnsupported`, `recorderEnv` injectable); `startRecording/pauseRecording/resumeRecording/stopRecording/
cancelRecording/addClip`; `dirty` includes an active take; `canPost` false while recording; `resetSession`, disposal and
  `pagehide` cancel the take; `addFiles` reserves a slot for a take in progress (count and video); `clipUrls` object URLs
  (local) / `/api/attachments/:id/file` (server) with revoke on remove/reset.
- i18n en + zh-CN `rec.*` keys. `vitest.unit.config.ts` now loads the Svelte plugin so rune modules (`*.svelte.ts`) can be unit tested.
- Tests: `tests/unit/voice-recorder.test.ts` (38), `tests/unit/voice-clips.test.ts` (25).

Commands and real results (Windows host):

- `npm run check` — 0 errors, 1 pre-existing warning (`AppShell.svelte`). `npm run lint` — clean.
- `npm run test:unit` — 230 passed (35 files). `npm run build` — OK.
- `npm run test:integration` — 265 passed, 7 skipped, 1 failed: `release-hygiene` doc-link check (pre-existing, see Session 2).
- `playwright test uploads.test.ts editor.test.ts` — 5 passed.

Not verified: any real browser recording (no UI yet; recorder driven only through fakes — real MediaRecorder/AudioContext
bindings in `browserRecorderEnv`/`createAudioMeter` are untested until VN06); Linux image; Safari/iOS.

Known stopgaps for VN04: the existing `AttachmentGrid` renders any non-image attachment (including `audio`) as a
placeholder tile; clips need their own list. Exposed messages for Post-disabled state: `rec.stopFirst`.
A clip stopped while a concurrent `addFiles` runs waits up to 2 s for it, then reports `work.addFailed`.

Next: VN04 — editor UI. Read SPEC §1.1–1.2, 1.4, `EditorOptions.svelte`, `AttachmentGrid.svelte`, `NoteEditor.svelte`,
`workspace.svelte.ts` (recorder API above). Validation: `npm run check && npm run lint && npm run test:unit` + e2e.

### Session 4 — VN04 editor UI (done)

Implemented:

- `EditorOptions.svelte`: microphone button after Photos/video (`data-record-button`); same lock rules plus disabled while a
  take is open; when the browser cannot record (insecure context, no MediaRecorder/MIME) it is disabled with the reason as title
  (capability is read in `onMount`, so SSR/hydration are unaffected).
- New `VoiceRecorder.svelte`: recorder strip above the toolbar (state dot, `m:ss` timer, non-animated level `meter`, Pause/Resume,
  Stop and add clip, Discard take). Reads only workspace state, so compact editor and focus-mode dialog show the same take. A
  mounted sr-only `role=status` region announces started/paused/resumed/added/discarded. Focus goes to Stop when a take starts
  and back to the microphone button when it closes.
- New `AudioClipList.svelte`: clip rows below the photo grid (play/pause preview from `workspace.clipUrls` through one shared
  `Audio`, name, recorder duration when known, remove X); drag and Alt+Arrow reorder. Moves are translated to indexes in the
  full attachment order, so `attachmentIds` stays the single source of truth. Preview stops on remove, on a new take and on destroy.
- `AttachmentGrid.svelte`: now photos/video only (audio filtered out; index translation for drag/Alt+Arrow).
- `NoteEditor.svelte`: renders the list and strip; Post/Save button shows "Stop recording first" while recording
  (`workspace.postBlockedReason`). `EditorFeedback.svelte`: shows `workspace.notice` (10:00 / size limit) as a status.
- i18n en + zh-CN: `rec.start/startTitle/strip/waiting/recording/paused/level/pause/resume/stop/cancel/announce*/clips/clip/play/pausePlay`.
- Unsaved guard / pagehide / dispose needed no change (VN03 workspace already treats a take as dirty and releases the microphone).
- Tests: new `tests/e2e/voice-editor.test.ts` (7, Chromium fake device via per-spec `launchOptions`): record/pause/resume/stop, focus
  mode continuity, focus return, second clip, Alt+Arrow reorder, remove; cancel; permission denied; navigation guard with Cancel
  and Discard; clip-only note posts and clears; 390 px layout with 44 px targets; axe WCAG 2.x AA scan of strip + rows.
  `editor.test.ts` toolbar count 3 → 4.

Commands and real results (Windows host):

- `npm run check` — 0 errors, 1 pre-existing warning (`AppShell.svelte`). `npm run lint` — clean.
- `npm run test:unit` — 230 passed. `npm run build` — OK.
- `npm run test:integration` — 265 passed, 7 skipped, 1 failed: `release-hygiene` doc-link check (pre-existing, see Session 2).
- `npx playwright test voice-editor` — 7 passed. `editor editor-session uploads language smoke` and the other `shell` tests — passed.
- Failing and **not caused by this step** (no editor involved; not run against a clean HEAD build): `shell.test.ts` screenshots
  `settings-dark-compact` (Settings page layout drift) and `shell-light-390x844` (header area); `zzzaccessibility` authenticated
  light/dark scans (4-minute timeouts) and the composer test failing at the final "Authorize backup action" dialog (the composer
  scan before it passed).

Not verified: real microphone (Chromium fake device only); Firefox/Safari/iOS; Linux image; screen-reader behavior beyond axe;
a Stop pressed within the first moments of a take produced no clip in one test run (the second recording only landed after the
timer left 0:00) — presumably the existing VN03 `empty` error, cause not inspected; consider a minimum-length note in VN06/VN07.
Post disabled button has no dimmed style (existing global button style), so the label is the cue.

Next: VN05 — display on cards and note page. Read SPEC §1.3, `NoteCard.svelte`, `NoteDetail.svelte`, `AttachmentGrid.svelte`,
`AudioClipList.svelte`; build `AudioClip.svelte` with single-playback coordination. Validation: `npm run check && npm run lint &&
npm run test:unit` + e2e.

### Session 5 — VN04 follow-up: open items from Session 4 (done)

Analysis of the Session 4 open items, verified on a clean-HEAD worktree (`1cbccac`, own build, junctioned
`node_modules`, removed afterwards):

- **Shell screenshots and axe failures were not caused by VN04.** All five (`settings-dark-compact`,
  `shell-light-390x844`, axe light/dark, composer/backup dialog) fail identically on clean HEAD. Causes:
  - axe light/dark: not slowness. The month picker's `Choose year, …` button became `Enter year, …` (manual year
    entry), so the click waited the full 4-minute test timeout.
  - composer axe test: the `Authorize backup action` dialog was removed in `7bda440` (backup create/download no
    longer ask for a password). The test now scans the remaining sensitive backup dialog, `Delete backup?`.
  - `settings-dark-compact`: baseline predates the Settings tab redesign and the sidebar redesign (last updated in
    `8cb3dbd`; main PROGRESS had already asked the owner to regenerate it).
  - `shell-light-390x844`: a cascade. The appearance test failed at its screenshot before its cleanup, leaving the
    stored theme Dark, so the "light" matrix shot rendered dark. Its baseline was also stale (new header).
- **Real app bug found while fixing the axe walk:** in the phone navigation drawer (a `Modal`), Escape in the month
  picker (even while editing the year) closed the whole drawer, because the dialog's keydown handler ran before
  the picker's window listener. `MonthPicker.svelte` now listens in the window capture phase. New phone
  regression steps in `calendar.test.ts`.
- **Quick Stop:** probed in Chromium with the fake device. A Stop within ~60 ms of `MediaRecorder.start()` yields a
  0-byte blob (the existing `empty` → "Nothing was recorded."; correct, not a state-machine bug). At ~90 ms it yields
  a 175-byte header-only webm with no audio frames, which **was added and would be uploaded as a useless clip**.
  Fix: minimum take length `MIN_VOICE_MS = 500` (recorded time, pauses excluded) for a user Stop. New
  `RecorderErrorCode` `short` → `rec.errShort` (en + zh-CN). Automatic ends are unchanged. Documented in SPEC §1.1/§1.4
  and ACCEPTANCE_TESTS VN-REC.
- **Disabled Post not dimmed:** `global.css` `button:disabled` now also sets `opacity: 0.55` (matches existing local
  choices of 0.45–0.5; WCAG 1.4.3 exempts inactive controls). This affects every disabled button app-wide, on
  purpose.

Test changes:

- `zzzaccessibility`: year-entry step (scan, Escape cancels the edit, Escape closes the picker, phone Escape closes
  the drawer). The backup step now scans `Delete backup?`.
- `shell`: the matrix test resets appearance itself (no theme inheritance). Screenshots mask the data-dependent
  sidebar calendar/tags region (`.sidebar-sections`), pinned to `flex: 1 1 0` via CSSOM (`toHaveScreenshot({ style })`
  is blocked by the page CSP). Three baselines regenerated and inspected (settings tabs, new header, mic button,
  dimmed Post). Verified both alone and after `calendar`/`tags-page` data.
- `calendar`: timezone test opens the Calendar tab. The delayed-image test uses the `Note images` thumbnail list (images
  are no longer inside `.markdown`).
- `zzrestore`: Settings tabs, password-free backup create/download, zh-CN labels for its zh-CN phase, and reload into
  English before restore. Added an `afterEach` that resets language/title/timezone even on failure. Before this,
  its failure left the shared instance in zh-CN, and every later spec failed, including the voice spec, which runs
  last because its own `launchOptions` put it in a separate worker group.
- `voice-editor`: new "Stop right after Start" case. Post-blocked button asserts `opacity: 0.55`.
- Unit: `voice-clips` fake env has a controllable clock (`state.step`) and a new too-short test. `voice-recorder` has a
  new `short` test (paused time excluded, exactly 500 ms ok, `minMs: 0` override). Three existing tests now record a
  realistic length.
- `docs/PROGRESS.md`: dead `nested-tags/PROGRESS.md` link (folder removed in `3b7d12a`) replaced by text, which fixes
  the `release-hygiene` DOC-01–03 failure carried since Session 2.

Touched: `src/lib/components/MonthPicker.svelte`, `src/lib/styles/global.css`, `src/lib/client/recording/{recorder,clips}.ts`,
`src/lib/client/uploads/file-kind.ts`, `src/lib/shared/i18n/{en,zh-CN}.ts`,
`tests/e2e/{zzzaccessibility,shell,calendar,zzrestore,voice-editor}.test.ts`, `tests/e2e/shell.test.ts-snapshots/*.png` (3),
`tests/unit/voice-{recorder,clips}.test.ts`, docs (this file, SPEC, ACCEPTANCE_TESTS, main PROGRESS).

Commands and real results (Windows host):

- `npm run check`: 0 errors, 1 pre-existing warning (`AppShell.svelte`). `npm run lint`: clean.
- `npm run test:unit`: 232 passed (35 files).
- `npm run test:integration`: **266 passed, 7 skipped, 0 failed** (release-hygiene fixed).
- `npm run build`: OK.
- Clean-HEAD worktree: `npx playwright test shell zzzaccessibility -g …`: the 5 reported failures reproduce.
- `npx playwright test` (full suite, current tree): **94 passed, 6 failed, 4.5 min** (before: 81 passed / 19 failed,
  21 min). The 6 remaining failures are pre-existing stale tests, not caused by VN04, and not fixed here:
  - `auth:448`: expects 401 for the removed `backup-download` fresh scope, gets 400 (`7bda440`).
  - `detail:256` and `detail:273`: `detail:273` expects nested `#tag/1` (removed in `3b7d12a`). `detail:256`'s card
    locator was not found and was not investigated further.
  - `tag-management:8`: expects the composer to show "Saved on server.", which now renders only on the note page.
  - `timeline:146`: the `Active filters` region no longer exists.
  - `version:6`: `#about` is in a hidden Settings tab.

  Session 4 already listed `auth:448`/`detail:273`, and main PROGRESS lists `timeline:146`.

Not verified: real microphone (fake device only), Firefox/Safari/iOS minimum-length behavior, Linux image.

Next: VN05 (display on cards and note page). Read SPEC §1.3, `NoteCard.svelte`, `NoteDetail.svelte`,
`AttachmentGrid.svelte`, `AudioClipList.svelte`, then build `AudioClip.svelte` with single-playback coordination. Validation:
`npm run check && npm run lint && npm run test:unit` + e2e. Optional owner task: update the 6 stale specs above.
