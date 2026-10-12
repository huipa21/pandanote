# Linux deployment gates (test-only)

These stacks and credentials are **synthetic**. Nothing here is an installation
example or shipped in the runtime image. Use a disposable Linux engine; never
point these commands at a production host/data folder. Production needs only the
root `docker-compose.yml` and `.env.example`, plus an existing Caddy network.

## Two-domain drill and benchmark

On Linux, with Node 24, installed dependencies, Chromium and Compose v2:

```sh
bash ops/release-drill.sh
bash ops/release-benchmark.sh
# To test an already-built, isolated image rather than build the clean checkout:
PANDANOTE_IMAGE=pandanote:<version> bash ops/release-drill.sh
```

`COMPOSE` defaults to `docker compose`, `DOCKER` to `docker`, `PLAYWRIGHT` to
`npx playwright`. For Podman use `DOCKER=podman COMPOSE=docker-compose` with its
Docker-compatible socket configured. The scripts explicitly use
`tests/release/compose.drill.yaml`, with dynamic networks and a minimal Caddy site
(local CA for test TLS only). State stays under ignored `.drill/` (or `DRILL_DIR=.drill/<simple-name>` to keep
prior synthetic drill results untouched). Caddy's ordinary
forwarding/body-size/timeout behavior is **not** overridden. Optional
`BENCH_CPUS=2 BENCH_MEMORY=3g` constrains only the benchmark container via the engine.

Setup posts use the one-time setup code exactly as an operator would: the harness reads
the newest `PandaNote setup code:` line from the container log (`setup-code.ts`, the
SH2.1 contract). It never stores or prints the code or the log text.

## Copied-folder deployment gate (DEP-01–08)

`deployment.test.ts` copies the **real root** Compose into a fresh Linux
`/var/tmp/pandanote-dep-*` folder. Its initial `.env` has exactly one line (`ORIGIN`).
It refuses an engine that already has `pandanote` or `proxynet`, saves/restores the
previous latest image alias, and removes only its own resources. Requires ~8 GiB
free beyond the application's reserve for the >1 GiB archive/download/staging.
The large fixture is three unchanged 384 MiB random files, streamed through real
TLS Caddy, manually backed up, downloaded, validated and restored with hashes checked.
A stopped native snapshot worker makes backup-interruption testing deterministic;
this signal injection belongs only to the test, not to application behavior.

Provide two isolated clean-source images:

1. `DEP_IMAGE`: normal production `ops/Dockerfile` build of the current checkout.
2. `DEP_UPGRADE_IMAGE`: another **throwaway committed clone**, never production:
   increment `SCHEMA_VERSION` to 3, add journal entry idx 2/tag
   `0002_deployment_proof`, SQL `CREATE TABLE deployment_proof (upgraded_at INTEGER NOT NULL);`,
   and a registered version-3 data step named `deployment-proof-v1` inserting
   `ctx.now` into that table. Build with the unchanged production Dockerfile.
   Never modify the first two migrations or their hashes. This proves automatic
   SQL + data-step startup, old-schema snapshot and the documented copy rollback.

`DEP_COMPOSE_BINARY` points to a Linux x86_64 Compose v2 executable on the driver
host. It is copied into the disposable folder (test tooling only).

```sh
DEP_ENGINE=docker DEP_IMAGE=pandanote:<base-version> \
DEP_UPGRADE_IMAGE=pandanote:<synthetic-upgrade-version> \
DEP_COMPOSE_BINARY=/path/to/docker-compose-linux-x86_64 \
npx playwright test --config playwright.release.config.ts tests/release/deployment.test.ts
```

For a Windows driver with an isolated rootful Podman WSL machine, use
`DEP_ENGINE=podman DEP_REMOTE=podman-machine`; the Linux Compose client connects to
`/run/user/0/podman/podman.sock`. Browser runs on the driver, native application and
all filesystem/Compose operations run on Linux. Tests preserve privilege checks
(PID 1 Node, UID/GID, zero permitted/effective capabilities), private modes, default
10 s idle shutdown, restarts/recreation, spoofed XFF, interrupted backup and rollback.

## Alpine/common and external production-image gates

Production is pinned Alpine/musl; the browser driver may stay Debian or a supported
host. Debian-native/Windows results do not prove musl compatibility.

