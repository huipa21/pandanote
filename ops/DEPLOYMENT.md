# PandaNote production deployment (single VPS)

One PandaNote app instance behind one HTTPS reverse proxy (Caddy), with one
persistent private data volume. PandaNote is a single-user app: do not run two
app containers, do not point two instances at the same data, and do not put the
data directory on network storage or serverless/ephemeral disks (SQLite WAL).

What this directory/repository provides:

| File                         | Purpose                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `ops/Dockerfile`             | Pinned Node 24.21.0 bookworm image; Linux-native sqlite/argon2/sharp; non-root `node` |
| `compose.yaml`               | `app` + `proxy` services and explicit one-shot `ops` tasks (migrate, token, recovery) |
| `ops/Caddyfile`              | HTTPS edge: automatic certificates, streaming bodies, overwritten client address      |
| `ops/production.env.example` | Deployment variables (copy to `.env`; keep it private)                                |
| `ops/RESTORE_RUNBOOK.md`     | Uploaded restore, rollback and "app cannot start" procedures                          |
| `ops/release-drill.sh`       | Two-deployment/different-domain restore drill + restart persistence                   |
| `ops/release-benchmark.sh`   | 10k-note measured workloads on a 2-CPU/3-GiB container                                |

Verified shape: a Linux VPS with about 2 CPU cores / 4 GB RAM, Docker Engine with
the Compose v2 plugin (Podman with a Compose provider also works), a DNS name
pointing at the VPS and TCP 80/443 (+UDP 443 for HTTP/3) reachable. Keep at least
the disk reserve free (default: the larger of 5 GiB and 10% of the filesystem).
The 60 GB disk is shared with the OS, images, staging and backup archives; it is
not a promise of 60 GB of attachments.

## 1. First install

```sh
git clone <your repository URL> pandanote && cd pandanote
git checkout <release tag or commit>
cp ops/production.env.example .env
chmod 600 .env
$EDITOR .env          # set DOMAIN and ORIGIN
# Requires Node 24.21.0 + npm 11 + Docker or Podman (no host npm ci).
npm run image:build -- --platform linux/amd64
# .env defaults to PANDANOTE_TAG=latest; optionally pin the printed YYMMDD-N tag.
```

Initialize storage explicitly, while the app is **not** running:

```sh
docker compose --profile ops run --rm --no-build migrate
# One-time setup token, valid one hour. It is printed ONLY to this terminal:
docker compose --profile ops run --rm --no-build -T setup-token
docker compose up -d --no-build
docker compose ps        # wait until app is "healthy" and proxy is running
```

Open `https://<DOMAIN>/setup`, enter the token and choose a password (12–256
characters). The token is single use; requesting another one invalidates the
previous token. Then, in **Settings**:

1. Enroll an authenticator (TOTP), confirm it, and store the ten single-use
   recovery codes somewhere safe, away from the VPS.
2. Create the first manual full backup and download it to protected storage off
   the server. The archive is **unencrypted** and contains your notes, files, the
   password hash, encrypted TOTP seed and the portable key. There is no separate
   backup password and no automatic backup scheduler: a copy on the same server
   is not disaster protection.

If setup does not work, check `docker compose logs app` and that `ORIGIN` equals
the exact origin (scheme + host [+ port]) users type, without a trailing slash.
HTTP is accepted only for loopback development origins.

### Build locally, transfer the image, use your existing Caddy

You need **one additional long-running container**, PandaNote. SQLite, private files
and the Node HTTP server are inside it; your existing Caddy remains independent.
Build on a clean, complete Git checkout with Node 24.21.0/npm 11 and Docker or
Podman (Docker Desktop must use Linux containers on Windows; start the Podman
machine with `podman machine start` if using Podman):

The wrapper uses only Node built-ins; **no host `npm ci` is needed**. Native
app dependencies are installed inside the Linux image. Python, make, g++ and CA
certificates are installed in both dependency stages so native addons can compile
when prebuilt downloads are unavailable; the runtime has no added build tools.
Compilation still requires working package/Node-header download connectivity.
ARM64 command support is
provided, but only Linux AMD64 was validated in this session.

