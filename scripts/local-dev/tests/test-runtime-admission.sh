#!/usr/bin/env bash
# tests/test-runtime-admission.sh — Runtime Intent & Admission Contract V1 (R2).
#
# Proves the DECLARE phase is deterministic, fail-closed, capacity-correct,
# identity-safe, redacted, and STRICTLY non-actuating: evaluation and intent
# recording never start/stop/attach/provision anything, never touch Supabase, and
# never invoke a sprint lifecycle command. Admission is NOT provisioning.
#
# Run:  bash scripts/local-dev/tests/test-runtime-admission.sh
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TESTS_DIR/.." && pwd)"
RO="$ROOT/alloy-ro"
INTENT="$ROOT/alloy-runtime-intent"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

command -v node >/dev/null 2>&1 || { echo "node is required for these tests"; exit 1; }

SBX="$(mktemp -d)"; trap 'rm -rf "$SBX"' EXIT
RT="$SBX/rt"; mkdir -p "$RT/metadata" "$RT/manifests" "$RT/runtimes"
CFG="$SBX/config"
printf 'ALLOY_RUNTIME_ROOT="%s"\nALLOY_MAX_ACTIVE_RUNTIMES="2"\nALLOY_FAKE_SECRET="TOP-SECRET-JWT-vALue"\n' "$RT" >"$CFG"
export ALLOY_CONFIG_FILE="$CFG" ALLOY_LOCAL_DEV_ROOT="$ROOT" ALLOY_AD_EVAL_NOW="2026-07-17T00:00:00Z"

# --- fixtures ----------------------------------------------------------------
SEP=$'\x1f'
row() { printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' "$@"; }
stack() { local ns="$1"
  row "id-$ns-db"   "supabase_db_$ns"   pg     running "Up 2h" "" "$ns" "" db
  row "id-$ns-kong" "supabase_kong_$ns" kong   running "Up 2h" "" "$ns" "" kong
  row "id-$ns-auth" "supabase_auth_$ns" gotrue running "Up 2h" "" "$ns" "" auth
  row "id-$ns-rest" "supabase_rest_$ns" pgrst  running "Up 2h" "" "$ns" "" rest
}
set_ps() { local f="$SBX/ps.$$"; : >"$f"; "$@" >"$f"; export ALLOY_RT_PS_FIXTURE="$f"; }
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
mkmanifest() { # name slot mutation tenant [initiative]
  node "$ROOT/lib/manifest-io.mjs" init "$RT/manifests/$1.json" "$1" "$2" >/dev/null
  node "$ROOT/lib/manifest-io.mjs" set "$RT/manifests/$1.json" \
    "sprint_name=$1-sprint" "initiative_key=${5:-$1-init}" \
    "posture.mutation=$3" "posture.tenant_class=$4" >/dev/null 2>&1 || \
    node "$ROOT/lib/manifest-io.mjs" set "$RT/manifests/$1.json" \
      "sprint_name=$1-sprint" "initiative_key=${5:-$1-init}" >/dev/null 2>&1 || true
  # Force posture even when the pair is one validateManifest warns on: write raw.
  node -e '
    const fs=require("fs"); const p=process.argv[1];
    const m=JSON.parse(fs.readFileSync(p,"utf8"));
    m.posture={mutation:process.argv[2],tenant_class:process.argv[3]};
    fs.writeFileSync(p, JSON.stringify(m,null,2)+"\n");
  ' "$RT/manifests/$1.json" "$3" "$4"
}
register_runtime() { # namespace class owner provenance
  cat >"$RT/runtimes/$1.env" <<R
ALLOY_RT_RUNTIME_CLASS=$2
ALLOY_RT_OWNER_MISSION_KEY=$3
ALLOY_RT_OWNER_PROVENANCE=${4:-explicit-arg}
ALLOY_RT_PROJECT_NAMESPACE=$1
R
}
adm() { "$RO" runtime-admission "$1" --json; }
jget() { python3 -c 'import json,sys
d=json.load(sys.stdin)
for k in sys.argv[1].split("."):
    d=d[k]
print(d)' "$1"; }

# ============================================================================
printf '== 1. read-only + none -> admitted-none (zero capacity) ==\n'
set_ps true   # no containers
mkmeta ro-none 1 br-1; mkmanifest ro-none 1 read-only none
o="$(adm ro-none)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-none" ]] && ok "admitted-none" || bad "read-only+none decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget capacity_required)" == "0" ]] && ok "none consumes 0 capacity" || bad "none capacity_required"
[[ "$(printf '%s' "$o" | jget runtime_required)" == "False" ]] && ok "none -> runtime_required false" || bad "none runtime_required"

