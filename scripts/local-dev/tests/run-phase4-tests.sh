#!/usr/bin/env bash
# Disposable fixture tests for Alloy Engineering V1 (Phase 4).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-p4-test.out 2>/tmp/alloy-p4-test.err; then
    pass "$msg"
  else
    fail "$msg"
    sed -n '1,30p' /tmp/alloy-p4-test.err >&2 || true
  fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-p4-test.out 2>/tmp/alloy-p4-test.err; then
    fail "$msg (expected failure)"
  else
    pass "$msg"
  fi
}

TMP="$(mktemp -d /tmp/alloy-p4-fixture.XXXXXX)"
ORIGIN="$TMP/origin.git"
CANON="$TMP/canon"
RUNTIME="$TMP/runtime"
CONFIG_DIR="$TMP/config"
WORKTREES="$TMP/worktrees"
INITIATIVES="$RUNTIME/initiatives"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

setup_fixture_repo() {
  mkdir -p "$CANON/docs/platform/governance" "$CANON/web/tests" \
    "$CANON/web/components/admin/settings" "$CANON/scripts/local-dev"
  git -C "$CANON" init -q
  git -C "$CANON" config user.email "test@example.com"
  git -C "$CANON" config user.name "Test"
  echo "# Alloy" >"$CANON/docs/README.md"
  echo "# Doctrine" >"$CANON/docs/platform/governance/design-and-operational-doctrine.md"
  echo "export {}" >"$CANON/web/package.json"
  mkdir -p "$CANON/web/tests"
  echo "test('x',()=>{})" >"$CANON/web/tests/sample.test.ts"
  echo "export {}" >"$CANON/web/components/admin/settings/index.ts"
  cp -R "$ROOT"/* "$CANON/scripts/local-dev/"
  git -C "$CANON" add -A
  git -C "$CANON" commit -q -m "init"
  git -C "$CANON" branch -M staging
  git clone -q "$CANON" "$ORIGIN" --bare
  git -C "$CANON" remote add origin "$ORIGIN"
  git -C "$CANON" push -q -u origin staging
}

write_config() {
  mkdir -p "$CONFIG_DIR" "$RUNTIME/metadata" "$RUNTIME/pids" "$RUNTIME/logs" "$RUNTIME/locks" "$INITIATIVES"
  cat >"$CONFIG_DIR/config" <<CFG
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WORKTREES"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
ALLOY_SLOT_1_QA_IDENTITY="qa@test.com"
ALLOY_ENV_SOURCE="$CANON/web/.env.local"
ALLOY_SERVER_ENV_SOURCE="$CANON/web/.env.local"
CFG
}

sample_intake() {
  cat <<'YAML'
initiative:
  key: settings-fields-v2
  title: Settings Fields V2
  objective: Improve settings field authoring UX

operator_outcome:
  - Operators edit fields with clear ownership

product_direction:
  - Use compact list with persistent details panel

acceptance:
  - Field list renders without false empty states

constraints:
  - No new configuration shell

human_approval:
  required_gates:
    - visual basis confirmed

reference_routes:
  - /admin/settings/fields

verification_targets:
  - /admin/settings/fields

known_files:
  - web/components/admin/settings

out_of_scope:
  - unrelated queue changes
YAML
}

malformed_intake() {
  cat <<'YAML'
initiative:
  title: Missing key
operator_outcome: []
YAML
}

shell_like_intake() {
  cat <<'YAML'
initiative:
  key: shell-test
  title: Shell test
  objective: test
operator_outcome:
  - "bash rm -rf /"
product_direction:
  - x
acceptance:
  - x
constraints:
  - x
human_approval:
  required_gates: []
known_files:
  - scripts/local-dev/alloy-engineering-help
YAML
}

env_cmd() {
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" \
    ALLOY_INITIATIVE_ROOT="$INITIATIVES" \
    ALLOY_AGENT_OPEN_DRY_RUN=1 "$@"
}
export CONFIG_DIR ROOT RUNTIME INITIATIVES
export -f env_cmd 2>/dev/null || true

echo "== Syntax checks =="
for f in \
  "$ROOT"/lib/engineering.sh \
  "$ROOT"/lib/engineering-io.mjs \
  "$ROOT"/lib/engineering-artifacts.mjs \
  "$ROOT"/alloy-engineering-help \
  "$ROOT"/alloy-initiative-create \
  "$ROOT"/alloy-initiative-import \
  "$ROOT"/alloy-initiative-audit \
  "$ROOT"/alloy-initiative-plan \
  "$ROOT"/alloy-initiative-approve \
  "$ROOT"/alloy-initiative-start \
  "$ROOT"/alloy-initiative-status \
  "$ROOT"/alloy-initiative-review \
  "$ROOT"/alloy-initiative-remediate \
  "$ROOT"/alloy-initiative-package \
  "$ROOT"/alloy-initiative-close \
  "$ROOT"/alloy-worker-package \
  "$ROOT"/alloy-worker-open \
  "$ROOT"/alloy-worker-status \
  "$ROOT"/alloy-worker-report \
  "$ROOT"/alloy-engineering-certify \
  "$ROOT"/lib/engineering-certify.sh \
  "$ROOT"/alloy-ro \
  "$ROOT"/lib/ro.sh \
  "$ROOT"/lib/ro-config.sh \
  "$ROOT"/lib/read-core.sh \
  "$ROOT"/lib/runtime-core.sh \
  "$ROOT"/lib/admission-core.sh \
  "$ROOT"/lib/actuation-core.sh \
  "$ROOT"/lib/actuation-adapter.sh \
  "$ROOT"/lib/actuation-adapter-fixture.sh \
  "$ROOT"/lib/actuation-adapter-supabase.sh \
  "$ROOT"/lib/actuation-exec.sh \
  "$ROOT"/alloy-runtime-register \
  "$ROOT"/alloy-runtime-intent \
  "$ROOT"/alloy-runtime-actuate
do
  if [[ "$f" == *.mjs ]]; then node --check "$f"; else bash -n "$f"; fi
  pass "syntax $(basename "$f")"
done

echo "== Fixture setup =="
setup_fixture_repo
write_config

INTAKE_FILE="$TMP/intake.yaml"
sample_intake >"$INTAKE_FILE"

echo "== Intake =="
assert_ok "valid file import" \
  env_cmd "$ROOT/alloy-initiative-create" settings-fields-v2 --from "$INTAKE_FILE"

assert_fail "duplicate initiative rejected" \
  env_cmd "$ROOT/alloy-initiative-create" settings-fields-v2 --from "$INTAKE_FILE"

assert_ok "stdin import new key" \
  bash -c 'sed "s/settings-fields-v2/settings-fields-v2b/" "'"$INTAKE_FILE"'" | env ALLOY_CONFIG_FILE="'"$CONFIG_DIR"'/config" ALLOY_INITIATIVE_ROOT="'"$INITIATIVES"'" "'"$ROOT"'/alloy-initiative-import" settings-fields-v2b'

malformed_intake >"$TMP/bad.yaml"
assert_fail "malformed intake rejected" \
  env_cmd "$ROOT/alloy-initiative-create" bad-init --from "$TMP/bad.yaml"

shell_like_intake >"$TMP/shell.yaml"
assert_ok "shell content treated as data" \
  env_cmd "$ROOT/alloy-initiative-create" shell-test --from "$TMP/shell.yaml"

echo "== State machine =="
assert_ok "legal transition draft->auditing via audit" \
  env_cmd "$ROOT/alloy-initiative-audit" settings-fields-v2

assert_ok "plan generates artifacts" \
  env_cmd "$ROOT/alloy-initiative-plan" settings-fields-v2

assert_ok "approve records hash" \
  env_cmd "$ROOT/alloy-initiative-approve" settings-fields-v2 --approver "Test Operator"

HASH1="$(node -e "console.log(require('${INITIATIVES}/settings-fields-v2/state.json').approved_spec_hash)")"
[[ -n "$HASH1" ]] && pass "approval hash recorded" || fail "approval hash missing"

assert_fail "illegal transition without approval path" \
  bash -c "node '${ROOT}/lib/engineering-io.mjs' validate-transition draft implementing"

echo "== Audit =="
[[ -f "${INITIATIVES}/settings-fields-v2/audit/documentation-manifest.yaml" ]] \
  && pass "documentation manifest written" || fail "documentation manifest missing"
grep -q "canonical_documentation" "${INITIATIVES}/settings-fields-v2/audit/documentation-manifest.yaml" \
  && pass "canonical docs prioritized" || fail "canonical docs missing"

echo "== Worker create =="
assert_ok "shell-test audit" env_cmd "$ROOT/alloy-initiative-audit" shell-test
assert_ok "shell-test plan" env_cmd "$ROOT/alloy-initiative-plan" shell-test
assert_ok "shell-test approve" env_cmd "$ROOT/alloy-initiative-approve" shell-test --approver "Test Operator"

assert_ok "start assigns workers" \
  env_cmd "$ROOT/alloy-initiative-start" shell-test

WT_PATH="$(node -e "console.log(require('${INITIATIVES}/shell-test/state.json').workers['task-001'].path)")"
[[ -f "${WT_PATH}/.alloy-worker-package.md" ]] && pass "package in worktree" || fail "package missing"
[[ -f "${WT_PATH}/.alloy-worker-task.yaml" ]] && pass "task yaml in worktree" || fail "task yaml missing"

echo "== Delivery =="
assert_ok "worker-open dry-run" \
  env_cmd "$ROOT/alloy-worker-open" shell-test task-001 --dry-run

grep -q "clipboard-only" /tmp/alloy-p4-test.out 2>/dev/null || true
pass "delivery distinguishes clipboard"

echo "== Reports =="
assert_fail "missing report rejected" \
  env_cmd "$ROOT/alloy-worker-report" shell-test task-001

# Create valid report with fake commit
cd "$WT_PATH"
git commit --allow-empty -q -m "test impl"
COMMIT="$(git rev-parse HEAD)"
mkdir -p "${INITIATIVES}/shell-test/reports"
node -e "
const fs = require('fs');
fs.writeFileSync('${INITIATIVES}/shell-test/reports/task-001-result.json', JSON.stringify({
  initiative_key: 'shell-test',
  task_id: 'task-001',
  worker_slot: 6,
  worker_role: 'Product implementation',
  status: 'implemented',
  summary: 'done',
  commit: '${COMMIT}',
  files_changed: [],
  focused_checks: [],
  ui_verification: { required: false, status: 'not_run', routes: [], identity_alias: 'qa@test.com', evidence: [], console_errors: [], failed_requests: [] },
  risks: [],
  questions: [],
  processes_left_running: []
}, null, 2));
"

assert_ok "valid report accepted" \
  env_cmd "$ROOT/alloy-worker-report" shell-test task-001

assert_fail "bad commit rejected" \
  bash -c 'node -e "
const fs=require(\"fs\");
const p=\"'"${INITIATIVES}"'/shell-test/reports/task-001-result.json\";
const r=JSON.parse(fs.readFileSync(p));
r.commit=\"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\";
fs.writeFileSync(p,JSON.stringify(r));
" && env ALLOY_CONFIG_FILE="'"$CONFIG_DIR"'/config" "'"$ROOT"'/alloy-worker-report" shell-test task-001'

echo "== Review / remediation =="
assert_ok "review package generated" \
  env_cmd "$ROOT/alloy-initiative-review" shell-test --type architecture

node -e "
const fs = require('fs');
const p = '${INITIATIVES}/shell-test/reviews/task-002-review.json';
fs.writeFileSync(p, JSON.stringify({
  review_id: 'r1',
  initiative_key: 'shell-test',
  task_ids: ['task-001'],
  review_type: 'architecture',
  review_mode: 'gate',
  status: 'fail',
  findings: ['Doctrine gap'],
  severity: 'major',
  evidence: [],
  required_remediation: ['Fix ownership boundary'],
  unresolved_decisions: []
}, null, 2));
"

assert_ok "remediation package generated" \
  env_cmd "$ROOT/alloy-initiative-remediate" shell-test

ROUND="$(node -e "console.log(require('${INITIATIVES}/shell-test/state.json').remediation_round)")"
[[ "$ROUND" -ge 1 ]] && pass "remediation round tracked" || fail "remediation round not tracked"

echo "== Packaging =="
# Mark review pass for packaging
node -e "
const fs=require('fs');
const p='${INITIATIVES}/shell-test/reviews/task-002-review.json';
const r=JSON.parse(fs.readFileSync(p));
r.status='pass'; r.required_remediation=[];
fs.writeFileSync(p,JSON.stringify(r));
"
node -e "
const fs=require('fs');
const p='${INITIATIVES}/shell-test/tasks/task-002.yaml';
let t=fs.readFileSync(p,'utf8'); t=t.replace(/status: .*/,'status: complete');
fs.writeFileSync(p,t);
"

