# Year heatmaps / no-drafts implementation

## State

**Done / locally verified.** Full browser and final host/Linux common gates pass.
No deployment or final PandaNote release approval implied. No commit, deployment,
legacy migration/importer or deletion of development data. User explicitly confirms
no production/deployed data. See main PROGRESS for current exact handoff.

## Changes

- Year picker now twelve miniature monthly heatmaps in 4 × 3 with whole-tile links,
  year arrows/quick years/direct jump, private bounded year data and error/retry.
- `src/lib/client/editor/{model,workspace.svelte,lifecycle.svelte}.ts` replaces draft
  browser repositories. Unsaved content/blobs and frozen posting identity are memory
  only; no autosave/local recovery. Content-free lifecycle retry persistence remains.
- Draft route/nav/actions removed; create/update/Trash only, fresh schema/snapshots,
  tag counts and backup summary/scope no draft fields. Existing development DB/archive
  hashes refuse rather than silently migrating/wiping.
- Post/Save–Discard–Cancel for internal navigation/mobile close/replacement/signout;
  browser actual close/refresh standard Leave/Stay, desktop focus X retains session.
- Safe same-session retry, lost-response receipts, new-attempt ID/AST remapping,
  server-base digest/revision and explicit conflict copy/replace preserved.

## Validation

Pinned Node24.21.0 executable/PATH, TLS1. `npm run check` zero diagnostics and
`npm run lint` pass. `npm run test:unit`: 134 pass. Full host integration:
213 pass + 7 existing Linux-only skips. Actual fresh Alpine image:
134 unit/all220 integration pass with zero skips (SQLite, Sharp, archive/restores,
crash/PTY/native gates included). Final source common/image close passed.
Final standalone `npm run test:e2e`: **68/68 Chromium PASS**,4.6min. Includes
normal screenshot comparisons, true native Leave/Stay, media/retries/conflicts,
calendar/filter/history and downloaded archive uploaded restore. Desktop/mobile
miniature heatmap screenshots opened/reviewed. Final Alpine16fd08... full common
check/lint134unit/all220integration/build PASS; owned validation images removed,
base caches/shared aliases/data untouched. No Linux visual/exact release claim.

Intermediate failures retained honestly: initial partial implementation had stale
fixtures/type errors and a nullable SQL CHECK weakness, fixed with nonnull guard.
Browser test request contexts require explicit real server-issued Secure cookie on
local HTTP; stale cookie/draft assertions updated, no auth bypass. Attachment details
must be opened for accessible button assertions. CDP reload bypassed Stay semantics;
actual script-triggered reload verifies native beforeunload. Cleanup fixture needed
awaited first measurement before aging DB to avoid stale response. Removed Drafts
sidebar and new test dataset require intentional reviewed snapshots; deterministic
current-month notes/stable first-six synthetic tags avoid suite-order geometry.
One combined 540s run timed out after host integration passed during browser run,
not a full pass; separate full run was 65 pass/3 fail (snapshot, bounded30-card
assertion, concurrent-output artifact error), next66/2snapshot+pointer-post failure, final68/68PASS. Keyboard activation of focused
Post in the accessibility test verifies explicit submission; no auto-post/shortcut.
Host second full integration concurrent with browser build211pass/2runtimebuild
fail+7skips; sequential runtime-server2PASS. Those suites both mutate build/ and
must run sequentially. Final full host sequential rerun **213PASS+7 existing Linux-only skips**251.63s;
no previous failure is claimed as a pass.
No failed or interrupted run counted as passed.

## Final handoff close

Last cleanup removed only draft CSS names/misleading recovery error copy and stale
handoff/test titles, no native/auth/restore behavior changes. Closing check/lint134
unit/build PASS; full browser **68PASS5.4min** with normal snapshots. First full
integration212PASS/1WindowsEPERM stagedDB rename failure+7skips rolled back safely;
restore24PASS rerun, final sequential full **213PASS+7existingLinux skips**252.17s.
No bypass, skipped failure or timeout relaxation. Linux socket unavailable for this
wording-only close; prior actual Alpine134/all220/common gates remain evidence.
No commit/deploy/data deletion; next action is user visual review/approval.

## Open independent limits

SS01 literal atomic directory exchange; S18 actual VPS/public cert/physical device/
IME/screen reader/exact clean release; Linux browser visual/ARM64. No release claim.
Historical restore refusal no longer reproduces: final full68/68browser gate
includes download/upload/validation/restore with no security bypass. Root cause
of the prior historical fixture refusal was not proven; this is current-source
regression evidence, not a retrospective claim. Next: user visual review, approval
before commit/clean release image; no requested feature remains pending.
