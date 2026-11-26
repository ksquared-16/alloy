#!/usr/bin/env bash
# Validate Cursor/Claude instruction wiring for Managed Sprint Operations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PASS=0
FAIL=0
pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

CANON="docs/platform/governance/managed-sprint-operations.md"
CURSOR_RULE=".cursor/rules/managed-sprint-operations.mdc"
CLAUDE="CLAUDE.md"

echo "== Instruction resolution =="

[[ -f "$ROOT/$CANON" ]] && pass "canonical doc exists" || fail "canonical doc missing"
[[ -f "$ROOT/$CURSOR_RULE" ]] && pass "Cursor rule exists" || fail "Cursor rule missing"
[[ -f "$ROOT/$CLAUDE" ]] && pass "CLAUDE.md exists" || fail "CLAUDE.md missing"

grep -q 'alwaysApply: true' "$ROOT/$CURSOR_RULE" && pass "Cursor rule alwaysApply" || fail "Cursor rule not alwaysApply"
grep -qF "$CANON" "$ROOT/$CURSOR_RULE" && pass "Cursor rule points at canonical doc" || fail "Cursor rule missing canonical path"
grep -q 'alloy-sprint-start' "$ROOT/$CURSOR_RULE" && pass "Cursor rule mentions sprint-start" || fail "Cursor rule missing sprint-start"
grep -q 'alloy-worker-pause' "$ROOT/$CURSOR_RULE" && pass "Cursor rule prints operator controls" || fail "Cursor rule missing operator controls"

grep -qF "$CANON" "$ROOT/$CLAUDE" && pass "CLAUDE.md points at canonical doc" || fail "CLAUDE.md missing canonical path"
grep -q 'alloy-sprint-start' "$ROOT/$CLAUDE" && pass "CLAUDE.md mentions sprint-start" || fail "CLAUDE.md missing sprint-start"
grep -q 'first response' "$ROOT/$CLAUDE" || grep -q 'First response' "$ROOT/$CLAUDE" && pass "CLAUDE.md first-response contract" || fail "CLAUDE.md missing first-response"

grep -q 'Use the Alloy managed sprint workflow defined in the repository' "$ROOT/$CANON" && \
  pass "canonical short invocation present" || fail "short invocation missing"
grep -q 'never implies' "$ROOT/$CANON" && pass "commit≠push policy present" || fail "commit≠push policy missing"
grep -q '3011' "$ROOT/$CANON" && pass "permanent ports documented" || fail "ports missing"

echo "== Cross-links =="
for f in \
  docs/README.md \
  docs/platform/governance/workspace-orchestration.md \
  docs/platform/governance/agent-repo-boundaries.md \
  docs/platform/governance/documentation-governance.md \
  scripts/local-dev/README.md \
  scripts/local-dev/CHEAT-SHEET.md \
  scripts/local-dev/AGENT-INSTRUCTIONS.md \
  .cursor/rules/alloy-project-context.mdc \
  .cursor/rules/alloy-development-guardrails.mdc \
  .cursor/rules/repo-boundry.mdc
do
  if grep -q 'managed-sprint-operations' "$ROOT/$f"; then
    pass "link in $f"
  else
    fail "missing managed-sprint-operations link in $f"
  fi
done

echo "== No contradictory ad-hoc port guidance in workspace-orchestration =="
if grep -n 'npx next dev -p 3002' "$ROOT/docs/platform/governance/workspace-orchestration.md" >/dev/null; then
  fail "workspace-orchestration still recommends ad-hoc 3002 for agents"
else
  pass "no ad-hoc 3002 agent server guidance"
fi
grep -q '3011–3016\|3011-3016\|3011' "$ROOT/docs/platform/governance/workspace-orchestration.md" && \
  pass "workspace-orchestration cites managed ports" || fail "workspace-orchestration missing 3011 ports"

echo "== Install command registration =="
for cmd in alloy-sprint-start alloy-worker-pause alloy-worker-resume alloy-worker-doctor alloy-sprint-finish; do
  if grep -q "$cmd" "$ROOT/scripts/local-dev/install.sh"; then
    pass "install registers $cmd"
  else
    fail "install missing $cmd"
  fi
  [[ -x "$ROOT/scripts/local-dev/$cmd" ]] && pass "executable $cmd" || fail "not executable $cmd"
done

echo "== Shell syntax =="
for f in \
  "$ROOT/scripts/local-dev/lib/sprint-ops.sh" \
  "$ROOT/scripts/local-dev/alloy-sprint-start" \
  "$ROOT/scripts/local-dev/alloy-worker-pause" \
  "$ROOT/scripts/local-dev/alloy-worker-resume" \
  "$ROOT/scripts/local-dev/alloy-worker-doctor" \
  "$ROOT/scripts/local-dev/alloy-sprint-finish"
do
  bash -n "$f" && pass "bash -n $(basename "$f")" || fail "bash -n $(basename "$f")"
done

echo
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
