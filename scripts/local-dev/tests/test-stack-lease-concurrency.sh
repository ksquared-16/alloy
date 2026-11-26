#!/usr/bin/env bash
# =============================================================================
# test-stack-lease-concurrency — two sessions sharing one stack must be visible
# to each other, and neither may pull the stack out from under the other.
#
# THE FAILURE THIS GUARDS, and it happened. Leases were keyed by the worktree
# BASENAME and `lease_path` is one file per holder name, so two sessions working
# in one worktree did not take two leases — the second overwrote the first:
#
#   A: use     -> lease held by 'wt5' (1 active)
#   B: use     -> lease held by 'wt5' (1 active)     <- silently overwrote A
#   A: release -> "last lease released - stopping the shared stack"
#
# and a live certification lost its database. Nothing warned: both joins really
# did succeed, and the count truthfully counted the one file that survived.
#
# The same collapsed count silently defeated three defences that were each
# correct in themselves — release-at-zero, exclusivity refusal, and the idle
# reaper — because all three read it. That is why the scenarios below assert on
# COUNTS and on whether the stack would be stopped, not merely on exit codes.
#
# Touches no Docker, no stack, no volumes. Lease files only, under a sandboxed
# state dir; every stack primitive is stubbed.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="${SCRIPT_DIR}/alloy-stack"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }

STATE="$(mktemp -d)"
trap 'rm -rf "$STATE"' EXIT

# One harness: sources the REAL alloy-stack, neutralises everything that would
# touch Docker, and records whether the shared stack would have been stopped.
harness() { # harness <script-body>
  ALLOY_STACK_STATE_DIR="$STATE" bash -c '
    ALLOY_STACK_TEST_SOURCE=1
    source "'"$STACK"'" >/dev/null 2>&1 || true
    docker_ok()            { return 0; }
    stack_is_running()     { return 0; }
    resolve_stack_workdir(){ echo "/tmp"; }
    ensure_seeded()        { return 0; }
    STOPPED_MARK="'"$STATE"'/STOPPED"
    stop_stack_by_project() { : > "$STOPPED_MARK"; }
    stack_stopped() { [[ -f "$STOPPED_MARK" ]]; }
    clear_stopped() { rm -f "$STOPPED_MARK"; }
    '"$1"'
  ' 2>&1
}

reset_state() { rm -rf "$STATE"/leases "$STATE"/STOPPED; mkdir -p "$STATE"/leases; }

# ---------------------------------------------------------------- scenario 1
reset_state
out="$(harness '
  cmd_use A >/dev/null 2>&1
  echo "leases=$(live_lease_count)"
  cmd_release A >/dev/null 2>&1
  stack_stopped && echo "stopped=yes" || echo "stopped=no"
  echo "after=$(live_lease_count)"
')"
grep -q 'leases=1'  <<<"$out" && ok "S1 single user: use A creates exactly one lease" || bad "S1 lease not created ($out)"
grep -q 'after=0'   <<<"$out" && ok "S1 single user: release A removes it"            || bad "S1 lease not removed ($out)"
grep -q 'stopped=yes' <<<"$out" && ok "S1 single user: last release may stop the stack" || bad "S1 stack not stopped ($out)"

# ---------------------------------------------------------------- scenario 2
reset_state
out="$(harness '
  cmd_use A >/dev/null 2>&1
  cmd_use B >/dev/null 2>&1
  echo "both=$(live_lease_count)"
  cmd_release A >/dev/null 2>&1
  stack_stopped && echo "afterA=stopped" || echo "afterA=up"
  echo "remaining=$(live_lease_count)"
  cmd_release B >/dev/null 2>&1
  stack_stopped && echo "afterB=stopped" || echo "afterB=up"
')"
grep -q 'both=2'        <<<"$out" && ok "S2 two users: both leases are visible"                  || bad "S2 leases collapsed ($out)"
grep -q 'afterA=up'     <<<"$out" && ok "S2 two users: A's release does NOT stop B's stack"      || bad "S2 STACK TORN DOWN UNDER B ($out)"
grep -q 'remaining=1'   <<<"$out" && ok "S2 two users: B's lease survives A's release"           || bad "S2 B's lease lost ($out)"
grep -q 'afterB=stopped'<<<"$out" && ok "S2 two users: only the last release may stop the stack" || bad "S2 last release did not stop ($out)"

