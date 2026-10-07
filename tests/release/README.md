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

## Cross-engine archive transfer (DEP-09)

Verify on a disposable Docker server with both engine builds available:

```sh
# Docker-built image:
docker image save -o docker-image.tar pandanote:latest
docker image load -i docker-image.tar
docker image inspect pandanote:latest

# Podman-built image (namespace is intentionally explicit):
podman save --format docker-archive -o podman-image.tar localhost/pandanote:latest
# Transfer the archive to the disposable Docker server:
docker image load -i podman-image.tar
docker tag localhost/pandanote:latest pandanote:latest
docker image inspect pandanote:latest
```

Check immutable version/revision/created labels and native modules in each loaded
image; compare the ID against the running root-Compose container. Never infer a
Docker transfer pass from Podman alone. Keep tar files out of Git. A temporary
privileged Docker-in-Docker daemon is test tooling only, not an app dependency or
recommended deployment topology.
