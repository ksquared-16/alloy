#!/usr/bin/env bash
# =============================================================================
# Certification database ownership — enforcement tests.
#
# These prove the guard REFUSES BEFORE side effects. Everything runs against
# isolated state dirs and a fake `supabase`/`docker` on PATH, so no test can
# touch a real stack: a test suite for "don't destroy the shared database" must
# not be able to destroy the shared database.
# =============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT="$(cd "${HERE}/.." && pwd)"

PASS=0; FAIL=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

export ALLOY_COMPUTE_STATE_DIR="${SANDBOX}/compute"
export ALLOY_STACK_STATE_DIR="${SANDBOX}/stack"
export ALLOY_COMPUTE_MIN_RECLAIM_AGE=900

# --- fake side-effect binaries: if a guard leaks, these record the breach ------
BIN="${SANDBOX}/bin"; mkdir -p "$BIN"
cat >"${BIN}/supabase" <<EOF
#!/usr/bin/env bash
# Only DESTRUCTIVE subcommands count as side effects. \`status\` and friends are
# reads the toolkit makes constantly; logging those would make every test look
# like a breach.
case "\$*" in
  *"db reset"*|*" stop"*) echo "SIDE_EFFECT supabase \$*" >> "${SANDBOX}/side-effects.log" ;;
esac
exit 0
EOF
cat >"${BIN}/docker" <<EOF
#!/usr/bin/env bash
# Records destructive calls; otherwise reports a running sanctioned stack so the
# stop path is actually reachable in tests.
case "\$*" in
  *"rm -f"*|*" stop"*) echo "SIDE_EFFECT docker \$*" >> "${SANDBOX}/side-effects.log"; exit 0 ;;
esac
case "\$*" in
  *"ps -q"*|*"ps -aq"*) echo "fake-container-id" ;;
  "info"*|*" info") : ;;
esac
exit 0
EOF
chmod +x "${BIN}/supabase" "${BIN}/docker"
export PATH="${BIN}:${PATH}"

side_effects() { [[ -f "${SANDBOX}/side-effects.log" ]] && wc -l < "${SANDBOX}/side-effects.log" | tr -d ' ' || echo 0; }

# --- two distinct worker identities -------------------------------------------
WORKER_A="${SANDBOX}/wt-a"; WORKER_B="${SANDBOX}/wt-b"
mkdir -p "$WORKER_A" "$WORKER_B"
(cd "$WORKER_A" && git init -q . 2>/dev/null)
(cd "$WORKER_B" && git init -q . 2>/dev/null)

as_a() { ( cd "$WORKER_A" && ALLOY_WORKTREE_PATH="$WORKER_A" "$@" ); }
as_b() { ( cd "$WORKER_B" && ALLOY_WORKTREE_PATH="$WORKER_B" "$@" ); }

COMPUTE="${TOOLKIT}/alloy-compute"
DBRESET="${TOOLKIT}/alloy-db-reset"
RES="exclusive-certification-db"

printf '\n=== certification ownership enforcement ===\n\n'

# 1. First worker acquires.
as_a "$COMPUTE" acquire "$RES" --reason "cert run" >/dev/null 2>&1
check "1. first worker acquires exclusive ownership" \
      '[[ -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-a.permit" ]]'

# 2. Second exclusive acquisition refused.
as_b "$COMPUTE" acquire "$RES" --reason "promotion" >/dev/null 2>&1
check "2. second exclusive acquisition is refused" \
      '[[ ! -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-b.permit" ]]'

# 3+4. Another worker cannot reset the database — and no side effect occurs.
before="$(side_effects)"
as_b "$DBRESET" >/dev/null 2>&1; rc=$?
check "3. non-owner cannot reset the database (exit ${rc})" '[[ "'"$rc"'" -ne 0 ]]'
check "4. refusal happened BEFORE any side effect" '[[ "$(side_effects)" == "'"$before"'" ]]'

# 5. Diagnostics name the owner and the operation.
out="$(as_b "$DBRESET" 2>&1)"
check "5. diagnostics identify the owner" 'grep -q "wt-a" <<<"'"$out"'"'
check "6. diagnostics identify the operation" 'grep -q "destroy-db" <<<"'"$out"'"'
check "7. diagnostics give a safe next action" 'grep -q "alloy-compute acquire" <<<"'"$out"'"'

# 8. Owner CAN reset — asserted as 'the guard did not refuse'. Whether the underlying
#    supabase call then succeeds needs a real stack, which this sandbox deliberately lacks.
out="$(as_a "$DBRESET" 2>&1)"
check "8. the owner is not refused" '! grep -q "refused" <<<"'"$out"'"'

# 9. Guard classification: db-destroying ops require the permit even unowned.
as_a "$COMPUTE" release "$RES" >/dev/null 2>&1
before="$(side_effects)"
as_b "$DBRESET" >/dev/null 2>&1; rc=$?
check "9. reset without ANY permit is refused (lease is insufficient)" '[[ "'"$rc"'" -ne 0 ]]'
check "10. still no side effect" '[[ "$(side_effects)" == "'"$before"'" ]]'

# 11. After release a second worker can acquire.
as_b "$COMPUTE" acquire "$RES" --reason "promotion" >/dev/null 2>&1
check "11. after release, the waiting worker acquires" \
      '[[ -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-b.permit" ]]'
as_b "$COMPUTE" release "$RES" >/dev/null 2>&1

