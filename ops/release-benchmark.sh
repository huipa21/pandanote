#!/usr/bin/env bash
# Test-only 10k-note workloads through minimal Caddy. No production config changes.
# Optional BENCH_CPUS/BENCH_MEMORY constrain the test container via engine update.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-docker compose}
DOCKER=${DOCKER:-docker}
PLAYWRIGHT=${PLAYWRIGHT:-npx playwright}
export DRILL_DIR=${DRILL_DIR:-.drill}
[[ "$DRILL_DIR" =~ ^\.drill(/[a-zA-Z0-9_-]+)?$ ]] || { echo 'DRILL_DIR must be .drill or a simple subfolder' >&2; exit 1; }
if [ -z "${PANDANOTE_IMAGE:-}" ]; then
  node scripts/image-build.ts --engine "$DOCKER"
  version=$(node scripts/release-version.ts | node --input-type=module -e 'let s=""; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.parse(s).version)')
  PANDANOTE_IMAGE=pandanote:$version
fi
mkdir -p "$DRILL_DIR"
cat > "$DRILL_DIR/c.env" <<ENV
PANDANOTE_IMAGE=$PANDANOTE_IMAGE
ORIGIN=https://c.localtest.me:7443
DRILL_HOST=c.localtest.me
DRILL_HTTP_PORT=7080
DRILL_HTTPS_PORT=7443
DATA_PATH=./$DRILL_DIR/c-data
ENV
c() { $COMPOSE --project-directory "$PWD" -f tests/release/compose.drill.yaml -p pnc --env-file "$DRILL_DIR/c.env" "$@"; }
c down -v --remove-orphans
mkdir -p "$DRILL_DIR/c-data"
data_path="$PWD/$DRILL_DIR/c-data"
if command -v cygpath >/dev/null; then data_path=$(cygpath -m "$data_path"); fi
MSYS_NO_PATHCONV=1 "$DOCKER" run --rm --entrypoint sh -v "$data_path:/test-data" "$PANDANOTE_IMAGE" -c 'find /test-data -mindepth 1 -delete'
c up -d --no-build
id=$(c ps -q pandanote)
if [ -n "${BENCH_CPUS:-}" ]; then "$DOCKER" update --cpus "$BENCH_CPUS" "$id"; fi
if [ -n "${BENCH_MEMORY:-}" ]; then "$DOCKER" update --memory "$BENCH_MEMORY" "$id"; fi
ready=false
for i in $(seq 1 90); do
  if [ "$("$DOCKER" inspect --format '{{.State.Health.Status}}' "$id")" = healthy ]; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ]
BENCH_APP=$id DOCKER=$DOCKER $PLAYWRIGHT test --config playwright.release.config.ts tests/release/benchmark.test.ts
echo "results: $DRILL_DIR/benchmark-results.json; remove with the test-only Compose -p pnc down -v."