```sh
docker build -f ops/Dockerfile.alpine-validation -t pandanote-alpine-tests .
docker run --rm --cpus=2 --memory=4g pandanote-alpine-tests
docker build -f ops/Dockerfile.native-probe -t pandanote-native-proof .
docker run --rm pandanote-native-proof
IMAGE_ENGINE=docker IMAGE_UNDER_TEST=pandanote:<version> npx playwright test --config playwright.release.config.ts tests/release/image.test.ts
```

The native-proof image genuinely rebuilds SQLite from source, then probes the minimal
musl install after real privilege drop/execve. All tools/fixtures are test-only.
The external-image gate verifies pristine inventory before copying temporary probes
into an owned container; actual source workers/deferred grammar/native formats,
ESM/labels/private modes, no-echo live PTY reset/revocation and stopped reindex run
without build dependencies. Requires Linux `python3` for the driver PTY.
For a Windows Podman driver use IMAGE_REMOTE=podman-machine and, when needed,
IMAGE_PTY_CLIENT_JSON containing the explicit Linux engine argv (isolated storage).
A missing image/PTY is a blocker, not an implicit skip. Temporary resources are owned
anonymous volumes; no fixed production alias or real data is used.

Run `content.test.ts` after the two-domain drill with the same DRILL_DIR and
IMAGE_EXPECTED_LABELS captured from that image's `image inspect --format
'{{json .Config.Labels}}'`. It verifies source/restarted and restored-destination
SSR/sidebar/mobile/no-JavaScript About identity as well as actual built Alpine
SSR/preview highlighting, lazy Mermaid and hostile-policy isolation.
The full ordinary e2e suite remains separate. Use ops/Dockerfile.browser-validation
for supported Linux nonvisual coverage; never auto-update OS visual baselines.

For isolated validation daemons only, deployment.test.ts accepts DEP_ENGINE_SOCKET
and DEP_DOCKER_CONTAINER (Docker inside an owned Podman container), and benchmark
accepts BENCH_DOCKER_CONTAINER. These transport switches run the real engine/Compose,
not mocks, and do not change root production Compose/env/Caddy. Some Podman custom
--root services schedule health timers against default storage; use a correctly
isolated Docker daemon rather than bypass readiness/health assertions. Current
Chromium per-rule network emulation is used; Windows throttling can stall, so record
that failure and measure the complete unchanged workload on the supported Linux driver.

## Cross-engine archive transfer (DEP-09 / IMG-XFER)

Verify on a disposable Docker server with both engine builds available:

```sh
# Docker-built image:
docker image save -o docker-image.tar pandanote:latest
gzip -6 -c docker-image.tar > docker-image.tar.gz
gzip -t docker-image.tar.gz
sha256sum docker-image.tar.gz > docker-image.tar.gz.sha256
sha256sum -c docker-image.tar.gz.sha256
docker image load -i docker-image.tar.gz
docker image inspect pandanote:latest

# Podman-built image (namespace is intentionally explicit):
podman save --format docker-archive -o podman-image.tar localhost/pandanote:latest
# Transfer the archive to the disposable Docker server:
gzip -6 -c podman-image.tar > podman-image.tar.gz
gzip -t podman-image.tar.gz
sha256sum podman-image.tar.gz > podman-image.tar.gz.sha256
sha256sum -c podman-image.tar.gz.sha256
docker image load -i podman-image.tar.gz
docker tag localhost/pandanote:latest pandanote:latest
docker image inspect pandanote:latest
```

Check immutable version/revision/created labels and native modules in each loaded
image; compare the ID against the running root-Compose container. Never infer a
Docker transfer pass from Podman alone. Keep tar files out of Git. A temporary
privileged Docker-in-Docker daemon is test tooling only, not an app dependency or
recommended deployment topology. Raw save/load remains a supported alternative.
Use unused filenames; preserve the raw file. On a disposable engine also reject a
truncated gzip with `gzip -t` and actual Docker load, then verify the prior running
image/reference/private data are unchanged. Actual Docker/Podman builds and fresh
Docker compressed-load/native/default-root-Compose probes are required; checksum
or Podman-only success is not equivalent. Podman compressed load is also locally
tested. Results and the engine-dependent compressed-layer accounting are recorded
in [image progress](../../docs/image-optimization/PROGRESS.md).