```sh
npm run version:release                           # prints version/hash/UTC commit time
npm run image:build -- --platform linux/amd64      # latest + YYMMDD-N tags
# ARM64 VPS instead: --platform linux/arm64
# Auto-detects a working Docker server, then Podman (15 s probe timeout each).
# Explicit override: append --engine docker or --engine podman.
# Engine/build failure is reported; a failed build is not retried with another engine.
```

Staged/unstaged changes and non-ignored untracked files fail **before** Docker runs.
Commit your source first; this command does not create a commit or Git tag. A shallow
clone needs complete history (`git fetch --unshallow`). Ignored `.env`/runtime data
are excluded: the wrapper builds from an immutable `git archive`, not the live tree.
The version date is UTC **committer** time; sequence counts same-day first-parent
ancestors. Rebuilding an old commit never uses today's date. See
[`docs/VERSIONING_PLAN.md`](../docs/VERSIONING_PLAN.md) for exact semantics.

Every successful build updates `pandanote:latest` and also creates the printed
versioned tag. The version is still embedded metadata, not the word "latest".
Export with whichever engine built the image (no binary pipes, PowerShell-safe):

```sh
# Docker build machine:
docker image save -o pandanote-image.tar pandanote:latest
# OR Podman build machine, Docker-compatible export:
podman save --format docker-archive -o pandanote-image.tar pandanote:latest
scp pandanote-image.tar user@server:/path/to/destination/
# On the Docker server (no Node/npm/source checkout needed):
docker image load -i /path/to/destination/pandanote-image.tar
docker image inspect pandanote:latest --format '{{json .Config.Labels}}'
```

For the POSIX server commands below, use `TAG=latest`, or retag/pin the loaded
image using its inspected version (`docker tag pandanote:latest pandanote:<version>`)
and set `TAG=<version>`. Exporting only latest does not transfer its other tags.

OCI labels are `org.opencontainers.image.version`, `.revision` (full Git hash), and
`.created` (**UTC commit time**, not build time). The same values are baked into the
SSR/browser build: the sidebar/mobile drawer footer shows the version, and
Settings → About shows version, hash and UTC commit time. Runtime environment
cannot override them. `npm run dev` and ordinary `npm run build` without release
metadata explicitly show Development. Release identity does not change DB/backup
compatibility; restore never replaces application binaries/version.

Connect the app to the **existing Caddy user-defined Docker network**. Ensure the
Caddy address on that network is fixed; set `TRUSTED_PROXY_IPS` to that exact address
(not a subnet and not the VPS public address). Example (substitute your real
network, fixed Caddy IP, domain and printed tag):

```sh
# First install only; app must not yet be running. These are temporary task containers.
docker run --rm --network none -v pandanote-data:/data \
  pandanote:$TAG node scripts/migrate.ts
docker run --rm --network none -v pandanote-data:/data \
  pandanote:$TAG node scripts/setup-token.ts

docker run -d --name pandanote --init --restart unless-stopped \
  --network caddy-net \
  -e ORIGIN=https://notes.example.com -e TRUSTED_PROXY_IPS=172.18.0.2 \
  -v pandanote-data:/data --read-only --tmpfs /tmp:size=512m,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --stop-timeout 60 --memory 3g --cpus 2 \
  --log-opt max-size=10m --log-opt max-file=5 \
  pandanote:$TAG
```

Do not publish port 3000. In your existing Caddy configuration, use the site block
from `ops/Caddyfile`, change `reverse_proxy app:3000` to `reverse_proxy pandanote:3000`,
and substitute the site hostname/environment placeholders. Preserve overwritten
`X-Forwarded-For`, streaming and upload/time limits. No second Caddy container is
required. Open `/setup` with the token, then enroll MFA and download a manual backup.
Never run two app instances on the same volume. On upgrades, stop/remove only the
old **container**, preserve the volume, run migrations with the new image, and
start the new image; make/download the pre-upgrade backup first.

For the bundled Compose stack, use `PANDANOTE_TAG=latest` (the default) or a pinned
loaded version in `.env`, and use `--no-build`. Ordinary deployment needs no
provenance environment variables. Low-level Docker/Compose builds require all
three build arguments `PANDANOTE_VERSION` (separate from the mutable image tag),
`PANDANOTE_COMMIT`, and
`PANDANOTE_COMMITTED_AT`. Missing/invalid values fail; these low-level primitives
cannot prove that caller-supplied metadata describes the source, so the supported
release path is **`npm run image:build`**, which enforces clean Git and snapshots it.
`latest` is intentionally mutable. Before loading a replacement, retain the old
image under its inspected version or image ID for rollback. Do not overwrite a
versioned tag with different source.

