#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d /tmp/alloy-review-modes.XXXXXX)"
RUNTIME="$TMP/runtime"
INITIATIVES="$RUNTIME/initiatives"
KEY="review-mode-cert"
BASE="$INITIATIVES/$KEY"
PASS=0
FAIL=0
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }
assert_ok() { local m="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$m"; else fail "$m"; fi; }
assert_fail() { local m="$1"; shift; if "$@" >/dev/null 2>&1; then fail "$m"; else pass "$m"; fi; }

mkdir -p "$RUNTIME/metadata" "$RUNTIME/pids" "$RUNTIME/logs" "$RUNTIME/locks" \
  "$BASE/reviews" "$BASE/reports" "$BASE/tasks"
cat >"$TMP/config" <<CFG
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_REPO="$TMP/repo"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
CFG
cat >"$BASE/state.json" <<JSON
{
  "key": "$KEY",
  "state": "implementing",
  "approved_spec_hash": "fixture-hash",
  "human_decisions": [],
  "reviews": {}
}
JSON
cat >"$BASE/tasks/task-002.yaml" <<'YAML'
task_id: task-002
status: blocked
YAML

run_review() {
  env ALLOY_CONFIG_FILE="$TMP/config" ALLOY_INITIATIVE_ROOT="$INITIATIVES" \
    "$ROOT/alloy-initiative-review" "$@"
}

assert_ok "advisory valid during implementing" \
  run_review "$KEY" --mode advisory --type architecture
grep -q "Mode: advisory" "$BASE/reviews/task-002-review-package.md" \
  && pass "advisory mode rendered" || fail "advisory mode rendered"
grep -q "status: blocked" "$BASE/tasks/task-002.yaml" \
  && pass "advisory cannot complete readiness task" || fail "advisory cannot complete readiness task"

assert_fail "gate before report rejected" \
  run_review "$KEY" --mode gate --type integration
assert_fail "final before validation rejected" \
  run_review "$KEY" --mode final --type integration

cat >"$BASE/reports/task-001-result.json" <<'JSON'
{"status":"implemented"}
JSON
node -e "
  const fs = require('fs');
  const p = '${BASE}/state.json';
  const d = JSON.parse(fs.readFileSync(p));
  d.state = 'reviewing';
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
"
rm -f "$BASE/reviews/task-002-review.json"
assert_ok "final review valid after reporting and validation state" \
  run_review "$KEY" --mode final --type integration

node -e "
  const fs = require('fs');
  const p = '${BASE}/reviews/task-002-review.json';
  const d = JSON.parse(fs.readFileSync(p));
  d.status = 'pass';
  d.findings = [];
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
"
assert_ok "completed final review ingests" \
  run_review "$KEY" --ingest task-002
node -e "
  const d = require('${BASE}/state.json');
  const r = d.reviews['task-002'];
  process.exit(r && r.mode === 'final' && r.contributes_to_ready === true ? 0 : 1);
" && pass "final review contributes to READY" || fail "final review contributes to READY"

echo
echo "Review mode tests: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