printf '== 2. read-only + shared, compatible registered runtime -> admitted-shared-existing ==\n'
mkmeta ro-shared 2 br-2; mkmanifest ro-shared 2 read-only shared
register_runtime shrdro shared-readonly platform-shared explicit-arg
set_ps stack shrdro
o="$(adm ro-shared)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-shared-existing" ]] && ok "admitted-shared-existing" || bad "shared-existing decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget capacity_required)" == "0" ]] && ok "attach existing -> 0 additional capacity" || bad "existing capacity_required"
[[ "$(printf '%s' "$o" | jget shared_candidate)" == "shrdro" ]] && ok "shared candidate identified" || bad "shared_candidate"

printf '== 3. read-only + shared, no runtime, capacity available -> admitted-shared-new ==\n'
rm -f "$RT/runtimes/shrdro.env"; set_ps true
o="$(adm ro-shared)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-shared-new" ]] && ok "admitted-shared-new" || bad "shared-new decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget capacity_required)" == "1" ]] && ok "new shared -> 1 capacity unit" || bad "new capacity_required"

printf '== 4. read-only + shared, no runtime, no capacity -> refused-capacity ==\n'
set_ps sh -c 'true'; set_ps stack a1; { stack a1; stack a2; } >"$SBX/ps.full"; export ALLOY_RT_PS_FIXTURE="$SBX/ps.full"
o="$(adm ro-shared)"
[[ "$(printf '%s' "$o" | jget decision)" == "refused-capacity" ]] && ok "refused-capacity at max" || bad "refused-capacity decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget reason_code)" == "capacity-exhausted" ]] && ok "reason capacity-exhausted" || bad "reason=$(printf '%s' "$o" | jget reason_code)"

printf '== 5. isolated-mutable + disposable, capacity -> admitted-dedicated ==\n'
set_ps true
mkmeta im-disp 3 br-3; mkmanifest im-disp 3 isolated-mutable disposable
o="$(adm im-disp)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-dedicated" ]] && ok "admitted-dedicated" || bad "dedicated decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget isolation_class)" == "dedicated-disposable" ]] && ok "isolation dedicated-disposable" || bad "isolation=$(printf '%s' "$o" | jget isolation_class)"

printf '== 6. isolated-mutable + disposable, no capacity -> refused-capacity ==\n'
export ALLOY_RT_PS_FIXTURE="$SBX/ps.full"
o="$(adm im-disp)"
[[ "$(printf '%s' "$o" | jget decision)" == "refused-capacity" ]] && ok "refused-capacity dedicated" || bad "dedicated refused decision=$(printf '%s' "$o" | jget decision)"

printf '== 7. production-like -> dedicated-certified ==\n'
set_ps true
mkmeta im-prod 4 br-4; mkmanifest im-prod 4 isolated-mutable production-like
o="$(adm im-prod)"
[[ "$(printf '%s' "$o" | jget isolation_class)" == "dedicated-certified" ]] && ok "isolation dedicated-certified" || bad "prod isolation=$(printf '%s' "$o" | jget isolation_class)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-dedicated" ]] && ok "certified admitted-dedicated with capacity" || bad "prod decision=$(printf '%s' "$o" | jget decision)"
mkmeta sro-prod 5 br-5; mkmanifest sro-prod 5 shared-read-only production-like
[[ "$(adm sro-prod | jget isolation_class)" == "dedicated-certified" ]] && ok "shared-read-only+production-like -> dedicated-certified" || bad "sro+prod isolation"

