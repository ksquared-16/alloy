#!/usr/bin/env bash
# Validation-broker capability detection, owned execution, and contention visibility.
#
# WHY THIS EXISTS
#   The broker used to take its heavy commands verbatim from config strings that carried CLI flags
#   (`ALLOY_TEST_COMMAND='npx vitest run --maxWorkers=2 --minWorkers=1'`). Vitest 4.x accepts
#   `--maxWorkers` but rejects `--minWorkers`, so every brokered `test` run died with
#   `CACError: Unknown option --minWorkers` BEFORE running a single test — and, worse, exited 1, which
#   is indistinguishable from a test failure. Workers then fell back to raw `npx vitest run`, which
#   takes no lease, so the broker could report `idle` while the host sat at load 100+.
#
#   Three separate defects, addressed here:
#     1. flags asserted rather than detected  → probe the installed CLI, omit what it does not accept;
#     2. no process-group ownership           → a killed wrapper orphaned vitest workers burning CPU;
#     3. status blind to unbrokered work      → `idle` was a lie whenever someone ran raw commands.
#
# Kept deliberately host-local and dumb: files under the runtime dir, `ps`, and process groups. No
# daemon, no scheduler, no IPC.

# ─────────────────────────────────────────────────────────────────────────────
# 1. CAPABILITY DETECTION
# ─────────────────────────────────────────────────────────────────────────────

# Installed vitest version for a web dir ("" when absent).
alloy_vitest_version() {
    local web_dir="$1"
    local pkg="${web_dir}/node_modules/vitest/package.json"
    [[ -f "$pkg" ]] || return 0
    node -e 'try{process.stdout.write(require(process.argv[1]).version)}catch(e){}' "$pkg" 2>/dev/null
}

# Cache file for a probe result, keyed by tool+version so a dependency bump re-probes automatically.
alloy_caps_cache_file() {
    local tool="$1" version="$2"
    printf '%s/caps-%s-%s' "${ALLOY_STATE_DIR:-$HOME/.local/state/alloy-dev}" "$tool" "${version:-unknown}"
}

# Does the installed vitest accept <flag>? Probes `--help` ONCE per version and caches.
#
# `--help` is the oracle rather than a version comparison: the flag set has moved more than once
# across vitest 1→4 (worker limits lived under `--poolOptions.threads.*` for a while), so a version
# table would be a second source of truth that silently rots. The probe cannot be wrong about the
# binary actually installed.
alloy_vitest_supports_flag() {
    local web_dir="$1" flag="$2"
    local version cache
    version="$(alloy_vitest_version "$web_dir")"
    [[ -n "$version" ]] || return 1
    cache="$(alloy_caps_cache_file vitest "$version")"

    if [[ ! -f "$cache" ]]; then
        mkdir -p "$(dirname "$cache")" 2>/dev/null || true
        # Probe in a subshell so a hang cannot wedge the caller; help is fast and offline.
        ( cd "$web_dir" && npx vitest run --help 2>/dev/null ) > "${cache}.tmp" 2>/dev/null || true
        if [[ -s "${cache}.tmp" ]]; then
            mv "${cache}.tmp" "$cache"
        else
            rm -f "${cache}.tmp"
            return 1   # could not probe → treat every optional flag as unsupported (fail safe)
        fi
    fi
    grep -q -- "$flag" "$cache"
}

