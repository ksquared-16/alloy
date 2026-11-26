#!/usr/bin/env bash
# tests/cert-runtime-actuator-local-docker.sh — REAL local-Docker certification (R3, Decision 1).
#
# Exercises the REAL allowlisted Supabase adapter against a NEWLY CREATED, ISOLATED
# local test namespace and proves:
#   provision creates the isolated runtime · R1 observes it · verification confirms
#   the admitted desired result · duplicate execution creates no second runtime ·
#   ownership-proven retire removes only the test runtime · R1 observes its absence ·
#   NO canonical/foreign runtime changed · no secrets entered execution records.
#
# SAFETY: acts only on an R3-minted namespace it provisions; snapshots the set of
# foreign namespaces before/after and asserts equality; a teardown trap stops the
# cert stack on ANY exit. It NEVER touches the canonical/shared stack, another
# worktree's runtime, hosted Supabase, or staging/production. Fails closed if the
# isolated runtime cannot be created/owned.
#
# This is NOT part of the hermetic phase-4 suite (it is heavy and requires Docker +
# the Supabase CLI). Run explicitly:  bash tests/cert-runtime-actuator-local-docker.sh
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TESTS_DIR/.." && pwd)"
RO="$ROOT/alloy-ro"; INTENT="$ROOT/alloy-runtime-intent"; ACT="$ROOT/alloy-runtime-actuate"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }
skip(){ printf '  --   SKIP: %s\n' "$1"; }

command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1 || { skip "docker unavailable"; exit 0; }
command -v supabase >/dev/null 2>&1 || { skip "supabase CLI unavailable"; exit 0; }
command -v node >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1 || { skip "node/python3 required"; exit 0; }

SBX="$(mktemp -d /tmp/alloy-r3-cert.XXXXXX)"
RT="$SBX/rt"; WORKROOT="$SBX/adapter"
mkdir -p "$RT/metadata" "$RT/manifests" "$RT/intents" "$RT/runtimes" "$WORKROOT"
CFG="$SBX/config"
printf 'ALLOY_RUNTIME_ROOT="%s"\nALLOY_MAX_ACTIVE_RUNTIMES="50"\n' "$RT" >"$CFG"
export ALLOY_CONFIG_FILE="$CFG" ALLOY_LOCAL_DEV_ROOT="$ROOT" ALLOY_ACT_SUPABASE_WORKROOT="$WORKROOT"

WT="r3cert"; MISSION="r3cert-init"
NS="$(bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/actuation-core.sh"; alloy_act_mint_namespace r3cert-init r3cert dedicated-disposable' 2>/dev/null)"
[[ "$NS" =~ ^alloy-r3-r3cert-init- ]] || { bad "namespace mint failed ($NS)"; rm -rf "$SBX"; exit 1; }

# --- teardown trap: never leave the cert stack running; never touch anything else ---
cleanup() {
  if [[ -d "$WORKROOT/$NS/supabase" ]]; then
    supabase stop --workdir "$WORKROOT/$NS" --no-backup >/dev/null 2>&1 || true
  fi
  rm -rf "$SBX"
}
trap cleanup EXIT INT TERM

# --- fixtures: cert worktree with a dedicated-disposable posture + recorded intent ---
cat >"$RT/metadata/$WT.env" <<M
ALLOY_WORKTREE_NAME=$WT
ALLOY_WORKTREE_PATH=$SBX/$WT
ALLOY_WORKTREE_BRANCH=agent/claude/6-r3cert
ALLOY_WORKTREE_SLOT=6
PORT=3016
ALLOY_AGENT=claude
M
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({worktree_name:"r3cert",slot:6,sprint_name:"r3cert-sprint",initiative_key:"r3cert-init",posture:{mutation:"isolated-mutable",tenant_class:"disposable"}},null,2)+"\n")' "$RT/manifests/$WT.json"
"$INTENT" "$WT" --mission "$MISSION" >/dev/null 2>&1

