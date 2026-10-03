# PandaNote — Architecture and technical contracts

## 1. Status and design rules

This is the proposed implementation architecture for the agreed product. Names and exact schema columns may evolve, but behavior in PRODUCT_SPEC must remain intact. Document material changes in PROGRESS.

- One SvelteKit/Node application instance; SQLite and private files on persistent local disk.
- SQLite is the source of truth. Search is derived and rebuildable.
- No external search service, location service, file storage service, or job broker.
- Render the initial authenticated view on the server, hydrate interactions, and fetch subsequent pages without full reloads.
- Browser drafts are device-local recovery storage, not offline synchronization.
- Keep server-only modules in SvelteKit's server directory; never bundle database/filesystem/secret code into the client.

## 2. Dependency and directory baseline

Use maintained, stable, mutually compatible versions, pin via package lock, and record versions during S00. Prefer supported Node LTS at implementation time; verify native modules in the Linux container.

Required families:

- SvelteKit, Svelte, TypeScript, adapter-node, Vite.
- better-sqlite3, Drizzle ORM/Kit. Raw SQL migrations for FTS5 are acceptable.
- remark/rehype/unified pipeline; GFM; sanitize; Shiki; Mermaid.
- Sharp.
- Maintained password/TOTP helpers; Node crypto for random tokens/AES-GCM where appropriate. Prefer Argon2id password hashing, with its memory cost benchmarked on the target VPS.
- One validation library such as Zod. One audited timezone utility, preferably Temporal with a polyfill if needed; do not hand-roll DST rules.
- Vitest, Playwright, ESLint/format checking.
- A maintained streaming archive library after a restore-safety spike. Do not shell out using user filenames.

Suggested layout:

```text
src/
  lib/
    components/          # shell, calendar, cards, composer, dialogs
    styles/              # tokens, themes, layout, Markdown styles
    shared/              # DTOs, validation types, pure query/tag utilities
    client/
      drafts/            # localStorage + IndexedDB repositories
      timeline/          # cursor state, scroll anchors, observer
      uploads/           # posting state machine
    server/
      db/                # schema, migrations integration, connection
      auth/              # account, sessions, TOTP, reauthentication
      notes/             # mutations, revision checks, queries
      tags/              # parsing integration, management, history
      search/            # normalization, query parser, FTS candidates
      attachments/       # private storage, Sharp processing, cleanup
      calendar/          # timezone boundaries and counts
      backups/           # creation, validation, restore coordinator
      settings/          # limits/preferences
      maintenance/       # write gate and filesystem journals
  routes/                # pages and internal authenticated endpoints
migrations/
tests/
  unit/
  integration/
  e2e/
  fixtures/
scripts/                 # setup, migration, reindex, explicit operator recovery
ops/                     # container/reverse-proxy examples and runbook
```

Do not add a generic repository/service abstraction for every table. Organize by domain and share small primitives.

### 2.1 S00 validated baseline and API findings

The runtime baseline is Node **24.21.0 LTS**, npm **11.x**. Direct dependencies
are exact-pinned in `package.json`; all resolutions are in `package-lock.json`.
See PROGRESS for the selected version inventory and actual host/Linux results.
`ops/Dockerfile.validation` pins a Debian bookworm/glibc Linux image by digest;
it is an initial validation image, not the final production deployment.

- **SvelteKit 3:** configuration is passed directly to `sveltekit({...})` in
  `vite.config.ts`, not `svelte.config.js`. `tsconfig.json` extends `$app/tsconfig`
  (generated inside `node_modules` by sync); hook types come from
  `@sveltejs/kit/hooks`. Origin/CSRF APIs must be rechecked against this installed
  major when S02 adds authorization. Do not copy outdated Kit 2 examples.
- **SQLite:** better-sqlite3 **12.11.1** is selected after 13.0.3 failed repeat
  `npm ci` on both hosts by triggering an unwanted default node-gyp rebuild.
  This is a compatible version selection, not a stack substitution. Real
  WAL/FULL/online-backup/trigram probes establish the capabilities, not the
  production connection/migration/search implementation.
- **Sharp:** `metadata().pages` identifies multi-frame GIF/WebP;
  `autoOrient()` before bounded resize/WebP corrects EXIF orientation. Outputs
  omit EXIF/ICC/XMP by default. Static GIF is accepted as a raster input;
  animations are rejected. Staging, queue/byte limits and cleanup remain S06.
