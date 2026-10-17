# PandaNote — operations guide

You need a Linux server with Docker (Compose v2), an existing Caddy container on a
Docker network (here `proxynet`), and a DNS name pointing at the server. Allow your
administrative access and Caddy's HTTP/HTTPS ports through the firewall; never
publish the app's port 3000. Run one PandaNote process per local-disk data folder.

Local Linux image/Caddy/drill gates are verified; public VPS, physical-device,
screen-reader and exact-release-commit checks remain open. See
[setup progress](../docs/simplify-setup/PROGRESS.md) and
[Alpine packaging evidence](../docs/image-optimization/PROGRESS.md).
Linux AMD64 is validated; ARM64 manifests/build option exist but native validation
has not been run.

## 1. Build the image (on your computer)

From a clean, committed, full-history checkout with Node 24.21.0/npm 11 and Docker
or Podman (Docker Desktop in Linux-container mode on Windows):

```sh
npm run version:release
npm run image:build -- --platform linux/amd64     # or linux/arm64
# Docker build machine:
docker image tag pandanote:latest localhost/pandanote:latest
docker image save -o pandanote-image.tar localhost/pandanote:latest
# OR Podman build machine (explicit archive namespace):
# podman save --format docker-archive -o pandanote-image.tar localhost/pandanote:latest
gzip -6 -c pandanote-image.tar > pandanote-image.tar.gz
gzip -t pandanote-image.tar.gz
sha256sum pandanote-image.tar.gz > pandanote-image.tar.gz.sha256
scp pandanote-image.tar.gz pandanote-image.tar.gz.sha256 docker-compose.yml user@server:~/pandanote/
```

Before transfer, edit `ORIGIN` in `docker-compose.yml` to the destination's
canonical HTTPS origin. The Compose file uses `localhost/pandanote:latest` and
mounts `./data`; no `.env` file is required.

Create `~/pandanote/` on the server first if missing. No host `npm ci` is needed to
build: the wrapper uses Node built-ins and installs native dependencies inside Linux.
Both dependency stages include CA/Python/make/g++ for compilation fallback, not the
runtime stage. Working package/Node-header connectivity is still necessary.
All production stages use the same verified Node 24.21.0 Alpine index pin; native
modules install inside musl, never from a host/Debian tree. Runtime adds only CA
certificates/libstdc++ (libgcc is already supplied), not compilers or a glibc shim.
Node ICU supplies verified IANA/DST behavior without an added timezone package.

Choose unused archive filenames; never overwrite a retained image export. `gzip -6 -c`
keeps the raw file. As a raw alternative, transfer `pandanote-image.tar` and load it
with `docker image load -i pandanote-image.tar`. Gzip changes transfer/storage, not
loaded image size or RSS. Docker's containerd store may already compress saved
layers; don't compare its raw tar directly to legacy Podman tar sizes.

The wrapper selects usable Docker then Podman (`--engine docker|podman` overrides),
rejects dirty/shallow history, and builds a committed-source archive, never your
ignored data. Builds update `pandanote:latest` and a `YYMMDD-N` tag. UTC committer
date + same-day first-parent sequence determine the version, not build time. Full
hash/time/version are embedded in OCI labels and the sidebar/drawer/Settings About;
restores/runtime configuration cannot override them. See
[versioning](../docs/VERSIONING_PLAN.md). No commit or Git tag is created by the tool.

## 2. Install (on the server)

```sh
cd ~/pandanote
sha256sum -c pandanote-image.tar.gz.sha256
gzip -t pandanote-image.tar.gz
docker image load -i pandanote-image.tar.gz
docker image inspect localhost/pandanote:latest --format '{{json .Config.Labels}}'
docker compose up -d
docker compose ps              # wait for healthy
```

Do not load/deploy if checksum or gzip integrity fails. Loading alone does not
replace a running container. Preserve the prior image and downloaded full backup
before upgrades. Checksums detect accidental corruption, not authenticity if both
files come from an untrusted source; verify trusted transfer and release labels.
Gzip is not encryption, and image exports are not sensitive application backups.

PandaNote's network must already exist and be the one Caddy uses. If its name is
not `proxynet`, change **both** `proxynet` lines in `docker-compose.yml`. Add to your
existing Caddyfile, then reload Caddy:

