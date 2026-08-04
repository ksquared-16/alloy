#!/usr/bin/env bash
# =============================================================================
# test-lease-reclaim — a crashed certification must not pin the shared stack.
#
# The failure this guards: a lease whose holder process died kept the shared
# environment reserved for the full 12h TTL, so the next certification run was
# blocked by a session that no longer existed.
#
# Reclaim is deliberately conservative. Every negative control below asserts a
# case where the lease is PRESERVED, because wrongly reclaiming a live holder is
# far worse than waiting.
#
# Touches no Docker, no stack, no volumes — it only exercises lease files.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="${SCRIPT_DIR}/alloy-stack"
PASS=0; FAIL=0

t() { # t <desc> <expected reclaim|preserve> <lease file>
  local desc="$1" want="$2" f="$3" got
  if run_reclaimable "$f"; then got=reclaim; else got=preserve; fi
  if [[ "$got" == "$want" ]]; then PASS=$((PASS+1)); printf '  ✓ %s\n' "$desc"
  else FAIL=$((FAIL+1)); printf '  ✗ %s (got=%s want=%s)\n' "$desc" "$got" "$want"; fi
}

# Exercise the real predicate out of alloy-stack rather than a copy of it.
run_reclaimable() {
  ALLOY_STACK_STATE_DIR="$STATE" bash -c '
    ALLOY_STACK_TEST_SOURCE=1
    source "'"$STACK"'" >/dev/null 2>&1 || true
    lease_reclaimable "'"$1"'"
  ' 2>/dev/null
}

# Test state lives beside the test, not under $TMPDIR. In a sandboxed shell `mktemp -d`
# returned rc=0 with a path that did not survive, so every fixture write became a silent
# no-op — and a lease file that was never created reads exactly like a lease the rules
# declined to reclaim. The assertions below make that failure mode loud instead.
TESTTMP="${SCRIPT_DIR}/tests/.tmp-lease-reclaim.$$"
STATE="$TESTTMP/state"; LEASES="$STATE/leases"
WT="$TESTTMP/worktree"          # a worktree that exists
mkdir -p "$LEASES" "$WT"
# Guard on BASHPID: an EXIT trap also fires when a command-substitution subshell exits,
# so an unguarded `rm -rf` deleted the fixtures mid-run — the first lease file then failed
# to write, and "file absent" is indistinguishable from "rules declined to reclaim".
trap '[[ "$BASHPID" == "$$" ]] && rm -rf "$TESTTMP"' EXIT
[[ -d "$LEASES" && -d "$WT" ]] || { echo "FATAL: could not create test state under $TESTTMP" >&2; exit 2; }

mklease() { # mklease <name> <pid> [start] [cmd] [worktree]
  local f="$LEASES/$1.lease"
  {
    printf 'HOLDER=%s\n' "$1"
    printf 'WORKTREE=%s\n' "${5:-$WT}"
    printf 'PID=%s\n' "$2"
    [[ -n "${3:-}" ]] && printf 'PID_START=%s\n' "$3"
    [[ -n "${4:-}" ]] && printf 'PID_CMD=%s\n' "$4"
    printf 'STACK_PROJECT=alloy-cert\nCREATED=2026-08-03T00:00:00Z\n'
  } > "$f"
  printf '%s\n' "$f"
}

echo "lease reclaim — conservative rules"
echo "=================================="

# A pid that is certainly dead.
sleep 60 & DEAD=$!; kill "$DEAD" 2>/dev/null; wait "$DEAD" 2>/dev/null

# A live holder we control, with its true identity recorded.
sleep 300 & LIVE=$!
LIVE_START="$(ps -o lstart= -p "$LIVE" 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//')"
LIVE_CMD="$(ps -o command= -p "$LIVE" 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//' | cut -c1-120)"

echo "reclaim cases"
t "dead PID + matching lease metadata → reclaimed" reclaim "$(mklease dead-holder "$DEAD" "Mon Jan  1 00:00:00 2020" "sleep 60")"
t "reused PID, mismatched start time → reclaimed" reclaim "$(mklease reused-start "$LIVE" "Mon Jan  1 00:00:00 2020" "$LIVE_CMD")"
t "reused PID, mismatched command → reclaimed"    reclaim "$(mklease reused-cmd "$LIVE" "$LIVE_START" "totally-different-command --x")"