- **Mermaid/CSP:** browser-only dynamic import, strict security and SVG-native
  labels work with `script-src 'self'` (no script unsafe-inline/eval). SVG styles
  require inline **style** allowance in this initial probe. DOMPurify plus a
  separate SVG policy removes foreignObject/scripts/links/external resources.
  Production directive overrides, complexity/timeouts and full attack fixtures
  must still be addressed in S04; the probe is not a production renderer.
- **Archive subset:** use streaming `tar-stream` plus Node gzip/crypto. The
  application-owned `.pnb` format initially emits only regular **USTAR** files
  with short ASCII paths; no directory/link/device or PAX/GNU extension entries.
  tar-stream consumes extension headers before entry callbacks, so a bounded
  raw-header guard is required **before** the parser to reject all extensions,
  followed by canonical path/type/allowlist/duplicate/size/checksum validation.
  This stricter subset needs no new archive service and avoids hidden overrides.
  S16/S17 must add the real manifest, immutable staged input, DB schema/key/file
  validation, safe second-pass extraction and journaled replacement.
- **Tooling:** Drizzle Kit's deprecated loader brings a vulnerable esbuild
  version. A scoped override of `@esbuild-kit/core-utils` to esbuild **0.28.2**
  removes that advisory without downgrading Drizzle. Revalidate the override
  during dependency updates and the S01 migration-generation gate.

All S00 helpers remain under `tests/spikes/`; no product domain module should
import them. The current public shell/health carry no private content. Private
storage begins in S01; central authorization and route privacy begin in S02.

## 3. Runtime storage

Environment-configurable root directory, separate from source/build/public assets:

```text
DATA_DIR/
  db/pandanote.sqlite
  files/<generated-id>/display.webp
  files/<generated-id>/thumbnail.webp
  files/<generated-id>/attachment.bin
  private/key-material.json
  staging/uploads/<batch-id>/...
  staging/backups/<job-id>/...
  staging/restores/<job-id>/...
  backups/<generated-id>.pnb
```

Names are generated IDs, never user paths. Retain original filenames in metadata, not storage paths. Database, WAL/SHM, files, keys, and backups need persistent volumes. Do not deploy SQLite on ephemeral serverless storage or across multiple app writers/network filesystems.

Deployment variables include `ORIGIN`, data-root location, proxy trust configuration, production/dev mode, and a one-time initialization mechanism. Never hardcode the domain. All stored attachment links are ID-based relative app routes, not absolute URLs.

Default disk reserve: greater of about 5 GB or 10% of total filesystem capacity; adjustable deployment setting. The reported 60 GB is shared with OS/container layers/staging/backups, not a promise of 60 GB usable attachments. Measure actual free bytes before expensive work.

## 4. Database baseline

Use foreign keys, WAL, busy timeout, and appropriate indexes. Start with `synchronous=FULL` to favor durability; change only after measured evidence and a documented risk tradeoff. Run migrations explicitly before serving production requests, not through schema-push shortcuts.

All times stored consistently as UTC integer milliseconds or equivalent explicit UTC representation. IDs are unguessable UUIDs; ordering ties use a documented stable ID comparison. No title column.

### 4.1 Tables

| Table               | Important fields / purpose                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `account`           | Singleton account ID, password hash, optional encrypted TOTP secret, TOTP enabled, last accepted TOTP time-step, security revision, created time                                                                   |
| `sessions`          | Hash of random session token, account ID, expiry, revoked state/security revision; never plaintext session tokens                                                                                                  |
| `auth_challenges`   | Short-lived pending MFA and fresh-auth grants; scoped, hashed, expiring; no full session before MFA success                                                                                                        |
| `recovery_codes`    | Account, code hash, consumed timestamp; consume atomically                                                                                                                                                         |
| `auth_rate_limits`  | Bounded persistent login/MFA attempt limits; expiry/cleanup policy                                                                                                                                                 |
| `notes`             | ID, Markdown body, status (`published`, `draft`, `trash`), prior status for Trash, `timeline_at`, immutable `created_at`, `updated_at`, nullable content-edited time, revision, nullable location fields           |
| `tags`              | ID, normalized unique key, display spelling                                                                                                                                                                        |
| `note_tags`         | Note/tag join, unique pair                                                                                                                                                                                         |
| `tag_changes`       | Rename/merge/removal history to detect stale local drafts; old normalized key, action/target, generation/time                                                                                                      |
| `attachments`       | ID, kind (`image` or `file`), original filename, detected MIME, incoming byte digest for retry identity, byte sizes/checksums for stored variants, dimensions, readiness, pending batch association, creation time |
| `note_attachments`  | Note/attachment join, kind/order; permits safe reference reuse when cloning a conflicted note                                                                                                                      |
| `upload_batches`    | Account, client mutation ID, creation/activity times, status; pending ready files used by posting retries                                                                                                          |
| `mutation_receipts` | Unique client mutation ID, request digest, compact successful result, timestamp; inserted atomically with the note change                                                                                          |
| `app_settings`      | Timezone, appearance preferences, session lifetime, upload/image limits, schema for validation                                                                                                                     |
| `backup_jobs`       | ID, state, archive path, progress/result metadata; never embed existing archives in backups                                                                                                                        |
| `file_cleanup_jobs` | Paths/IDs eligible for safe deletion after committed reference removal; crash-recoverable cleanup                                                                                                                  |
| `note_search`       | Rebuildable normalized searchable fields/text keyed by note ID                                                                                                                                                     |
| `note_search_fts`   | FTS5 trigram index over derived normalized search text                                                                                                                                                             |

