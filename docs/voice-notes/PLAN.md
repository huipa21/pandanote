# Voice clips — implementation plan

One step per session normally. Every step ends with:

```sh
npm run check && npm run lint && npm run test:unit && npm run test:integration && npm run build
```

plus affected Playwright specs (`npm run build` first). Record exact commands and real
outcomes in [PROGRESS.md](PROGRESS.md). Read [README.md](README.md) and
[SPEC.md](SPEC.md) first. Serving behavior must also pass in the Linux image.

## VN01 — Document reconciliation — done (docs only)

Files: this folder, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`,
`docs/ACCEPTANCE_TESTS.md`, `docs/PROGRESS.md` (pointers only).
Gate: `npx prettier --check docs/voice-notes`.

## VN02 — Server: audio classification and inline serving with Range — done

Highest risk, so first. Files: `src/lib/shared/attachments.ts` (`voice` flag),
`src/lib/server/attachments/images.ts` (container detection), `service.ts`
(classification, file-route headers, Range),
`src/routes/api/attachments/[attachmentId]/[variant]/+server.ts`,
`src/hooks.server.ts` (media-src, Permissions-Policy), error catalog keys.

1. Detection + `voice` flag as in SPEC §2.2; reject mismatching bytes.
2. Inline audio responses, `Range`/206/416, `HEAD`, download override.
3. Spike `cache-control` behavior for seeking; document the decision.
4. Header/CSP changes.

Tests (integration): each container accepted; non-voice webm stays octet-stream; voice
with wrong bytes rejected; full/partial/suffix/invalid ranges; download unchanged;
unauthorized and cross-note access unchanged; retry safety with the flag in the digest.

## VN03 — Client recorder core (no UI)

Files: `src/lib/client/recording/recorder.ts`, `uploads/file-kind.ts`
(`MAX_VOICE_CLIPS = 20`, `MAX_VOICE_SECONDS = 600`), `editor/model.ts` (`kind: 'audio'`),
`uploads/protocol.ts` and `attempt.ts` (send `voice: true`), `workspace.svelte.ts`
(`addClip`, limits, remove/reorder reuse, object-URL lifecycle, recorder state).

Tests (unit): MIME selection table, filename in app timezone, limit rules (video
excludes clips, 21st clip, photos+clips mix), fingerprint/dirty/`hasSessionContent`
with a clip-only note, upload items carry `voice`, blob cleanup.

## VN04 — Editor UI

Files: `EditorOptions.svelte` (mic button), new `VoiceRecorder.svelte` strip, new
`AudioClipList.svelte` (or extend `AttachmentGrid.svelte`), `NoteEditor.svelte` (Post
disabled while recording, focus-mode continuity), unsaved-guard hooks in
`workspace.svelte.ts`/`lifecycle.svelte.ts`, i18n `en.ts`/`zh-CN.ts`, CSS (390 px
mobile, light/dark, 44 px targets, ARIA live announcements for start/stop).

## VN05 — Display on cards and note page

Files: `NoteCard.svelte`, `NoteDetail.svelte`, new `AudioClip.svelte` (single-playback
coordination), i18n. Inline edit shows server clips with remove/reorder.

## VN06 — Playwright coverage

Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
(per-spec `launchOptions`, not global). Cases in [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md).
Permission-denied via context permissions.

## VN07 — Milestone gate

Full check/lint/unit/integration/build, full e2e, Alpine image integration, and a
manual real-device pass (Chrome, Firefox, Safari/iOS) recorded honestly. Update the
main spec sections. Do not claim release completion.
