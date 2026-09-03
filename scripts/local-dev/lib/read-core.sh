#!/usr/bin/env bash
# lib/read-core.sh — Alloy Shared Read Core.
#
# The single implementation of read interpretation for the whole toolkit. Both
# the mutation runtime (lib/common.sh and the commands that source it) and the
# inspection runtime (alloy-ro, via lib/ro.sh + lib/ro-config.sh) consume these
# primitives. There is ONE runtime state (owned and written only by the mutation
# commands); this core only reads and interprets it, so no second runtime is
# introduced.
#
# CONSTITUTION (platform invariant): this file is pure, deterministic, and
# read-only. It MUST NOT:
#   - source user-writable config or metadata as shell code (it PARSES);
#   - write files, create directories, or initialise runtime state;
#   - fetch from the network, install packages, or reach out;
#   - launch, stop, signal, or recover processes;
#   - mutate git refs, index, or worktrees;
#   - execute arbitrary or user-controlled strings.
# Mutation behaviour is layered ABOVE this core by the mutation runtime.
#
# Naming: primitives are `alloy_rc_*`; constants/derived values are `ALLOY_RC_*`.
# shellcheck shell=bash

# Idempotent include guard (sourced by common.sh, ro.sh, ro-config.sh).
[[ -n "${ALLOY_RC_LOADED:-}" ]] && return 0
ALLOY_RC_LOADED=1

ALLOY_RC_VERSION="1.0.0"

# ===========================================================================
# Canonical defaults — the ONE source of truth for toolkit default constants.
# Both alloy_load_config (mutation runtime) and alloy_rc_config_init (inspection
# runtime) derive their fallbacks from these, so a default can never drift.
# ===========================================================================
ALLOY_RC_DEFAULT_BASE_REMOTE="origin"
ALLOY_RC_DEFAULT_BASE_BRANCH="staging"
ALLOY_RC_DEFAULT_WEB_DIR="web"
ALLOY_RC_DEFAULT_FIRST_AGENT_PORT="3011"
ALLOY_RC_DEFAULT_CANONICAL_PORT="3000"
ALLOY_RC_DEFAULT_MAX_AGENTS="6"
# Runtime Resource Orchestration V1 — observational capacity ceiling (default 2).
ALLOY_RC_DEFAULT_MAX_ACTIVE_RUNTIMES="2"

alloy_rc_default_runtime_root() {
  printf '%s/.local/state/alloy-dev' "$HOME"
}

# ===========================================================================
# Canonical metadata schema — the ONE declaration of worktree metadata fields.
# ===========================================================================
ALLOY_RC_METADATA_REQUIRED_FIELDS="ALLOY_WORKTREE_NAME ALLOY_WORKTREE_PATH \
ALLOY_WORKTREE_BRANCH ALLOY_WORKTREE_SLOT PORT ALLOY_AGENT"

ALLOY_RC_METADATA_OPTIONAL_FIELDS="ALLOY_AGENT_ROLE ALLOY_AGENT_STATUS ALLOY_AGENT_INSTRUCTIONS \
ALLOY_AGENT_OPENED_AT ALLOY_AGENT_CLOSED_AT ALLOY_SPRINT_NAME ALLOY_SPRINT_OBJECTIVE \
ALLOY_WORKER_LIFECYCLE ALLOY_PROVIDER_SESSION_ID ALLOY_PAUSE_RECORDED_AT ALLOY_FINISHED_AT"

# ===========================================================================
# Canonical read-only inspection verb set — the ONE source the capability
# manifest and the alloy-ro dispatcher are both validated against.
# ===========================================================================
ALLOY_RC_RO_VERBS="root runtime-paths worker-status agent-status dev-status agent-evidence worker-detail sprint-manifest initiatives initiative capabilities runtime-list runtime-status runtime-capacity runtime-discover runtime-containers runtime-intent runtime-admission runtime-policy runtime-explain runtime-reservations runtime-executions runtime-actuation-capacity"
ALLOY_RC_CAPABILITY_KEYS="reads writes network process_control git_mutation deletion arbitrary_execution credential_access"

