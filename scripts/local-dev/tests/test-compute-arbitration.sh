#!/usr/bin/env bash
# =============================================================================
# test-compute-arbitration — permits must refuse when they should, and never
# strand a resource when a holder dies.
#
# The failure this guards: three sessions each ran a dev server plus a Playwright
# fleet, the machine hit 124M free, and a certification run was OOM-killed
# mid-suite. Docker containment did not help — the contention had moved from
# containers to Node and Chromium processes.
#
# The negative controls carry the weight. Every case where a permit is REFUSED is
# a case where somebody else's run survives.
#
# Touches no Docker, no processes, no stacks — permit files only.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPUTE="${SCRIPT_DIR}/alloy-compute"
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

TESTTMP="${SCRIPT_DIR}/tests/.tmp-compute.$$"
export ALLOY_COMPUTE_STATE_DIR="$TESTTMP/state"
mkdir -p "$ALLOY_COMPUTE_STATE_DIR"
# An EXIT trap also fires when a command-substitution subshell exits; guard on BASHPID
# or the fixtures vanish mid-run and every case silently becomes "refused".
trap '[[ "$BASHPID" == "$$" ]] && rm -rf "$TESTTMP"' EXIT
[[ -d "$ALLOY_COMPUTE_STATE_DIR" ]] || { echo "FATAL: cannot create $ALLOY_COMPUTE_STATE_DIR" >&2; exit 2; }

run() { ALLOY_COMPUTE_STATE_DIR="$ALLOY_COMPUTE_STATE_DIR" bash "$COMPUTE" "$@" >/dev/null 2>&1; }

echo "compute arbitration — permits, queueing, and stale recovery"
echo "=========================================================="

echo "capacity is enforced"
run acquire full-typecheck --holder a && ok "first holder granted" || bad "first holder refused"
run acquire full-typecheck --holder b --no-wait && bad "second holder granted on a cap-1 resource" || ok "second holder REFUSED on a cap-1 resource"
run release full-typecheck --holder a && ok "release succeeds" || bad "release failed"
run acquire full-typecheck --holder b && ok "after release the next holder is granted" || bad "still refused after release"
run release full-typecheck --holder b

echo "capacity above 1 admits exactly that many"
ALLOY_COMPUTE_NEXT_DEV_CAP=2 run acquire heavy-next-dev --holder d1 && ok "dev server 1 granted (cap 2)" || bad "dev 1 refused"
ALLOY_COMPUTE_NEXT_DEV_CAP=2 run acquire heavy-next-dev --holder d2 && ok "dev server 2 granted (cap 2)" || bad "dev 2 refused"
if ALLOY_COMPUTE_NEXT_DEV_CAP=2 run acquire heavy-next-dev --holder d3 --no-wait; then
  bad "THIRD dev server granted — this is the case that killed the machine"
else
  ok "third dev server REFUSED — the exact case that OOM-killed a certification run"
fi
run release heavy-next-dev --holder d1; run release heavy-next-dev --holder d2

echo "acquire is idempotent"
run acquire browser-certification --holder same
run acquire browser-certification --holder same && ok "re-acquiring an owned permit succeeds" || bad "re-acquire failed"
run release browser-certification --holder same

echo "NEGATIVE CONTROLS — refusals that protect another session"
run acquire exclusive-certification-db --holder owner
run acquire exclusive-certification-db --holder intruder --no-wait \
  && bad "a second holder took the exclusive certification db" \
  || ok "exclusive-certification-db admits exactly one — a rebuild cannot destroy another session's data"
run acquire browser-certification --holder fleet1
run acquire browser-certification --holder fleet2 --no-wait \
  && bad "two browser fleets admitted" \
  || ok "a second Playwright fleet is REFUSED"
run release exclusive-certification-db --holder owner
run release browser-certification --holder fleet1

run acquire not-a-real-resource --holder x --no-wait \
  && bad "unknown resource accepted" || ok "unknown resource rejected"