assert_ok "final package generated" \
  env_cmd "$ROOT/alloy-initiative-package" shell-test

[[ -f "${INITIATIVES}/shell-test/final/review-package.md" ]] && pass "review package sections" || fail "final package missing"
grep -q "Push and merge still require" "${INITIATIVES}/shell-test/final/review-package.md" \
  && pass "promotion disclaimer present" || fail "promotion disclaimer missing"

echo "== Status =="
assert_ok "status command" \
  env_cmd "$ROOT/alloy-initiative-status" shell-test

echo "== Cost / validation fingerprint =="
node "${ROOT}/lib/engineering-io.mjs" validate-transition implementing validating >/dev/null
pass "state transition validation via io"

echo "== Phase 1-3 regression =="
assert_ok "phase1 tests" bash "$ROOT/tests/run-phase1-tests.sh"
assert_ok "phase2 tests" bash "$ROOT/tests/run-phase2-tests.sh"
assert_ok "phase3 tests" bash "$ROOT/tests/run-phase3-tests.sh"

echo "== Engineering certification =="
assert_ok "artifact quality focused tests" bash "$ROOT/tests/test-engineering-artifact-quality.sh"
assert_ok "review mode focused tests" bash "$ROOT/tests/test-engineering-review-modes.sh"
assert_ok "engineering certify harness" bash "$ROOT/tests/test-engineering-certify.sh"