```caddyfile
notes.example.com {
	reverse_proxy pandanote:3000
}
```

Open `https://notes.example.com`. You are sent to **Setup**. First get the setup code from
the server log:

```sh
docker compose logs pandanote | grep "setup"
```

The output has two lines: `PandaNote setup code: XXXXX-XXXXX-XXXXX-XXXXX (valid for 60 minutes
while no account exists)` and `PandaNote setup link: https://notes.example.com/setup#code=…`.
Open the link (it fills in the code) or type the code into the form. Then:

1. Setup code, username, email, password (8–128 Unicode characters), re-enter password → **Create account**.
2. Site title, language, timezone → **Finish setup**.

**Setup code.** It is valid while no account exists, for 60 minutes after the server process
starts. Anyone who can read the Docker logs can read it, so keep log access private until setup
is finished. Use the newest `PandaNote setup code:` line; a restart prints a new code.
Setup cannot replace an existing account. Leaving after step one resumes preferences after
username/password login. Completed instances open Login when signed out, the timeline when
signed in. Email is required metadata, not verified; no email is sent.
Recommended next: enable TOTP in Settings and download a full backup.

### What is where

| Path                 | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `docker-compose.yml` | One PandaNote service on the existing Caddy network.                           |
| `./data/`            | Database, files, keys, staging, manual backups and latest pre-upgrade DB copy. |

Startup automatically recovers restores, initializes keys/database/default settings,
and applies SQL + registered data steps before HTTP listens. No migration/setup
operator command. Linux data directories are owner-only `0700`, files `0600`.
Never copy a live SQLite main file without WAL, regenerate lost keys or manually
remove referenced attachment bytes.

### Compose configuration

