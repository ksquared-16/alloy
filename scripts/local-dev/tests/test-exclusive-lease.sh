#!/usr/bin/env bash
# =============================================================================
# test-exclusive-lease — a destructive tenant rebuild must be impossible while
# another session holds the shared stack.
#
# The failure this guards: certification requires a PRISTINE, pre-publication
# tenant, and publications are immutable by design — so rerunning it means
# rebuilding the database. On a shared stack that database is also two other
# sessions' work. Without this gate, "make my certification rerunnable" and
# "destroy someone else's environment" are the same command.
#
# The negative controls matter more than the positive ones: every case below
# where exclusivity is REFUSED is a case where data survives.
#
# Touches no Docker, no stack, no volumes — lease files only.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="${SCRIPT_DIR}/alloy-stack"
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

# Exercise the real predicate out of alloy-stack rather than a copy of it.
run_exclusive() { # run_exclusive <holder> -> exit status
  ALLOY_STACK_STATE_DIR="$STATE" bash -c '
    ALLOY_STACK_TEST_SOURCE=1
    source "'"$STACK"'" >/dev/null 2>&1 || true
    require_exclusive "'"$1"'"
  ' >/dev/null 2>&1
}

t() { # t <desc> <granted|refused> <holder>
  local desc="$1" want="$2" got
  if run_exclusive "$3"; then got=granted; else got=refused; fi
  [[ "$got" == "$want" ]] && ok "$desc" || bad "$desc (got=$got want=$want)"
}

TESTTMP="${SCRIPT_DIR}/tests/.tmp-exclusive.$$"
STATE="$TESTTMP/state"; LEASES="$STATE/leases"
WT="$TESTTMP/worktree"
mkdir -p "$LEASES" "$WT"
# An EXIT trap also fires when a command-substitution subshell exits; guard on BASHPID
# or the fixtures vanish mid-run and every case silently becomes "refused".
trap '[[ "$BASHPID" == "$$" ]] && rm -rf "$TESTTMP"' EXIT
[[ -d "$LEASES" ]] || { echo "FATAL: cannot create $LEASES" >&2; exit 2; }

# A live process so leases look genuinely held rather than reclaimable.
sleep 300 & LIVE=$!
LIVE_START="$(ps -o lstart= -p "$LIVE" 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//')"
LIVE_CMD="$(ps -o command= -p "$LIVE" 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//' | cut -c1-120)"

mklease() { # mklease <holder> [pid]
  { printf 'HOLDER=%s\nWORKTREE=%s\nPID=%s\n' "$1" "$WT" "${2:-$LIVE}"
    printf 'PID_START=%s\nPID_CMD=%s\n' "$LIVE_START" "$LIVE_CMD"
    printf 'STACK_PROJECT=alloy-cert\nCREATED=2026-08-03T00:00:00Z\n'
  } > "$LEASES/$1.lease"
}

echo "exclusive lease — a rebuild must never outrank another session"
echo "=============================================================="

echo "GRANTED (safe to rebuild)"
mklease solo
t "sole holder of the stack → granted" granted solo

echo "REFUSED (someone else's data is on the line)"
mklease neighbour
t "another session holds a lease → refused"        refused solo
t "the neighbour is equally blocked → refused"     refused neighbour

mklease third
t "two other sessions holding → refused"           refused solo

rm -f "$LEASES/neighbour.lease" "$LEASES/third.lease"
t "holder with NO lease of its own → refused"      refused nobody

rm -f "$LEASES/solo.lease"
t "no leases at all, holder holds none → refused"  refused solo

echo "a lease whose holder is gone must not block forever"
mklease solo
# A dead pid with a mismatched fingerprint is reclaimable, so it must not count as a
# live neighbour — otherwise one crashed session pins the stack for its whole TTL.
sleep 60 & DEAD=$!; kill "$DEAD" 2>/dev/null; wait "$DEAD" 2>/dev/null
{ printf 'HOLDER=crashed\nWORKTREE=%s\nPID=%s\n' "$WT" "$DEAD"
  printf 'PID_START=Mon Jan  1 00:00:00 2020\nPID_CMD=sleep 60\n'
  printf 'STACK_PROJECT=alloy-cert\nCREATED=2026-08-03T00:00:00Z\n'
} > "$LEASES/crashed.lease"
t "only a reclaimable dead lease remains → granted" granted solo

echo "safety: the check itself changes no infrastructure"
before_c="$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')"
before_v="$(docker volume ls -q 2>/dev/null | wc -l | tr -d ' ')"
run_exclusive solo >/dev/null 2>&1 || true
after_c="$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')"
after_v="$(docker volume ls -q 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$before_c" == "$after_c" && "$before_v" == "$after_v" ]]; then
  ok "containers ${before_c}→${after_c} and volumes ${before_v}→${after_v} unchanged"
else
  bad "infrastructure changed: containers ${before_c}→${after_c} volumes ${before_v}→${after_v}"
fi

kill "$LIVE" 2>/dev/null; wait "$LIVE" 2>/dev/null
echo
echo "passed=$PASS failed=$FAIL"
[[ "$FAIL" -eq 0 ]]
