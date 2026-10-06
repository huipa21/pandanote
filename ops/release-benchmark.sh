#!/usr/bin/env bash
# S18 measured workloads on a fresh production deployment limited to 2 CPUs / 3 GiB
# (the documented small-VPS shape). Seeds 10,000 synthetic multilingual notes through
# the real HTTP API, then measures API latency, rendering, bundle/Mermaid loading,
# browser DOM/heap growth, multi-image posting, backup and uploaded restore, with
# process RAM/disk peaks. Results: .drill/benchmark-results.json.
# Same prerequisites/variables as ops/release-drill.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-docker compose}
DOCKER=${DOCKER:-docker}
PLAYWRIGHT=${PLAYWRIGHT:-npx playwright}
PANDANOTE_TAG=$(node scripts/release-version.ts | node --input-type=module -e 'let s=""; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.parse(s).version)')
mkdir -p .drill
cat > .drill/c.env <<ENV
COMPOSE_PROJECT_NAME=pnc
PANDANOTE_TAG=$PANDANOTE_TAG
DOMAIN=c.localtest.me
ORIGIN=https://c.localtest.me:7443
HTTP_PORT=7080
HTTPS_PORT=7443
EDGE_SUBNET=172.30.0.0/24
EDGE_PROXY_IP=172.30.0.2
APP_IP=172.30.0.10
APP_CPUS=${APP_CPUS:-2}
APP_MEM_LIMIT=${APP_MEM_LIMIT:-3g}
CADDY_TLS_DIRECTIVE=tls internal
ENV
c() { $COMPOSE --env-file .drill/c.env "$@"; }
node scripts/image-build.ts --engine "$DOCKER"
c down -v --remove-orphans >/dev/null 2>&1 || true
c --profile ops run --rm --no-build migrate
c --profile ops run --rm --no-build -T setup-token > .drill/c.token
c up -d --no-build
for i in $(seq 1 60); do
  [ "$($DOCKER inspect --format '{{.State.Health.Status}}' pnc-app-1)" = healthy ] && break
  sleep 2
done
BENCH_APP=pnc-app-1 DOCKER=$DOCKER $PLAYWRIGHT test --config playwright.release.config.ts tests/release/benchmark.test.ts
echo "results: .drill/benchmark-results.json; remove with: $COMPOSE --env-file .drill/c.env down -v"