printf '== 8. production-like is NEVER satisfied by a shared runtime ==\n'
# Even with a compatible-looking shared runtime present, certified stays dedicated.
register_runtime shrdro shared-readonly platform-shared explicit-arg
set_ps stack shrdro
o="$(adm im-prod)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-dedicated" ]] && ok "certified ignores available shared runtime" || bad "certified used shared: $(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget shared_candidate_required)" == "False" ]] && ok "certified never requires a shared candidate" || bad "certified shared_candidate_required"
rm -f "$RT/runtimes/shrdro.env"

printf '== 9. shared-mutable WITHOUT coordination -> refused-coordination-required ==\n'
set_ps true
mkmeta im-shared 6 br-6; mkmanifest im-shared 6 isolated-mutable shared
o="$(adm im-shared)"
[[ "$(printf '%s' "$o" | jget decision)" == "refused-coordination-required" ]] && ok "refused-coordination-required" || bad "coord decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget isolation_class)" == "shared-mutable" ]] && ok "isolation shared-mutable" || bad "shared-mutable isolation"

printf '== 10. shared-mutable WITH coordination ==\n'
# 10a: coordination declared but no compatible runtime -> refused-no-compatible-shared-runtime
"$INTENT" im-shared --mission im-shared-init --coordinate --coordination-reason "coordinating with platform runtime" --declared-by tester >/dev/null 2>&1 \
  && ok "intent with coordination recorded" || bad "intent+coordination write failed"
o="$(adm im-shared)"
[[ "$(printf '%s' "$o" | jget coordination)" == "declared" ]] && ok "admission picks up recorded coordination" || bad "coordination not read from intent"
[[ "$(printf '%s' "$o" | jget decision)" == "refused-no-compatible-shared-runtime" ]] && ok "coordinated but no runtime -> refused-no-compatible-shared-runtime" || bad "coord-nocompat decision=$(printf '%s' "$o" | jget decision)"
# 10b: coordination declared AND a compatible shared-mutable runtime exists -> admitted-shared-existing
register_runtime shmut shared-mutable team-shared explicit-arg
set_ps stack shmut
o="$(adm im-shared)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-shared-existing" ]] && ok "coordinated + compatible runtime -> admitted-shared-existing" || bad "coord+compat decision=$(printf '%s' "$o" | jget decision)"
rm -f "$RT/runtimes/shmut.env"; rm -f "$RT/intents/im-shared.env"; set_ps true

printf '== 11. invalid posture combination -> refused-invalid-posture ==\n'
mkmeta bad-combo 1 br-1b; mkmanifest bad-combo 1 read-only disposable
o="$(adm bad-combo)"
[[ "$(printf '%s' "$o" | jget decision)" == "refused-invalid-posture" ]] && ok "refused-invalid-posture" || bad "invalid decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget reason_code)" == "invalid-posture-combination" ]] && ok "reason invalid-posture-combination" || bad "invalid reason=$(printf '%s' "$o" | jget reason_code)"
[[ "$(printf '%s' "$o" | jget isolation_class)" == "invalid" ]] && ok "isolation invalid (fail closed)" || bad "invalid isolation"

printf '== 12. malformed manifest posture -> refused-invalid-posture (posture-malformed) ==\n'
mkmeta malformed 2 br-2b; mkmanifest malformed 2 read-only shared
printf '{ this is not valid json' >"$RT/manifests/malformed.json"
o="$(adm malformed)"
[[ "$(printf '%s' "$o" | jget decision)" == "refused-invalid-posture" ]] && ok "malformed -> refused-invalid-posture" || bad "malformed decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget reason_code)" == "posture-malformed" ]] && ok "reason posture-malformed" || bad "malformed reason=$(printf '%s' "$o" | jget reason_code)"
[[ "$(printf '%s' "$o" | jget input_provenance.posture_source)" == "manifest-malformed" ]] && ok "provenance posture-malformed" || bad "malformed provenance"

