#!/usr/bin/env bash
# Test-only two-domain HTTPS + downloaded-archive restore + restart drill.
# Requires Node 24, dependencies, Chromium, Docker/Podman and Compose v2.
# Override PANDANOTE_IMAGE to test an already-built image without rebuilding.
# Synthetic state lives in ignored .drill/. Does not touch the production Compose.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=${COMPOSE:-docker compose}
DOCKER=${DOCKER:-docker}
PLAYWRIGHT=${PLAYWRIGHT:-npx playwright}
# Keep all destructive drill cleanup under the repository's ignored test tree.
export DRILL_DIR=${DRILL_DIR:-.drill}
[[ "$DRILL_DIR" =~ ^\.drill(/[a-zA-Z0-9_-]+)?$ ]] || { echo 'DRILL_DIR must be .drill or a simple subfolder' >&2; exit 1; }
if [ -z "${PANDANOTE_IMAGE:-}" ]; then
  node scripts/image-build.ts --engine "$DOCKER"
  version=$(node scripts/release-version.ts | node --input-type=module -e 'let s=""; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.parse(s).version)')
  PANDANOTE_IMAGE=pandanote:$version
fi
mkdir -p "$DRILL_DIR"
rm -f "$DRILL_DIR/used-codes.json" "$DRILL_DIR/seed.json"
write_env() { # name host https http
  cat > "$DRILL_DIR/$1.env" <<ENV
PANDANOTE_IMAGE=$PANDANOTE_IMAGE
ORIGIN=https://$2:$3
DRILL_HOST=$2
DRILL_HTTP_PORT=$4
DRILL_HTTPS_PORT=$3
DATA_PATH=./$DRILL_DIR/$1-data
ENV
}
write_env a a.localtest.me 8443 8080
write_env b b.localtest.me 9443 9080
c() { local s=$1; shift; $COMPOSE --project-directory "$PWD" -f tests/release/compose.drill.yaml -p "pn$s" --env-file "$DRILL_DIR/$s.env" "$@"; }
healthy() {
  local id; id=$(c "$1" ps -q pandanote)
  for i in $(seq 1 90); do
    [ "$("$DOCKER" inspect --format '{{.State.Health.Status}}' "$id")" = healthy ] && return
    sleep 1
  done
  c "$1" logs --tail=50 pandanote
  return 1
}
for s in a b; do
  c "$s" down -v --remove-orphans
  # These paths belong only to this drill; removal runs in Linux, never host data.
  mkdir -p "$DRILL_DIR/$s-data"
  data_path="$PWD/$DRILL_DIR/$s-data"
  if command -v cygpath >/dev/null; then data_path=$(cygpath -m "$data_path"); fi
  MSYS_NO_PATHCONV=1 "$DOCKER" run --rm --entrypoint sh -v "$data_path:/test-data" "$PANDANOTE_IMAGE" -c 'find /test-data -mindepth 1 -delete'
  c "$s" up -d --no-build
  healthy "$s"
done
$PLAYWRIGHT test --config playwright.release.config.ts tests/release/drill.test.ts
for s in a b; do
  id=$(c "$s" ps -q pandanote)
  c "$s" stop pandanote
  [ "$("$DOCKER" inspect --format '{{.State.ExitCode}}' "$id")" = 0 ]
  c "$s" start pandanote
  healthy "$s"
done
$PLAYWRIGHT test --config playwright.release.config.ts tests/release/restart.test.ts
echo "drill passed; state: $DRILL_DIR. Remove only these test projects with Compose -f tests/release/compose.drill.yaml -p pna/pnb down -v (keep --project-directory and --env-file)."
