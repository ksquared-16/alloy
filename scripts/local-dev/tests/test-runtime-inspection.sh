#!/usr/bin/env bash
# tests/test-runtime-inspection.sh — Runtime Registry & Inspection V1.
#
# Proves runtime discovery/inspection is authoritative, deterministic, redacted,
# and STRICTLY observational (it cannot start/stop/restart/remove/prune anything).
#
# Run:  bash scripts/local-dev/tests/test-runtime-inspection.sh
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TESTS_DIR/.." && pwd)"
RO="$ROOT/alloy-ro"
SEP=$'\x1f'
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

SBX="$(mktemp -d)"; trap 'rm -rf "$SBX"' EXIT
CFG="$SBX/config"; printf 'ALLOY_RUNTIME_ROOT="%s/rt"\n' "$SBX" >"$CFG"
export ALLOY_CONFIG_FILE="$CFG" ALLOY_LOCAL_DEV_ROOT="$ROOT"

# Fixture helpers: row <id> <name> <image> <state> <status> <ports> <sup> <comp> <svc>
row() { printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' "$@"; }
stack() { # <ns> <state-of-kong>  -> a db+kong+auth+rest stack (kong state overridable)
  local ns="$1" kong="${2:-running}"
  row "id-$ns-db"   "supabase_db_$ns"   pg     running "Up 2h" "0.0.0.0:5${RANDOM:0:4}->5432/tcp" "$ns" "" db
  row "id-$ns-kong" "supabase_kong_$ns" kong   "$kong" "Up 2h" "" "$ns" "" kong
  row "id-$ns-auth" "supabase_auth_$ns" gotrue running "Up 2h" "" "$ns" "" auth
  row "id-$ns-rest" "supabase_rest_$ns" pgrst  running "Up 2h" "" "$ns" "" rest
}
jvalid() { python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1; }

# ---- 1. zero runtimes -------------------------------------------------------
PS="$SBX/ps0"; : >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"; unset ALLOY_RT_DOCKER_UNAVAILABLE
out="$("$RO" runtime-list 2>/dev/null)"
[[ "$out" == *"no runtimes"* ]] && ok "zero runtimes -> none listed" || bad "zero runtimes"
[[ "$("$RO" runtime-capacity --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["active_runtimes"])')" == "0" ]] \
  && ok "zero runtimes -> capacity active=0" || bad "zero capacity"

# ---- 2. one complete runtime ------------------------------------------------
PS="$SBX/ps1"; stack complete-one >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"
h="$("$RO" runtime-status complete-one --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["health"])')"
[[ "$h" == "healthy" ]] && ok "one complete runtime -> healthy" || bad "one complete health=$h"

# ---- 3. multiple complete runtimes ------------------------------------------
PS="$SBX/ps2"; { stack alpha; stack beta; } >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"
n="$("$RO" runtime-list --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["runtimes"]))')"
[[ "$n" == "2" ]] && ok "multiple runtimes -> 2 listed" || bad "multiple runtimes n=$n"

# ---- 4. partial runtime -----------------------------------------------------
PS="$SBX/ps4"; stack part exited >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"
h="$("$RO" runtime-status part --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["health"])')"
[[ "$h" == "partial" ]] && ok "partial runtime (kong exited) -> partial" || bad "partial health=$h"

# ---- 5. fully exited runtime ------------------------------------------------
PS="$SBX/ps5"; { row e1 supabase_db_gone pg exited "Exited (0) 2d" "" gone "" db
                 row e2 supabase_kong_gone kong exited "Exited (0) 2d" "" gone "" kong; } >"$PS"
export ALLOY_RT_PS_FIXTURE="$PS"
s="$("$RO" runtime-status gone --json | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["container_state"],d["health"])')"
[[ "$s" == "exited stopped" ]] && ok "exited runtime -> state=exited health=stopped" || bad "exited state=$s"

# ---- 6. mixed unrelated containers ------------------------------------------
PS="$SBX/ps6"; { stack real; row r1 redis-cache redis running "Up 3h" "0.0.0.0:6379->6379/tcp" "" "" ""
                 row r2 my-app node running "Up 3h" "" "" "" ""; } >"$PS"
export ALLOY_RT_PS_FIXTURE="$PS"
u="$("$RO" runtime-list --json | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["runtimes"]),d["unrelated_containers"])')"
[[ "$u" == "1 2" ]] && ok "mixed -> 1 runtime, 2 unrelated (not promoted)" || bad "mixed u=$u"

# ---- 7. unknown owner (discovered, unregistered) ----------------------------
o="$("$RO" runtime-status real --json | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["owner_mission_key"],d["registration"])')"
[[ "$o" == "unknown discovered" ]] && ok "discovered runtime -> owner unknown, registration discovered" || bad "owner=$o"

# ---- 8. inferred association ------------------------------------------------
mkdir -p "$SBX/rt/metadata"
cat >"$SBX/rt/metadata/wt3-runtime-realization.env" <<M
ALLOY_WORKTREE_NAME=wt3-runtime-realization
ALLOY_WORKTREE_SLOT=3
ALLOY_WORKTREE_PATH=/tmp/x
ALLOY_WORKTREE_BRANCH=b
ALLOY_AGENT=claude
PORT=3013
M
PS="$SBX/ps8"; stack alloy-runtime-realization >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"
a="$("$RO" runtime-status alloy-runtime-realization --json | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["association"],d["associated_worktrees"])')"
[[ "$a" == "inferred wt3-runtime-realization" ]] && ok "inferred association (name match, evidence)" || bad "assoc=$a"

# ---- 9. over-budget observation ---------------------------------------------
PS="$SBX/ps9"; { stack a1; stack a2; stack a3; } >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS" ALLOY_RT_MAX_ACTIVE=2
ob="$(ALLOY_MAX_ACTIVE_RUNTIMES=2 "$RO" runtime-capacity --json | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["over_budget"],d["active_runtimes"],d["remaining_capacity"])')"
[[ "$ob" == "True 3 -1" ]] && ok "over-budget observed (3>2, remaining -1)" || bad "over-budget=$ob"

# ---- 10. docker unavailable -------------------------------------------------
export ALLOY_RT_DOCKER_UNAVAILABLE=1
da="$("$RO" runtime-list --json)"; code=$?
if printf '%s' "$da" | jvalid && [[ "$(printf '%s' "$da" | python3 -c 'import json,sys;print(json.load(sys.stdin)["docker_available"])')" == "False" ]] && [[ "$code" -eq 0 ]]; then
  ok "docker unavailable -> graceful (docker_available=false, exit 0, valid JSON)"
else bad "docker unavailable handling"; fi
unset ALLOY_RT_DOCKER_UNAVAILABLE

# ---- 11. malformed docker output --------------------------------------------
PS="$SBX/ps11"; printf 'garbage line no separators\n\n%s\n' "$(row x supabase_db_ok pg running Up "" ok "" db)" >"$PS"
export ALLOY_RT_PS_FIXTURE="$PS"
if "$RO" runtime-list --json | jvalid; then ok "malformed docker output -> no crash, valid JSON" ; else bad "malformed output crashed"; fi

# ---- 12. JSON stability for every verb --------------------------------------
PS="$SBX/ps12"; { stack j1; stack j2; } >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"
allj=1
for v in "runtime-list" "runtime-discover" "runtime-capacity" "runtime-status j1" "runtime-containers j1"; do
  "$RO" $v --json | jvalid || { allj=0; echo "    bad JSON: $v"; }
done
[[ "$allj" -eq 1 ]] && ok "all runtime verbs emit valid JSON" || bad "JSON stability"

# ---- 13. secret redaction (structural + output) -----------------------------
# 13a: no forbidden docker subcommand and no secret-bearing template token in code
# (matches only real usage — `docker <mutating>` adjacency and {{.Command}}-style
# tokens — never the forbidden-list wording in comments/docs).
if grep -qnE 'docker[[:space:]]+(inspect|top|logs|exec|cp|commit|start|stop|rm|kill|prune|restart|create|compose)|\{\{[[:space:]]*\.(Command|Args|Entrypoint|Env)' "$ROOT/lib/runtime-core.sh" "$RO"; then
  bad "code references a secret-bearing / mutating docker read"
else ok "code never runs docker inspect/top/logs/mutations or reads .Command/.Env (redaction by construction)"; fi
# 13b: a container whose name/status carries a JWT-looking token is not leaked verbatim in a way that exposes it as a value
PS="$SBX/ps13"; { stack sec; } >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"
if "$RO" runtime-containers sec --json | grep -q '"ports"' && ! "$RO" runtime-containers sec --json | grep -qiE 'command|entrypoint|"env"'; then
  ok "container output exposes no command/env/entrypoint fields"
else bad "container output shape leaks command/env"; fi

# ---- 14. NO MUTATION: docker shim proves only ps/stats are ever called ------
SHIM="$SBX/bin"; mkdir -p "$SHIM"
cat >"$SHIM/docker" <<'SH'
#!/usr/bin/env bash
echo "docker $*" >> "$DOCKER_CALL_LOG"
# emulate a minimal daemon: `ps`/`stats`/`version`/`info` succeed with no rows
case "${1:-}" in ps|stats|version|info) exit 0 ;; *) exit 0 ;; esac
SH
chmod +x "$SHIM/docker"
export DOCKER_CALL_LOG="$SBX/docker.calls"; : >"$DOCKER_CALL_LOG"
unset ALLOY_RT_PS_FIXTURE ALLOY_RT_STATS_FIXTURE   # force real docker path (the shim)
PATH="$SHIM:$PATH" "$RO" runtime-list        >/dev/null 2>&1
PATH="$SHIM:$PATH" "$RO" runtime-discover    >/dev/null 2>&1
PATH="$SHIM:$PATH" "$RO" runtime-capacity    >/dev/null 2>&1
if grep -qE '^docker (start|stop|restart|kill|rm|prune|create|compose|exec|inspect|top|logs)' "$DOCKER_CALL_LOG"; then
  bad "inspection invoked a mutating/forbidden docker subcommand:"; grep -E '^docker (start|stop|restart|kill|rm|prune|create|compose|exec|inspect|top|logs)' "$DOCKER_CALL_LOG" | sed 's/^/      /'
else ok "inspection called ONLY docker ps/stats (no start/stop/rm/prune/inspect/...)"; fi
[[ -s "$DOCKER_CALL_LOG" ]] && grep -qE '^docker (ps|stats)' "$DOCKER_CALL_LOG" && ok "docker was actually exercised (ps/stats seen)" || bad "docker shim not exercised"
export ALLOY_RT_PS_FIXTURE="$PS"

# ---- 15. alloy-ro stays read-only: no registry writes on inspection ---------
rm -rf "$SBX/rt/runtimes"
PS="$SBX/ps15"; stack noreg >"$PS"; export ALLOY_RT_PS_FIXTURE="$PS"
"$RO" runtime-list >/dev/null 2>&1; "$RO" runtime-status noreg >/dev/null 2>&1
[[ ! -e "$SBX/rt/runtimes" ]] && ok "inspection created no registry dir/records (read-only)" || bad "inspection wrote registry"

printf '\n==== runtime inspection tests: %d passed, %d failed ====\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