# ===========================================================================
# Non-executing configuration parser.
# ===========================================================================

# Last KEY=VALUE in <file>, quote-stripped, NO expansion/validation. Return 1 if
# absent/unreadable.
alloy_rc_kv_raw() {
  local file="$1" key="$2" line rhs found=1
  [[ -r "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in *"$key"=*) : ;; *) continue ;; esac
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?"$key"=(.*)$ ]]; then
      rhs="${BASH_REMATCH[2]}"
    else
      continue
    fi
    case "$rhs" in
      \"*) rhs="${rhs#\"}"; rhs="${rhs%%\"*}" ;;
      \'*) rhs="${rhs#\'}"; rhs="${rhs%%\'*}" ;;
      *)   rhs="${rhs%%#*}"; rhs="${rhs%%[[:space:]]*}" ;;
    esac
    found=0
  done <"$file"
  [[ "$found" -eq 0 ]] || return 1
  printf '%s' "$rhs"
}

# 0 iff <value> is a safe literal (no command sub, backticks, redirection/pipe/
# list operators, backslash, residual $, or newline). Fail closed.
alloy_rc_is_safe_value() {
  local v="$1"
  case "$v" in *'$('*|*'`'*|*'<('*|*'>('*) return 1 ;; esac
  case "$v" in *';'*|*'|'*|*'&'*|*'>'*|*'<'*|*'\'*) return 1 ;; esac
  case "$v" in *'$'*) return 1 ;; esac
  case "$v" in *$'\n'*) return 1 ;; esac
  return 0
}

# Expand ONLY whitelisted path vars ($HOME + resolved ALLOY_RC_* bases); refuse
# on command substitution or residual $. Prints resolved value or returns 1.
alloy_rc_expand_value() {
  local v="$1"
  case "$v" in
    *'$('*|*'`'*|*'<('*|*'>('*) return 1 ;;
    *';'*|*'|'*|*'&'*|*'\'*) return 1 ;;
  esac
  v="${v//\$\{HOME\}/$HOME}";                    v="${v//\$HOME/$HOME}"
  v="${v//\$\{ALLOY_REPO\}/${ALLOY_RC_REPO:-}}"; v="${v//\$ALLOY_REPO/${ALLOY_RC_REPO:-}}"
  v="${v//\$\{ALLOY_RUNTIME_ROOT\}/${ALLOY_RC_RUNTIME_ROOT:-}}"
  v="${v//\$ALLOY_RUNTIME_ROOT/${ALLOY_RC_RUNTIME_ROOT:-}}"
  v="${v//\$\{ALLOY_WORKTREE_ROOT\}/${ALLOY_RC_WORKTREE_ROOT:-}}"
  v="${v//\$ALLOY_WORKTREE_ROOT/${ALLOY_RC_WORKTREE_ROOT:-}}"
  v="${v//\$\{ALLOY_CONFIG_DIR\}/${ALLOY_RC_CONFIG_DIR:-}}"
  v="${v//\$ALLOY_CONFIG_DIR/${ALLOY_RC_CONFIG_DIR:-}}"
  alloy_rc_is_safe_value "$v" || return 1
  printf '%s' "$v"
}

# Config file paths (repo example is trusted; user config is user-writable).
alloy_rc_config_files() {
  ALLOY_RC_CFG_EXAMPLE="${ALLOY_LOCAL_DEV_ROOT}/alloy-config.example"
  ALLOY_RC_CFG_USER="${ALLOY_CONFIG_FILE:-$HOME/.config/alloy-dev/config}"
}

# Fetch a config key, example→user precedence (user wins), validated+expanded. A
# refused (unsafe) value never erases an earlier safe one. Return 1 if unset.
alloy_rc_config_get() {
  local key="$1" raw="" val="" cand="" got=1 f
  for f in "$ALLOY_RC_CFG_EXAMPLE" "$ALLOY_RC_CFG_USER"; do
    [[ -r "$f" ]] || continue
    if raw="$(alloy_rc_kv_raw "$f" "$key")"; then
      if cand="$(alloy_rc_expand_value "$raw")"; then
        val="$cand"; got=0
      else
        printf 'alloy-read-core: refused unsafe value for %s in %s (ignored; using default)\n' \
          "$key" "$f" >&2
      fi
    fi
  done
  [[ "$got" -eq 0 ]] || return 1
  printf '%s' "$val"
}

