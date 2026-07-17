#!/usr/bin/env bash
# TM-5 Fail Closed — promotion classification must never become more optimistic
# because evidence is missing.
#
# The regression: risk came from a hardcoded reports/task-001-result.json read
# as `node -e ... || echo 1`. A MISSING report therefore produced risks=1, which
# classified as READY_WITH_KNOWN_RISKS — a promotion-eligible verdict produced by
# the absence of evidence.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

TMP="$(mktemp -d /tmp/alloy-fail-closed.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

export ALLOY_RUNTIME_ROOT="$TMP/state"
export ALLOY_INITIATIVE_ROOT="$TMP/state/initiatives"
export ALLOY_LOCAL_DEV_ROOT="$LOCAL_DEV"

cat >"$TMP/config" <<EOF
ALLOY_REPO="$TMP/canon"
ALLOY_WORKTREE_ROOT="$TMP/worktrees"
ALLOY_RUNTIME_ROOT="$TMP/state"
ALLOY_INITIATIVE_ROOT="$TMP/state/initiatives"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
EOF
export ALLOY_CONFIG_FILE="$TMP/config"

KEY="fixture-initiative"
BASE="$ALLOY_INITIATIVE_ROOT/$KEY"
mkdir -p "$BASE/tasks" "$BASE/reports" "$BASE/reviews" "$BASE/final"

# Minimal initiative shaped like the real one.
cat >"$BASE/state.json" <<'EOF'
{
  "key": "fixture-initiative",
  "title": "fixture",
  "state": "reviewing",
  "human_decisions": [],
  "workers": {},
  "reports": {},
  "reviews": {
    "r1": { "mode": "final", "status": "pass", "contributes_to_ready": true }
  }
}
EOF

cat >"$BASE/tasks/task-001.yaml" <<'EOF'
id: task-001
status: complete
EOF

cat >"$BASE/reviews/task-002-review.json" <<'EOF'
{ "review_id": "task-002-review", "status": "pass", "findings": [] }
EOF

# Source the classifier out of the command without running main().
# shellcheck source=../lib/common.sh
source "${LOCAL_DEV}/lib/common.sh"
alloy_load_config
# shellcheck source=../lib/engineering.sh
source "${LOCAL_DEV}/lib/engineering.sh"

# Extract classify_promotion + its helpers from the command file.
sed -n '/^# Reasons behind the classification/,/^main() {/p' \
  "${LOCAL_DEV}/alloy-initiative-package" | sed '$d' >"$TMP/classifier.sh"
# shellcheck source=/dev/null
source "$TMP/classifier.sh"

# ── 1. Missing report must NOT soften the verdict ────────────────────────────
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "NOT_READY" ]]; then
  pass "missing result report classifies NOT_READY (not READY_WITH_KNOWN_RISKS)"
else
  fail "missing result report classified '$got' — absence produced a promotable verdict"
fi

reasons="$(classify_reasons_print)"
if [[ "$reasons" == *"not assessable"* ]]; then
  pass "classification states that the claim was not assessable"
else
  fail "classification does not explain the missing evidence: $reasons"
fi

# ── 2. Unreadable report must NOT soften the verdict ─────────────────────────
printf 'not json at all\n' >"$BASE/reports/task-001-result.json"
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "NOT_READY" ]]; then
  pass "unreadable result report classifies NOT_READY"
else
  fail "unreadable result report classified '$got'"
fi

# ── 3. Present report with risks -> READY_WITH_KNOWN_RISKS ───────────────────
cat >"$BASE/reports/task-001-result.json" <<'EOF'
{ "task_id": "task-001", "risks": ["one known risk"] }
EOF
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "READY_WITH_KNOWN_RISKS" ]]; then
  pass "present report with risks classifies READY_WITH_KNOWN_RISKS"
else
  fail "present report with risks classified '$got'"
fi

# ── 4. Present report, no risks -> READY ─────────────────────────────────────
cat >"$BASE/reports/task-001-result.json" <<'EOF'
{ "task_id": "task-001", "risks": [] }
EOF
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "READY" ]]; then
  pass "present report with no risks classifies READY"
else
  fail "present report with no risks classified '$got'"
fi

# ── 4b. A REVIEW task's evidence is a review, not a result report ────────────
# Regression guard: the first fail-closed attempt demanded reports/<tid>-result
# .json from EVERY complete task, which refused the reviewer task (task-002) and
# broke the certification harness's happy path. A task's evidence depends on its
# kind.
cat >"$BASE/tasks/task-002.yaml" <<'EOF'
id: task-002
status: complete
EOF
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "READY" ]]; then
  pass "a complete review task is satisfied by its review (not a result report)"
else
  fail "review task classified '$got' — review evidence not accepted: $(classify_reasons_print)"
fi

# But a complete task with NEITHER kind of evidence must block.
cat >"$BASE/tasks/task-009.yaml" <<'EOF'
id: task-009
status: complete
EOF
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "NOT_READY" ]]; then
  pass "a complete task with no evidence of any kind classifies NOT_READY"
else
  fail "evidence-free complete task classified '$got'"
fi
rm -f "$BASE/tasks/task-009.yaml" "$BASE/tasks/task-002.yaml"

# ── 5. A second task with no report must block, even though task-001 is clean ─
# This is the de-hardcoding: risk was previously read from task-001 alone, so a
# second task's missing evidence was invisible.
cat >"$BASE/tasks/task-003.yaml" <<'EOF'
id: task-003
status: complete
EOF
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "NOT_READY" ]]; then
  pass "a second task's missing report blocks (risk is not read from task-001 alone)"
else
  fail "second task's missing report classified '$got' — evidence assessed from one task only"
fi

reasons="$(classify_reasons_print)"
if [[ "$reasons" == *"task-003"* ]]; then
  pass "classification names the task whose evidence is missing"
else
  fail "classification does not name task-003: $reasons"
fi

# ── 6. Risks aggregate across tasks ──────────────────────────────────────────
cat >"$BASE/reports/task-003-result.json" <<'EOF'
{ "task_id": "task-003", "risks": ["risk from the second task"] }
EOF
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "READY_WITH_KNOWN_RISKS" ]]; then
  pass "risks aggregate across every task, not just task-001"
else
  fail "aggregate risk classified '$got'"
fi

# ── 7. Incomplete task still blocks ──────────────────────────────────────────
cat >"$BASE/tasks/task-003.yaml" <<'EOF'
id: task-003
status: implementing
EOF
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "NOT_READY" ]]; then
  pass "incomplete task still classifies NOT_READY"
else
  fail "incomplete task classified '$got'"
fi

# ── 8. An initiative with no tasks is not READY ──────────────────────────────
rm -f "$BASE/tasks/task-001.yaml" "$BASE/tasks/task-003.yaml"
got="$(classify_promotion "$KEY" "$BASE")"
if [[ "$got" == "NOT_READY" ]]; then
  pass "an initiative with no tasks classifies NOT_READY (absence of work is not readiness)"
else
  fail "no-task initiative classified '$got'"
fi

printf '\nFail-closed promotion results: PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
