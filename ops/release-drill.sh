#!/usr/bin/env bash
# S18 release drill: two independent production deployments with DIFFERENT domains.
#   A = source; B = fresh replacement restored from A's downloaded backup through
#   Settings. Also checks graceful shutdown (exit code 0) and restart persistence.
# Synthetic names/passwords only. Everything lives in ignored .drill/ and in
# throw-away compose projects `pna`/`pnb` (removed with their volumes at start).
#
# Requires: a compose CLI (COMPOSE, default "docker compose"), a container CLI
# (DOCKER, default "docker"), Node 24 + npm dependencies and Playwright Chromium.
# Names resolve to 127.0.0.1 through public DNS (*.localtest.me); certificates come
# from Caddy's local CA (CADDY_TLS_DIRECTIVE="tls internal"), so the browser
# ignores certificate errors for this drill only.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-docker compose}
DOCKER=${DOCKER:-docker}
PLAYWRIGHT=${PLAYWRIGHT:-npx playwright}
PANDANOTE_TAG=$(node scripts/release-version.ts | node --input-type=module -e 'let s=""; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.parse(s).version)')
mkdir -p .drill
rm -f .drill/used-codes.json .drill/seed.json

write_env() { # name domain https http subnet-index
  cat > ".drill/$1.env" <<ENV
COMPOSE_PROJECT_NAME=pn$1
PANDANOTE_TAG=$PANDANOTE_TAG
DOMAIN=$2
ORIGIN=https://$2:$3
HTTP_PORT=$4
HTTPS_PORT=$3
EDGE_SUBNET=172.$5.0.0/24
EDGE_PROXY_IP=172.$5.0.2
APP_IP=172.$5.0.10
CADDY_TLS_DIRECTIVE=tls internal
ENV
}
write_env a a.localtest.me 8443 8080 28
write_env b b.localtest.me 9443 9080 29
c() { local s=$1; shift; $COMPOSE --env-file ".drill/$s.env" "$@"; }

node scripts/image-build.ts --engine "$DOCKER"
for s in a b; do
  c $s down -v --remove-orphans >/dev/null 2>&1 || true
  c $s --profile ops run --rm --no-build migrate
  c $s --profile ops run --rm --no-build -T setup-token > ".drill/$s.token"
  c $s up -d --no-build
done
for s in a b; do
  for i in $(seq 1 60); do
    [ "$($DOCKER inspect --format '{{.State.Health.Status}}' pn$s-app-1)" = healthy ] && break
    sleep 2
  done
done

$PLAYWRIGHT test --config playwright.release.config.ts tests/release/drill.test.ts

echo "== graceful shutdown + restart"
for s in a b; do
  c $s stop app
  code=$($DOCKER inspect --format '{{.State.ExitCode}}' pn$s-app-1)
  echo "pn$s app exit code after SIGTERM: $code"
  [ "$code" = 0 ]
  c $s start app
done
for s in a b; do
  for i in $(seq 1 60); do
    [ "$($DOCKER inspect --format '{{.State.Health.Status}}' pn$s-app-1)" = healthy ] && break
    sleep 2
  done
done
$PLAYWRIGHT test --config playwright.release.config.ts tests/release/restart.test.ts
echo "drill passed; remove with: for s in a b; do $COMPOSE --env-file .drill/\$s.env down -v; done"