Indexes at minimum:

- `notes(status, timeline_at DESC, id DESC)`.
- `note_tags(tag_id, note_id)` and unique `note_tags(note_id, tag_id)`.
- `note_attachments(attachment_id, note_id)` and note-order access.
- Unique tag normalized key, mutation ID, upload file/batch identity.
- Session hash/expiry; unconsumed recovery-code lookup; pending cleanup state.

### 4.2 Invariants

- Location latitude/longitude are both absent or both valid. Latitude [-90,90], longitude [-180,180], accuracy null or nonnegative finite meters. Label has a bounded length.
- All normal queries explicitly select published notes; draft/trash views opt into their own statuses.
- Every update to a note, including status/tag/date changes, increments revision.
- A Trash note remembers the status to restore.
- Content, extracted tags, attachment links, derived search text, and mutation receipt change in one SQLite transaction.
- A committed note references only ready, authorized attachments.
- Deletion of one reference does not destroy a file still referenced elsewhere.
- TOTP/recovery/session security data do not appear in client account DTOs.
- Permanent note deletion enqueues eligible file cleanup. Filesystem deletion is not treated as an atomic part of a SQLite transaction.

Use a read-only test inspection connection to assert these invariants; mocks alone are insufficient.

### 4.3 S01 persistence contracts and implemented choices

- `schema.ts` defines 17 domain tables and their indexes/checks. The first two
  migrations contain generated table SQL and custom invariant triggers. FTS5 is
  deliberately deferred to S10; `note_search` reserves a normalized body plus
  separate JSON arrays of tag and filename fields, with source revision. It is
  derived data, not a product search service yet.
- `npm run db:migrate` is explicit operator initialization/upgrade, from the
  repository root while the app is stopped. It seeds settings only, never an
  account or notes. The runner consumes Drizzle SQL/journal files with a custom
  contiguous SHA-256 ledger and `user_version`; hashes normalize CRLF to LF.
  All pending SQL/ledger changes and integrity checks run in one IMMEDIATE
  transaction. Modified histories, unknown DBs and downgrades fail closed.
  See `migrations/README.md`. Runtime opens only the current migrated schema.
- UTC epoch milliseconds are numeric, IDs are lowercase UUIDv4, ordering ties
  use SQLite's default BINARY text ordering. Note triggers preserve ID/creation
  time and require revision exactly +1 for every row update. Service-layer
  expected-revision predicates, content-edited timing and atomic joins/search/
  receipts remain required when S07 implements note mutations.
- A ready attachment cannot be linked if queued for cleanup; an attachment with
  any note reference (including Trash) cannot have its metadata changed or be
  deleted. Cleanup records use generated attachment IDs, never arbitrary paths.
  Enqueueing is transactional and idempotent; byte deletion/worker recovery is
  S06/S07, not claimed in S01. Metadata stays until safe cleanup is complete.
- `PrivateStorage` resolves operator-configured `DATA_DIR`, requires an absolute
  production path, rejects source/build/public roots and symlink/junction paths,
  and uses generated IDs/known variants only. POSIX directories are `0700` and
  keys/DB/WAL/SHM `0600`; Windows needs operator-set NTFS ACLs. The private tree is
  trusted against writes by other UIDs, not an OS attacker controlling the app UID.
- Portable key material is a versioned JSON file containing a random key ID and
  32-byte TOTP encryption key. Exclusive, fsynced creation never overwrites keys;
  missing keys alongside an existing DB are an operator-recovery failure.
  S02 defines authenticated AES-GCM encryption/enrollment, not S01.