# ---------------------------------------------------------------- scenario 3
reset_state
harness 'cmd_use A >/dev/null 2>&1; cmd_use B >/dev/null 2>&1' >/dev/null
# `require_exclusive` refuses by calling die(), which EXITS — so it is run in its
# own shell, the way the operator's shell runs it, rather than inside a caller
# whose remaining assertions would never execute.
if harness 'require_exclusive A' >/dev/null 2>&1; then excl=granted; else excl=refused; fi
out="exclusive=${excl}
blockers=$(harness 'other_lease_holders A' | tr '\n' ',')"
grep -q 'exclusive=refused' <<<"$out" && ok "S3 exclusivity: reset refused while B holds a lease" || bad "S3 exclusivity wrongly granted ($out)"
grep -q 'blockers=B'        <<<"$out" && ok "S3 exclusivity: the blocking lease is named"         || bad "S3 blocker not named ($out)"

reset_state
harness 'cmd_use A >/dev/null 2>&1' >/dev/null
if harness 'require_exclusive A' >/dev/null 2>&1; then sole=granted; else sole=refused; fi
out="sole=${sole}"
grep -q 'sole=granted' <<<"$out" && ok "S3 exclusivity: sole holder may proceed" || bad "S3 sole holder wrongly refused ($out)"

# ---------------------------------------------------------------- scenario 4
reset_state
out="$(harness '
  cmd_use A >/dev/null 2>&1
  # The reaper only considers the sanctioned stack idle at zero live leases.
  echo "live=$(live_lease_count)"
')"
grep -q 'live=1' <<<"$out" && ok "S4 idle reaper: an active lease keeps the stack out of reap scope" || bad "S4 active lease invisible to reaper ($out)"
grep -q 'include_idle" -eq 1 && "$(live_lease_count)" == "0"' "$STACK" \
  && ok "S4 idle reaper: reap gate requires live_lease_count == 0" || bad "S4 reap gate not lease-driven"

# ---------------------------------------------------------------- scenario 5
reset_state
out="$(ALLOY_STACK_STATE_DIR="$STATE" bash -c '
  ALLOY_STACK_TEST_SOURCE=1
  source "'"$STACK"'" >/dev/null 2>&1 || true
  docker_ok(){ return 0; }; stack_is_running(){ return 0; }
  resolve_stack_workdir(){ echo /tmp; }; ensure_seeded(){ return 0; }
  stop_stack_by_project(){ :; }
  # Force the lease write to fail: make the lease path unwritable.
  lease_path(){ printf "%s\n" "/proc/nonexistent-dir/x.lease"; }
  cmd_use A >/dev/null 2>&1; echo "rc=$?"
' 2>&1)"
grep -q 'rc=0' <<<"$out" && bad "S5 lease write failure: use falsely reported success ($out)" \
                         || ok "S5 lease write failure: use returns non-zero, no false success"

# ---------------------------------------------------------------- scenario 6
out="$(ALLOY_STACK_STATE_DIR="$STATE" bash -c '
  ALLOY_STACK_TEST_SOURCE=1
  source "'"$STACK"'" >/dev/null 2>&1 || true
  d="$(mktemp -d)"
  printf "#!/usr/bin/env bash\nexit 7\n" > "$d/alloy-certify"; chmod +x "$d/alloy-certify"
  ensure_seeded "$d" >/dev/null 2>&1; echo "rc=$?"
' 2>&1)"
grep -q 'rc=0' <<<"$out" && bad "S6 seed failure: ensure_seeded returned 0 on failure ($out)" \
                         || ok "S6 seed failure: ensure_seeded propagates non-zero"

out="$(ALLOY_STACK_STATE_DIR="$STATE" bash -c '
  ALLOY_STACK_TEST_SOURCE=1
  source "'"$STACK"'" >/dev/null 2>&1 || true
  d="$(mktemp -d)"
  printf "#!/usr/bin/env bash\nexit 0\n" > "$d/alloy-certify"; chmod +x "$d/alloy-certify"
  ensure_seeded "$d" >/dev/null 2>&1; echo "rc=$?"
' 2>&1)"
grep -q 'rc=0' <<<"$out" && ok "S6 seed success: an idempotent already-seeded run stays a success" \
                         || bad "S6 harmless seed turned into a failure ($out)"

