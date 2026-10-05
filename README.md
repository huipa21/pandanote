# PandaNote

A single-user, responsive, Markdown-first personal notes application.
**Composer, recovery, timeline, search, calendar, detail/edit/viewer and Drafts/Trash are implemented; later features remain unfinished.**
One-time operator setup, password login/logout and private route protection are
implemented, including confirmed encrypted TOTP enrollment, single-use recovery
codes, scoped fresh authentication, password/MFA changes, session settings,
all-device signout and operator-only recovery (S02). S03 adds design tokens, private navigation,
mobile drawer/editor shells and persisted appearance preferences. S04 adds safe
Markdown/GFM preview, highlighted code copy, lazy sanitized Mermaid and Unicode
source-span tag parsing. S05 adds multiple browser-local text/file drafts, reload
and restart recovery, missing-file repair, quota warnings and cross-tab conflicts.
S06 adds private resumable uploads, bounded static-image WebP processing and
safe authenticated downloads. S07 adds atomic, idempotent note mutation APIs with
revision conflicts and draft/Trash lifecycle. S08 connects explicit composer posting
with frozen, receipt-first retries, upload progress and confirmed-success cleanup.
S09 adds server-rendered chronological cards, private cursor paging, all-tag filtering,
collapse/density preferences and scroll/history restoration. S10 adds SQLite literal
multilingual search, quoted phrases, short-query fallback and safe snippets.
S11 adds global month activity, timezone/week-start settings, month/year/day navigation
and scroll synchronization. S12 adds addressable full-note detail, published/server-draft
recovery edits, confirmed conflict copy/load/revision-checked replacement and a WebP
image viewer. S13 adds separate local/server Drafts, recovery overlays, Trash
restore and confirmed permanent deletion with durable lifecycle retries.
S14 adds tag management, exact cross-status source rewrites, safe previews/retries,
local autocomplete and explicit stale-draft tag resolution. Location/storage and
backup/restore remain future steps. Do not deploy this
unfinished app as a complete product.

## Start here

