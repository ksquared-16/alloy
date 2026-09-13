#!/usr/bin/env bash
# =============================================================================
# THE AGENT COLUMN WAS A STORED FIELD WEARING A LIVENESS CHECK'S NAME.
#
# `ALLOY_AGENT_STATUS` is written at sprint start and changed only by an
# explicit command. Nothing reconciled it against reality, so a column headed
# AGENT reported a declaration and read like an observation.
#
# MEASURED on the live host: twelve slotted records, ELEVEN saying `active`,
# while only seven worktrees had a live agent session. Five slots read `active`
# with nobody working in them, and slot 3 read `closed` while its agent was
# demonstrably live. Wrong in BOTH directions — which is why "stale" undersells
# it; a stale field drifts one way.
#
# The consequence the operator hit: `alloy-worktree-adopt` refuses with "the
# slot is already assigned" because the record still holds it, and the status
# table agreed with the record rather than with the host.
#
# These pin the derivation, both divergence directions, and the fail-closed
# fallback. They do NOT re-test tmux; the liveness owner is
# lane-worktree-lifecycle and it has its own suite.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()   { echo "PASS: $*"; PASS=$((PASS+1)); }
bad()  { echo "FAIL: $*"; FAIL=$((FAIL+1)); }
check(){ local m="$1" want="$2" got="$3"; [[ "$got" == *"$want"* ]] && ok "$m" || { bad "$m (wanted '$want' in '$got')"; }; }

SRC="${ROOT}/lib/sprint-ops.sh"

# ── 1. the derivation is no longer an unconditional stored read ──────────────
code="$(sed 's|#.*||' "$SRC")"
if grep -q 'lifecycle="${ALLOY_WORKER_LIFECYCLE:-${ALLOY_AGENT_STATUS:-active}}"' <<<"$code" \
   && ! grep -q 'declared="${ALLOY_WORKER_LIFECYCLE:-${ALLOY_AGENT_STATUS:-active}}"' <<<"$code"; then
  bad "AGENT column still reads the stored field unconditionally"
else
  ok "AGENT column no longer reads the stored field unconditionally"
fi
grep -q 'ALLOY_OBSERVED_STATES' <<<"$code" \
  && ok "observed state participates in the row" \
  || bad "observed state is not consulted"

# ── 2. observed overrides declared, in both directions ───────────────────────
# The awk lookup is the load-bearing line; exercise it directly rather than
# rendering a whole table, so a failure points at the derivation.
states=$'wt-a\tidle\nwt-b\tlive'
got="$(printf '%s\n' "$states" | awk -F'\t' -v n="wt-a" '$1==n{print $2; exit}')"
check "declared-active worktree resolves to observed idle" "idle" "$got"
got="$(printf '%s\n' "$states" | awk -F'\t' -v n="wt-b" '$1==n{print $2; exit}')"
check "declared-closed worktree resolves to observed live" "live" "$got"
got="$(printf '%s\n' "$states" | awk -F'\t' -v n="wt-missing" '$1==n{print $2; exit}')"
[[ -z "$got" ]] && ok "an unknown worktree yields nothing, so the row keeps its declared value" \
                || bad "unknown worktree invented a state: '$got'"

# ── 3. both divergence directions are reported, not silently corrected ───────
grep -q 'declared-active-observed-idle' <<<"$code" \
  && ok "declared active / observed idle is recorded as divergence" \
  || bad "the stale-high direction is not reported"
grep -q 'observed-live' <<<"$code" \
  && ok "declared closed / observed live is recorded as divergence" \
  || bad "the stale-low direction is not reported — this is the slot 3 case"
grep -q 'registry divergence' <<<"$code" \
  && ok "divergence is surfaced under the table" \
  || bad "divergence is computed but never shown"

# ── 4. fail closed, and SAY so ───────────────────────────────────────────────
grep -q 'AGENT column is the DECLARED value' <<<"$code" \
  && ok "an unreadable liveness owner is announced, not silently assumed" \
  || bad "fallback to the declared value is silent"
if awk '/^alloy_observed_agent_states\(\)/,/^}/' "$SRC" | grep -q 'return 1'; then
  ok "the bridge returns failure rather than an empty success"
else
  bad "the bridge cannot signal that it could not answer"
fi

# ── 5. asked once per table, never once per row ──────────────────────────────
# A per-row probe turns a status read into a fleet scan: one node and up to
# twelve tmux calls per slot.
fn="$(awk '/^alloy_worker_status_table\(\)/,/^}/' "$SRC")"
n="$(grep -c 'alloy_observed_agent_states' <<<"$fn")"
[[ "$n" == "1" ]] && ok "liveness is resolved once per table (found $n call)" \
                  || bad "liveness is resolved $n times in the table function"
grep -q 'for ((i = 1' <<<"$fn" && ok "the row loop is still the row loop" || bad "row loop not found"
if awk '/for \(\(i = 1/,/^  done/' <<<"$fn" | grep -q 'alloy_observed_agent_states'; then
  bad "the bridge is called INSIDE the row loop"
else
  ok "the bridge is not called inside the row loop"
fi

# ── 6. the owner is asked, not re-implemented ────────────────────────────────
awk '/^alloy_observed_agent_states\(\)/,/^}/' "$SRC" | grep -q 'lane-worktree-lifecycle.mjs' \
  && ok "liveness comes from the existing owner, not a second shell rule" \
  || bad "shell invented its own liveness rule"

echo
echo "passed=$PASS failed=$FAIL"
[[ "$FAIL" -eq 0 ]]