printf '== 12b. absent manifest -> refused-invalid-posture (posture-undeclared) ==\n'
mkmeta no-manifest 3 br-3b   # metadata but NO manifest
o="$(adm no-manifest)"
[[ "$(printf '%s' "$o" | jget reason_code)" == "posture-undeclared" ]] && ok "absent manifest -> posture-undeclared" || bad "absent reason=$(printf '%s' "$o" | jget reason_code)"
[[ "$(printf '%s' "$o" | jget input_provenance.posture_source)" == "manifest-absent" ]] && ok "provenance manifest-absent" || bad "absent provenance"

printf '== 13. unknown runtime class is NOT compatible shared capacity ==\n'
# A discovered-but-unregistered runtime (unknown class/owner) must not be attached to.
set_ps stack ghost   # observed, but no registry record
o="$(adm ro-shared)"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-shared-new" ]] && ok "unknown-class runtime not treated as compatible (falls to new)" || bad "unknown-class treated as compatible: $(printf '%s' "$o" | jget decision)"
# And an unknown-OWNER registered runtime is likewise not capacity.
register_runtime unown shared-readonly unknown undeclared
set_ps stack unown
[[ "$(adm ro-shared | jget decision)" == "admitted-shared-new" ]] && ok "unknown-owner registered runtime not treated as compatible" || bad "unknown-owner treated as compatible"
rm -f "$RT/runtimes/unown.env"

printf '== 14/15. over-budget: zero-runtime admitted, capacity-needing refused ==\n'
{ stack o1; stack o2; stack o3; } >"$SBX/ps.over"; export ALLOY_RT_PS_FIXTURE="$SBX/ps.over"   # 3 active > max 2
o="$(adm ro-none)"
[[ "$(printf '%s' "$o" | jget over_budget)" == "True" ]] && ok "over_budget observed (3 > 2)" || bad "over_budget flag"
[[ "$(printf '%s' "$o" | jget decision)" == "admitted-none" ]] && ok "zero-runtime posture admitted even while over budget" || bad "over-budget none decision=$(printf '%s' "$o" | jget decision)"
[[ "$(printf '%s' "$o" | jget remaining_capacity)" == "0" ]] && ok "remaining clamped to 0 (never negative)" || bad "remaining not clamped"
[[ "$(adm im-disp | jget decision)" == "refused-capacity" ]] && ok "over-budget grants no dedicated allocation" || bad "over-budget dedicated admitted"

printf '== 16. deterministic JSON output (same inputs -> byte identical) ==\n'
set_ps true
a="$(adm im-disp)"; b="$(adm im-disp)"
[[ "$a" == "$b" ]] && ok "admission JSON is deterministic (pinned evaluated_at)" || bad "admission output not deterministic"

printf '== 17. stable reason codes (exact slugs) ==\n'
codes="$(for w in ro-none im-disp im-prod im-shared bad-combo; do adm "$w" | jget reason_code; done | tr '\n' ' ')"
[[ "$codes" == "posture-requires-no-runtime dedicated-runtime-within-capacity dedicated-runtime-within-capacity coordination-required invalid-posture-combination " ]] \
  && ok "reason codes are stable and exact" || bad "reason codes drifted: [$codes]"

printf '== 18. provenance present and correct ==\n'
o="$(adm im-disp)"
[[ "$(printf '%s' "$o" | jget input_provenance.posture_source)" == "manifest-declared" ]] && ok "posture_source manifest-declared" || bad "provenance posture_source"
[[ "$(printf '%s' "$o" | jget mission_key)" == "im-disp-init" ]] && ok "mission_key derived from manifest" || bad "mission_key"
[[ "$(printf '%s' "$o" | jget schema_version)" == "1" ]] && ok "schema_version present" || bad "schema_version"

