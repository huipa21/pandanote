# PandaNote

A single-user, responsive, Markdown-first personal notebook. Notes have no separate
title field. The app includes a memory-only editor, a chronological timeline,
multilingual literal search, tags, a month calendar, private attachments, optional
location, conflict detection, Trash, optional TOTP, and manual full backup/restore.

**Implemented and locally verified, not a final production release.** Setup and
minimal container deployment are implemented; the outstanding SS01 directory-exchange
clarification and S18 real-VPS/device/screen-reader/release-commit checks remain open.
See [current progress](docs/simplify-setup/PROGRESS.md) and
[release measurements](docs/RELEASE_RESULTS.md).

## Production deployment

You need a Linux server with Docker + Compose v2, an existing Caddy container on
an external network (`proxynet` by default), and a DNS name pointing to the server.
PandaNote adds **one app container**, not another database or proxy service.

From a clean, committed, full-history checkout with Node **24.21.0** and Docker or Podman:

```sh
npm run image:build -- --platform linux/amd64
# Docker build machine:
docker image save -o pandanote-image.tar pandanote:latest
# OR Podman build machine:
# podman save --format docker-archive -o pandanote-image.tar localhost/pandanote:latest
gzip -6 -c pandanote-image.tar > pandanote-image.tar.gz
gzip -t pandanote-image.tar.gz
sha256sum pandanote-image.tar.gz > pandanote-image.tar.gz.sha256
scp pandanote-image.tar.gz pandanote-image.tar.gz.sha256 docker-compose.yml .env.example user@server:~/pandanote/
```

On the Docker server:

```sh
cd ~/pandanote
sha256sum -c pandanote-image.tar.gz.sha256
gzip -t pandanote-image.tar.gz
docker image load -i pandanote-image.tar.gz
# Only for a Podman-built archive:
# docker tag localhost/pandanote:latest pandanote:latest
cp .env.example .env
chmod 600 .env
nano .env                       # set ORIGIN=https://notes.example.com
docker compose up -d
```

These filenames must be unused; retain prior archives/images. Compression preserves
the raw tar. Raw transfer remains supported: copy `pandanote-image.tar` and load with
`docker image load -i pandanote-image.tar`. Checksums detect corruption, not authenticity;
use trusted build/transfer channels. Neither gzip nor an image archive is an app backup.
Create the destination folder before transfer. Docker's containerd image store may
already save compressed layers, so outer gzip savings vary by engine.

Add to your existing Caddyfile and reload Caddy:

```caddyfile
notes.example.com {
	reverse_proxy pandanote:3000
}
```

Open the domain within **60 minutes of process start** and complete setup:
username, required email, password + confirmation, then site title, language and
timezone. **The first visitor owns the empty instance**; claim it promptly or keep
public access restricted until you are ready. If setup expires, restart PandaNote.
There is no setup secret or manual database initialization command. An unfinished
preferences step resumes after login. An existing account cannot be replaced by
setup. Email is not verified and no email is sent.

Full install, environment, upgrade, immediate database-copy rollback, password
reset and troubleshooting instructions: **[ops/DEPLOYMENT.md](ops/DEPLOYMENT.md)**.
Only one process may use a data folder; keep it on persistent local disk. Never
publish port 3000, store data in public assets, or run a second instance on the same
folder. The brief root initializer prepares only `/data`, then permanently drops
privileges to PUID/PGID (default 1000:1000); the server is PID 1 with no capabilities.

### Release identity

`npm run image:build` selects a running Docker engine, then Podman; use
`--engine docker|podman` to override or `--platform linux/arm64` for an ARM server
(only AMD64 is validated). The wrapper needs no host `npm ci`: both image install
stages include native compilation tools, not the runtime stage. Builds need working
package/Node-header connectivity. Production uses digest-pinned Node 24.21.0 Alpine
(musl), with a separate `ops/runtime` lock, explicit runtime peers, optional Sharp
musl/libvips packages and dependency maps pruned before COPY. Browser Mermaid and
DOMPurify remain in the built client; Kit/Svelte/Shiki/source maintenance stay usable.
Measured packaging/regression evidence: [image optimization](docs/image-optimization/PROGRESS.md).

The command rejects dirty/shallow checkouts, archives committed source only, and
updates **`pandanote:latest`** plus **`pandanote:YYMMDD-N`**. The version uses the
UTC committer date and same-day first-parent sequence, not build time. The full
hash is authoritative. Inspect with `npm run version:release` or:

```sh
docker image inspect pandanote:latest --format '{{json .Config.Labels}}'
```