echo "queue: waiters are recorded and FIFO-ordered"
run acquire full-typecheck --holder head
( ALLOY_COMPUTE_STATE_DIR="$ALLOY_COMPUTE_STATE_DIR" bash "$COMPUTE" acquire full-typecheck --holder w1 --wait=1 >/dev/null 2>&1 ) || true
Q="$ALLOY_COMPUTE_STATE_DIR/full-typecheck/queue"
[[ -f "$Q" ]] && ok "queue file created for a contended resource" || bad "no queue file"
run release full-typecheck --holder head

echo "stale recovery"
D="$ALLOY_COMPUTE_STATE_DIR/browser-certification"; mkdir -p "$D"
sleep 60 & DEAD=$!; kill "$DEAD" 2>/dev/null; wait "$DEAD" 2>/dev/null
{ printf 'HOLDER=crashed\nRESOURCE=browser-certification\nWORKTREE=%s\n' "$TESTTMP"
  printf 'PID=%s\nPID_START=Mon Jan  1 00:00:00 2020\nPID_CMD=sleep 60\n' "$DEAD"
  printf 'CREATED=2020-01-01T00:00:00Z\n'; } > "$D/crashed.permit"
run acquire browser-certification --holder newcomer --no-wait \
  && ok "a crashed holder's permit is reclaimed, not stranded forever" \
  || bad "crashed holder stranded the resource"
run release browser-certification --holder newcomer

echo "  a YOUNG permit is never treated as a crash"
{ printf 'HOLDER=fresh\nRESOURCE=full-typecheck\nWORKTREE=%s\n' "$TESTTMP"
  printf 'PID=%s\nPID_START=Mon Jan  1 00:00:00 2020\nPID_CMD=sleep 60\n' "$DEAD"
  printf 'CREATED=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; } > "$ALLOY_COMPUTE_STATE_DIR/full-typecheck/fresh.permit"
run acquire full-typecheck --holder racer --no-wait \
  && bad "a seconds-old permit was reclaimed — this is how exclusivity silently ends" \
  || ok "a seconds-old permit is PRESERVED even with a dead pid"
rm -f "$ALLOY_COMPUTE_STATE_DIR/full-typecheck/fresh.permit"

echo "  an unidentifiable permit is never reclaimed"
printf 'CREATED=2020-01-01T00:00:00Z\n' > "$ALLOY_COMPUTE_STATE_DIR/full-typecheck/corrupt.permit"
run acquire full-typecheck --holder opportunist --no-wait \
  && bad "reclaimed a permit it could not identify" \
  || ok "a permit with no HOLDER is preserved, not reclaimed"
rm -f "$ALLOY_COMPUTE_STATE_DIR/full-typecheck/corrupt.permit"

echo "safety: arbitration never touches processes or containers"
bc="$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')"
bp="$(pgrep -f 'next dev' 2>/dev/null | wc -l | tr -d ' ')"
run acquire heavy-next-dev --holder probe; run release heavy-next-dev --holder probe
run doctor
ac="$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')"
ap="$(pgrep -f 'next dev' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$bc" == "$ac" && "$bp" == "$ap" ]]; then
  ok "containers ${bc}→${ac} and next-dev processes ${bp}→${ap} unchanged"
else
  bad "arbitration mutated the machine: containers ${bc}→${ac}, processes ${bp}→${ap}"
fi

echo "diagnostics"
ALLOY_COMPUTE_STATE_DIR="$ALLOY_COMPUTE_STATE_DIR" bash "$COMPUTE" status >/dev/null 2>&1 \
  && ok "status renders" || bad "status failed"
ALLOY_COMPUTE_STATE_DIR="$ALLOY_COMPUTE_STATE_DIR" bash "$COMPUTE" doctor >/dev/null 2>&1 \
  && ok "doctor renders" || bad "doctor failed"

echo
echo "passed=$PASS failed=$FAIL"
[[ "$FAIL" -eq 0 ]]