printf '== 19. redaction: no secret / no docker-forbidden field in output or code ==\n'
if adm ro-shared | grep -q "TOP-SECRET-JWT"; then bad "a config secret leaked into admission output"; else ok "no config secret in admission output"; fi
if grep -qnE 'docker[[:space:]]+(inspect|top|logs|exec|start|stop|rm|kill|prune|restart|create|compose)|\{\{[[:space:]]*\.(Command|Args|Entrypoint|Env)' "$ROOT/lib/admission-core.sh" "$INTENT"; then
  bad "admission code references a secret-bearing / mutating docker read"
else ok "admission code never reads .Command/.Env or runs docker mutations (redaction by construction)"; fi

printf '== 20. NO ACTUATION: shim proves evaluation calls only docker ps/stats, no supabase, no lifecycle ==\n'
SHIM="$SBX/bin"; mkdir -p "$SHIM"
for cmd in docker supabase alloy-sprint-start alloy-sprint-finish; do
  cat >"$SHIM/$cmd" <<SH
#!/usr/bin/env bash
echo "$cmd \$*" >> "\$CALL_LOG"
case "$cmd" in docker) case "\${1:-}" in ps|stats|version|info) exit 0;; *) exit 0;; esac;; *) exit 0;; esac
SH
  chmod +x "$SHIM/$cmd"
done
export CALL_LOG="$SBX/calls.log"; : >"$CALL_LOG"
unset ALLOY_RT_PS_FIXTURE ALLOY_RT_STATS_FIXTURE   # force the real (shimmed) docker path
PATH="$SHIM:$PATH" "$RO" runtime-admission im-disp >/dev/null 2>&1
PATH="$SHIM:$PATH" "$RO" runtime-explain  im-disp >/dev/null 2>&1
PATH="$SHIM:$PATH" "$RO" runtime-policy            >/dev/null 2>&1
PATH="$SHIM:$PATH" "$INTENT" im-disp --mission im-disp-init --supersede >/dev/null 2>&1
if grep -qE '^docker (start|stop|restart|kill|rm|prune|create|compose|exec|inspect|top|logs)' "$CALL_LOG"; then
  bad "a mutating/forbidden docker subcommand was invoked"; grep -E '^docker ' "$CALL_LOG" | sed 's/^/      /'
else ok "only docker ps/stats invoked (no start/stop/rm/prune/inspect/...)"; fi
if grep -qE '^supabase ' "$CALL_LOG"; then bad "supabase was invoked"; else ok "supabase never invoked"; fi
if grep -qE '^alloy-sprint-(start|finish) ' "$CALL_LOG"; then bad "a sprint lifecycle command was invoked"; else ok "no sprint lifecycle command invoked"; fi
export ALLOY_RT_PS_FIXTURE="$SBX/ps.empty"; : >"$SBX/ps.empty"

printf '== 21. alloy-ro writes NOTHING (read-only inspection) ==\n'
rm -f "$RT/intents/im-disp.env" "$RT/intents/superseded/"*.env 2>/dev/null
before="$(find "$RT" -type f | sort | md5 2>/dev/null || find "$RT" -type f | sort | md5sum)"
"$RO" runtime-admission im-disp   >/dev/null 2>&1
"$RO" runtime-intent     im-disp  >/dev/null 2>&1
"$RO" runtime-explain    im-disp  >/dev/null 2>&1
"$RO" runtime-policy              >/dev/null 2>&1
after="$(find "$RT" -type f | sort | md5 2>/dev/null || find "$RT" -type f | sort | md5sum)"
[[ "$before" == "$after" ]] && ok "no files created/changed by alloy-ro admission verbs" || bad "alloy-ro mutated the runtime tree"

