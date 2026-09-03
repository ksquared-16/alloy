#!/usr/bin/env bash
# =============================================================================
# THE SERVER DIED AND NOBODY BROUGHT IT BACK.
#
# Four legitimate dev servers exited on this host in one session with ~18-23 GB
# free and zero swap, and every one stayed dead. Next exits expecting a
# supervisor to restore it; alloy-dev-start launched it detached and no layer
# owned "should this still be running?", so lane QA capacity vanished silently.
#
# These lock in the supervisor's contract. The dangerous failure is not "failed
# to restart" — it is "restarted something an operator deliberately stopped", so
# the negative cases matter at least as much as the positive one.
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SUP="${ROOT}/alloy-dev-supervise"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

[[ -x "$SUP" ]] && ok "1. the supervisor exists and is executable" || bad "1. missing alloy-dev-supervise"
bash -n "$SUP" 2>/dev/null && ok "2. it parses" || bad "2. syntax error"

# --- desired state is DERIVED, never a second registry ----------------------
grep -q 'alloy_server_audit_path' "$SUP" \
  && ok "3. desired state is read from the existing lifecycle audit" \
  || bad "3. desired state is not derived from the audit"
grep -qE 'supervise_last_action|action.*start' "$SUP" \
  && ok "4. last canonical action decides RUNNING vs STOPPED" \
  || bad "4. no last-action derivation"

# --- the negative cases: what must NEVER be restarted ----------------------
grep -q 'desired="PAUSED"' "$SUP" \
  && ok "5. a paused lane is PAUSED and stays paused" \
  || bad "5. pause state is not honoured"
grep -q 'if \[\[ "$desired" != "RUNNING" \]\]' "$SUP" \
  && ok "6. anything not desired-RUNNING takes no action" \
  || bad "6. restart is not gated on desired=RUNNING"
grep -q 'desired="UNKNOWN"' "$SUP" \
  && ok "7. a worktree the audit never saw is UNKNOWN, not assumed stopped or running" \
  || bad "7. unknown desired state is guessed"

# --- an unreadable port is not an absent server ----------------------------
grep -q 'deferred (port not readable)' "$SUP" \
  && ok "8. an unreadable port defers rather than starting a second server" \
  || bad "8. unknown port ownership does not defer"
grep -q 'alloy_rc_loopback_port_owner' "$SUP" \
  && ok "9. reality is read loopback-scoped, so Tailscale's tailnet listeners are not mistaken for the lane server" \
  || bad "9. not using the loopback-scoped owner"

# --- bounded, never a crash loop -------------------------------------------
grep -q 'SUPERVISE_MAX_RESTARTS' "$SUP" && grep -q 'SUPERVISE_WINDOW_MIN' "$SUP" \
  && ok "10. restarts are bounded by count within a window" \
  || bad "10. no restart bound"
grep -q 'restart_exhausted' "$SUP" \
  && ok "11. past the bound it records restart_exhausted and stops trying" \
  || bad "11. no exhaustion state"

# --- one start implementation ----------------------------------------------
grep -q '"${SCRIPT_DIR}/alloy-dev-start"' "$SUP" \
  && ok "12. restart reuses the canonical start path, not a second spawn" \
  || bad "12. the supervisor spawns its own server"
grep -qv 'npm run dev' <(grep -c 'npm run dev' "$SUP") 2>/dev/null
[[ "$(grep -c 'npm run dev' "$SUP")" == "0" ]] \
  && ok "13. it never launches Next directly" \
  || bad "13. a second Next launcher exists in the supervisor"

# --- evidence survives recovery --------------------------------------------
grep -q 'supervise_capture_evidence' "$SUP" \
  && ok "14. exit evidence is captured before the restart" \
  || bad "14. no evidence capture"
grep -q 'process_exit_trace' "$SUP" \
  && ok "15. it records whether a process.exit trace exists, so the next recurrence is diagnosable" \
  || bad "15. process.exit attribution not preserved"
grep -q 'ALLOY_SERVER_AUDIT_ACTOR="supervisor"' "$SUP" \
  && ok "16. supervisor actions are attributed to the supervisor in the audit" \
  || bad "16. supervisor events inherit an ambient actor"

# --- the stop path must be able to record, or desired state is a lie -------
#
# alloy_port_in_use fails closed on 'unknown', and every lane port reads unknown
# once Tailscale Serve holds its tailnet addresses. alloy-dev-stop therefore
# refused to confirm release on provably-free ports and returned BEFORE its audit
# write: the last recorded stop was 14:12:10 while stops kept being issued for
# hours. An unrecorded stop reads as "should still be running", which is exactly
# how a supervisor resurrects a server someone deliberately stopped.
grep -q 'alloy_rc_loopback_port_owner' "${ROOT}/alloy-dev-stop" \
  && ok "17. alloy-dev-stop verifies release loopback-scoped so the stop is recorded" \
  || bad "17. alloy-dev-stop still asks the port-global question and can skip its audit write"

printf '\n==== dev-server-supervisor: %s passed, %s failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