- Settings are singleton validated JSON, schema version 1, with the agreed
  appearance/upload defaults and a seven-day session lifetime. Initial timezone
  is **UTC** until setup/settings explicitly accepts the browser proposal;
  never use the VPS timezone as a silent default.
- `Persistence.write` always acquires the shared coordinator and runs a
  synchronous IMMEDIATE Drizzle transaction. `writeAsync` leases protect future
  filesystem operations; exclusive maintenance refuses new writes and drains
  active leases with a bounded timeout. Exclusive capabilities expire on exit;
  close drains and permanently closes the coordinator. Domain code must not
  bypass this using the exposed low-level migration/online-backup handles.
- Journals use bounded validated private JSON and fsynced single-file replacement.
  Pending journals block normal initialization/opening. This is a primitive, not
  the S17 journaled multi-directory restore/recovery state machine.
- Shared DTO/validation modules contain no secrets or server dependencies.
  Kit 3 uses package `imports` mappings for `#lib`/`#lib/*`, not implicit `$lib`.
  Real production-build tests reject direct and indirect browser imports of
  persistence (test child processes disable inherited Vitest/Kit test mode).
  The operator CLI uses Node 24 native TS stripping; its import graph must use
  erasable syntax and explicit relative `.ts` imports.

## 5. Internal endpoints and DTO contracts

Exact path names can change, but define and test typed contracts before client integration. This is an internal API inside SvelteKit, not a separately deployed backend.

Suggested domains:

- Auth: login/password challenge, MFA completion, logout, enrollment/verification, recovery regeneration, fresh authentication, session revocation.
- Notes: list/get, create, optimistic update, move-to-draft, trash/restore/permanent-delete, server draft list.
- Tags: list/counts/autocomplete, management preview and execute.
- Search: may share note-list endpoint with parsed filters.
- Calendar: month counts given year/month; month/year jump uses note listing.
- Attachments: initialize/resume post batch, upload item, ready status, authorized variant GET/download.
- Settings: read/update preferences and limits/storage information.
- Backups: create/status/list, protected download/delete, restore upload/validate/confirm/status.

Request conventions:

- Runtime validation on every server boundary; bound body/query sizes. Initial safety defaults: at most 1 MiB UTF-8 Markdown and 100 attachments per note, independently of per-file limits; keep these documented and configurable where useful.
- Mutations require same-origin protection, authenticated account, appropriate fresh-auth grant, expected revision when applicable, and client mutation ID when retriable.
- Cursor encodes `(timeline_at, id)` and is bound to canonical filters; reject a cursor from a different query rather than mixing pages.
- Use half-open UTC ranges `[start,end)` for selected local calendar dates/month anchors.
- GETs do not mutate user content. Login/session maintenance is narrowly scoped.
- Errors use stable codes plus safe user-facing messages: validation, unauthorized, fresh-auth-required, conflict, storage-full, upload-failed, busy/maintenance, invalid-backup.
- 409 conflicts include current note revision and a safe server snapshot needed for comparison.
- Never send raw stacks, disk paths, SQL, or secret material to the browser.

## 6. Browser draft storage

### 6.1 Identity and schema

Persist each local draft separately to avoid rewriting a huge monolithic list. Keep a small index for listing; rebuild index if inconsistent. Prefix by app/origin and account ID. Version the schema and migrate explicitly.

Suggested local draft record:

```text
schemaVersion, localDraftId, accountId
kind: new | edit-published | edit-server-draft
serverNoteId?, expectedServerRevision?
bodyMarkdown, timelineAt, location?
attachmentDescriptors[] (local ID or existing server ID, display metadata)
createdLocallyAt, modifiedLocallyAt
postingAttempt? (mutation ID, frozen payload digest, uploaded-ready map)
```

No stored title; use excerpts. `localStorage` holds text/metadata; IndexedDB holds blobs keyed by draft and attachment ID. Existing server files are references, never duplicated into IndexedDB automatically.

### 6.2 Recovery and consistency

