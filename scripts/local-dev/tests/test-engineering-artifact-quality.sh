#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d /tmp/alloy-artifact-quality.XXXXXX)"
PASS=0
FAIL=0
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }
assert_ok() { local m="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$m"; else fail "$m"; fi; }

REPO="$TMP/repo"
AUDIT="$TMP/audit"
PLAN="$TMP/plan"
TASKS="$TMP/tasks"
mkdir -p "$REPO/docs/platform/governance" "$REPO/scripts/local-dev/tests" "$AUDIT" "$PLAN" "$TASKS"
git -C "$REPO" init -q
git -C "$REPO" config user.email quality@test.local
git -C "$REPO" config user.name "Quality Test"
cat >"$REPO/docs/README.md" <<'EOF'
# Docs
Historical sample text: settings-fields-v2 /admin/settings/fields
EOF
echo "# Governance" >"$REPO/docs/platform/governance/design-and-operational-doctrine.md"
echo "# Documentation" >"$REPO/docs/platform/governance/documentation-governance.md"
echo "# Boundaries" >"$REPO/docs/platform/governance/agent-repo-boundaries.md"
echo "certify implementation" >"$REPO/scripts/local-dev/alloy-engineering-certify"
echo "certify test" >"$REPO/scripts/local-dev/tests/test-certify.sh"
git -C "$REPO" add .
git -C "$REPO" commit -q -m "quality fixture"
SHA="$(git -C "$REPO" rev-parse HEAD)"

cat >"$TMP/intake.json" <<'JSON'
{
  "initiative": {
    "key": "artifact-quality-cert",
    "title": "Artifact Quality Certification",
    "objective": "Verify deterministic artifact provenance and completeness"
  },
  "operator_outcome": ["Review grounded artifacts before assignment"],
  "product_direction": ["Use explicit fixture references only"],
  "acceptance": ["Artifacts label evidence and uncertainty"],
  "constraints": ["No product changes"],
  "human_approval": {"required_gates": []},
  "known_docs": ["docs/platform/governance/design-and-operational-doctrine.md"],
  "known_files": ["scripts/local-dev/alloy-engineering-certify"]
}
JSON

cat >"$TMP/state.json" <<'JSON'
{
  "state": "planning",
  "human_decisions": []
}
JSON

node "$ROOT/lib/engineering-artifacts.mjs" audit \
  "$REPO" "$TMP/intake.json" "$AUDIT" "$SHA" "$TMP/metadata"
node "$ROOT/lib/engineering-artifacts.mjs" plan \
  "$TMP/intake.json" "$AUDIT/evidence.json" "$PLAN" "$TASKS" "$TMP/state.json" >/dev/null

assert_ok "documentation relevance reasons" grep -q "relevance_reason:" "$AUDIT/documentation-manifest.yaml"
assert_ok "documentation provenance" bash -c 'grep -q "source:" "$1" && grep -q "confidence:" "$1"' _ "$AUDIT/documentation-manifest.yaml"
assert_ok "code searches recorded" bash -c 'grep -q "terms:" "$1" && grep -q "max_files:" "$1"' _ "$AUDIT/code-manifest.yaml"
assert_ok "full task graph fields" bash -c '
  for f in task_id title objective role task_kind dependencies status allowed_scope prohibited_scope constitutional_references initiative_decisions likely_code_areas acceptance focused_checks ui_verification required_outputs integration_risks generation_basis confidence; do
    grep -q "$f:" "$1" || exit 1
  done
' _ "$PLAN/task-graph.yaml"
assert_ok "worker rationale fields" bash -c '
  for f in reason_selected prerequisites expected_inputs expected_outputs review_relationship ui_auth_readiness_required estimated_context_sources cost_rationale reason_not_selected; do
    grep -q "$f:" "$1" || exit 1
  done
' _ "$PLAN/worker-plan.yaml"
assert_ok "spec evidence sections" bash -c '
  for h in "A. Intake facts" "B. Audit findings" "C. Proposed decisions" "D. Unknowns" "E. Standard operating policy"; do
    grep -q "$h" "$1" || exit 1
  done
' _ "$PLAN/specification.md"
assert_ok "sample docs do not leak into initiative artifacts" bash -c \
  '! grep -R -qE "settings-fields-v2|/admin/settings/fields" "$1" "$2"' _ "$AUDIT" "$PLAN"
assert_ok "no duplicate list markers" bash -c '! grep -qE "^- +-" "$1"' _ "$PLAN/specification.md"
assert_ok "no contradictory unresolved copy" bash -c '! grep -qi "none — pending audit review" "$1"' _ "$PLAN/specification.md"

RAW="$(node "$ROOT/lib/engineering-artifacts.mjs" normalize-list '["raw value"]')"
PREFIXED="$(node "$ROOT/lib/engineering-artifacts.mjs" normalize-list '["- prefixed value"]')"
EMPTY="$(node "$ROOT/lib/engineering-artifacts.mjs" normalize-list '["", "   "]')"
MULTILINE="$(node "$ROOT/lib/engineering-artifacts.mjs" normalize-list '["line one\nline two"]')"
[[ "$RAW" == "- raw value" ]] && pass "raw list value normalized" || fail "raw list value normalized"
[[ "$PREFIXED" == "- prefixed value" ]] && pass "prefixed list value normalized" || fail "prefixed list value normalized"
[[ "$EMPTY" == "- None" ]] && pass "empty list value normalized" || fail "empty list value normalized"
[[ "$MULTILINE" == "- line one line two" ]] && pass "multiline list value normalized" || fail "multiline list value normalized"

echo
echo "Artifact quality tests: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
