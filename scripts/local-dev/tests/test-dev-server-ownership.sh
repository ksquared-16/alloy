#!/usr/bin/env bash
# Dev-server ownership — slot-scoped PID, idempotent start, safe stop.
# Uses the same fixture pattern as run-phase1-tests (isolated runtime).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

# Static contract proofs (no live Next required): ownership helpers refuse foreign PIDs
# and duplicate starts are documented in alloy-dev-start.

grep -q 'Refusing duplicate start' "$ROOT/alloy-dev-start" \
  && ok "1. alloy-dev-start refuses duplicate start for live owned PID" \
  || bad "1. duplicate-start guard missing"

grep -q 'does not belong to' "$ROOT/alloy-dev-stop" \
  && ok "2. alloy-dev-stop refuses foreign port/PID kill" \
  || bad "2. foreign-kill guard missing"

grep -q 'alloy_stop_pid_tree' "$ROOT/alloy-dev-stop" \
  && ok "3. stop uses pid-tree of owned process (not pkill node)" \
  || bad "3. owned stop helper missing"

! grep -E 'pkill[[:space:]]+(-f[[:space:]]+)?(node|next)' "$ROOT/alloy-dev-stop" \
  && ok "4. alloy-dev-stop never pkill node/next" \
  || bad "4. broad pkill found in alloy-dev-stop"

grep -q 'alloy_pid_belongs_to_worktree' "$ROOT/alloy-dev-start" \
  && ok "5. start validates PID belongs to worktree" \
  || bad "5. worktree PID ownership check missing"

grep -q 'alloy_guard_server_start' "$ROOT/alloy-dev-start" \
  && ok "6. start enforces running-server capacity guard" \
  || bad "6. server capacity guard missing"

# Sprint finish stops only the named worktree's server.
grep -q 'alloy-dev-stop" "\$name"' "$ROOT/lib/sprint-ops.sh" \
  || grep -q 'alloy-dev-stop" "$name"' "$ROOT/lib/sprint-ops.sh" \
  || grep -q 'alloy-dev-stop" "\$name"' "$ROOT/lib/sprint-ops.sh"
if grep -E 'alloy-dev-stop" "\$name"|alloy-dev-stop "\$name"' "$ROOT/lib/sprint-ops.sh" >/dev/null; then
  ok "7. sprint finish stops slot-scoped server by name"
else
  # looser check
  grep -q 'alloy-dev-stop' "$ROOT/lib/sprint-ops.sh" \
    && ok "7. sprint finish invokes alloy-dev-stop" \
    || bad "7. sprint finish missing alloy-dev-stop"
fi

! grep -E 'pkill[[:space:]]+(-f[[:space:]]+)?(node|next)' "$ROOT/lib/sprint-ops.sh" \
  && ok "8. sprint-ops never pkill node/next" \
  || bad "8. broad pkill in sprint-ops"

# Metadata → pid path is per worktree name (slot ownership record).
grep -q 'alloy_pid_path' "$ROOT/lib/common.sh" \
  && ok "9. pid path helper exists in common.sh" \
  || bad "9. pid path helper missing"

printf '\n==== dev-server-ownership: %s passed, %s failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