# Resolve the minimal base configuration into ALLOY_RC_* globals using the
# canonical defaults above. Idempotent; writes nothing to disk.
alloy_rc_config_init() {
  [[ "${ALLOY_RC_CONFIG_READY:-0}" == "1" ]] && return 0
  alloy_rc_config_files

  ALLOY_RC_REPO="$(alloy_rc_config_get ALLOY_REPO || true)"
  ALLOY_RC_RUNTIME_ROOT="$(alloy_rc_config_get ALLOY_RUNTIME_ROOT || true)"
  [[ -n "$ALLOY_RC_RUNTIME_ROOT" ]] || ALLOY_RC_RUNTIME_ROOT="$(alloy_rc_default_runtime_root)"
  ALLOY_RC_WORKTREE_ROOT="$(alloy_rc_config_get ALLOY_WORKTREE_ROOT || true)"
  [[ -n "$ALLOY_RC_WORKTREE_ROOT" ]] || ALLOY_RC_WORKTREE_ROOT="$HOME/Code/alloy-worktrees"
  ALLOY_RC_CONFIG_DIR="$(alloy_rc_config_get ALLOY_CONFIG_DIR || true)"
  [[ -n "$ALLOY_RC_CONFIG_DIR" ]] || ALLOY_RC_CONFIG_DIR="$HOME/.config/alloy-dev"

  ALLOY_RC_BASE_REMOTE="$(alloy_rc_config_get ALLOY_BASE_REMOTE || true)"
  [[ -n "$ALLOY_RC_BASE_REMOTE" ]] || ALLOY_RC_BASE_REMOTE="$ALLOY_RC_DEFAULT_BASE_REMOTE"
  ALLOY_RC_BASE_BRANCH="$(alloy_rc_config_get ALLOY_BASE_BRANCH || true)"
  [[ -n "$ALLOY_RC_BASE_BRANCH" ]] || ALLOY_RC_BASE_BRANCH="$ALLOY_RC_DEFAULT_BASE_BRANCH"
  ALLOY_RC_WEB_DIR="$(alloy_rc_config_get ALLOY_WEB_DIR || true)"
  [[ -n "$ALLOY_RC_WEB_DIR" ]] || ALLOY_RC_WEB_DIR="$ALLOY_RC_DEFAULT_WEB_DIR"

  ALLOY_RC_FIRST_AGENT_PORT="$(alloy_rc_config_get ALLOY_FIRST_AGENT_PORT || true)"
  [[ "$ALLOY_RC_FIRST_AGENT_PORT" =~ ^[0-9]+$ ]] || ALLOY_RC_FIRST_AGENT_PORT="$ALLOY_RC_DEFAULT_FIRST_AGENT_PORT"
  ALLOY_RC_CANONICAL_PORT="$(alloy_rc_config_get ALLOY_CANONICAL_PORT || true)"
  [[ "$ALLOY_RC_CANONICAL_PORT" =~ ^[0-9]+$ ]] || ALLOY_RC_CANONICAL_PORT="$ALLOY_RC_DEFAULT_CANONICAL_PORT"
  ALLOY_RC_MAX_AGENTS="$(alloy_rc_config_get ALLOY_MAX_AGENTS || true)"
  [[ "$ALLOY_RC_MAX_AGENTS" =~ ^[0-9]+$ ]] || ALLOY_RC_MAX_AGENTS="$ALLOY_RC_DEFAULT_MAX_AGENTS"

  ALLOY_RC_METADATA_DIR="$ALLOY_RC_RUNTIME_ROOT/metadata"
  ALLOY_RC_PIDS_DIR="$ALLOY_RC_RUNTIME_ROOT/pids"
  ALLOY_RC_LOGS_DIR="$ALLOY_RC_RUNTIME_ROOT/logs"
  ALLOY_RC_LOCKS_DIR="$ALLOY_RC_RUNTIME_ROOT/locks"
  ALLOY_RC_AUTH_DIR="$ALLOY_RC_RUNTIME_ROOT/auth"
  ALLOY_RC_EVIDENCE_DIR="$ALLOY_RC_RUNTIME_ROOT/evidence"
  ALLOY_RC_BROWSER_PIDS_DIR="$ALLOY_RC_RUNTIME_ROOT/browser-pids"
  ALLOY_RC_INITIATIVES_DIR="$ALLOY_RC_RUNTIME_ROOT/initiatives"

  ALLOY_RC_CONFIG_READY=1
}