- Debounce text writes briefly; flush on blur/visibility change where possible, but do not rely only on unload events.
- Persist attachment blobs first; update text/reference record only after blob persistence succeeds. Handle crash-created orphan blobs with reconciliation.
- On reopen, reconcile missing blob references and give a repair/removal action; never post broken image references silently.
- Request `navigator.storage.persist()` where available; report failure/quota errors without claiming guaranteed persistence.
- Do not mark text saved if localStorage throws.
- Pause unsafe in-progress payload edits during a post, or snapshot them separately. The frozen retry payload must not change under the same mutation ID.
- Cross-tab changes use storage/BroadcastChannel notifications with draft revision checks; prevent silent overwrites by two tabs editing one draft.
- Signing out stops access to draft UI and warns drafts remain on that device; do not silently delete them. Browser-local data is not cryptographically protected from someone controlling that browser.
- After restore, check server revision/identity before associating local edits; do not upload stale local drafts automatically.

## 7. Attachment representation and posting protocol

### 7.1 Stable IDs

Allocate attachment IDs with `crypto.randomUUID()` locally. Use an internal Markdown reference such as `![alt](attachment:<uuid>)` for images. It is not a real external protocol. A Markdown plugin resolves only validated attachment IDs into authenticated relative URLs (server note) or temporary blob URLs (local preview).

- Validate image references against the draft/note's attachment descriptors.
- Ordinary file rows use metadata rather than invented Markdown links.
- Sanitize after internal-link resolution; allow only known generated image routes/blob URLs in the appropriate preview context.
- Never accept arbitrary `attachment:` path fragments or external active URLs.
- Revoke temporary blob URLs on view close/replacement; do not persist blob URLs.
- IDs let local Markdown remain unchanged when files upload.

### 7.2 State machine

```text
local-draft
  -> frozen-post-attempt
  -> uploading / processing
  -> committing-note
  -> confirmed
  -> remove local recovery data
```

Failure returns to recoverable local state while retaining retry metadata. No optimistic deletion of local storage.

1. On Post/Save changes, freeze payload and generate a unique mutation ID.
2. Check for an existing successful mutation receipt first; if present, resolve the original success without re-uploading. Otherwise initialize/resume its batch. Do not initialize this automatically when merely selecting a file.
3. Upload new blobs with stable attachment IDs; server validates ownership/ID/batch and processes images.
4. Retry queries readiness before resending successful files. Detect mismatched bytes/type for an already-used ID.
5. Commit body/date/location/attachments with mutation ID and expected revision.
6. Transaction checks status/revision, resolves tags, inserts note changes/search/joins and success receipt.
7. Response loss is safe: retry sees the same mutation ID and returns the original successful result. Different payload under an existing ID is rejected.
8. Only confirmed success clears local blobs/records. Content typed after the snapshot, if allowed, must survive in another draft rather than being cleared.

Use pending uploads for interrupted attempts only, not permanent published originals. Abandoned unreferenced ready files are visible in Settings cleanup. Implement safe startup cleanup of temporary original processing files; deletion of recoverable ready retry files is explicit/manual initially.

### 7.3 Server processing

- Streaming byte-count limit while receiving, not just trusting Content-Length.
- Detect/decode file contents for images; never trust extension/client MIME. Recognized raster images follow the WebP processing policy even when chosen through the generic file picker; do not accidentally retain an original by labeling it an ordinary file.
- Reject animations by frame/page metadata before processing; test animated WebP/GIF and static GIF policy.
- Reject SVG-as-image initially to avoid external resource/active content surprises; it can be an unchanged downloadable file attachment.
- Sharp corrects orientation, limits decoded pixels, resizes without enlargement, strips metadata, outputs only display/thumbnail WebP.
- Bounded queue/concurrency=1; bound queue length and processing deadlines. Native-library caches/concurrency must be measured on 4 GB RAM.
- Delete temporary originals on success/failure/restart cleanup. Do not retain originals for retries on the server.
- Store result dimensions, exact output byte sizes, checksums.
- Files download with `Content-Disposition: attachment`, safe filename escaping, `nosniff`, and conservative MIME where needed.
- Image/file routes authenticate requests; backups have extra fresh-auth checks. No directory listing.

## 8. Search details

### 8.1 Normalization and semantics

Initial default normalization: Unicode NFKC, then deterministic lowercase for search/tag identity. This intentionally treats width variants equivalently and ignores English case; it does not convert Han variants/readings or remove arbitrary accents. Keep original Markdown unchanged.

Parse unquoted whitespace-separated terms and double-quoted phrases. All parsed units are ANDed. Define escaping for quotes/backslashes; malformed quotes get a helpful validation error rather than changing meaning silently. Cap query length and unit count (initial defaults 256 characters / 20 units).

Search fields: Markdown source, canonical tags, attachment original filenames. A unit may match any field; different units can match different fields. Phrase matching must not falsely join unrelated fields. Parameterize queries; LIKE `%`/`_` and FTS operators are literal user data unless part of the explicitly supported query grammar.

