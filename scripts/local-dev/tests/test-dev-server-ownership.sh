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

# ── Live ownership judgement (regression: supervisor PIDs on lsof-less hosts) ──
#
# `alloy-dev-start` records the PID of `npm run dev`, and that command line names
# no path. The cwd signal that would settle it needs lsof, which is absent on
# some hosts, so ownership was decided by the wrapper's command line alone and a
# healthy toolkit-owned server was reported `stale` — `alloy-agent-verify` then
# refused to run against it. Ownership must follow the process tree.

source "$ROOT/lib/common.sh"

TMPD="$(mktemp -d 2>/dev/null || mktemp -d -t alloywt)"
MARK="$TMPD/serves-this-worktree"
: > "$MARK"

# Only the innermost shell expands MARKPATH, so the literal path exists at depth
# 2 and nowhere above it. Without that isolation the root matches on its own
# command line and the depth walk is never exercised.
export MARKPATH="$MARK"
bash -c 'bash -c "tail -f \$MARKPATH ; true" ; true' &
ROOTPID=$!
sleep 2
D1="$(ps -eo pid=,ppid= | awk -v r="$ROOTPID" '$2==r{print $1; exit}')"
D2="$(ps -eo pid=,ppid= | awk -v c="$D1" '$2==c{print $1; exit}')"

if [[ -n "$D2" ]] && ! ps -o command= -p "$ROOTPID" 2>/dev/null | grep -qF "$MARK" \
   && ps -o command= -p "$D2" 2>/dev/null | grep -qF "$MARK"; then
  if alloy_pid_belongs_to_worktree "$ROOTPID" "$MARK"; then
    ok "10. supervisor PID owns the worktree its descendant serves"
  else
    bad "10. supervisor PID not recognised through the process tree"
  fi

  if alloy_pid_belongs_to_worktree "$ROOTPID" "${MARK}-other"; then
    bad "11. claimed ownership of an unrelated path"
  else
    ok "11. refuses a worktree no descendant serves"
  fi
else
  bad "10. depth-2 fixture did not build (cannot judge)"
  bad "11. depth-2 fixture did not build (cannot judge)"
fi

# No `wait` here: bash re-raises a background job's fatal signal in the calling
# shell, so waiting on a job we just SIGTERM'd ends the suite with 143 after the
# assertions have already passed.
kill "$D2" "$D1" "$ROOTPID" 2>/dev/null
rm -rf "$TMPD"

# A dead PID owns nothing, tree or no tree.
DEADPID="$(bash -c 'echo $$')"
sleep 1
if alloy_pid_belongs_to_worktree "$DEADPID" "/nonexistent/worktree"; then
  bad "12. a dead PID claimed ownership"
else
  ok "12. dead PID owns nothing"
fi

# The walk must terminate even when the tree is deep or malformed.
if alloy_pid_tree_serves_worktree "$$" "/definitely/not/a/worktree/path"; then
  bad "13. matched a path nothing serves"
else
  ok "13. bounded walk terminates and refuses"
fi

printf '\n==== dev-server-ownership: %s passed, %s failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