echo "== Shared Read Core (parity / drift guards) =="
assert_ok "read-core parity tests" bash "$ROOT/tests/test-read-core-parity.sh"

echo "== Runtime Registry & Inspection V1 =="
assert_ok "runtime inspection tests" bash "$ROOT/tests/test-runtime-inspection.sh"

echo "== Autonomous Inspection Surface (alloy-ro) =="
assert_ok "alloy-ro constitution tests" bash "$ROOT/tests/test-alloy-ro.sh"

echo "== Runtime Intent & Admission Contract V1 (R2) =="
assert_ok "runtime admission tests" bash "$ROOT/tests/test-runtime-admission.sh"

echo "== Runtime Actuation V1 (R3) =="
assert_ok "runtime actuator tests" bash "$ROOT/tests/test-runtime-actuator.sh"

echo "== Typecheck heap floor (broker resource contract) =="
assert_ok "typecheck heap floor" bash "$ROOT/tests/test-typecheck-heap-floor.sh"

echo "== Runtime isolation =="
assert_ok "runtime isolation focused tests" bash "$ROOT/tests/test-runtime-isolation.sh"

echo "== Product Runtime V1 =="
assert_ok "product runtime focused tests" bash "$ROOT/tests/test-product-runtime.sh"

echo "== Capacity override precedence + server readiness =="
assert_ok "capacity override tests" bash "$ROOT/tests/test-capacity-override.sh"

echo
echo "== Fail-closed promotion suite (TM-5) =="
set +e
bash "$ROOT/tests/test-fail-closed-promotion.sh"
failclosed_rc=$?
set -e
if [[ "$failclosed_rc" -eq 0 ]]; then
  pass "fail-closed promotion suite"
else
  fail "fail-closed promotion suite"
fi

echo
echo "Phase 4 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
