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

STATE="$(mktemp -d)"; LEASES="$STATE/leases"; mkdir -p "$LEASES"
WT="$(mktemp -d)"           # a worktree that exists
trap 'rm -rf "$STATE" "$WT"' EXIT

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
CHILDWT="$(mktemp -d)"
( cd "$CHILDWT" && exec -a "certrun-$CHILDWT" sleep 300 ) & CHILD=$!
sleep 1
t "dead holder BUT live process in its worktree → preserved" preserve "$(mklease with-child "$DEAD" "Mon Jan  1 00:00:00 2020" "sleep 60" "$CHILDWT")"
kill "$CHILD" 2>/dev/null; wait "$CHILD" 2>/dev/null
rm -rf "$CHILDWT"

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