# Build the vitest command for this worktree: base + only supported worker limits + caller args.
#
# Caller args (paths, `-t`, `--reporter`, …) are appended verbatim and never rewritten — a broker that
# silently edits a worker's test selection is worse than no broker.
alloy_build_test_command() {
    local web_dir="$1"; shift
    local -a parts=("npx" "vitest" "run")
    local workers="${ALLOY_TEST_MAX_WORKERS:-2}"

    if alloy_vitest_supports_flag "$web_dir" "--maxWorkers"; then
        parts+=("--maxWorkers=${workers}")
    fi
    # `--minWorkers` is intentionally probed, not assumed: vitest 4.x dropped it, which is the exact
    # bug this function exists to prevent from ever recurring silently.
    if alloy_vitest_supports_flag "$web_dir" "--minWorkers"; then
        parts+=("--minWorkers=1")
    fi

    local arg
    for arg in "$@"; do parts+=("$arg"); done
    printf '%s' "${parts[*]}"
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. FAILURE CLASSIFICATION
# ─────────────────────────────────────────────────────────────────────────────

# Classify a non-zero heavy-job exit as `config` (the command never ran) or `test` (it ran and failed).
#
# This is not cosmetic. The broker caches results per commit for reuse, so a CLI error cached as a
# "test result" poisons every later run on that commit with a failure that never happened.
alloy_classify_exec_failure() {
    local log="$1" rc="$2"
    [[ "$rc" -ne 0 ]] || { printf 'ok'; return 0; }
    [[ -f "$log" ]] || { printf 'test'; return 0; }
    if grep -qE "CACError|Unknown option|unknown option|command not found|Cannot find module|ERR_MODULE_NOT_FOUND|error TS6[0-9]{3}|Invalid option" "$log"; then
        printf 'config'
    else
        printf 'test'
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. OWNED EXECUTION + PROCESS-TREE REAPING
# ─────────────────────────────────────────────────────────────────────────────

# Run a command as the leader of its own process group, recording the pgid so the WHOLE tree can be
# reaped later. Without this, killing the wrapper left vitest workers running — observed burning a
# core for 21 minutes after its parent was gone.
#
# Usage: alloy_run_owned <pgid_out_file> <logfile> --shell "<cmd string>"
#        alloy_run_owned <pgid_out_file> <logfile> --argv <cmd> [args...]
alloy_run_owned() {
    local pgid_file="$1" log="$2" mode="$3"; shift 3
    local rc=0
    set -m                      # own process group per job
    if [[ "$mode" == "--shell" ]]; then
        bash -lc "$1" > >(tee -a "$log") 2>&1 &
    else
        "$@" > >(tee -a "$log") 2>&1 &
    fi
    local child=$!
    set +m
    printf '%s' "$child" > "$pgid_file"    # pgid == child pid, it leads its own group
    wait "$child" || rc=$?
    rm -f "$pgid_file"
    return "$rc"
}

# Terminate and reap an owned process group: TERM, bounded wait, then KILL. Never touches a pgid we
# did not record, so a sibling worktree's work can never be collateral.
alloy_reap_group() {
    local pgid="$1" grace="${2:-10}"
    [[ -n "$pgid" ]] || return 0
    kill -0 "-${pgid}" 2>/dev/null || return 0

    kill -TERM "-${pgid}" 2>/dev/null || true
    local waited=0
    while [[ "$waited" -lt "$grace" ]]; do
        kill -0 "-${pgid}" 2>/dev/null || return 0
        sleep 1
        waited=$((waited + 1))
    done
    kill -KILL "-${pgid}" 2>/dev/null || true
    sleep 1
    kill -0 "-${pgid}" 2>/dev/null && return 1
    return 0
}

# Reap whatever the owner file recorded (crash/abandon recovery).
alloy_reap_owned_job() {
    local pgid_file="$1"
    [[ -f "$pgid_file" ]] || return 0
    local pgid
    pgid="$(cat "$pgid_file" 2>/dev/null || true)"
    alloy_reap_group "$pgid" || true
    rm -f "$pgid_file"
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. UNBROKERED-WORK DETECTION
# ─────────────────────────────────────────────────────────────────────────────

# Emit one `pid<TAB>pgid<TAB>etime<TAB>command` line per heavy process NOT under the broker's lease.
#
# Signature-matched on the actual heavy binaries, because that is what saturates the host regardless
# of how it was launched. The broker's own child is excluded by pgid so a legitimate lease never
# reports itself as a violation.
alloy_detect_unbrokered_heavy() {
    local owned_pgid="${1:-}"
    ps -A -o pid=,pgid=,etime=,command= 2>/dev/null | awk -v owned="$owned_pgid" '
        {
            pid=$1; pgid=$2; etime=$3;
            cmd=""; for (i=4; i<=NF; i++) cmd = cmd (i>4 ? " " : "") $i;
        }
        # heavy signatures: full tsc, vitest, next build/start-time compile
        cmd ~ /typescript\/bin\/tsc|[ \/]tsc( |$)|vitest|next build/ &&
        cmd !~ /awk|grep|vac-run|alloy-validate/ {
            if (owned != "" && pgid == owned) next;
            printf "%s\t%s\t%s\t%s\n", pid, pgid, etime, substr(cmd, 1, 110);
        }
    '
}

# Which worktree does a pid most likely belong to (best-effort, from its command string)?
alloy_guess_worktree_for_cmd() {
    local cmd="$1"
    printf '%s' "$cmd" | sed -n 's|.*/alloy-worktrees/\([^/]*\)/.*|\1|p' | head -1
}

alloy_host_load_1m() {
    uptime | sed -n 's/.*load averages*: *\([0-9.]*\).*/\1/p'
}
