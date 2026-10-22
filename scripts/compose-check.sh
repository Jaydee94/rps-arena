#!/usr/bin/env bash
# End-to-end check of compose.yaml: config, image build + health, the test service against a real
# Redis (Redis tests must RUN, not be skipped) and a two-replica smoke test.
# Exits non-zero at the first failed step and always tears the stack down again.
#
# Environment (all optional):
#   APP_PORT / APP2_PORT / REDIS_PORT  host ports (defaults 8080 / 8081 / 6380)
#   COMPOSE_TEST_CMD                   npm command run by the tests service (default: npm test);
#                                      " -- --reporter=verbose" is appended, and it must include
#                                      the @rps/server tests (the Redis assertion looks for them)
#   COMPOSE_PROJECT_NAME               defaults to rps-arena-check so a running dev stack
#                                      (project rps-arena) is never torn down by this script
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export APP_PORT="${APP_PORT:-8080}"
export APP2_PORT="${APP2_PORT:-8081}"
export REDIS_PORT="${REDIS_PORT:-6380}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rps-arena-check}"

WORK_DIR="$(mktemp -d)"
STEP="start"

cleanup() {
  local status=$?
  docker compose --profile test --profile replicas down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
  if [ "$status" -eq 0 ]; then
    echo "PASS: compose check (config, app health, redis-backed tests, two-replica smoke)"
  else
    echo "FAIL: compose check failed during step: $STEP (exit $status)" >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

step() {
  STEP="$*"
  echo "==> $STEP"
}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "docker not found"
command -v curl >/dev/null 2>&1 || fail "curl not found"
command -v node >/dev/null 2>&1 || fail "node not found"
# The smoke test runs on the host and needs the repo's dependencies.
node --input-type=module -e "import('socket.io-client')" >/dev/null 2>&1 \
  || fail "socket.io-client cannot be resolved on the host: run 'npm ci' first"

step "compose config (default and each profile)"
docker compose config -q
docker compose --profile test config -q
docker compose --profile replicas config -q
docker compose --profile test --profile replicas config -q

step "build and start redis + app (waits for healthchecks)"
docker compose up -d --build --wait redis app

step "app /healthz and /readyz"
base="http://127.0.0.1:${APP_PORT}"
health="$(curl -fsS "$base/healthz")" || fail "GET $base/healthz failed"
[ "$health" = "ok" ] || fail "GET $base/healthz returned '$health', expected 'ok'"
code="$(curl -sS -o /dev/null -w '%{http_code}' "$base/readyz")" || fail "GET $base/readyz failed"
[ "$code" = "200" ] || fail "GET $base/readyz returned HTTP $code, expected 200"

# The verbose reporter lists every test (passed: "✓", skipped: "↓"), which the assertion below needs.
export COMPOSE_TEST_CMD="${COMPOSE_TEST_CMD:-npm test} -- --reporter=verbose"
step "tests service against redis (${COMPOSE_TEST_CMD})"
test_log="$WORK_DIR/tests.log"
# -T: no pseudo-TTY, so the output is plain and can be parsed. --build: never reuse a stale image.
# The pipeline may fail (set -e / pipefail), so its status is captured explicitly.
tests_status=0
docker compose run --build --rm -T tests 2>&1 | tee "$test_log" || tests_status="${PIPESTATUS[0]}"
[ "$tests_status" -eq 0 ] || fail "tests service exited with status $tests_status"

step "redis-backed tests ran (not skipped)"
plain_log="$WORK_DIR/tests.plain.log"
sed -E $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$test_log" > "$plain_log"
redis_passed="$(grep -cE '✓.*redis-store\.test\.ts' "$plain_log" || true)"
redis_skipped="$(grep -cE '↓.*redis-store\.test\.ts' "$plain_log" || true)"
[ "$redis_skipped" -eq 0 ] || fail "$redis_skipped redis-store tests were skipped (REDIS_URL not reaching the tests service?)"
[ "$redis_passed" -gt 0 ] || fail "no passed redis-store test in the output (test file did not run)"
echo "ok: $redis_passed redis-store tests passed, 0 skipped"

step "second replica (app2) and cross-replica smoke test"
docker compose --profile replicas up -d --wait app2
APP_URL="http://127.0.0.1:${APP_PORT}" APP2_URL="http://127.0.0.1:${APP2_PORT}" \
  node scripts/compose-smoke.mjs

STEP="done"