### 8.2 Trigram acceleration

Use FTS5 `tokenize='trigram'` over normalized derived text. S00 must prove this SQLite build supports FTS5/trigram.

- For a suitable unit of >=3 Unicode codepoints, safely quote it in FTS MATCH as a literal candidate query. Do not concatenate raw user input as FTS syntax.
- Candidate intersection can narrow results for multiple indexable units.
- Always apply the literal semantic predicate to candidates. FTS is an accelerator, not the definition of a match.
- One/two-codepoint units and any unsupported edge cases use `instr()` or equivalent literal scanning on normalized fields.
- If no unit is indexable, scan the filtered published set. Tag/day/cursor predicates still apply.
- Keep candidate and fallback ordering identical, then cursor-paginate.
- Handle literal punctuation/emoji/combining sequences through oracle-based tests. If FTS would omit valid candidates for a unit, use fallback for that unit.
- Search updates happen in the same transaction as note/tag/file-name changes. No asynchronous index lag/service.
- Reindex command recreates search data from source notes, never changes note content.

Safe snippets are escaped text plus structured highlight ranges/segments, not database-produced trusted HTML. If normalization changes positions, use a tested original-to-normalized mapping or return a clearly safe normalized excerpt; do not corrupt original saved text.

## 9. Tag parsing and management

Implement one shared parser over Markdown AST text-node source spans, not a global regex over the whole note. Original source offsets are needed for precise rename/remove edits.

Initial grammar:

- Hashtag marker at start or after whitespace/opening punctuation.
- Body allows Unicode letters/numbers/combining marks, underscore, and hyphen.
- Ends at whitespace/other punctuation. Slash is not a nested-tag operator.
- Escaped markers, code, raw HTML, URL destinations, and heading marker runs are ignored.
- Limit tag length/count with documented validation defaults (e.g. 64 codepoints/tag, 100 unique tags/note).

AST source-span tests must cover escape handling: parsed text can differ from original source. Preserve formatting by replacing spans from the end toward the start, not serializing the whole AST on tag rename.

Tag management:

1. Preview affected counts and action.
2. Execute one transactional rewrite (for personal-scale data); for unexpectedly large changes, use a bounded maintenance job with explicit locking.
3. Change matching hashtag source spans only, update joins/search, increment all affected revisions.
4. Record rename/merge/removal history; collapse merges/deduplicate note joins.
5. Offer stale-tag resolution before committing a browser-local draft. Preserve that draft while waiting for user confirmation.

Case-only display changes and rename to an existing normalized tag need explicit semantics; use merge confirmation for the latter. Removal removes only the hashtag token; do not strip surrounding prose or unrelated spaces beyond necessary display cleanup.

## 10. Timeline/calendar mechanics

### 10.1 Ordering and loading

Ordering: `(timeline_at DESC, id DESC)`. Default page size about 30; server maximum 100. Cursor pagination, not offsets. Deleted/changed notes should not duplicate across fetched pages; list state deduplicates by ID and refreshes visible versions after mutations.

Initial unfiltered anchor: current month in app timezone. Loading older can cross months in one page. Search/tag mode anchors at newest matching result across all months. Explicit month jump uses an exclusive month-end bound and initially verifies whether that month has matching notes; an empty selected month stays visible until another action.

Use IntersectionObserver relative to the actual note scroll container for:

- Bottom sentinel loading older notes.
- Stable top-visible-card/month tracking (including tall cards).
- Lazy expensive rendering when appropriate.

Avoid a calendar observer causing a fetch that moves the same scroll position repeatedly. Distinguish navigation-driven anchor changes from scroll-driven calendar display changes. Scroll-driven month tracking must not add a new browser-history entry per card/month; use replace/state restoration rather than flooding Back navigation.

First implement bounded paging and normal DOM cards; measure before adopting virtualization. If very long scrolling grows DOM/memory, trim distant pages while preserving measured spacer heights and restoring scroll anchors. Do not virtualize aggressively before Mermaid/images/card expansion are stable.

### 10.2 Timezone correctness

Persist one IANA timezone, initially proposed from browser detection. Changing browser/system/VPS timezone does not override it.

Compute local day/month start and next start using the timezone utility, convert to UTC, query `[start,end)`. Never assume a day is exactly 24 hours. Counts for a displayed month use all published notes. Cache only with keys including timezone/month and invalidate after publish/date/status/trash/restore/timezone changes.