### Environment reference

| Variable                                    | Meaning                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DOMAIN`                                    | Public host name Caddy serves and obtains certificates for.                                                                            |
| `ORIGIN`                                    | **Required.** Canonical `https://host[:port]` the browser uses. Checked on every state-changing request and used for `Secure` cookies. |
| `EDGE_SUBNET`, `EDGE_PROXY_IP`, `APP_IP`    | Fixed private network. The app trusts `X-Forwarded-For` **only** from `EDGE_PROXY_IP` (`TRUSTED_PROXY_IPS`, exact addresses, max 16).  |
| `BODY_SIZE_LIMIT` / `BODY_SIZE_LIMIT_CADDY` | Transport ceilings (default 64G / 64GB) so full restore archives stream. Domain handlers enforce the real file/JSON/archive limits.    |
| `DISK_RESERVE_BYTES`                        | Optional override of the free-space reserve protecting the volume.                                                                     |
| `APP_MEM_LIMIT`, `APP_CPUS`                 | Container limits (default 3g / 2). Node's heap is capped at 1536 MiB.                                                                  |
| `HTTP_PORT`, `HTTPS_PORT`                   | Published proxy ports (80/443). Only the proxy publishes ports; the app listens on 3000 inside the private network.                    |
| `PANDANOTE_TAG`                             | Image tag; defaults to latest, or set a versioned tag to pin/rollback.                                                                 |
| `CADDY_TLS_DIRECTIVE`                       | Leave empty. `tls internal` is for local drills only (untrusted certificate).                                                          |

`DATA_DIR` is always `/data` in the container (named volume `pandanote-data`).
Persistent data is: `db/` (SQLite + WAL), `files/` (WebP/attachments), `private/`
(portable key material, restore journals), `staging/` and `backups/`
(manual `.pnb` archives). Nothing is under a public/static path; the image
contains no uploads or database. Back the **volume** up only with the app stopped
or use the application's manual backup. Caddy's `caddy-data` volume holds the
certificate account/keys; losing it only causes re-issuance.

Using another reverse proxy is allowed if it: terminates HTTPS, **overwrites**
(not appends) `X-Forwarded-For` with exactly one client IP, forwards `Host`,
streams request/response bodies without buffering whole uploads, has body/time
limits at least as large as the backup/restore you intend to use, and its exact
peer address is listed in `TRUSTED_PROXY_IPS`. The Caddy configuration above is
the verified path.

## 2. Operating the stack

| Task                     | Command                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| Status / health          | `docker compose ps` (app health = `GET /health`: ready, maintenance, or 503)     |
| Logs (structured, safe)  | `docker compose logs --tail=200 app` / `proxy` (rotated by the json-file driver) |
| Disk and data sizes      | `docker compose exec app du -sh /data/* ; df -h` and Settings → Storage          |
| Memory / CPU             | `docker stats`                                                                   |
| Reindex search (app off) | `docker compose stop app && docker compose --profile ops run --rm reindex`       |
| Restart                  | `docker compose restart app`                                                     |

`/health` is public, read-only and returns only `{"status":"ok"}`,
`{"status":"maintenance"}` (restore replacement in progress) or HTTP 503
`{"status":"unavailable"}` (storage not initialized/migrated, corrupt keys,
pending filesystem recovery). Logs never contain note text, passwords, TOTP
seeds, recovery codes, session tokens or precise coordinates; do not add such
logging when debugging.

### Graceful shutdown

`docker compose stop app` (or a host shutdown) sends SIGTERM. The Node adapter
stops accepting requests, drains in-flight ones, waits for a running backup to
finish and closes SQLite/WAL; the process exits **0**. The 60 s
`stop_grace_period` covers a typical backup. Do not `kill -9` or remove the
container while a backup/restore is running; the journaled restore and startup
recovery exist for crashes, not as a routine stop method.

## 3. Upgrade and rollback