jget() { python3 -c 'import json,sys
d=json.load(sys.stdin)
for k in sys.argv[1].split("."): d=d[k]
print(json.dumps(d) if isinstance(d,bool) else d)' "$1"; }
# foreign namespaces = every discovered supabase project label EXCEPT our cert ns.
foreign_ns() { docker ps -a --format '{{.Label "com.supabase.cli.project"}}' 2>/dev/null | grep -v '^$' | grep -vx "$NS" | sort -u; }
ns_container_count() { docker ps -a --format '{{.Label "com.supabase.cli.project"}}' 2>/dev/null | grep -cx "$NS"; }

echo "== R3 real local-Docker certification =="
echo "  isolated ns: $NS"
echo "  cert root:   $RT"

FOREIGN_BEFORE="$(foreign_ns)"
echo "  foreign namespaces observed (must be untouched): $(printf '%s' "$FOREIGN_BEFORE" | tr '\n' ' ')"

# --- PROVISION (real supabase adapter) ---
echo "== provision (real supabase; this pulls/starts containers, may take minutes) =="
o="$("$ACT" "$WT" --operation provision --mission "$MISSION" --adapter supabase --json 2>/dev/null)"
state="$(printf '%s' "$o" | jget state 2>/dev/null || echo err)"
[[ "$state" == "succeeded" ]] && ok "provision succeeded (real adapter)" || { bad "provision state=$state ($o)"; }
[[ "$(printf '%s' "$o" | jget desired_state_reached 2>/dev/null)" == "true" ]] && ok "R3 verification confirmed desired result" || bad "desired_state_reached"

# --- R1 independently observes the isolated runtime ---
health="$("$RO" runtime-status "$NS" --json 2>/dev/null | jget health 2>/dev/null || echo none)"
cstate="$("$RO" runtime-status "$NS" --json 2>/dev/null | jget container_state 2>/dev/null || echo none)"
[[ "$cstate" == "active" ]] && ok "R1 observes runtime active ($NS)" || bad "R1 container_state=$cstate"
[[ "$health" == "healthy" ]] && ok "R1 observes runtime healthy (core services up)" || bad "R1 health=$health"
CNT_AFTER_PROVISION="$(ns_container_count)"
[[ "$CNT_AFTER_PROVISION" -ge 4 ]] && ok "docker shows isolated stack ($CNT_AFTER_PROVISION containers)" || bad "container count=$CNT_AFTER_PROVISION"

# --- DUPLICATE delivery creates NO second runtime ---
o2="$("$ACT" "$WT" --operation provision --mission "$MISSION" --adapter supabase --json 2>/dev/null)"
[[ "$(printf '%s' "$o2" | jget state 2>/dev/null)" == "succeeded" ]] && ok "duplicate provision returns terminal success" || bad "dup state"
CNT_AFTER_DUP="$(ns_container_count)"
[[ "$CNT_AFTER_DUP" == "$CNT_AFTER_PROVISION" ]] && ok "duplicate created NO second runtime ($CNT_AFTER_DUP)" || bad "dup changed count ($CNT_AFTER_PROVISION → $CNT_AFTER_DUP)"

# --- foreign runtimes unchanged at mid-point ---
[[ "$(foreign_ns)" == "$FOREIGN_BEFORE" ]] && ok "no canonical/foreign runtime changed by provision" || bad "foreign namespaces changed during provision"

# --- no secrets in execution/reservation records ---
if grep -rqiE 'service_role|anon.{0,3}key|password=|JWT|BEGIN (RSA|PRIVATE)' "$RT/executions" "$RT/reservations" 2>/dev/null; then
  bad "secret/provider material leaked into records"; else ok "no secrets/provider output in records"; fi

# --- RETIRE (ownership-proven) ---
echo "== retire (ownership-proven teardown) =="
o="$("$ACT" "$WT" --operation retire --mission "$MISSION" --adapter supabase --json 2>/dev/null)"
[[ "$(printf '%s' "$o" | jget state 2>/dev/null)" == "succeeded" ]] && ok "ownership-proven retire succeeded" || bad "retire state ($o)"
sleep 2
CNT_AFTER_RETIRE="$(ns_container_count)"
[[ "$CNT_AFTER_RETIRE" == "0" ]] && ok "docker shows isolated runtime removed" || bad "containers remain after retire ($CNT_AFTER_RETIRE)"
cstate2="$("$RO" runtime-status "$NS" --json 2>/dev/null | jget container_state 2>/dev/null || echo absent)"
[[ "$cstate2" == "absent" || "$cstate2" == "none" ]] && ok "R1 observes absence after retirement" || bad "R1 still sees $cstate2"

# --- foreign runtimes unchanged after the whole cycle ---
[[ "$(foreign_ns)" == "$FOREIGN_BEFORE" ]] && ok "no canonical/foreign runtime changed by the full cycle" || bad "foreign namespaces changed after cycle"

printf '\n==== R3 local-Docker certification: %d passed, %d failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