Backdating defaults to local app time. User-entered DST-ambiguous/nonexistent times must be handled deliberately with validation or documented disambiguation.

## 11. Rendering and frontend performance

- SSR first note page/basic content; keep initial payload bounded and never fetch all notes.
- Keep Mermaid out of the initial bundle for pages without diagrams.
- Shiki initializes lazily and caches by code/language/theme configuration. Reuse resources instead of loading grammars per card.
- Server Markdown rendering may cache by note revision/theme; local preview is debounced. No global unbounded content cache.
- Shared sanitizer policy blocks scripts, event handlers, unsafe schemes, active raw HTML. Mermaid SVG needs a separately tested SVG sanitizer policy that preserves safe diagram elements without allowing script/foreignObject/external links.
- Disable Mermaid click callbacks/external sources; set SVG-native labels instead of unsafe HTML labels where required by the sanitizer. Complexity/size limits and timeout/error fallback prevent a malformed diagram locking the interface indefinitely.
- Copy code reads saved code text directly.
- Image dimensions and lazy loading avoid layout jumps; viewer-only large image fetching.
- Dark mode/density/collapse changes preserve scroll context as reasonably possible.
- Detail modal is URL-addressable, accessible, and SSR/direct-navigation capable. Browser Back closes it without losing timeline state when opened from timeline.

## 12. Authentication and threat boundaries

### 12.1 Initialization

No unauthenticated open registration. A new empty deployment needs a one-time setup token generated/displayed through VPS/CLI access (or supplied securely via environment). Setup consumes it and creates the sole account. Never enable a predictable public setup page on an empty database.

A fresh replacement VPS can initialize temporary access, then use Settings to restore; restored account credentials replace the temporary ones. Document this workflow.

### 12.2 Sessions and login

- Argon2id with random salt, target measured cost that fits 4 GB under bounded concurrent logins.
- High-entropy random session token, only its hash stored. HttpOnly, Secure in production, SameSite cookie; appropriate path/expiry.
- Password success with enabled MFA creates only a short-lived challenge, not an authenticated session.
- Challenge limits and password/MFA rate limits work across restarts; bound their tables and avoid unlimited per-IP memory.
- Trust forwarded client IP only from configured reverse proxy. Account-wide limits complement IP limits; do not make permanent lockout easy.
- TOTP drift small and explicit; reject replay of an already consumed step. Recovery-code consumption atomic.
- TOTP secret encrypted at rest with a random server key kept in private persistent key material. Full backups include the key needed for portability; therefore unencrypted archives remain sensitive.
- Security changes rotate session/security revision and revoke appropriate sessions.
- Fresh-auth grants short-lived (initial default 5 minutes), scoped to sensitive actions, not a reusable full privileged cookie for hours.
- Backup downloads have authenticated/fresh-auth headers and no public cache. Log safe audit events without secrets.

### 12.3 Common protections

Same-origin/CSRF enforcement for all mutations, including uploads. Tight trusted origin configuration; no wildcard CORS. SSR must not leak another view's server drafts or auth secrets. Security headers: `nosniff`, referrer policy, frame protection, compatible CSP. Verify sanitizer/Mermaid policies with CSP rather than using broad unsafe exemptions.

LocalStorage/IndexedDB contents are plaintext in that browser. MFA protects server access, not a compromised device/XSS or a downloaded unencrypted backup. Explain these limits accurately.

## 13. Full backup/restore design

### 13.1 Format

Initial format: `.pnb` streaming tar.gz archive with manifest, using the regular-file-only USTAR subset validated in section 2.1 (no PAX/GNU extensions). Format version separate from database schema/app version. No encryption or separate password. Checksums detect corruption, not authenticity or confidentiality.

Archive contents:

```text
manifest.json
snapshot/pandanote.sqlite
snapshot/key-material.json
files/<generated-id>/<known-variant>
```

Manifest includes format/schema/app compatibility versions, created time, entry paths/sizes/SHA-256 checksums, note/attachment counts, and clearly described included/excluded sections. The manifest lists payload checksums, not its own recursive checksum. Do not include source archive/backups/staging/WAL/live session credentials.

The snapshot includes account/MFA/recovery-code state and settings. Remove sessions/challenges/rate-limit runtime state, upload batches, unreferenced/pending attachment rows, pending cleanup jobs, and source backup-job paths from the staged database. Preserve useful successful mutation receipts for included notes so a recovered client can recognize a previously committed post. Clear pending batch associations on referenced ready attachments. Rebuild search after restore.