echo "preserve cases (a wrong reclaim is worse than waiting)"
t "live matching holder → preserved"               preserve "$(mklease live-holder "$LIVE" "$LIVE_START" "$LIVE_CMD")"
t "missing metadata (no HOLDER/WORKTREE) → preserved" preserve "$(printf 'PID=%s\n' "$DEAD" > "$LEASES/corrupt.lease"; echo "$LEASES/corrupt.lease")"
t "empty lease file → preserved"                   preserve "$(: > "$LEASES/empty.lease"; echo "$LEASES/empty.lease")"
t "legacy lease with no identity + live pid → preserved" preserve "$(mklease legacy "$LIVE")"

# A dead launcher does not prove the work stopped: a detached child still inside the
# holder's worktree must keep the lease.
CHILDWT="$TESTTMP/child-worktree"; mkdir -p "$CHILDWT"
( cd "$CHILDWT" && exec -a "certrun-$CHILDWT" sleep 300 ) & CHILD=$!
sleep 1
t "dead holder BUT live process in its worktree → preserved" preserve "$(mklease with-child "$DEAD" "Mon Jan  1 00:00:00 2020" "sleep 60" "$CHILDWT")"
kill "$CHILD" 2>/dev/null; wait "$CHILD" 2>/dev/null
rm -rf "$CHILDWT"

# A lease is taken by a short-lived `alloy-stack use` invocation, so its launching shell is
# routinely gone seconds later. Treating that as a crash made leases evaporate on creation.
echo "young leases are never crashes"
YOUNG="$LEASES/young.lease"
{ printf 'HOLDER=young\nWORKTREE=%s\nPID=%s\n' "$WT" "$DEAD"
  printf 'PID_START=Mon Jan  1 00:00:00 2020\nPID_CMD=sleep 60\n'
  printf 'STACK_PROJECT=alloy-cert\nCREATED=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$YOUNG"
t "dead PID but lease seconds old → preserved" preserve "$YOUNG"

OLD="$LEASES/old.lease"
{ printf 'HOLDER=old\nWORKTREE=%s\nPID=%s\n' "$WT" "$DEAD"
  printf 'PID_START=Mon Jan  1 00:00:00 2020\nPID_CMD=sleep 60\n'
  printf 'STACK_PROJECT=alloy-cert\nCREATED=2020-01-01T00:00:00Z\n'
} > "$OLD"
t "dead PID and lease long past grace → reclaimed" reclaim "$OLD"

echo "the lease anchors to a process that outlives the command"
ANCHOR="$(ALLOY_STACK_STATE_DIR="$STATE" bash -c '
  ALLOY_STACK_TEST_SOURCE=1; source "'"$STACK"'" >/dev/null 2>&1 || true
  resolve_holder_pid' 2>/dev/null)"
if [[ -n "$ANCHOR" && "$ANCHOR" != "$$" ]] && kill -0 "$ANCHOR" 2>/dev/null; then
  PASS=$((PASS+1)); printf '  ✓ anchor pid %s is a live ancestor, not the transient shell\n' "$ANCHOR"
else
  FAIL=$((FAIL+1)); printf '  ✗ anchor pid resolved to %s (shell was %s)\n' "${ANCHOR:-empty}" "$$"
fi

echo "safety: reclaim never touches infrastructure"
before_c="$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')"
before_v="$(docker volume ls -q 2>/dev/null | wc -l | tr -d ' ')"
run_reclaimable "$(mklease safety "$DEAD" "Mon Jan  1 00:00:00 2020" "sleep 60")" || true
after_c="$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')"
after_v="$(docker volume ls -q 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$before_c" == "$after_c" && "$before_v" == "$after_v" ]]; then
  PASS=$((PASS+1)); printf '  ✓ containers %s→%s and volumes %s→%s unchanged\n' "$before_c" "$after_c" "$before_v" "$after_v"
else
  FAIL=$((FAIL+1)); printf '  ✗ infrastructure changed: containers %s→%s volumes %s→%s\n' "$before_c" "$after_c" "$before_v" "$after_v"
fi

kill "$LIVE" 2>/dev/null; wait "$LIVE" 2>/dev/null
echo
echo "passed=$PASS failed=$FAIL"
[[ "$FAIL" -eq 0 ]]