# 12. Simultaneous acquisition yields exactly one owner.
rm -rf "${ALLOY_COMPUTE_STATE_DIR}/${RES}"
for i in 1 2 3 4 5 6; do
  d="${SANDBOX}/race-${i}"; mkdir -p "$d"; (cd "$d" && git init -q . 2>/dev/null)
  ( cd "$d" && ALLOY_WORKTREE_PATH="$d" "$COMPUTE" acquire "$RES" --reason "race" >/dev/null 2>&1 ) &
done
wait
n="$(ls "${ALLOY_COMPUTE_STATE_DIR}/${RES}"/*.permit 2>/dev/null | wc -l | tr -d ' ')"
check "12. simultaneous acquisition yields exactly one owner (got ${n})" '[[ "'"$n"'" -eq 1 ]]'
rm -rf "${ALLOY_COMPUTE_STATE_DIR}/${RES}"

# 13. Stale recovery REFUSES a live owner.
as_a "$COMPUTE" acquire "$RES" --reason "live run" >/dev/null 2>&1
out="$(as_b "$COMPUTE" recover "$RES" 2>&1)"; rc=$?
check "13. recovery refuses while the owner is live" '[[ "'"$rc"'" -ne 0 ]] || grep -q "refusing" <<<"'"$out"'"'
check "14. the live owner still holds ownership" \
      '[[ -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-a.permit" ]]'

# 15. Recovery SUCCEEDS for a provably abandoned owner (dead pid + aged).
f="${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-a.permit"
python3 - "$f" <<'PY'
import sys, re, datetime
p = sys.argv[1]
s = open(p).read()
s = re.sub(r'^PID=.*$', 'PID=999999', s, flags=re.M)
s = re.sub(r'^PID_START=.*$', 'PID_START=', s, flags=re.M)
s = re.sub(r'^PID_CMD=.*$', 'PID_CMD=', s, flags=re.M)
old = (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M:%SZ')
s = re.sub(r'^CREATED=.*$', f'CREATED={old}', s, flags=re.M)
open(p, 'w').write(s)
PY
before="$(side_effects)"
as_b "$COMPUTE" recover "$RES" >/dev/null 2>&1
check "15. recovery succeeds for a provably abandoned owner" '[[ ! -f "'"$f"'" ]]'
check "16. recovery did NOT stop or reset anything" '[[ "$(side_effects)" == "'"$before"'" ]]'
check "17. recovery is recorded" '[[ -f "${ALLOY_COMPUTE_STATE_DIR}/recovery.log" ]]'

# 18. Interrupted acquire leaves no irrecoverable ownership (stale mutex clears).
mkdir -p "${ALLOY_COMPUTE_STATE_DIR}/${RES}/.acquire.lock"
touch -t 200001010000 "${ALLOY_COMPUTE_STATE_DIR}/${RES}/.acquire.lock" 2>/dev/null || true
as_a "$COMPUTE" acquire "$RES" --reason "after interruption" >/dev/null 2>&1
check "18. an interrupted acquire does not wedge ownership" \
      '[[ -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-a.permit" ]]'
as_a "$COMPUTE" release "$RES" >/dev/null 2>&1

printf '\n=== stack stop protection ===\n\n'
# The original failure was a STOP, not just a reset: the stack vanished while the
# permit was held. Drive the real alloy-stack release path as the only lease holder,
# so it reaches the stop, and prove the guard refuses before any docker call.
STACKCMD="${TOOLKIT}/alloy-stack"
rm -f "${SANDBOX}/side-effects.log"
rm -rf "${ALLOY_COMPUTE_STATE_DIR}/${RES}"
as_a "$COMPUTE" acquire "$RES" --reason "owner mid-certification" >/dev/null 2>&1
as_b "$STACKCMD" use wt-b >/dev/null 2>&1
rm -f "${SANDBOX}/side-effects.log"   # ignore setup; only the refused stop counts
out="$(as_b "$STACKCMD" release wt-b 2>&1)"; rc=$?
check "non-owner releasing the last lease cannot stop the stack" '[[ "'"$rc"'" -ne 0 ]]'
check "the refusal names the owner" 'grep -q "wt-a" <<<"'"$out"'"'
check "no docker/supabase side effect occurred" '[[ "$(side_effects)" == "0" ]]'
as_a "$COMPUTE" release "$RES" >/dev/null 2>&1

printf '\n=== reproduction: the Interactive Tour failure ===\n\n'
# Worker A owns and has a seeded tenant; Worker B runs promotion cleanup and
# attempts stop + reset. Both must be refused, with A's state intact.
rm -f "${SANDBOX}/side-effects.log"
as_a "$COMPUTE" acquire "$RES" --reason "Interactive Tour certification" >/dev/null 2>&1
echo "seeded-tenant" > "${SANDBOX}/tenant.state"

as_b "$DBRESET" >/dev/null 2>&1; rc_reset=$?
check "A owns; B's promotion reset is refused" '[[ "'"$rc_reset"'" -ne 0 ]]'
check "no stack/database side effect occurred" '[[ "$(side_effects)" == "0" ]]'
check "worker A's tenant state is intact" '[[ "$(cat "${SANDBOX}/tenant.state")" == "seeded-tenant" ]]'
check "worker A still owns the certification database" \
      '[[ -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-a.permit" ]]'

# And the owner can still finish cleanly.
as_a "$COMPUTE" release "$RES" >/dev/null 2>&1
check "owner releases cleanly" '[[ ! -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-a.permit" ]]'
as_b "$COMPUTE" acquire "$RES" --reason "promotion, now unblocked" >/dev/null 2>&1
check "the waiting worker then acquires" \
      '[[ -f "${ALLOY_COMPUTE_STATE_DIR}/${RES}/wt-b.permit" ]]'

printf '\n-------------------------------------------\n'
printf '  passed: %s   failed: %s\n\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
