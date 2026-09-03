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


# ---------------------------------------------------------------------------
# LISTENER OWNERSHIP: UNKNOWN IS NOT FREE
#
# THE DEFECT THESE ENCODE. `alloy_rc_port_pid` resolved `lsof` by bare name with
# no /usr/sbin fallback and returned 1 for three different facts — tool missing,
# probe failed, nothing listening. Callers read `return 1` as "free". Measured on
# the Mac mini: 3014/3015/3016 were answering HTTP 200 from real next-server
# processes while `alloy-dev-status` printed `(free)` for every one of them, and
# `alloy_refuse_occupied_port` — the guard against starting a server on another
# slot's port — was disarmed by the same conflation.
# ---------------------------------------------------------------------------

FIXTURE_PORT=3917
/usr/bin/python3 -c "
import socket, time
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', $FIXTURE_PORT)); s.listen(1); time.sleep(25)
" >/dev/null 2>&1 &
LISTENER_PID=$!
disown "$LISTENER_PID" 2>/dev/null || true   # keep job-control chatter out of the suite output
sleep 1

owner="$(alloy_rc_port_owner "$FIXTURE_PORT")"
case "$owner" in
  owned\ *) ok "14. a live listener is reported owned with a PID ($owner)" ;;
  *) bad "14. live listener reported '$owner', expected owned <pid>" ;;
esac

# The exact shell context that produced the defect: /usr/sbin absent from PATH.
owner_nopath="$(PATH=/usr/bin:/bin bash -c '
  ALLOY_LOCAL_DEV_ROOT="'"$ROOT"'"; source "'"$ROOT"'/lib/read-core.sh"
  alloy_rc_port_owner '"$FIXTURE_PORT"'')"
case "$owner_nopath" in
  owned\ *) ok "15. ownership survives a PATH without /usr/sbin (no false free)" ;;
  *) bad "15. PATH without /usr/sbin reported '$owner_nopath' — the original defect" ;;
esac

# And when the probe genuinely cannot run, the answer is unknown — never free.
owner_noprobe="$(bash -c '
  ALLOY_LOCAL_DEV_ROOT="'"$ROOT"'"; source "'"$ROOT"'/lib/read-core.sh"
  alloy_rc_lsof_bin() { return 1; }
  alloy_rc_port_owner '"$FIXTURE_PORT"'')"
if [[ "$owner_noprobe" == "unknown" ]]; then
  ok "16. an unavailable probe reports unknown, not free"
else
  bad "16. unavailable probe reported '$owner_noprobe'"
fi

# Fail closed: unknown must not satisfy "known free", and must count as in use.
if bash -c '
  ALLOY_LOCAL_DEV_ROOT="'"$ROOT"'"; source "'"$ROOT"'/lib/read-core.sh"
  alloy_rc_lsof_bin() { return 1; }
  alloy_rc_port_known_free '"$FIXTURE_PORT"''; then
  bad "17. unknown was treated as known-free"
else
  ok "17. unknown is not known-free (bind guard fails closed)"
fi

# Kill only the fixture listener, and never this shell: an empty or self PID here
# terminated the suite before its summary line the first time round.
if [[ -n "${LISTENER_PID:-}" && "$LISTENER_PID" != "$$" ]]; then
  kill -TERM "$LISTENER_PID" >/dev/null 2>&1 || true
fi

# A port with nothing on it is still allowed to be free — this must not become
# a probe that can only ever say "unknown".
if [[ "$(alloy_rc_port_owner 3918)" == "free" ]]; then
  ok "18. an genuinely empty port is still reported free"
else
  bad "18. empty port was not reported free"
fi

# Source-level invariants: no second lsof resolver, and no (free) on the
# unproven branch of the status table.
if grep -q 'alloy_rc_lsof_bin' "$ROOT/lib/common.sh"; then
  ok "19. common.sh delegates to the one lsof resolver in the read core"
else
  bad "19. common.sh carries a second lsof resolver"
fi

if grep -q 'unattributable' "$ROOT/alloy-dev-status"; then
  ok "20. alloy-dev-status reports unattributable rather than free"
else
  bad "20. alloy-dev-status can still print (free) for an unproven port"
fi

if grep -q 'Refusing to bind a port that cannot be proven free' "$ROOT/lib/common.sh"; then
  ok "21. alloy_refuse_occupied_port refuses an unprovable port"
else
  bad "21. the bind guard still proceeds when ownership is unknown"
fi


# ---------------------------------------------------------------------------
# GOVERNED FOREIGN-OWNER RECLAIM — the refusals are the feature.
#
# The incident: Financials started Next on Runtime Performance's port 3011, and
# the only way back was a hand-run kill. This command reclaims that case and
# nothing else. Everything below asserts a thing it must NOT do.
# ---------------------------------------------------------------------------

[[ -x "$ROOT/alloy-dev-reclaim" ]] \
  && ok "22. alloy-dev-reclaim exists and is executable" \
  || bad "22. alloy-dev-reclaim missing"

grep -q 'PREVIEW ONLY' "$ROOT/alloy-dev-reclaim" \
  && ok "23. preview is the default; --apply is required to stop anything" \
  || bad "23. reclaim has no preview mode"

if grep -E 'pkill[[:space:]]+(-f[[:space:]]+)?(node|next)|kill -9|kill -KILL' "$ROOT/alloy-dev-reclaim" >/dev/null; then
  bad "24. reclaim contains a broad kill — it must never become kill-port"
else
  ok "24. reclaim never broad-kills and never auto-SIGKILLs"
fi

grep -q 'class         unattributable' "$ROOT/alloy-dev-reclaim" \
  && ok "25. an unreadable probe is refused, not treated as an empty port" \
  || bad "25. reclaim does not refuse on unknown ownership"

grep -q 'class         unmanaged_listener' "$ROOT/alloy-dev-reclaim" \
  && ok "26. a listener that is not a provable foreign dev server is refused" \
  || bad "26. reclaim does not refuse unprovable listeners"

grep -q 'this is the canonical owner' "$ROOT/alloy-dev-reclaim" \
  && ok "27. the canonical owner of a port is never reclaimed from itself" \
  || bad "27. reclaim can target the canonical owner"

grep -q 'alloy_record_server_lifecycle "reclaim"' "$ROOT/alloy-dev-reclaim" \
  && ok "28. reclaim records a lifecycle audit entry" \
  || bad "28. reclaim is not audited"

grep -q 're-observed' "$ROOT/alloy-dev-reclaim" \
  && ok "29. reclaim re-observes the port and never assumes the stop worked" \
  || bad "29. reclaim does not re-observe"

grep -q 'alloy_stop_pid_tree()' "$ROOT/lib/common.sh" \
  && ok "30. one owner for stopping a server tree, shared by stop and reclaim" \
  || bad "30. alloy_stop_pid_tree is not shared"

printf '\n==== dev-server-ownership: %s passed, %s failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