1. Create a **manual backup in Settings and download it off-server.**
2. `git fetch && git checkout <new tag>`; review `docs/PROGRESS.md`/release notes.
3. Before loading a new image, inspect the current `pandanote:latest` labels and tag it with its old version for rollback (`docker tag pandanote:latest pandanote:<old-version>`). On the clean build checkout, run `npm run image:build`; transfer/load the new image and inspect its labels. Keep `.env` `PANDANOTE_TAG=latest` or pin the new version. Loading the image does not update an already running container.
4. Stop the app and migrate while nothing else writes:
   ```sh
   docker compose stop app
   docker compose --profile ops run --rm --no-build migrate
   docker compose up -d --no-build --force-recreate app
   docker compose ps       # wait for healthy
   ```
5. Sign in and spot-check recent notes, a download, Drafts/Trash and Settings.

Migrations are forward only and verified against the trusted migration history.
An older image cannot open a newer schema (it fails closed, `/health` = 503). To
roll back after migrating, deploy the previous tag and **restore the backup taken
in step 1** through Settings (see the restore runbook), not by editing the DB.
Browser-local drafts stay in each browser and are not affected by upgrades.

## 4. Recovery

- **Forgot the password / lost the authenticator and recovery codes** (operator
  only; no web bypass). Stop the app, pipe the new password through stdin, restart:

  ```sh
  docker compose stop app
  read -rs -p 'New password: ' PW; echo
  jq -n --arg password "$PW" '{password: $password}' |
    docker compose --profile ops run --rm -T recover-auth \
      node scripts/auth-recover.ts --confirm-reset-security
  unset PW
  docker compose start app      # then wait for `docker compose ps` = healthy
  ```

  This changes the password, removes MFA/recovery codes and revokes every session;
  enroll MFA again afterwards.

- **Setup token expired** (before an account exists): `docker compose stop app`,
  rerun the `setup-token` task, start the app.
- **App will not start / `/health` is 503 / restore interrupted:** follow
  `ops/RESTORE_RUNBOOK.md` ("If the app cannot start"). Preserve the entire volume
  before manual repair; never delete journal files or regenerate keys.
- **Disk nearly full:** use Settings → Storage and delete old manual backups after
  downloading them; never delete files by hand inside `files/`.
- **Lost the server:** deploy a new VPS with this guide (new or same domain),
  initialize temporary access, upload your downloaded `.pnb` in Settings and
  restore. Sign in with the archived password/TOTP. Domain, `.env`, TLS keys and
  browser drafts are not part of an archive.

## 5. Security checklist

- HTTPS only; `ORIGIN` exact; `.env` mode 600 and out of version control.
- Firewall: allow only 22 (your admin access), 80, 443 (+UDP 443).
- Never publish port 3000 or mount the data volume into another container.
- Keep archives and recovery codes offline/encrypted by you; they are sensitive.
- Update the base image/dependencies by rebuilding the pinned tag deliberately;
  run `npm audit` (0 vulnerabilities at release) before updating the lockfile.
- Production image has no tests, fixtures, docs, dev dependencies, demo account or
  debug route; `tests/integration/release-hygiene.test.ts` pins the shipped route set.

## 6. Verification drills

Both scripts use throw-away projects (`pna`, `pnb`, `pnc`), synthetic data and a
local certificate authority (`*.localtest.me` resolves to 127.0.0.1 through public
DNS) and write only to ignored `.drill/`.

```sh
# Needs a clean/full Git checkout, Node 24 + `npm ci`, Playwright Chromium,
# a compose CLI and a container CLI (DOCKER=docker or podman).
COMPOSE="docker compose" DOCKER=docker bash ops/release-drill.sh      # restore drill
COMPOSE="docker compose" DOCKER=docker bash ops/release-benchmark.sh  # 10k-note workloads
```

The drill deploys two independent production stacks with different domains,
initializes A, enrolls TOTP, creates mixed data (images, file, draft, trash,
location, code/Mermaid, settings), takes a manual backup, downloads it, restores it
through Settings into the fresh deployment B, verifies archived password/TOTP and a
recovery code, exact file bytes, search and settings, gracefully stops/starts both
(exit code 0) and rechecks persistence and the retained browser-local draft. Results
and the benchmark methodology are recorded in `docs/RELEASE_RESULTS.md`.