1. [`AGENTS.md`](AGENTS.md) — working rules and handoff protocol.
2. [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — authoritative product behavior.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — storage/security contracts and validated API decisions.
4. [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — S00–S18 acceptance gates.
5. [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md) — integrated verification matrix.
6. [`docs/PROGRESS.md`](docs/PROGRESS.md) — actual status, command results and exact next task.

The product specification takes precedence over architectural suggestions.
Subsequent sessions must follow the **next unfinished step in PROGRESS**, not
redesign settled requirements or assume a capability probe is a product feature.

## Local development

Use **Node 24.21.0 LTS** (`.node-version`) and npm 11. Exact dependencies are
pinned in `package.json` and `package-lock.json`. On Windows, verify the Node
version used by both npm and its child processes; don't run with an older Node
installation earlier in PATH.

```sh
node --version
npm ci
cp .env.example .env
npm run db:migrate
npm run auth:setup-token
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173/setup` and enter the operator-held token to create
the sole account; subsequent visits use `/login`. `dev`, `start` and operator
commands load a private `.env` if present; real environment variables take precedence.
`.env.example` documents the environment contract. `/health` exposes only `{ "status": "ok" }` with no-store caching;
it does **not** yet check database/storage readiness. This scaffold is not
ready for an Internet-facing deployment.

## Private persistence initialization (S01)

```sh
# Set DATA_DIR in your environment or a private .env (see .env.example).
# Stop the app before migrating; run from the repository root.
npm run db:migrate
```

This creates private directories, random portable key material, the current SQLite
schema and validated settings defaults. **It creates no account or demo content.**
Production requires an absolute `DATA_DIR` outside source/build/public assets, on
persistent local disk. Keep `migrations/` with the trusted application installation.
Do not use schema-push or copy a live SQLite file without its WAL.
See [`migrations/README.md`](migrations/README.md) for generation/upgrade rules.

Linux directories are owner-only `0700`; keys/database/WAL/SHM are `0600`. On
Windows, POSIX mode bits are not ACL protection: restrict the data directory's
NTFS ACL to the operator/application account. Symlink/junction paths and
user-controlled filenames are rejected as storage paths. Losing key material for
an existing database fails closed rather than silently generating a replacement.
Only authenticated ID/variant attachment routes expose authorized immutable bytes;
no directory listing or arbitrary filesystem path is served.

`Persistence.write` combines the maintenance gate with a synchronous IMMEDIATE
transaction. Use it for every domain mutation; `Persistence.close()` drains active
write leases and closes the database. The application now uses one lazy runtime
instance; adapter-node's post-request `sveltekit:shutdown` event drains and closes it.
Requests never initialize keys or migrate schema. Pending filesystem
journals block opening/migrating data until recovery; the S17 restore state machine
remains future work. S06 implements a restartable reference-safe attachment cleanup
worker; S07 note edits/permanent deletion atomically enqueue last-reference cleanup.
Initial timezone is UTC until setup/settings explicitly accepts a browser proposal.

## Authentication and security (S02)

`npm run auth:setup-token` requires operator/VPS filesystem access and a stopped
app with migrated private storage. It prints one random token to your terminal,
valid for one hour. Keep it out of shell history/log collectors; do not put it in
a URL. Reissue invalidates the previous token. Account creation, token consumption
and the initial session commit atomically. A lost success response can be recovered
by signing in with the chosen password. An existing account prevents token issuance;
there is no public registration or public password/MFA bypass.

Passwords use Argon2id (64 MiB, three passes, one lane), with only one hashing or
verification operation in flight and no queue. `npm run auth:benchmark` reports
synthetic latency/RSS measurements; it never prints passwords or hashes. Sessions
use a host-only HttpOnly, SameSite=Strict cookie, Secure in production, and a hashed
random bearer token in SQLite. Default expiry is seven days, without rolling renewal.
Persistent fixed-window limits apply per client IP and account, including across
restarts. All mutations require the exact configured Origin; all data/page routes
are private except the method-aware health/setup/login allowlist.

Proxy trust: keep `ADDRESS_HEADER`, `HOST_HEADER`, `PROTOCOL_HEADER` and `PORT_HEADER`
unset. Set canonical `ORIGIN` explicitly (HTTPS outside loopback, no trailing slash).
Adapter 6 no longer reads runtime ORIGIN itself; our version-checked build wrapper
supplies it through the generated adapter handoff, preserving Kit's form CSRF
checks and allowing the same build to run at a different domain. Do not configure
build-time `kit.paths.origin`. The application uses the
actual peer address unless it matches `TRUSTED_PROXY_IPS` (at most 16 exact IPs).
A trusted edge must overwrite `X-Forwarded-For` with **one** client IP, not append a
chain; missing/invalid trusted headers fail closed. Bind the Node listener privately
behind that edge. Untrusted forwarded headers are ignored.

In `/settings`, enable or change an authenticator with a local QR code/manual secret.
Enrollment is encrypted with AES-256-GCM and expires in five minutes; MFA activates
only after confirmation. TOTP uses SHA-1, six digits, 30-second steps and ±one-step
drift. Accepted steps cannot be reused, including the enrollment confirmation step;
wait for the next code or use a recovery code. Password success with MFA creates only
a five-minute pending challenge, never a full session.

Exactly ten random single-use recovery codes are shown/downloadable **only at
generation**. Save them privately. They replace TOTP, not the password; only hashes
are stored and concurrent consumption permits one success. Regeneration invalidates
the previous set. Lost generation responses cannot reveal the codes again: sign in
with your authenticator and regenerate them, or use operator recovery.

Sensitive actions require fresh password verification and TOTP/recovery when MFA is
enabled. Grants expire in five minutes, are single-use, and bind an exact action,
session and security revision. Security changes sign out other devices and rotate the
current cookie. Sign out all devices also signs out the current device. Session lifetime
is configurable from 1–30 days (default seven); changing it revokes existing sessions.
Backup/restore scopes are ready for their future handlers; those features are not
implemented yet. Credentials/grants/seeds/codes are never browser-storage settings.

### Operator-only recovery after losing password/MFA access

There is **no public reset endpoint**. With VPS/filesystem access, stop the app and
run as its OS user from the trusted installation with the correct private `DATA_DIR`.
The command requires `--confirm-reset-security` and a bounded stdin JSON object
`{ "password": "a new password of at least 12 characters" }`; never put the actual
password in command arguments, environment variables, shell history or logs.
For Bash, enter it without echo (the shell variable is not exported):

```sh
read -r -s -p 'New password: ' new_password; printf '\n'
printf '%s' "$new_password" | node --input-type=module -e '
const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
process.stdout.write(JSON.stringify({password: Buffer.concat(chunks).toString("utf8")}));
' | npm run auth:recover -- --confirm-reset-security
unset new_password
```

This transaction changes the password, disables/removes MFA and recovery codes,
increments the security revision and removes all sessions/challenges; it does **not**
erase notes/files/settings. Restart, sign in and enroll MFA again. A failed command
leaves existing security data intact. Missing/corrupt key material or an incompatible
schema still fails closed: recover the matching private key/data from a trusted copy;
do not delete the database, manually toggle MFA, or reopen public setup. OS access can
control this single-user application; MFA does not protect against a compromised VPS,
a compromised browser, plaintext browser drafts, or a downloaded unencrypted backup.

## Responsive shell and appearance (S03)

The authenticated app has a fixed desktop sidebar/composer/filter region and an
independent notes pane. Below 900 CSS pixels, navigation is a keyboard-accessible
drawer and Compose opens a full-screen editor shell. Short screens may scroll
sidebar sections independently so navigation is not clipped.

`/settings` saves Light/Dark/Follow system, Comfortable/Compact, and the long-note
collapse preference in SQLite. Validated attributes are rendered on the initial
HTML document; CSS handles system dark mode without a pre-hydration script or
light-theme flash. Public login/setup use the default system theme. Changes apply
on other devices on their next page load, not via live preference synchronization.

The composer saves **browser-local drafts** (S05) with Write/Preview, and uploads
only on explicit Post/Save changes (S08). Server drafts/Trash screens,
tag administration and storage/backup settings are
explicitly labeled as later-step work; these are not completed features.

## Month calendar and date navigation (S11)

The sidebar/drawer calendar shades every day's **published** note count, independent
of search/tags; drafts and Trash never count. Today has a dot; the selected day has
an outline. Click a day to lock search/tag results to that local day; click it again
or remove its chip to resume continuous scrolling. Month arrows and the heading's
quick year/month picker jump the timeline, clearing a selected day. Today returns
to the current month while retaining search/tags. Clear all clears everything.

The calendar follows the top visible note in the notes pane without fetching a new
timeline or adding history entries. Normal paging skips empty matching months;
a manually chosen empty month waits for Load older notes or Return to Today. Back
restores loaded cards, calendar month and an ID/pixel reading anchor.

Settings → Calendar saves a named IANA app timezone and Monday/Sunday week start.
Browser detection is only an explicit proposal; it never overwrites the saved zone.
All date grouping uses UTC half-open intervals computed with Temporal, including
23/25-hour DST days. Month/day controls accept Gregorian years 1969–9998; they do
not introduce future scheduling. Search/tag changes otherwise cover every month.

## Markdown preview and parsing (S04)

Compact and full-screen editors share the same safe Markdown/GFM pipeline and
300 ms debounced preview. Code blocks have language labels, horizontal scrolling,
original-code Copy and success/failure feedback. Unknown languages stay readable.
Mermaid loads only for visible fenced diagrams, follows the theme, and shows clean
syntax/size/deadline errors without discarding editor text.

Raw HTML and active URL schemes are disabled. Images require known internal
attachment descriptors; arbitrary remote images are not fetched. Mermaid links,
callbacks, HTML/assets, configuration overrides and custom styling are disabled;
SVG output is separately sanitized. See ARCHITECTURE 11.2 for limits/contracts.
Attachments can be selected, pasted or dropped locally (S05). S08 calls the S06
upload primitives only after explicit Post/Save changes, never during selection or preview.

The shared Unicode tag parser deduplicates by NFKC/lowercase identity and preserves
source spans for precise rewrites, ignoring code/HTML/escapes/URLs. All-tag filtering
is implemented; autocomplete and management are still later steps.

## Exact multilingual search (S10)

Search the published Markdown source (including code), normalized tags and original
attachment filenames. Space-separated terms combine with AND; `"coffee shop"` is
one exact phrase. A phrase cannot join different fields. English case and Unicode
width/compatibility forms normalize through NFKC/lowercase, but Han variants,
readings, accents and misspellings do not become equivalent. No file contents are
searched. `%`, `_`, FTS keywords and punctuation are literal data.

Use double quotes for phrases; `\"` and `\\` escape quote/backslash, and other
backslashes stay literal. Empty/unclosed/adjacent quotes show validation feedback.
Limits: 20 units, 256 normalized content codepoints, 1024 input codepoints including
syntax/escaping. Search updates after a 300 ms pause (after IME composition ends),
ignores superseded requests and shares the newest-first cursor timeline. Search,
all selected tags and an optional day range combine with AND, across all months.
Snippet marks render escaped normalized text; saved Markdown remains unchanged.

**Upgrade with the app stopped:** `npm run db:migrate` adds/backfills schema v4's
FTS5 trigram index. One/two-character and unsupported punctuation/Unicode units
scan literally; the index never defines matching semantics. For explicit repair,
stop the app and run `npm run search:reindex`. It atomically rebuilds only derived
search data. `npm run search:benchmark` uses isolated synthetic 10k-note data, never
reads your deployment data, and reports oracle comparisons, latency/RSS/disk/payload.
See PROGRESS for actual host/Linux measurements and remaining release checks.

## Browser-local drafts and recovery (S05)

`/drafts` lists multiple local/device-only drafts with safe excerpts. Create another,
resume, and explicitly confirm discarding a nonempty draft. Text/metadata persist
in separate versioned localStorage records; original unposted files persist in
account/draft-scoped IndexedDB. Reload/browser restart recovers them on that profile.
Selecting files and autosaving never send draft content to the server.

Text autosaves after 300 ms and flushes on blur/visibility changes where possible.
Quota/storage failures remain visible; keep another copy and retry. Missing files
must be repaired with their original filename/size or removed. Two tabs cannot
silently overwrite a shared draft: choose to keep your version as a separate draft
or confirm loading the saved version. A current browser with **Web Locks** support
is needed for safe writes; unsupported storage/locking is a visible failure, not
fake success. Persistent storage can be requested from Drafts, but may be denied.

This is **not backup or encrypted storage**. Clearing site data, private browsing,
storage eviction or losing this device can remove drafts. Other devices and server
backups do not contain them. Signing out leaves drafts on the browser/device;
anyone controlling it can read them. Local preview URLs are temporary and revoked.
S08 adds posting and an app-timezone timeline-date dialog. Server draft/detail
entry points are implemented in S12/S13; location controls remain S15.

## Private attachments and bounded images (S06)

Server primitives are integrated with S07 note commits and S08 browser posting.
`POST /api/uploads` initializes/resumes a frozen manifest of stable IDs, filenames,
exact byte sizes and SHA-256 checksums. Query readiness through the batch GET,
then PUT missing raw file bodies only. Reusing an ID with different bytes fails
rather than overwriting. A successful note receipt is checked before initializing
another batch; S07 computes and verifies the actual atomic note payload digest.

Raster magic, not the filename/client MIME, triggers orientation-corrected,
metadata-stripped display/thumbnail WebP. Static GIF is supported; animation,
including APNG, and corrupt/over-limit images are rejected. Defaults: 20 MiB input,
50 MP decoded, display edge 2560/quality 85, thumbnail 480/quality 75, no upscale.
Only one native job runs, with two bounded waiters and a hard 30-second subprocess
deadline. Other files remain byte-identical (50 MiB default), download-only.
Original server images are deleted before readiness; temporary/crash inputs are
cleaned at startup. Ready retry outputs survive until explicit cleanup in S15.

Private GET/HEAD variants require login and an authorized reference/pending batch;
files use safe Unicode download names, octet-stream, nosniff and sandbox headers.
Only processed image WebP can be downloaded, never an original. Queued byte cleanup
rechecks clone/draft/Trash references and survives restart; it cannot remove a
still-referenced attachment. Storage controls/UI remain S15.

Set adapter `BODY_SIZE_LIMIT=512M` as in `.env.example` and configure the eventual
reverse proxy for streaming uploads. The adapter otherwise defaults to 512 KiB;
server byte/pixel limits still apply independently. Disk reserve is max(5 GiB,
10% filesystem capacity), optionally overridden by operator `DISK_RESERVE_BYTES`.
Concurrent uploads reserve estimated peak space rather than spending OS reserve.
`npm run images:benchmark` uses synthetic inputs only and reports native latency/RSS;
see ARCHITECTURE 7.4 and PROGRESS for exact contracts and measured limitations.

## Atomic note APIs and lifecycle (S07)

The backend supports text/image/file-only creation, optimistic published edits,
move-to-draft, edited draft publication, Trash/restore and confirmed permanent
deletion. Server draft edits are never background-saved. S08 supplies the composer
protocol; full detail/edit and lifecycle entry screens are implemented in S12/S13.

- `POST /api/notes`: strict `create` command.
- `GET /api/notes/<id>`: private body/metadata/revision/tag/ordered attachment-descriptor snapshot.
- `PATCH /api/notes/<id>`: strict `update` command for published notes.
- `POST /api/notes/<id>/actions`: `publish`, `move-to-draft`, `trash`, `restore`,
  `permanent-delete`; all require expected revision and client mutation ID.

Use `shared/notes.ts` for exact typed payloads and the canonical UTF-8 SHA-256 input
for upload initialization. The commit server independently computes the digest,
returns original receipt success on identical retries, and rejects changed payloads.
All body/tags/file joins/search fields/receipt writes share one transaction. Stale
revisions return a safe 409 comparison snapshot without overwriting local work.
Permanent deletion requires Trash plus `confirmed: true`; shared/Trash file bytes
survive until the final reference is removed and durable cleanup completes.
Creation dates are immutable. Updates/republishing retain an explicit timeline date;
body/attachment changes alone set the content-edited indicator. See ARCHITECTURE 4.4.

## Composer posting and retry (S08)

Post is the only publishing action; Enter and Ctrl/Cmd+Enter never publish. New
notes use Post, published recovery edits use Save changes, and server-draft recovery
uses Post. Selecting new files, autosave, and preview remain browser-only.

On activation, the composer freezes its validated payload, mutation ID, SHA-256
manifest and retry state in localStorage before sending anything. Editing is locked
until confirmation; failures/reloads retain the exact attempt and local files.
Retry checks the server receipt first, then authoritative upload readiness, sending
only missing files. Upload bytes, processing and complete-note save have visible
feedback; double clicks and concurrent tabs cannot submit changed payloads.

Only confirmed success removes the submitted record/blobs; other drafts remain.
Storage failure after a server commit can be retried safely. Error/conflict/stale-tag
messages keep work intact; sign in again when needed. An editable separate copy
allocates new IDs for local files and leaves the original uncertain attempt intact.
Retry first: copying cannot cancel a save that may already have committed.

The Date dialog uses the configured app timezone and rejects future/nonexistent/
ambiguous local times. Recovery bases recheck ID, revision and canonical snapshot
identity before new uploads, including after restore. Full edit/conflict/draft
screens are implemented in S12/S13; there is no background server draft saving.

Confirmed saves update the persisted, date-sorted timeline without a full page reload.
A backdated save is never artificially prepended. If it is outside the current filters
or already-loaded date range, the UI explains how to find it.

## Timeline and tag filters (S09)

All notes renders the first published page on the server (normally 30 cards), then
loads older cursor pages inside the notes pane. Timestamp ties use descending ID;
cursors are bound to canonical search/tag/day filters and app timezone. Multiple selected tags
mean **match all**. Sidebar/card tags toggle visible removable chips; Clear all resets
filters, and browser Back restores loaded pages and a useful reading position.

Cards show timeline time, actual content-edited indicators, safe Markdown/code,
private lazy thumbnails with reserved dimensions, file download rows and optional
location text. Show more/less follows the collapse preference; compact density uses
the saved spacing tokens. Large bodies use explicitly labeled bounded previews;
full source loads on expansion (or visibility with full-card preference). Partial
code is never offered as the complete original by Copy. Copy Markdown, confirmed
Move to Drafts/Trash and revision-conflict refresh are available from Note actions.
Drafts/Trash server screens and detail/image viewer are implemented in S12/S13.

Month separators/top-visible-month tracking connect to S11's calendar and date
navigation. S10 supplies literal search on this same list API.
10k-note paging and 300-card DOM measurements are recorded in `docs/PROGRESS.md`;
virtualization is deferred pending evidence from longer reading sessions.

## Tag management and stale drafts (S14)

Manage tags shows published counts separately from server drafts and Trash. Search
finds up to 100 matching tags. Preview Rename, Merge into an existing tag, or Remove,
inspect affected source samples, then confirm. All affected server notes gain a
revision; code, escaped markers, URLs, unrelated text, dates and files stay intact.
Case-only rename changes token spelling; renaming into another existing tag requires
an explicit Merge. Remove deletes only the hashtag token, not its note or adjacent
spaces. Extremely large operations (over 10,000 notes / 32 MiB) fail safely instead
of partly rewriting the collection.

Browser drafts are not silently rewritten. Post checks tag history before uploads.
Choose Apply history, Remove locally, or intentionally keep/recreate a retired tag.
The choice saves locally; review and explicitly Post again. Frozen attempts are
resolved through an editable copy with preserved files, retaining the original retry.
History follows chronological rename/merge chains, including removals, and survives
recreation. Intentional recreation is acknowledged for the exact retirement generation;
a newer retirement requires another review. Lost management responses can be checked
from the unconfirmed operations on Manage tags after reload.

Autocomplete uses locally filtered existing-tag metadata; arrows/Enter select,
Escape dismisses, and touch options work. Code/URLs/escapes do not trigger it; no
prefix or note content is sent while typing. Suggestions are bounded to the first
5,000 non-retired tags; management search remains available beyond that set.

**Upgrade with the app stopped:** run `npm run db:migrate` before starting this
version. Schema v5 adds tag-management retry receipts without changing existing
note receipt identities or browser draft schema versions.

## Drafts and Trash (S13)

Drafts separates device-only new/edit recovery copies from last saved server drafts.
Server rows identify available local recoveries; reopening checks the full server
base and uses local work without erasing other losing copies. Other devices see only
saved server content. Post republishes the server draft with its original timeline
date unless deliberately changed. New files remain local until that explicit action.

Trash shows prior published/draft status, private detail, Restore and confirmed
permanent deletion. Dates/files survive restore; there is no automatic emptying.
Attachment bytes remain referenced while in Trash. Permanent deletion never erases
browser recovery copies or files still used by another note.

Lists use bounded private SSR/cursor pages and explicit older loading/error retry.
Card/detail/list lifecycle actions save a content-free retry identity on this browser
before networking. Unconfirmed actions can be reviewed/retried after reload, even
when a lost-response permanent delete already removed the note. Stopping retries
is not cancellation. Storage failures block the action; revision conflicts never
force overwrites. These browser records, like local drafts, are not a backup.

## Validation

```sh
npx playwright install chromium
npm run check
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

- `check` includes strict application **and test/tooling** TypeScript checks.
- `lint` runs ESLint and Prettier checks; `npm run format` applies formatting.
- Integration tests use real isolated SQLite, Sharp and streamed archives.
- Playwright starts the **built adapter-node app**, plus a separate test-only
  Mermaid/CSP harness; it owns/cleans its synthetic test data and never reuses
  a user's running server.
- See [`tests/README.md`](tests/README.md) for coverage, probe limits and Linux
  validation commands using `ops/Dockerfile.validation`.

Never disable TLS verification to install dependencies. Never place secrets,
application data, browser profiles or backup archives in git or public assets.

## Settled stack

- SvelteKit 3 + Svelte 5 + TypeScript 6, Vite 8 and adapter-node.
- SQLite + Drizzle + better-sqlite3; FTS5 trigram plus literal short-query fallback.
- remark/rehype, Shiki and dynamically loaded Mermaid; plain CSS, no large UI kit.
- Sharp and private local filesystem storage; browser-local unpublished drafts.
- One Node application instance behind HTTPS on the target 2-core/4 GB VPS.
- No external search service, Redis, cloud storage requirement or automatic backups.

## Start a coding session

> Read AGENTS.md and the planning documents. Inspect git and docs/PROGRESS.md.
> Implement only the next unfinished step, with its tests. Preserve existing
> work and settled requirements. Run the prescribed checks, record actual
> outcomes including failures, and leave an exact handoff in PROGRESS.
> A blocked native/browser/Linux check is not a pass.

See PROGRESS for validation results and the exact next task.
Production deployment, performance and independent backup/restore drills remain
part of the final S18 gate; this repository does not claim product completion.