| Setting              | Location                 | Default                  | Meaning                                                                                                                                                                                   |
| -------------------- | ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`             | `environment`            | Edit the example value   | Canonical HTTPS origin, no trailing slash; HTTP only for loopback.                                                                                                                        |
| Host data folder     | `volumes`                | `./data`                 | Private local folder on this server for all app data, mounted at `/data`.                                                                                                                 |
| `PUID` / `PGID`      | `environment` (optional) | `1000` / `1000`          | Non-root positive numeric owner IDs.                                                                                                                                                      |
| `DISK_RESERVE_BYTES` | `environment` (optional) | max(5 GiB, 10% capacity) | Free-space floor protecting the shared filesystem.                                                                                                                                        |
| `BODY_SIZE_LIMIT`    | `environment` (optional) | `64G` in image           | Transport ceiling; domain image/file/archive limits still apply.                                                                                                                          |
| `PORT`               | `environment` (optional) | `3000`                   | Internal listener; changing it also requires changing Caddy's upstream.                                                                                                                   |
| `TRUSTED_PROXIES`    | `environment` (optional) | private peers            | `none` ignores XFF; otherwise up to 32 comma-separated IPv4/IPv6 addresses or CIDRs. Only listed TCP peers may supply XFF. Unset/blank retains private-network/loopback/link-local trust. |

Edit these values directly in `docker-compose.yml`. Container `DATA_DIR` is always
`/data`; the host side of the volume controls where data is stored. Use the configured
path, not literal `data`, in disk/recovery examples if you changed it.
The 60 GB disk is shared with OS/images/staging/backups; do not consume the reserve.

## 3. Everyday commands

| Task         | Command                                        |
| ------------ | ---------------------------------------------- |
| Status       | `docker compose ps`                            |
| Logs         | `docker compose logs --tail=100 pandanote`     |
| Restart      | `docker compose restart pandanote`             |
| Stop / start | `docker compose stop` / `docker compose up -d` |
| Disk usage   | Settings → Storage, or `sudo du -sh data/*`    |

Health exposes only `ok`, `maintenance`, or HTTP 503 `unavailable`. Logs exclude
note text/passwords/seeds/codes/sessions/precise coordinates. Docker's default idle
shutdown window is 10 seconds; the server exits 0 after draining and closing SQLite.
Avoid forced kills as routine operation. Interrupted restore replacement recovers
from its durable journal at startup.

## 4. Backups

Settings → Backup & Restore → create, then **download to another machine**. A
server-only archive does not survive server loss. Full archives are unencrypted,
sensitive and include account/MFA/portable keys. Protect them yourself. No separate
backup password, scheduler or automatic full backup exists.

Stopping during creation can interrupt the backup; startup marks interrupted jobs
failed, never lists partial archives complete. Create again after restart.
`pre-upgrade/` is a database-only rollback aid, not a full backup. Browser drafts
are device-only and excluded from both.

## 5. Upgrade

1. Create/download a fresh full backup in Settings; retain it off-server.
2. Keep the current image: `docker tag localhost/pandanote:latest localhost/pandanote:previous`.
3. Load the new archive as in section 2. It replaces `localhost/pandanote:latest`.
   Run `docker compose up -d`, then inspect health/logs
   and spot-check login, notes, Drafts/Trash, Settings and a file download.

Loading an image alone does not update an already-running container. A new schema
is applied on startup, with a consistent online DB copy + manifest saved first to
`data/pre-upgrade/`. Fresh/current schemas skip that copy. Settings → Storage shows
its size/version/time. SQL/data/ledger/integrity changes share one IMMEDIATE
transaction; migration failure rolls back the DB and exits without serving.

The latest copy replaces its predecessor using **durable journaled rotation**,
recovering interrupted rotation before migration. There is a brief path-absence
window, not a single atomic directory exchange; SS01's literal atomicity clarification
is still open. It copies no keys/files. Insufficient space refuses upgrade before
serving; logs give the required space. Do not modify migration history or down-migrate.

## 6. Roll back an upgrade

**Only immediately after a database upgrade**, before new writes: notes/settings
written since the copy are lost. Check `pre-upgrade/manifest.json` for the source
schema and matching old image. A no-schema image update creates no new copy: do not
use a stale copy for it. Current migrations are database-only; keys/files are not
restored by this procedure. After subsequent edits/deletions/cleanup/restore, use a
full downloaded backup and a compatible instance instead.

With the default `./data` bind (adjust paths if customized), and after confirming the
old image is `localhost/pandanote:previous`:

```sh
docker compose down
docker image tag localhost/pandanote:latest localhost/pandanote:failed
docker image tag localhost/pandanote:previous localhost/pandanote:latest
sudo mv data/db data/db.after-upgrade
sudo mkdir data/db
sudo cp data/pre-upgrade/pandanote.sqlite data/db/pandanote.sqlite
docker compose up -d
```

The container fixes ownership on startup. Verify
health/login/content before deleting `data/db.after-upgrade`; preserve it if recovery
fails. See [RESTORE_RUNBOOK.md](RESTORE_RUNBOOK.md) for full-state recovery. An older
image refuses newer schemas; deploy a compatible version before uploaded restore.

## 7. Forgot password / lost two-step verification

```sh
docker compose run --rm pandanote reset-password
```

Interactive terminal required; no arguments or piped input. Shows username, asks
twice without echo (8–128 characters), atomically changes password, disables MFA/
recovery codes, revokes sessions/challenges and clears all sign-in rate limits.
Notes/files/settings stay intact.
Works with the app running, invalidating old sessions on their next request without
restart. Maintenance verifies the `/data` mount ownership against PUID/PGID without walking
or re-owning live files; mismatched ownership refuses. Pending recovery journals or
no account also refuse. Enroll TOTP again after login. No public reset endpoint.

## 8. Someone else completed setup / start over

With server access, preserve the old directory privately first if you need anything
from it. **This deletes ALL server data, archives and keys**; use the actual host folder
mounted at `/data`, never an OS/shared folder:

```sh
docker compose down
sudo rm -rf data                # default ./data bind only; irreversible
docker compose up -d
```

Open the site and complete setup within 60 minutes, using the setup code from
`docker compose logs pandanote | grep "setup"` (section 2). Existing browser drafts are not
server data and remain on their browser/device.

## 9. Move to a new server

Install as in section 2 with destination ORIGIN, complete temporary browser setup,
then Settings → Restore with the downloaded format-v2 `.pnb` archive. Validate the
summary, freshly authenticate and confirm destructive replacement. Sign in with
archived username/password/MFA. Destination origin stays configurable, old sessions
are revoked, local browser drafts and unrelated destination archives are untouched.
Full procedure/bounds/crash recovery: [RESTORE_RUNBOOK.md](RESTORE_RUNBOOK.md).
Pre-release archives/data are refused; no compatibility migration is provided.

## 10. Rebuild the search index (rarely needed)

```sh
docker compose stop pandanote
docker compose run --rm pandanote reindex
docker compose start pandanote
```

Argument-free, stopped-app-only; changes derived search, not notes/revisions/files.

## 11. Troubleshooting

| Log message / symptom                            | Fix                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ORIGIN must be set` / `must be https`           | Set canonical HTTPS ORIGIN in `docker-compose.yml`, then `docker compose up -d`.                                                                                                                             |
| Network `proxynet` not found                     | Use Caddy's existing network; change both network references.                                                                                                                                                |
| `Database upgrade failed at migration N`         | DB transaction rolled back; use the compatible previous image and report only safe logs.                                                                                                                     |
| `Not enough free space for the pre-upgrade copy` | Free disk space (needed size is logged), restart.                                                                                                                                                            |
| `upgraded by a newer PandaNote`                  | Use newer image or immediate copy rollback (section 6).                                                                                                                                                      |
| `created by a pre-release PandaNote`             | Move the old private data folder away and start empty.                                                                                                                                                       |
| Too many attempts. Try again in 15 minutes.      | Likely an attack on sign-in limits. Wait 15 minutes, or sign in from a browser used before. Last resort: `reset-password` (section 7), which also clears limits but signs out all devices and turns off MFA. |
| Setup timed out                                  | `docker compose restart pandanote`, then use the newest setup code from `docker compose logs pandanote`.                                                                                                     |
| Setup code is incorrect                          | Use the newest `PandaNote setup code:` line from `docker compose logs pandanote`. A restart prints a new code (only while no account exists). Never paste codes into public places.                          |     |
| 502 from Caddy                                   | Check health/logs and shared network/upstream name.                                                                                                                                                          |
| Missing/corrupt keys or recovery journal         | Stop, preserve entire data tree, follow restore runbook; never regenerate/delete blindly.                                                                                                                    |

## 12. Notes for advanced users

- Container briefly starts as root to prepare only the `/data` mount, rejects links/special
  files/nested filesystems/external hardlinks, then drops supplementary groups and
  UID/GID permanently. Server PID 1 Node has zero effective/permitted capabilities.
  Do not add `user:` to this automatic-root-owned-bind workflow.
- Minimal Compose intentionally has no hardening/resource/stop-timeout overrides,
  published ports, bundled proxy or one-off services. Image HEALTHCHECK remains.
- Never share the data directory with another service or use network storage. Keep
  data/archives/env/browser profiles out of Git and public paths.
- Another proxy must terminate HTTPS, forward Host, overwrite XFF with a single
  valid client IP and stream adequate upload sizes. `TRUSTED_PROXIES` controls which
  TCP peers may supply XFF (details below). For a trusted peer, absent XFF uses its
  peer and invalid/chained XFF returns 400; untrusted peers ignore XFF entirely.
  Leave adapter address/host/protocol/port forwarding overrides unset.

### Restrict forwarded-address trust (recommended hardening)

The compatibility default trusts every private-network/loopback/link-local peer.
Other containers sharing that network can therefore forge forwarded addresses.
To trust only Caddy, inspect its actual peer address and the network's subnet:

```sh
docker network inspect proxynet
```

Select an unused address in that subnet and pin **Caddy's** address in its existing
Compose file. For example (the address is illustrative, not a universal default):

```yaml
services:
  caddy:
    networks:
      proxynet:
        ipv4_address: 172.18.0.2
networks:
  proxynet:
    external: true
```

Recreate Caddy with its normal deployment procedure, inspect the network again,
and set `TRUSTED_PROXIES` in PandaNote's `docker-compose.yml` to the actual fixed peer address:

```yaml
services:
  pandanote:
    environment:
      TRUSTED_PROXIES: 172.18.0.2
```

Then apply the new environment with `docker compose up -d --force-recreate`
(a restart alone does not change a container's environment). List both actual
IPv4/IPv6 peer addresses if needed, separated by commas; mapped IPv4 peers match
IPv4 entries. Narrow CIDRs are supported, but trusting the entire shared subnet
also trusts its other containers. Invalid configuration prevents startup. The
startup log reports only the number of proxy entries, or that XFF is ignored.

For deliberate direct TCP exposure without a proxy, use `TRUSTED_PROXIES=none`;
XFF is ignored even from private peers. This is an address-trust setting, not a TLS
or firewall substitute: the supported installation still keeps port 3000 private
and serves public traffic over HTTPS.

Caddy replaces untrusted XFF by default; the minimal site needs no extra option.
Configure Caddy's own `trusted_proxies` only when Caddy itself sits behind a CDN or
another trusted proxy. In that topology, forward only the resolved `{client_ip}`
(for example `header_up X-Forwarded-For {client_ip}`), not a comma-separated chain.
PandaNote never trusts a header merely because it contains a plausible client IP.

Sign-in protection isolates anonymous IP buckets from verified device/IP buckets;
correct setup-code requests also have their own code/IP bucket. An anonymous flood
cannot spend those allowances even behind shared NAT or an IPv6 /64. A stolen
valid device cookie can still exhaust that device's allowance; connection floods
and password-worker contention are not eliminated. New/expired-cookie browsers
remain on the anonymous path. Never exempt a request based only on a supplied
password or unverified cookie.

- Dependency audits/builds are dated evidence, not permanent security guarantees.
  Use pinned compatible updates and rerun native/archive/auth gates deliberately.

## 13. Verification tooling (not installation steps)

[Test-only release tooling](../tests/release/README.md) uses synthetic independent
HTTPS domains/data under ignored `.drill/`. With Node/dependencies/Chromium and an
isolated engine, run `bash ops/release-drill.sh` and `bash ops/release-benchmark.sh`.
It never points at a user's data folder; its Caddy stack is not bundled deployment.
Current gates and remaining limitations: [setup progress](../docs/simplify-setup/PROGRESS.md)
and [image progress](../docs/image-optimization/PROGRESS.md).

## 14. Runtime lock and image measurements

The full root lock builds the client/server. The separate `ops/runtime/package.json`
and lock install only reviewed exact runtime roots with `npm ci --omit=dev --omit=peer`.
Svelte is explicit; Kit/Shiki/native/source-tool/worker imports stay available.
Never omit optional packages: Sharp needs platform musl/libvips artifacts. Mermaid/
DOMPurify/adapter/Vite/TypeScript are build/client dependencies, not runtime roots.
Final `/app/package.json` remains the main ESM/#lib metadata, not the staging manifest;
therefore a full `npm ls` against it is not the runtime-inventory oracle.

For deliberate dependency maintenance on supported Node/npm:

1. Update/review main exact pins and root lock normally; no force audit repairs.
2. Update matching exact pins in `ops/runtime/package.json`, with root/reason changes
   reviewed in `scripts/runtime-dependency-contract.ts`. Keep runtime script/dev/
   workspace sections absent. Copy any applicable root overrides.
3. Regenerate explicitly (ordinary check/build never mutates the lock):

   ```sh
   npm --prefix ops/runtime install --package-lock-only --ignore-scripts --omit=dev --omit=peer
   npm run runtime:check
   ```

4. Review transitive versions/integrities against the main lock, not only direct pins.
   The initial runtime lock preserves all main-lock transitive versions. Peer-only
   lock entries may exist but must not enter the actual installed runtime tree.
5. Include both manifests/locks in the reviewed source change. Run common/full browser,
   Alpine common/native/fallback and actual production inventory/worker/PTY/restore
   gates before building the clean committed release. No runtime npm/network repair.

Read-only reporting (with dev dependencies, new ignored output path):

```sh
mkdir -p .browser-spike
npm run image:inspect -- --archive pandanote-image.tar.gz --gzip-level 6 --output .browser-spike/image-size.json
docker image inspect pandanote:latest --format '{{.Size}}'
```

The output is created privately/exclusively; an existing path is refused. Docker-format
manifests are required (standalone OCI archives refused). Multiple images and layer
aliases are explicit. Stored gzip/zstd layer blobs are distinguished from decoded
layer tar bytes. Regular-file payload is cumulative across layers, not merged-rootfs/
allocated-disk accounting. Maps overlap packages/modules, compressed browser assets
overlap build; do not add those categories. Engine accounting varies; RSS is measured
separately. Exact matched before/after measurements: image-optimization PROGRESS.

If a native/module/grammar asset is missing, rebuild inside the pinned Alpine stages
and inspect the runtime contract/COPY, not a dev install. Never copy glibc/host binaries,
disable TLS, delete grammars/licenses or install packages on startup to make it run.