printf '== 22. identity safety of the mutating writer (fail closed) ==\n'
"$INTENT" 6 --mission im-disp-init >/dev/null 2>&1 && bad "slot-only target accepted" || ok "slot-only target refused"
"$INTENT" im-disp --mission WRONG  >/dev/null 2>&1 && bad "mission mismatch accepted" || ok "mission mismatch refused"
"$INTENT" im-disp >/dev/null 2>&1 && bad "missing --mission accepted" || ok "missing --mission refused"
"$INTENT" im-disp --mission im-disp-init --expect-branch wrong-branch >/dev/null 2>&1 && bad "branch mismatch accepted" || ok "branch mismatch refused"
# manifest/metadata slot mismatch
mkmeta id-mismatch 3 br-3c; mkmanifest id-mismatch 9 read-only none   # metadata slot 3, manifest slot 9
"$INTENT" id-mismatch --mission id-mismatch-init >/dev/null 2>&1 && bad "slot identity mismatch accepted" || ok "manifest/metadata slot mismatch refused"
# invalid posture cannot be declared
"$INTENT" bad-combo --mission bad-combo-init >/dev/null 2>&1 && bad "intent for invalid posture accepted" || ok "intent for invalid posture refused"

printf '== 23. writer writes ONLY the intent record; supersede archives, never silently overwrites ==\n'
rm -rf "$RT/intents"
before="$(find "$RT" -type f | sort)"
"$INTENT" im-disp --mission im-disp-init --declared-by tester >/dev/null 2>&1
newf="$(comm -13 <(printf '%s\n' "$before") <(find "$RT" -type f | sort))"
[[ "$newf" == "$RT/intents/im-disp.env" ]] && ok "exactly one new file written (the intent record)" || bad "unexpected files written: $newf"
"$INTENT" im-disp --mission im-disp-init >/dev/null 2>&1 && bad "silent overwrite allowed" || ok "refuses overwrite without --supersede"
ALLOY_AD_EVAL_NOW="2026-07-17T02:00:00Z" "$INTENT" im-disp --mission im-disp-init --supersede >/dev/null 2>&1
[[ "$("$RO" runtime-intent im-disp --json | jget supersedes_count)" == "1" ]] && ok "supersede increments count" || bad "supersede count"
[[ -n "$(find "$RT/intents/superseded" -name '*.env' 2>/dev/null)" ]] && ok "prior intent archived with provenance" || bad "prior intent not archived"

printf '== 24. Shared Read Core parity: admission-core builds on the core, no duplicate policy ==\n'
if grep -qE '^\s*source .*/read-core.sh' "$ROOT/lib/admission-core.sh" && grep -qE '^\s*source .*/runtime-core.sh' "$ROOT/lib/admission-core.sh"; then
  ok "admission-core sources read-core + runtime-core (one owner)"
else bad "admission-core does not build on the Shared Read Core"; fi
# The capacity numbers admission reports must equal what runtime-capacity reports.
export ALLOY_RT_PS_FIXTURE="$SBX/ps.over"
ac="$("$RO" runtime-capacity --json | jget active_runtimes)"
aa="$(adm ro-none | jget current_active_runtimes)"
[[ "$ac" == "$aa" ]] && ok "admission and runtime-capacity agree on active count ($ac)" || bad "capacity parity: cap=$ac adm=$aa"

printf '== 25. staleness detection when posture changes after an intent is recorded ==\n'
export ALLOY_RT_PS_FIXTURE="$SBX/ps.empty"
rm -rf "$RT/intents"
"$INTENT" im-disp --mission im-disp-init >/dev/null 2>&1
[[ "$("$RO" runtime-intent im-disp --json | jget stale)" == "False" ]] && ok "fresh intent not stale" || bad "fresh intent flagged stale"
mkmanifest im-disp 3 isolated-mutable production-like   # posture changed underneath
[[ "$("$RO" runtime-intent im-disp --json | jget stale)" == "True" ]] && ok "intent flagged stale after posture change" || bad "stale not detected"

printf '\n==== runtime admission tests: %d passed, %d failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