# ===========================================================================
# Metadata reads (parse, never source).
# ===========================================================================
alloy_rc_metadata_path() { printf '%s/%s.env' "$1" "$2"; }   # <metadata_dir> <name>

# Read one metadata field WITHOUT sourcing. Refuses shell-active values.
alloy_rc_meta_get() {
  local file="$1" key="$2" raw=""
  raw="$(alloy_rc_kv_raw "$file" "$key")" || return 1
  if alloy_rc_is_safe_value "$raw"; then printf '%s' "$raw"; return 0; fi
  printf 'alloy-read-core: refused unsafe metadata value for %s in %s (ignored)\n' "$key" "$file" >&2
  return 1
}

# List metadata basenames under <metadata_dir>. Missing dir → nothing (no mkdir).
alloy_rc_list_metadata() {
  local dir="$1" f base
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob
  for f in "$dir"/*.env; do base="$(basename "$f" .env)"; printf '%s\n' "$base"; done
  shopt -u nullglob
}

# Resolve a slot number to a metadata basename under <metadata_dir>, by parsing.
alloy_rc_resolve_slot() {
  local dir="$1" slot="$2" name meta_slot
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    meta_slot="$(alloy_rc_meta_get "$(alloy_rc_metadata_path "$dir" "$name")" ALLOY_WORKTREE_SLOT 2>/dev/null || true)"
    if [[ "$meta_slot" == "$slot" ]]; then printf '%s' "$name"; return 0; fi
  done < <(alloy_rc_list_metadata "$dir")
  return 1
}

# ===========================================================================
# Git inspection (read-only; subcommand allowlist).
# ===========================================================================
alloy_rc_git() {
  local dir="$1" sub="$2"; shift 2
  case "$sub" in
    rev-parse|status|rev-list|symbolic-ref|show-ref|for-each-ref|cat-file|describe) : ;;
    remote) [[ "${1:-}" == "get-url" ]] || { printf 'alloy-read-core: refused non-read-only git remote form\n' >&2; return 97; } ;;
    config) [[ "${1:-}" == "--get" ]] || { printf 'alloy-read-core: refused non-read-only git config form\n' >&2; return 97; } ;;
    *) printf 'alloy-read-core: refused non-allowlisted git subcommand: %s\n' "$sub" >&2; return 97 ;;
  esac
  GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 git --no-optional-locks -C "$dir" "$sub" "$@" 2>/dev/null
}

alloy_rc_is_git_worktree() { [[ -d "$1" ]] && alloy_rc_git "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; }
alloy_rc_git_toplevel()    { alloy_rc_git "$1" rev-parse --show-toplevel 2>/dev/null; }
alloy_rc_git_branch()      { alloy_rc_git "$1" rev-parse --abbrev-ref HEAD 2>/dev/null || printf '?'; }

# Filtered porcelain: ignores the agent env marker. stdout only.
alloy_rc_dirty_porcelain() {
  local dir="$1" out
  out="$(alloy_rc_git "$dir" status --porcelain 2>/dev/null || true)"
  printf '%s\n' "$out" | grep -vE '^\?\? \.env\.local\.agent$' || true
}

# THE dirty-state business rule (one place). stdout: clean | next-env-only | dirty.
# next-env-only: sole dirty path is <web_dir>/next-env.d.ts (Next.js regeneration).
alloy_rc_dirty_classification() {
  local dir="$1" web_dir="${2:-web}" web_rel="${2:-web}/next-env.d.ts"
  local out line file_path
  out="$(alloy_rc_dirty_porcelain "$dir")"
  if [[ -z "${out//[[:space:]]/}" ]]; then printf 'clean'; return; fi
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    file_path="${line:3}"
    [[ "$file_path" == "$web_rel" ]] && continue
    printf 'dirty'; return
  done <<<"$out"
  printf 'next-env-only'
}

# Ahead/behind HEAD vs <base_ref> using only cached refs (never fetches).
alloy_rc_ahead_behind() {
  local dir="$1" base="$2" ahead behind
  ahead="$(alloy_rc_git "$dir" rev-list --count "${base}..HEAD" 2>/dev/null || echo '?')"
  behind="$(alloy_rc_git "$dir" rev-list --count "HEAD..${base}" 2>/dev/null || echo '?')"
  printf '%s/%s' "${ahead:-?}" "${behind:-?}"
}

alloy_rc_base_ref_sha() {
  local repo="$1" base="$2"
  [[ -n "$repo" && -d "$repo/.git" ]] || { printf 'unknown'; return; }
  alloy_rc_git "$repo" rev-parse --short "$base" 2>/dev/null || printf 'unknown'
}

# ===========================================================================
# Root classification (one implementation; callers own their presentation).
# Inputs: <toplevel> and <canon>/<wt_root> should already be resolved by the
# caller; retired roots are resolved here (read-only cd+pwd) to match the
# canonical alloy-root semantics. stdout: outside | canonical | managed-worktree
# | retired | unmanaged
# ===========================================================================
alloy_rc_resolve_dir() { ( cd "$1" 2>/dev/null && pwd -P ) || printf '%s' "$1"; }

alloy_rc_classify_root() {
  local toplevel="$1" canon="$2" wt_root="$3" retired_roots="$4"
  if [[ -z "$toplevel" ]]; then printf 'outside'; return; fi
  if [[ "$toplevel" == "$canon" ]]; then printf 'canonical'; return; fi
  if [[ "$toplevel" == "$wt_root"/* ]]; then printf 'managed-worktree'; return; fi
  local r rr
  for r in $retired_roots; do
    rr="$(alloy_rc_resolve_dir "$r")"
    if [[ "$toplevel" == "$rr" || "$toplevel" == "$rr"/* ]]; then printf 'retired'; return; fi
  done
  printf 'unmanaged'
}

alloy_rc_root_sanctioned() {   # 0 (true) iff class is sanctioned for work
  case "$1" in canonical|managed-worktree) return 0 ;; *) return 1 ;; esac
}

# ===========================================================================
# Process / port inspection (read-only).
# ===========================================================================
# `lsof` lives in /usr/sbin on macOS, which is NOT on every PATH this toolkit
# runs under — launchd agents and hook shells routinely have neither /usr/sbin
# nor /sbin. Resolving it by bare name alone is how a port that was serving
# traffic came back as unowned. ONE resolver: lib/common.sh delegates here.
alloy_rc_lsof_bin() {
  local candidate
  if command -v lsof >/dev/null 2>&1; then
    printf 'lsof'
    return 0
  fi
  for candidate in /usr/sbin/lsof /usr/bin/lsof /sbin/lsof; do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

# WHO IS LISTENING ON THIS PORT, AND DID WE ACTUALLY GET TO LOOK?
#
# THE DEFECT THIS REPLACES. `alloy_rc_port_pid` resolved `lsof` by bare name with
# no /usr/sbin fallback, and then returned 1 for THREE different facts: the probe
# tool was missing, the probe failed, and the port has no listener. Every caller
# reads `return 1` as "free". Measured on the Mac mini: ports 3014/3015/3016 were
# answering HTTP 200 from real next-server processes while `alloy-dev-status`
# printed `(free)` for all three, because the shell it ran under had no
# /usr/sbin on PATH. The same conflation disarms `alloy_refuse_occupied_port`,
# which is the guard that is supposed to stop one worktree starting a server on
# another slot's port — the exact historical Financials-on-3011 collision.
#
# UNKNOWN IS NOT FREE. This prints a status word and, when there is one, a PID:
#
#   owned <pid>   a listener exists and the probe read its PID
#   free          the probe ran and found no listener
#   unknown       the probe could not run, or ran and failed
#
# Callers that decide whether it is safe to BIND a port must treat `unknown` as
# occupied. Callers that report state must show `unknown` as unattributable, and
# never as free.
alloy_rc_port_owner() {
  local port="$1" lsof_bin="" out="" pid="" rc=0
  if ! lsof_bin="$(alloy_rc_lsof_bin)"; then
    printf 'unknown'
    return 0
  fi
  # lsof exits 1 both for "no match" and for several failures, so the exit code
  # alone cannot separate them; an empty read with a clean exit is the only
  # combination that actually means "nothing is listening".
  out="$("$lsof_bin" -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null)"
  rc=$?
  pid="$(printf '%s\n' "$out" | awk 'NR==2 {print $2}')"
  if [[ -n "$pid" ]]; then
    printf 'owned %s' "$pid"
    return 0
  fi
  if (( rc <= 1 )); then
    printf 'free'
    return 0
  fi
  printf 'unknown'
}

# Back-compatible: prints the PID and returns 0 when a listener is proven,
# returns 1 otherwise. Callers that must distinguish "free" from "could not
# tell" have to use alloy_rc_port_owner — this one cannot express the
# difference, which is why it must never be the basis of a bind decision.
alloy_rc_port_pid() {
  local owner
  owner="$(alloy_rc_port_owner "$1")"
  case "$owner" in
    owned\ *) printf '%s' "${owner#owned }" ;;
    *) return 1 ;;
  esac
}

# True when the port is known to be free. `unknown` is NOT free, so this is
# false there — a bind guard built on it fails closed.
alloy_rc_port_known_free() {
  [[ "$(alloy_rc_port_owner "$1")" == "free" ]]
}

alloy_rc_pid_alive() { [[ -n "$1" ]] && kill -0 "$1" 2>/dev/null; }

# ===========================================================================
# Formatting (deterministic; never reads file contents).
# ===========================================================================
alloy_rc_file_bytes() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  stat -f '%z' "$path" 2>/dev/null || stat -c '%s' "$path" 2>/dev/null || return 1
}

alloy_rc_file_mtime() {
  local path="$1"
  stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%SZ' "$path" 2>/dev/null \
    || stat -c '%y' "$path" 2>/dev/null | cut -c1-19 \
    || printf 'unknown'
}

# Contract matches the historical alloy_human_bytes exactly (return 1, no output,
# on non-numeric input) so the mutation runtime can delegate without any change.
alloy_rc_human_bytes() {
  local bytes="$1"
  [[ "$bytes" =~ ^[0-9]+$ ]] || return 1
  if command -v numfmt >/dev/null 2>&1; then
    numfmt --to=iec-i --suffix=B "$bytes" 2>/dev/null && return 0
  fi
  awk -v b="$bytes" 'BEGIN {
    split("B KB MB GB TB", u, " ");
    i = 1; v = b + 0;
    while (v >= 1024 && i < 5) { v /= 1024; i++ }
    if (i == 1) printf "%d%s\n", v, u[i];
    else printf "%.1f%s\n", v, u[i];
  }'
}

# ===========================================================================
# JSON emission (read-only string building).
# ===========================================================================
alloy_rc_json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"; s="${s//$'\r'/\\r}"; s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}
alloy_rc_json_kv()     { printf '"%s":"%s"' "$(alloy_rc_json_escape "$1")" "$(alloy_rc_json_escape "$2")"; }
alloy_rc_json_kv_raw() { printf '"%s":%s' "$(alloy_rc_json_escape "$1")" "$2"; }
