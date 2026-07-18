#!/usr/bin/env bash
# tests/test-runtime-actuator.sh — Runtime Actuation V1 (R3).
#
# Hermetic: the fixture adapter edits the R1 docker-ps fixture so authoritative R1
# observation reflects simulated results; NO real Docker/Supabase is touched. Proves
# the 13 required demonstrations + reservation/idempotency/concurrency/timeout/crash/
# security/redaction, and that alloy-ro stays read-only.
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TESTS_DIR/.." && pwd)"
RO="$ROOT/alloy-ro"; INTENT="$ROOT/alloy-runtime-intent"; ACT="$ROOT/alloy-runtime-actuate"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }
command -v node >/dev/null 2>&1 || { echo "node required"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required"; exit 1; }

# --- sandbox (fixture runtime root; /tmp/alloy-*-fixture.* ⇒ alloy_runtime_is_fixture) ---
SBX="$(mktemp -d /tmp/alloy-r3-fixture.XXXXXX)"; trap 'rm -rf "$SBX"' EXIT
RT="$SBX/rt"; mkdir -p "$RT/metadata" "$RT/manifests" "$RT/runtimes" "$RT/intents"
CFG="$SBX/config"
printf 'ALLOY_RUNTIME_ROOT="%s"\nALLOY_MAX_ACTIVE_RUNTIMES="2"\nALLOY_TEST_FIXTURE=1\nALLOY_FAKE_SECRET="TOP-SECRET-JWT-vALue"\n' "$RT" >"$CFG"
export ALLOY_CONFIG_FILE="$CFG" ALLOY_LOCAL_DEV_ROOT="$ROOT" ALLOY_TEST_FIXTURE=1
export ALLOY_AD_EVAL_NOW="2026-07-17T00:00:00Z" ALLOY_ACT_EVAL_NOW="2026-07-17T00:00:00Z"
PSF="$SBX/ps"; : >"$PSF"; export ALLOY_RT_PS_FIXTURE="$PSF"

# --- fixture helpers -----------------------------------------------------------
row() { printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' "$@"; }
stack() { local ns="$1"
  row "id-$ns-db"   "supabase_db_$ns"   pg     running "Up 2h" "" "$ns" "" db
  row "id-$ns-kong" "supabase_kong_$ns" kong   running "Up 2h" "" "$ns" "" kong
  row "id-$ns-auth" "supabase_auth_$ns" gotrue running "Up 2h" "" "$ns" "" auth
  row "id-$ns-rest" "supabase_rest_$ns" pgrst  running "Up 2h" "" "$ns" "" rest
}
reset_ps() { : >"$PSF"; }
set_ps()  { : >"$PSF"; "$@" >>"$PSF"; }
add_ps()  { "$@" >>"$PSF"; }

mkmeta() { # name slot branch
  cat >"$RT/metadata/$1.env" <<M
ALLOY_WORKTREE_NAME=$1
ALLOY_WORKTREE_PATH=$SBX/$1
ALLOY_WORKTREE_BRANCH=$3
ALLOY_WORKTREE_SLOT=$2
PORT=30$2$2
ALLOY_AGENT=claude
M
}
mkmanifest() { # name slot mutation tenant
  node -e 'const fs=require("fs");const p=process.argv[1];let m={};
    m.worktree_name=process.argv[2];m.slot=Number(process.argv[3]);m.sprint_name=process.argv[2]+"-sprint";
    m.initiative_key=process.argv[2]+"-init";m.posture={mutation:process.argv[4],tenant_class:process.argv[5]};
    fs.writeFileSync(p,JSON.stringify(m,null,2)+"\n");' "$RT/manifests/$1.json" "$1" "$2" "$3" "$4"
}
register_runtime() { # namespace class owner [provenance]
  cat >"$RT/runtimes/$1.env" <<R
ALLOY_RT_RUNTIME_CLASS=$2
ALLOY_RT_OWNER_MISSION_KEY=$3
ALLOY_RT_OWNER_PROVENANCE=${4:-explicit-arg}
ALLOY_RT_PROJECT_NAMESPACE=$1
R
}
mkwt_dedicated() { mkmeta "$1" "$2" "agent/claude/$2-$1"; mkmanifest "$1" "$2" isolated-mutable disposable; }
mkwt_shared_ro() { mkmeta "$1" "$2" "agent/claude/$2-$1"; mkmanifest "$1" "$2" read-only shared; }
record_intent() { "$INTENT" "$1" --mission "$1-init" >/dev/null 2>&1; }
act() { "$ACT" "$1" --operation "$2" --mission "$1-init" --adapter fixture --json 2>/dev/null; }
jget() { python3 -c 'import json,sys
d=json.load(sys.stdin)
for k in sys.argv[1].split("."):
    d=d[k]
print(json.dumps(d) if isinstance(d,bool) else d)' "$1"; }
exec_field() { "$RO" runtime-executions "$1" --json 2>/dev/null | jget "$2" 2>/dev/null; }
# run R3 library code in a subshell with the full toolkit loaded (for crafting state).
craft() { bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/actuation-exec.sh"
  alloy_load_config >/dev/null 2>&1; alloy_act_init; alloy_act_ensure_dirs; '"$1" 2>/dev/null; }

echo "== Runtime Actuator V1 (R3) tests =="

# 1) Successful isolated dedicated-runtime provision (provider ok + R1 verifies).
reset_ps; mkwt_dedicated d1 1; record_intent d1
o="$(act d1 provision)"
[[ "$(printf '%s' "$o" | jget state)" == "succeeded" && "$(printf '%s' "$o" | jget desired_state_reached)" == "true" ]] \
  && ok "provision succeeds and is R1-verified" || bad "provision succeed/verify ($o)"
NS1="$(printf '%s' "$o" | jget target_namespace)"
[[ "$NS1" =~ ^alloy-r3-d1-init- ]] && ok "namespace is R3-minted ($NS1)" || bad "namespace mint ($NS1)"
[[ "$(grep -c "$NS1" "$PSF")" == "4" ]] && ok "exactly one isolated stack observed" || bad "stack rows"

# 2) Duplicate delivery returns prior result and creates NO second runtime.
o2="$(act d1 provision)"
[[ "$(printf '%s' "$o2" | jget state)" == "succeeded" ]] && ok "duplicate returns terminal success" || bad "dup state ($o2)"
[[ "$(grep -c "$NS1" "$PSF")" == "4" ]] && ok "duplicate creates no second runtime" || bad "dup made 2nd runtime"

# 3) Two contenders for one remaining slot ⇒ exactly one winner (reservation overlay).
#    R2 admits (active 1 < max 2 ⇒ remaining 1), but a held reservation (contender A,
#    in-flight) consumes the slot, so contender B is refused — fail closed.
rm -rf "$RT/reservations"; set_ps stack occupier   # 1 active, max 2 ⇒ R2 remaining 1
mkwt_dedicated cA 1; record_intent cA; mkwt_dedicated cB 2; record_intent cB
craft 'alloy_act_authorize cA provision; alloy_act_reserve cA-init cA dedicated-disposable "$_ACT_TARGET_NS" provision fp'  # A holds the slot
o="$(act cB provision)"
[[ "$(printf '%s' "$o" | jget state)" == "conflicted" && "$(printf '%s' "$o" | jget result_code)" == "reservation-capacity-exhausted" ]] \
  && ok "second contender refused; exactly one wins the slot" || bad "contenders ($o)"

# 4) Stale / no-longer-admitted intent ⇒ NO provider mutation.
reset_ps; rm -rf "$RT/reservations"; mkwt_dedicated s1 3; record_intent s1
mkmanifest s1 3 read-only none   # drift posture underneath the recorded intent → stale
o="$(act s1 provision)"
[[ "$(printf '%s' "$o" | jget state)" == "stale" || "$(printf '%s' "$o" | jget result_code)" == "stale-admission" ]] \
  && ok "stale intent → stale/refused, no provider effect" || bad "stale ($o)"
[[ "$(wc -l <"$PSF" | tr -d ' ')" == "0" ]] && ok "stale caused no runtime creation" || bad "stale mutated ps"

# 5) Provider rejection ⇒ typed, retry-classified failure.
reset_ps; mkwt_dedicated r1 4; record_intent r1
o="$(ALLOY_ACT_FIXTURE_PROVISION_RESULT=rejected act r1 provision)"
[[ "$(printf '%s' "$o" | jget state)" == "failed" && "$(printf '%s' "$o" | jget result_code)" == "provider-rejected" ]] \
  && ok "provider rejection → typed failed/provider-rejected" || bad "reject ($o)"

# 6) Ambiguous timeout ⇒ not success; reconcilable through R1.
reset_ps; mkwt_dedicated t1 5; record_intent t1
o="$(ALLOY_ACT_FIXTURE_PROVISION_RESULT=timeout act t1 provision)"
[[ "$(printf '%s' "$o" | jget state)" == "timed_out" && "$(printf '%s' "$o" | jget result_code)" == "ambiguous-provider-result" ]] \
  && ok "timeout → timed_out/ambiguous, not success" || bad "timeout ($o)"
[[ "$(printf '%s' "$o" | jget desired_state_reached)" == "unknown" ]] && ok "timeout desired=unknown" || bad "timeout desired"
eid="$(printf '%s' "$o" | jget execution_id)"
"$ACT" t1 --operation reconcile --mission t1-init --adapter fixture >/dev/null 2>&1   # runtime absent
[[ "$(exec_field "$eid" state)" == "failed" ]] && ok "reconcile(absent) → failed, no fabricated success" || bad "reconcile timeout absent ($(exec_field "$eid" state))"

# 7) Provider completion + failed verification ⇒ not success.
reset_ps; mkwt_dedicated v1 6; record_intent v1
o="$(ALLOY_ACT_FIXTURE_PROVISION_RESULT=unhealthy act v1 provision)"
[[ "$(printf '%s' "$o" | jget state)" == "failed" && "$(printf '%s' "$o" | jget result_code)" == "verification-failed" ]] \
  && ok "provider ok + verify fail → verification-failed (not success)" || bad "verify-fail ($o)"

# 8) Process interruption leaves durable state for safe reconcile (adopt when R1 conclusive).
reset_ps; rm -rf "$RT/reservations"; mkwt_dedicated k1 1; record_intent k1
NSK="$(bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/actuation-core.sh"; alloy_act_mint_namespace k1-init k1 dedicated-disposable' 2>/dev/null)"
set_ps stack "$NSK"; register_runtime "$NSK" dedicated-disposable k1-init
craft 'eid="$(alloy_act_execution_id k1-init k1 dedicated-disposable provision "'"$NSK"'" fp)"
  alloy_act_write_execution "$eid" k1-init k1 dedicated-disposable provision "'"$NSK"'" "" fixture tester admitted-dedicated
  alloy_act_exec_update "$eid" ALLOY_EXEC_STATE executing ALLOY_EXEC_CLAIM_PID 999999
  printf "%s" "$eid" > "'"$SBX"'/k1.eid"'
eidk="$(cat "$SBX/k1.eid" 2>/dev/null)"
[[ "$(exec_field "$eidk" state)" == "executing" && "$(exec_field "$eidk" claim_live)" == "false" ]] \
  && ok "interrupted execution durably recorded (dead claim)" || bad "interrupted setup (state=$(exec_field "$eidk" state))"
"$ACT" k1 --operation reconcile --mission k1-init --adapter fixture >/dev/null 2>&1
[[ "$(exec_field "$eidk" state)" == "succeeded" ]] && ok "reconcile adopts success when R1 conclusive" || bad "reconcile adopt ($(exec_field "$eidk" state))"

# 9) Ownership-proven retire removes the isolated runtime; R1 observes absence.
reset_ps; rm -rf "$RT/reservations"; mkwt_dedicated rt1 2; record_intent rt1
o="$(act rt1 provision)"; NSR="$(printf '%s' "$o" | jget target_namespace)"
[[ "$(grep -c "$NSR" "$PSF")" == "4" ]] && ok "retire: runtime present before" || bad "retire pre"
o="$(act rt1 retire)"
[[ "$(printf '%s' "$o" | jget state)" == "succeeded" ]] && ok "ownership-proven retire succeeds" || bad "retire ($o)"
[[ "$(grep -c "$NSR" "$PSF")" == "0" ]] && ok "R1 observes absence after retire" || bad "retire absence"

# 10) Attempted retire of a shared/foreign runtime fails closed.
reset_ps; set_ps stack "foreign-shared"; register_runtime "foreign-shared" shared-readonly someone-else
mkwt_dedicated fr1 3; record_intent fr1
craft 'alloy_act_write_attachment fr1 fr1-init foreign-shared shared-readonly shared manual'
o="$("$ACT" fr1 --operation retire --mission fr1-init --adapter fixture --json 2>/dev/null)"
[[ "$(printf '%s' "$o" | jget state)" == "failed" ]] && ok "retire of foreign/shared fails closed" || bad "retire foreign ($o)"
[[ "$(grep -c 'foreign-shared' "$PSF")" == "4" ]] && ok "foreign runtime untouched by refused retire" || bad "foreign mutated"

# 11) Attach/detach change relationship state without mutating shared infra.
reset_ps; set_ps stack "shared-pool"; register_runtime "shared-pool" shared-readonly shared-pool-owner
mkwt_shared_ro a1 4; record_intent a1
before="$(md5 -q "$PSF" 2>/dev/null || md5sum "$PSF" | awk '{print $1}')"
o="$(act a1 attach)"
[[ "$(printf '%s' "$o" | jget state)" == "succeeded" ]] && ok "attach records relationship" || bad "attach ($o)"
[[ -f "$RT/attachments/a1.env" ]] && ok "attachment record written" || bad "attach record missing"
after="$(md5 -q "$PSF" 2>/dev/null || md5sum "$PSF" | awk '{print $1}')"
[[ "$before" == "$after" ]] && ok "attach did NOT mutate shared runtime" || bad "attach mutated infra"
o="$("$ACT" a1 --operation detach --mission a1-init --adapter fixture --json 2>/dev/null)"
[[ "$(printf '%s' "$o" | jget state)" == "succeeded" && ! -f "$RT/attachments/a1.env" ]] \
  && ok "detach removes relationship only" || bad "detach ($o)"

# 12) Inspection/read commands remain non-mutating.
snapshot() { find "$RT" -type f -exec md5 -q {} \; 2>/dev/null | sort | md5 -q 2>/dev/null \
             || find "$RT" -type f -exec md5sum {} \; 2>/dev/null | awk '{print $1}' | sort | md5sum | awk '{print $1}'; }
b="$(snapshot)"
for v in runtime-reservations runtime-executions runtime-actuation-capacity; do "$RO" "$v" >/dev/null 2>&1; done
"$RO" runtime-executions --json >/dev/null 2>&1
a="$(snapshot)"
[[ "$b" == "$a" ]] && ok "alloy-ro R3 verbs write nothing (tree unchanged)" || bad "alloy-ro mutated tree"

# 13) Execution records contain no secrets / no raw command output.
if grep -rqi 'TOP-SECRET-JWT-vALue' "$RT/executions" "$RT/reservations" "$RT/attachments" 2>/dev/null; then
  bad "secret leaked into records"; else ok "no secret in R3 records"; fi
if grep -rqiE '\.Command|\.Env|service_role|password=' "$RT/executions" 2>/dev/null; then
  bad "raw/provider secret material in records"; else ok "no raw provider output in records"; fi

# --- reservation: exhaustion (overlay), expiry, selective accounting -----------
# Capacity exhausted via the R3 overlay (R2 admits; a held reservation exhausts).
reset_ps; rm -rf "$RT/reservations"; set_ps stack occ1   # active 1, max 2 ⇒ R2 remaining 1
mkwt_dedicated x1 5; record_intent x1; mkwt_dedicated x2 6; record_intent x2
craft 'alloy_act_authorize x1 provision; alloy_act_reserve x1-init x1 dedicated-disposable "$_ACT_TARGET_NS" provision fp'
o="$(act x2 provision)"
[[ "$(printf '%s' "$o" | jget result_code)" == "reservation-capacity-exhausted" ]] \
  && ok "reservation overlay exhaustion → fail closed" || bad "cap-exhausted ($o)"

# reservation expiry frees capacity ONLY for an abandoned reservation (time-travel).
reset_ps; rm -rf "$RT/reservations"; mkwt_dedicated e1 6; record_intent e1
ALLOY_ACT_RESERVATION_TTL=30 craft 'alloy_act_authorize e1 provision
  alloy_act_reserve e1-init e1 dedicated-disposable "$_ACT_TARGET_NS" provision fp'
held_before="$("$RO" runtime-actuation-capacity --json | jget held_reservation_units)"
[[ "$held_before" == "1" ]] && ok "held reservation counts against capacity" || bad "held count ($held_before)"
ALLOY_ACT_EVAL_NOW="2026-07-17T01:00:00Z" craft 'alloy_act_reconcile_expiry'
held_after="$(ALLOY_ACT_EVAL_NOW=2026-07-17T01:00:00Z "$RO" runtime-actuation-capacity --json | jget held_reservation_units)"
[[ "$held_after" == "0" ]] && ok "expired/abandoned reservation frees capacity" || bad "expiry free ($held_after)"

# selective accounting: attach reserves NO capacity unit.
reset_ps; rm -rf "$RT/reservations"; set_ps stack "shared-pool2"; register_runtime "shared-pool2" shared-readonly sp2-owner
mkwt_shared_ro sa1 1; record_intent sa1
act sa1 attach >/dev/null 2>&1
[[ "$("$RO" runtime-reservations --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["reservations"]))')" == "0" ]] \
  && ok "attach creates no capacity reservation (selective accounting)" || bad "attach reserved capacity"

# --- security: identity safety + adapter allowlist -----------------------------
"$ACT" 6 --operation provision --mission whatever --adapter fixture >/dev/null 2>&1 \
  && bad "slot-only target accepted" || ok "slot-only target refused (identity safety)"
reset_ps; mkwt_dedicated m1 2; record_intent m1
"$ACT" m1 --operation provision --mission wrong-key --adapter fixture >/dev/null 2>&1 \
  && bad "mission mismatch accepted" || ok "mission mismatch refused"

# fixture adapter refused outside a fixture/cert root (prod root NOT under /tmp/alloy-*-fixture).
PRODRT="$(mktemp -d /tmp/alloy-r3-prodroot.XXXXXX)"
mkdir -p "$PRODRT/metadata" "$PRODRT/manifests" "$PRODRT/intents" "$PRODRT/runtimes"
printf 'ALLOY_RUNTIME_ROOT="%s"\nALLOY_MAX_ACTIVE_RUNTIMES="2"\n' "$PRODRT" >"$SBX/prodcfg"
( export ALLOY_CONFIG_FILE="$SBX/prodcfg"; unset ALLOY_TEST_FIXTURE
  cat >"$PRODRT/metadata/p1.env" <<M
ALLOY_WORKTREE_NAME=p1
ALLOY_WORKTREE_PATH=$SBX/p1
ALLOY_WORKTREE_BRANCH=agent/claude/1-p1
ALLOY_WORKTREE_SLOT=1
PORT=3011
ALLOY_AGENT=claude
M
  node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({worktree_name:"p1",slot:1,sprint_name:"p1-sprint",initiative_key:"p1-init",posture:{mutation:"isolated-mutable",tenant_class:"disposable"}},null,2))' "$PRODRT/manifests/p1.json"
  "$INTENT" p1 --mission p1-init >/dev/null 2>&1
  os="$("$ACT" p1 --operation provision --mission p1-init --adapter fixture --json 2>/dev/null)"
  st="$(printf '%s' "$os" | jget state 2>/dev/null || echo err)"
  [[ "$st" != "succeeded" ]] && echo PASS >"$SBX/prodres" || echo FAIL >"$SBX/prodres" )
[[ "$(cat "$SBX/prodres" 2>/dev/null)" == "PASS" ]] && ok "fixture adapter refused outside fixture root" || bad "fixture ran in prod root"
rm -rf "$PRODRT"

# --- no-mutation proof: fixture path invokes NO docker/supabase -----------------
reset_ps; rm -rf "$RT/reservations"; mkwt_dedicated nm1 3; record_intent nm1
mkdir -p "$SBX/bin"; CALLLOG="$SBX/calllog"; : >"$CALLLOG"
for c in docker supabase; do
  printf '#!/usr/bin/env bash\necho "%s $*" >>"%s"\nexit 0\n' "$c" "$CALLLOG" >"$SBX/bin/$c"
  chmod +x "$SBX/bin/$c"
done
PATH="$SBX/bin:$PATH" act nm1 provision >/dev/null 2>&1
if grep -qE 'docker (start|stop|rm|run|create|prune)|^supabase ' "$CALLLOG" 2>/dev/null; then
  bad "fixture path invoked docker/supabase mutation"; else ok "fixture path invoked no docker/supabase mutation"; fi

# --- C-0: concurrent same-identity delivery → one winner, non-mutating loser -------
# (a) Deterministic loser: hold the per-resource lock with a LIVE pid (simulating an
#     in-flight contender), then deliver the same intent → must return already-in-progress
#     and mutate NOTHING (no reservation, no execution head, no runtime).
reset_ps; rm -rf "$RT/reservations" "$RT/executions" "$RT/attachments" "$RT/locks"; mkwt_dedicated cc1 1; record_intent cc1
NSCC="$(bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/actuation-core.sh"; alloy_act_mint_namespace cc1-init cc1 dedicated-disposable' 2>/dev/null)"
LOCKDIR="$(bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/actuation-core.sh"; alloy_load_config >/dev/null 2>&1; alloy_act_init; alloy_act_lock_dir_for "resource-'"$NSCC"'"' 2>/dev/null)"
sleep 30 & HOLD=$!
mkdir -p "$LOCKDIR"
printf 'ALLOY_ACT_LOCK_KEY="resource-%s"\nALLOY_ACT_LOCK_PID="%s"\nALLOY_ACT_LOCK_STARTED="2026-07-17T00:00:00Z"\n' "$NSCC" "$HOLD" >"$LOCKDIR/owner.env"
rb="$(ls "$RT/reservations" 2>/dev/null | wc -l | tr -d ' ')"; eb="$(ls "$RT/executions" 2>/dev/null | wc -l | tr -d ' ')"; pb="$(wc -l <"$PSF" | tr -d ' ')"
o="$(act cc1 provision)"
[[ "$(printf '%s' "$o" | jget result_code)" == "already-in-progress" ]] && ok "concurrent loser returns already-in-progress" || bad "loser result ($o)"
ra="$(ls "$RT/reservations" 2>/dev/null | wc -l | tr -d ' ')"; ea="$(ls "$RT/executions" 2>/dev/null | wc -l | tr -d ' ')"; pa="$(wc -l <"$PSF" | tr -d ' ')"
[[ "$rb" == "$ra" && "$eb" == "$ea" && "$pb" == "$pa" ]] && ok "concurrent loser mutated NOTHING (reservation/execution/runtime unchanged)" || bad "loser mutated state (resv $rb→$ra exec $eb→$ea ps $pb→$pa)"
kill "$HOLD" 2>/dev/null; wait "$HOLD" 2>/dev/null; rm -rf "$LOCKDIR"
o="$(act cc1 provision)"
[[ "$(printf '%s' "$o" | jget state)" == "succeeded" ]] && ok "after lock release, the winner provisions cleanly" || bad "post-release provision ($o)"

# (b) Genuine parallel launch: two same-intent deliveries at once → exactly ONE runtime,
#     exactly ONE reservation, no second provider execution, coherent audit.
reset_ps; rm -rf "$RT/reservations" "$RT/executions" "$RT/attachments" "$RT/locks"; mkwt_dedicated cc2 2; record_intent cc2
( act cc2 provision >"$SBX/cc2a" 2>/dev/null ) &
( act cc2 provision >"$SBX/cc2b" 2>/dev/null ) &
wait
NSCC2="$(bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/actuation-core.sh"; alloy_act_mint_namespace cc2-init cc2 dedicated-disposable' 2>/dev/null)"
rows="$(grep -c "$NSCC2" "$PSF")"
[[ "$rows" == "4" ]] && ok "parallel same-intent → exactly ONE runtime (no double provision)" || bad "parallel produced $rows rows (expected 4)"
rescount="$(ls "$RT/reservations"/*.env 2>/dev/null | wc -l | tr -d ' ')"
[[ "$rescount" == "1" ]] && ok "parallel → exactly ONE reservation (no capacity/reservation corruption)" || bad "reservations=$rescount"
execcount="$(ls "$RT/executions"/*.env 2>/dev/null | wc -l | tr -d ' ')"
[[ "$execcount" == "1" ]] && ok "parallel → exactly ONE execution head (no bookkeeping corruption)" || bad "executions=$execcount"
succ=0; for f in "$SBX/cc2a" "$SBX/cc2b"; do [[ "$(jget state <"$f" 2>/dev/null)" == "succeeded" ]] && succ=$((succ+1)); done
[[ "$succ" -ge 1 ]] && ok "parallel: at least one delivery reports success; one runtime total" || bad "parallel succ=$succ"
EID2="$(ls "$RT/executions"/*.env 2>/dev/null | head -1 | xargs -I{} basename {} .env)"
[[ "$(exec_field "$EID2" state)" == "succeeded" && "$(exec_field "$EID2" desired_state_reached)" == "true" ]] \
  && ok "parallel: surviving execution head is coherent (succeeded, verified)" || bad "audit head incoherent"

printf '\n==== runtime actuator tests: %d passed, %d failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