Backup-job records from the source are not valid paths on a destination; reset the catalog and rediscover existing completed destination archives using bounded, validated manifest reads. Never include those archives in the restored source payload or automatically delete them.

### 13.2 Consistent creation

A single in-process maintenance/write coordinator protects file/reference changes and security/settings writes during snapshot capture. All persistent mutations must pass through it; it cannot be an unused helper.

1. Fresh-auth gate, free-space estimate, allocate private staging job.
2. Enter brief snapshot capture state; drain bounded active writes/uploads as needed and block new mutations with a clear retryable response. Reads may continue.
3. Use SQLite online backup API to produce a consistent staged DB. Never copy a live main DB while ignoring WAL.
4. Capture the referenced immutable files and portable key material consistently. Never modify stored attachment bytes in place. Prevent deletions/key rotation during capture; same-filesystem hardlinks/reflinks can keep the gate brief, with copy fallback if needed. Archive captured content as regular files, not hardlink entries. Do not rely on mutable file paths changing under the archiver.
5. Release write gate once an immutable snapshot is captured; archive/checksum in the background with bounded resource use.
6. Remove transient/session data from staged DB, generate manifest, write archive to temporary path, verify, atomically rename completed archive, mark complete.
7. On failure delete incomplete staging/archive, retain live app data, report error. Never mark partial file complete.

Manual creation can be a long-running job polled by the UI, not a request forced to finish within proxy timeout. No cron/scheduled creation. Keep backup creation/status history safe across process crash.

### 13.3 Restore validation

Uploaded backup stays private and staged until explicitly confirmed. Limit uploaded bytes and expanded bytes/file count using manifest and actual streaming counters; account for originals plus incoming archive plus expanded snapshot/rollback within 60 GB.

Reject:

- Absolute paths, drive paths, `..` traversal, NULs, normalized escape paths.
- Symlinks/hardlinks/devices, duplicate/unexpected entries, archive path tricks/PAX overrides.
- Unsupported schema/format, missing keys/files, size/checksum mismatches, invalid DB integrity/schema, attachment/database inconsistencies.
- Decompression bombs/too many files; canceled/incomplete uploads.

Inspect the staged SQLite DB read-only with extensions disabled and `trusted_schema=OFF` where supported. Compare schema objects against the application's known migration-produced schema; reject unexpected triggers/views/virtual-table modules or altered security-critical structures, not just a matching schema-version number. Validate singleton account, settings, IDs and file references. Never execute SQL supplied by the manifest/archive. Migrate only through trusted application migrations on a disposable staged copy. Do not allow downgrade restores from unknown newer schema.

### 13.4 Safe replacement

1. Validate archive completely; show summary; require fresh authentication and explicit replace confirmation.
2. Enter maintenance mode, block writes, drain active work.
3. Prepare a restore journal and retain old DB/files/key material as rollback set. Close DB handles before replacement, especially on Windows. Clear stale WAL/SHM safely.
4. Swap the whole staged state using a journaled procedure on the same filesystem; there is no magical atomic rename across multiple independent directories.
5. Reopen DB, apply approved migrations/reindex, integrity-check, revoke sessions/challenges, reset derived catalogs, load restored keys/settings.
6. On success exit maintenance, force login, clean temporary rollback state after health validation. Never auto-delete unrelated completed user backup archives.
7. On failure restore previous state. On crash, startup reads the journal and completes or rolls back before accepting writes. The operator runbook must document recovery if the process cannot start.

Domain/origin/data-root and deployment TLS configuration are not overwritten by archived source settings. Local browser drafts are untouched; they may need conflict checks after restored revisions change.

## 14. Testing, observability, deployment

See ACCEPTANCE_TESTS for detailed cases. Tests must exercise the production SQLite tokenizer, actual filesystem authorization/cleanup, browser reload recovery, and restore crash boundaries.

Log structured safe events/timings/errors. Health endpoint reports readiness without note/account/disk-path details. Storage usage and job errors are visible in Settings. No third-party analytics requirement.

Deploy one Node instance behind HTTPS reverse proxy, with persistent DATA_DIR and pinned container image. Configure request size/timeouts suitable for files/backups without buffering all uploads in memory. Allow graceful shutdown and migration/restore maintenance. Use a Linux image with compatible libc/native builds; verify Sharp and better-sqlite3 rather than assuming Windows artifacts work.

Performance figures in ACCEPTANCE_TESTS are initial budgets to measure, not guarantees. Search/image/backup workloads are the main risks on a 2-core/4 GB machine.