OCI labels match sidebar/mobile drawer and Settings → About. Runtime environment,
domain, timezone, restarts and restores cannot change the embedded identity.
Ordinary local builds say **Development**. Keep the old image before replacing
latest; set `PANDANOTE_IMAGE=pandanote:<version>` in `.env` to pin it.
Details: [VERSIONING_PLAN.md](docs/VERSIONING_PLAN.md).

### Runtime lock and size reporting

After changing dependency pins, update the reviewed runtime manifest/lock as described
in [ops/DEPLOYMENT.md](ops/DEPLOYMENT.md#14-runtime-lock-and-image-measurements).
`npm run runtime:check` (also a build prerequisite) rejects missing/extra/drifting roots
and stale locks; ordinary image installs never regenerate locks or repair at startup.

With development dependencies installed:

```sh
npm run image:inspect -- --archive pandanote-image.tar.gz --gzip-level 6 --output .browser-spike/image-size.json
```

Create the ignored output directory first; report creation is exclusive (no overwrite).
The read-only streaming reporter handles Docker manifests, legacy aliases and
compressed layer blobs; it reports archive/hash/platform/identity, stored versus
decoded layer tar and cumulative package/map payload. Categories overlap. Engine
image size, saved archive size, gzip transfer bytes and application RSS are different.

## Local development

Use Node **24.21.0 LTS** (`.node-version`) and npm 11. Verify npm's child processes
also use that Node version, especially on Windows. Dependencies are exact-pinned
with a committed lockfile.

```sh
node --version
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173`. No `.env` is needed locally: non-production defaults
are `DATA_DIR=./data` and the local origin (5173 for dev, 3000 for built start).
For a built local server, run `npm run build && npm start`. Do not copy the
production HTTPS origin into local development unless deliberately testing a proxy.
`dev`, `start` and maintenance tools load a private `.env` if present; actual
environment variables win. Production requires canonical `ORIGIN` (HTTPS outside
loopback) and an absolute private data path; the image forces `/data`.

Startup recovers interrupted restores before reading keys/SQLite, applies trusted
SQL + registered data migrations, then initializes settings **before listening**.
Requests never migrate. Pending upgrades of existing databases first make a private
WAL-consistent online DB copy in `data/pre-upgrade/`; fresh/current databases skip it.
Insufficient space or failed migration prevents serving and leaves the database
unchanged. This latest-only copy excludes keys/files and is **not a full disaster
backup**. Directory replacement is durable journaled rotation, not a single atomic
exchange (the SS01 clarification is still open). Pre-release data/archives are
refused, not upgraded. See [migrations/README.md](migrations/README.md).

Linux data directories are `0700`, database/WAL/SHM/keys `0600`. Windows requires
operator-managed NTFS ACLs; POSIX mode bits are not ACL protection. Missing keys
alongside an existing database fail closed. `/health` reveals only readiness:
`ok`, `maintenance`, or HTTP 503 `unavailable`, never paths or account state.

### Startup fails with “Applied migration history does not match”

The selected data folder does not match this build's trusted SQL/data-step history.
The approved no-drafts change replaced the fresh-install baseline without an old-data
migration. Earlier development databases remain incompatible even when both report
schema version 2. A mismatch can also mean altered migration files; do not assume
that changing the stored hash makes the database compatible.

No reset or upgrade is performed on this refusal. **Keep the entire old data folder**
(database, keys, files, and any WAL/SHM sidecars). To access its data, use the matching
older PandaNote build; older-baseline archives cannot be restored into this build.
Do not delete individual database/key files or edit the migration ledger.

To start the current build fresh, stop PandaNote and select a **new, unused private
folder**. For local PowerShell development:

```powershell
$env:DATA_DIR = Join-Path $PWD 'data-current'
npm run dev -- --host 127.0.0.1
```

Use a different name if `data-current` already contains data. This leaves `./data`
untouched and starts browser setup again. Keep the same `DATA_DIR` on subsequent
starts (or save it in your private `.env`); otherwise startup selects the old folder.
For Compose, stop the service, set `DATA_PATH` in `.env` to a new unused private host
folder, then recreate the service with `docker compose up -d`. An existing production
folder needing migration requires a separate compatibility plan, not this fresh-start
workaround. Recovery reference: [migrations/README.md](migrations/README.md).

## Authentication and Settings

- Username: trimmed/lowercased, 3–32 ASCII letters/digits/`.`/`_`/`-`.
- Password: exact **8–128 Unicode characters**, at most 1024 UTF-8 bytes, no trimming,
  normalization or complexity rules. Argon2id uses 64 MiB / three passes / one lane;
  bounded hashing and persistent IP/account limits protect the small server.
- Optional TOTP: confirmed enrollment, six digits/30-second steps/±one-step drift,
  replay protection, encrypted secret. Exactly ten single-use recovery codes are
  shown/downloadable at generation only; they substitute for TOTP, not the password.
- Sessions: hashed random tokens, HttpOnly/SameSite=Strict, Secure in production;
  seven-day default, configurable 1–30 days. All-device signout is available.
- Sensitive security/account/backup/restore actions require fresh password and
  TOTP/recovery when enabled. Single-use scoped grants expire after five minutes.
- General: plain-text site title and language. English is complete; **Simplified
  Chinese is partial** (setup/login/MFA, navigation, General/Account); other strings
  fall back to English. Note content is never translated. Saved language controls
  `<html lang>` and the title appears in tabs, sidebar/mobile header and login.
- Account: username/email changes require fresh authentication, without signing
  out existing sessions. Email is private metadata, not email recovery.
- Calendar/Appearance/Storage: named app timezone, week start, light/dark/system,
  density, card collapse and bounded upload/image/note limits.

Same-origin checks protect all mutations. Leave adapter forwarding overrides unset.
Rate-limit IP uses the TCP peer; loopback/private/link-local peers may supply exactly
one valid XFF address, absent headers fall back to the peer, invalid/chained headers
fail with 400. Public peers cannot spoof XFF. Default Caddy forwarding works without
custom headers or body-size options. The image transport limit is 64G; smaller domain
limits remain authoritative. See the deployment guide for other reverse proxies.

### Lost password or MFA (operator access only)

```sh
docker compose run --rm pandanote reset-password
# Locally: npm run reset-password
```

Requires an interactive terminal, no arguments or piped input. It displays the
username and asks twice **without echo**. One transaction changes the password,
disables MFA/recovery codes, revokes sessions/challenges and clears all sign-in rate
limits, preserving notes, files and settings. It works with the app running; old sessions fail on their next
request, without restart. Missing accounts or pending recovery journals refuse.
Re-enable MFA afterwards. There is no public reset endpoint. See the
[restore/recovery runbook](ops/RESTORE_RUNBOOK.md) for an app that cannot start.

## Writing and reading

- Textarea Markdown editor, Write/Preview and expanded/mobile editing. **Only Post**
  publishes; Enter and Ctrl/Cmd+Enter never publish. Published edits use Save changes.
- One unsaved editor per tab holds text/metadata/files **in memory only**. No drafts,
  localStorage/IndexedDB content, autosave or recovery after reload/crash. To keep
  unfinished writing, Post it as a note and edit later. Selection/preview upload
  nothing; files remain until confirmed save or explicit discard.
- Internal navigation, mobile close, editor replacement and signout ask Post/Save
  changes, Discard, Cancel. Browser close/refresh uses Leave/Stay. Failed saves
  retain the mounted editor; receipt-first retries avoid duplicate notes/files.
  Discard does not cancel an uncertain server commit. Desktop focus X keeps writing.
- Chronological SSR timeline with bounded cursor pages, all-selected-tags AND,
  collapse/density, stable private detail URLs, history/scroll/focus restoration,
  revision-checked edits and conflict copy/load/explicit replace. No silent merging.
- Literal multilingual search: normalized NFKC/lowercase, all terms AND, quoted
  phrase, code and filenames included, file contents excluded. No fuzzy/readings/
  Han conversion. SQLite trigram acceleration plus one/two-character fallback;
  safe highlighted snippets. Search/tags cover all months unless a day is selected.
- Month calendar uses saved app timezone, global note counts, a 4 × 3 miniature
  monthly-heatmap year picker/Today, top-visible-note tracking, day-locked filtering and explicit empty
  months. Editing/backdating does not artificially move notes to the top.
- Flat Unicode hashtags and local autocomplete. Management renames/merges/removes
  exact source spans across notes/Trash, preserves code/prose, increments
  revisions and warns before stale unsaved tags are posted. Editor source is not
  silently rewritten.
- Safe Markdown/GFM, highlighted original-code copy, visible-only lazy sanitized
  Mermaid. No raw active HTML, diagram callbacks or remote image fetching.
- Private static images: correct orientation, strip metadata, display/thumbnail
  WebP, no upscale/retained originals; animations reject. Defaults: 20 MiB/50 MP,
  2560 px quality 85 display, 480 px quality 75 thumbnail. One bounded native job.
  Viewer supports zoom/pan/navigation/swipe and processed-WebP download.
- Other files stay byte-identical (50 MiB default), download-only, authenticated,
  with safe disposition/nosniff/sandbox headers. No public uploads/backups.
- Location is explicit/off by default. Browser permission is requested only by
  Use current location; manual coordinates need no invented accuracy. Copy/map
  popover; OpenStreetMap opens only on explicit action, no embed/geocoder/tracking.
- Trash preserves prior status/dates/files; confirmed permanent deletion and
  restartable reference-safe cleanup cannot break shared/Trash attachments.
  Unused whole posting attempts can be explicitly abandoned after 24 quiet hours;
  nothing expires automatically. Local originals remain, but a frozen abandoned
  attempt needs a separate editable copy before posting again.

Derived search repair is stopped-app-only:

```sh
docker compose stop pandanote
docker compose run --rm pandanote reindex
docker compose start pandanote
# Local equivalent with app stopped: npm run search:reindex
```

Search and tag receipt tables are part of the current schema-v2 baseline. Upgrades
run automatically on startup, not through an operator migration command. Reindex
changes no source notes/revisions/files/receipts. Synthetic benchmark scripts:
`auth:benchmark`, `images:benchmark`, `search:benchmark`, `backups:benchmark`.

## Manual full backup and uploaded restore

Settings → Backup & Restore creates, lists, downloads and explicitly deletes full
private `.pnb` archives. They are **unencrypted and sensitive**: notes/
Trash, files, tags/history/receipts, settings, account/password/MFA/recovery state and
portable keys. Download to protected storage elsewhere; a server-only copy does not
survive losing the VPS. No scheduler or separate backup password.

Format **2**, regular USTAR tar.gz, uses consistent online SQLite snapshot + immutable
files and bounded streaming/checksums. Excludes unsaved editor text/files, sessions/challenges,
rate limits, pending/unreferenced uploads, old archives, staging, derived search,
pre-upgrade copies, deployment origin/TLS and binaries. Only verified archives are
listed complete. Checksums detect corruption, not authenticity or encryption.

Upload and validate in Settings, inspect the summary, then freshly authenticate and
explicitly confirm replacement (never merge). Exact known baseline-v1 schemas migrate
through trusted SQL/data steps on isolated staging to schema 2; format-1 pre-release,
unknown/newer/altered schemas, unsafe paths/links/checksums/files fail before replacement.
Journaled swaps retain complete old state until durable validation and recover before
startup DB/key reads. All sessions are invalidated; sign in with archived credentials.
Destination origin/unrelated archives/pre-upgrade copy remain. Unsaved editor content is not restored.

On a new VPS: deploy → complete temporary browser setup → upload/restore → archived
username/password/MFA login. Full bounds, failure and recovery procedure:
[ops/RESTORE_RUNBOOK.md](ops/RESTORE_RUNBOOK.md).

## Validation and contributor docs

```sh
npx playwright install chromium
npm run check
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

Tests use actual isolated SQLite/filesystem/Sharp/archives and built adapter-node
browser routes; production has no fixtures/debug endpoints. Linux PTY/root/modes
cases must pass on Linux, not be counted as passed on Windows. Deployment/drill
harnesses live only in [tests/release/](tests/release/README.md). Coverage and Linux
validation: [tests/README.md](tests/README.md).

Settled stack: SvelteKit 3/Svelte 5/TypeScript 6/Vite 8/adapter-node; SQLite/Drizzle/
better-sqlite3; remark/rehype/Shiki/Mermaid; Sharp; plain CSS/private local storage.
No external search service, Redis, multi-user roles, rich editor, offline sync,
external location service or automatic full backups.

Before coding read [AGENTS.md](AGENTS.md), [product spec](docs/PRODUCT_SPEC.md),
[architecture](docs/ARCHITECTURE.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md),
[acceptance matrix](docs/ACCEPTANCE_TESTS.md) and [progress](docs/PROGRESS.md).
Preserve work/history, follow the next unfinished task, and record real validation.

## Release status

[RELEASE_RESULTS.md](docs/RELEASE_RESULTS.md) records **dated S18 measurements**, not
current dependency/audit claims. The simplify-setup [handoff](docs/simplify-setup/PROGRESS.md)
records newer gates. Remaining: real VPS/public DNS/Let's Encrypt/independent-host
restore, physical-device/IME/pinch/screen-reader audit, reviewed Linux visual
baselines, maximum-bound/100k stress and exact clean-release-commit verification.
Very long reading sessions grow a non-virtualized DOM; virtualization needs separately
approved scroll/history work. No final project completion is claimed.
