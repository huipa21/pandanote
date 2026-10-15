# Voice clips — progress and handoff

## Current state

- **VN01 docs done; VN02 (server audio classification + inline Range serving) done.** Next: VN03.

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