# S6c/S6d — WHICH CALLER DIES. A failing seed must stop a CERTIFICATION before it
# takes a lease, and must NOT stop a plain join: `alloy-certify seed` shells out
# to a host psql that does not exist on this machine, so a fatal plain join would
# leave every session unable to take a lease at all — and an unleased session is
# what let one lane stop the stack under another.
reset_state
out="$(harness '
  ensure_seeded() { return 1; }
  ALLOY_STACK_SEED_REQUIRED=0 cmd_use J >/dev/null 2>&1; echo "join_rc=$?"
  echo "join_leases=$(live_lease_count)"
')"
grep -q 'join_rc=0'     <<<"$out" && ok "S6 plain join survives a failing seed"            || bad "S6 plain join bricked by seed failure ($out)"
grep -q 'join_leases=1' <<<"$out" && ok "S6 plain join still takes its lease"              || bad "S6 plain join left unleased ($out)"

reset_state
# The required path aborts the shell, so the lease count is read by a SECOND
# invocation against the same state dir rather than after the abort.
if harness 'ensure_seeded() { return 1; }; ALLOY_STACK_SEED_REQUIRED=1 cmd_use C' >/dev/null 2>&1; then
  cert_rc=0; else cert_rc=1; fi
out="cert_rc=${cert_rc}
cert_leases=$(harness 'live_lease_count')"
grep -q 'cert_rc=0'     <<<"$out" && bad "S6 certification proceeded on an unseeded baseline ($out)" \
                                  || ok "S6 certification refuses an unseeded baseline"
grep -q 'cert_leases=0' <<<"$out" && ok "S6 certification takes no lease when the seed failed"        \
                                  || bad "S6 certification took a lease anyway ($out)"

# ---------------------------------------------------------------- scenario 7
reset_state
out="$(harness '
  cmd_use A >/dev/null 2>&1
  f="$(lease_path A)"
  # A lease whose worktree is gone is definitively stale.
  sed -i "" "s|^WORKTREE=.*|WORKTREE=/nonexistent/worktree-$$|" "$f" 2>/dev/null \
    || sed -i "s|^WORKTREE=.*|WORKTREE=/nonexistent/worktree-$$|" "$f"
  echo "pruned=$(prune_stale_leases)"
  echo "left=$(live_lease_count)"
')"
grep -q 'pruned=1' <<<"$out" && ok "S7 stale lease: a dead holder is reclaimed"           || bad "S7 stale lease not reclaimed ($out)"
grep -q 'left=0'   <<<"$out" && ok "S7 stale lease: it does not pin the stack forever"    || bad "S7 stack still pinned ($out)"

# ------------------------------------------------- the original regression
reset_state
out="$(ALLOY_STACK_STATE_DIR="$STATE" bash -c '
  ALLOY_STACK_TEST_SOURCE=1
  source "'"$STACK"'" >/dev/null 2>&1 || true
  ALLOY_WORKTREE_PATH=/tmp
  ALLOY_STACK_SESSION=alpha; a="$(default_holder)"
  ALLOY_STACK_SESSION=beta;  b="$(default_holder)"
  [[ "$a" == "$b" ]] && echo "distinct=no" || echo "distinct=yes"
' 2>&1)"
grep -q 'distinct=yes' <<<"$out" \
  && ok "REGRESSION: two sessions in one worktree get distinct lease identities" \
  || bad "REGRESSION: sessions still collapse to one lease ($out)"

reset_state
out="$(harness '
  cmd_use shared >/dev/null 2>&1
  # A second live session with no token would previously have overwritten this.
  f="$(lease_path shared)"
  # A REAL live process this user owns. pid 1 looks dead from here: the liveness
  # check starts with `kill -0`, and launchd is root-owned, so a non-root probe
  # is refused and the lease reads as abandoned. Fingerprint fields are cleared
  # so the fail-safe "no recorded identity, trust the live pid" branch applies.
  # fds redirected, or command substitution would hold the pipe open until the
  # sleep exits and the whole suite would appear to hang.
  sleep 30 >/dev/null 2>&1 </dev/null & other=$!
  perl -pi -e "s|^PID=.*|PID=$other|; s|^PID_START=.*|PID_START=|; s|^PID_CMD=.*|PID_CMD=|" "$f"
  cmd_use shared >/dev/null 2>&1; echo "rc=$?"
  kill "$other" 2>/dev/null
')"
grep -q 'rc=0' <<<"$out" && bad "FALLBACK: a live session's lease was silently overwritten ($out)" \
                         || ok "FALLBACK: refuses to overwrite a different live session's lease"

printf '\npassed=%d failed=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
