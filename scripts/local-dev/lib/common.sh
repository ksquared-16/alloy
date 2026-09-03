#!/usr/bin/env bash
# Shared helpers for Alloy local-dev Phase 1 toolkit.
# shellcheck shell=bash

set -euo pipefail

ALLOY_LOCAL_DEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Shared Read Core — the single implementation of read interpretation. The
# mutation runtime layers its side-effecting behaviour (config sourcing, mkdir,
# git mutation, process control) ABOVE these read-only primitives. See
# lib/read-core.sh and SHARED-READ-CORE.md.
# shellcheck source=lib/read-core.sh
source "${ALLOY_LOCAL_DEV_ROOT}/lib/read-core.sh"

alloy_die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

alloy_info() {
  printf '%s\n' "$*" >&2
}

alloy_warn() {
  printf 'warning: %s\n' "$*" >&2
}

alloy_have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

alloy_require_cmd() {
  alloy_have_cmd "$1" || alloy_die "required command not found: $1"
}

alloy_iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Production default runtime root (path name only — never secrets).
# Delegates to the Shared Read Core so the default lives in exactly one place.
alloy_default_runtime_root() {
  alloy_rc_default_runtime_root
}

# Derive every runtime subdirectory from the single authoritative root.
alloy_resolve_runtime_paths() {
  local root="${1:-${ALLOY_RUNTIME_ROOT:-}}"
  [[ -n "$root" ]] || root="$(alloy_default_runtime_root)"
  ALLOY_RUNTIME_ROOT="$root"
  ALLOY_METADATA_DIR="${ALLOY_RUNTIME_ROOT}/metadata"
  ALLOY_PIDS_DIR="${ALLOY_RUNTIME_ROOT}/pids"
  ALLOY_LOGS_DIR="${ALLOY_RUNTIME_ROOT}/logs"
  ALLOY_LOCKS_DIR="${ALLOY_RUNTIME_ROOT}/locks"
  ALLOY_VALIDATE_LOCK_DIR="${ALLOY_LOCKS_DIR}/validate.lock"
  ALLOY_VALIDATE_QUEUE_DIR="${ALLOY_LOCKS_DIR}/validate.queue"
  ALLOY_VALIDATE_RESULTS_DIR="${ALLOY_RUNTIME_ROOT}/validate-results"
  ALLOY_AUTH_DIR="${ALLOY_RUNTIME_ROOT}/auth"
  ALLOY_BROWSER_PIDS_DIR="${ALLOY_RUNTIME_ROOT}/browser-pids"
  ALLOY_BROWSER_PROFILES_DIR="${ALLOY_RUNTIME_ROOT}/browser-profiles"
  ALLOY_EVIDENCE_DIR="${ALLOY_RUNTIME_ROOT}/evidence"
  ALLOY_INITIATIVES_DIR="${ALLOY_RUNTIME_ROOT}/initiatives"
  # Export so nested env/subprocess invocations cannot fall back to production.
  export ALLOY_RUNTIME_ROOT ALLOY_METADATA_DIR ALLOY_PIDS_DIR ALLOY_LOGS_DIR \
    ALLOY_LOCKS_DIR ALLOY_VALIDATE_LOCK_DIR ALLOY_VALIDATE_QUEUE_DIR \
    ALLOY_VALIDATE_RESULTS_DIR ALLOY_AUTH_DIR \
    ALLOY_BROWSER_PIDS_DIR ALLOY_BROWSER_PROFILES_DIR ALLOY_EVIDENCE_DIR \
    ALLOY_INITIATIVES_DIR
}

# Diagnostic: resolved runtime path names only (never prints secrets or file contents).
alloy_runtime_paths_report() {
  alloy_resolve_runtime_paths "${ALLOY_RUNTIME_ROOT:-}"
  cat <<EOF
ALLOY_CONFIG_FILE=${ALLOY_CONFIG_FILE:-}
ALLOY_RUNTIME_ROOT=${ALLOY_RUNTIME_ROOT}
ALLOY_METADATA_DIR=${ALLOY_METADATA_DIR}
ALLOY_PIDS_DIR=${ALLOY_PIDS_DIR}
ALLOY_LOGS_DIR=${ALLOY_LOGS_DIR}
ALLOY_LOCKS_DIR=${ALLOY_LOCKS_DIR}
ALLOY_AUTH_DIR=${ALLOY_AUTH_DIR}
ALLOY_BROWSER_PIDS_DIR=${ALLOY_BROWSER_PIDS_DIR}
ALLOY_BROWSER_PROFILES_DIR=${ALLOY_BROWSER_PROFILES_DIR}
ALLOY_EVIDENCE_DIR=${ALLOY_EVIDENCE_DIR}
ALLOY_INITIATIVES_DIR=${ALLOY_INITIATIVES_DIR}
ALLOY_INITIATIVE_ROOT=${ALLOY_INITIATIVE_ROOT:-}
ALLOY_FIRST_AGENT_PORT=${ALLOY_FIRST_AGENT_PORT:-}
EOF
}

alloy_load_config() {
  local example="${ALLOY_LOCAL_DEV_ROOT}/alloy-config.example"
  local user_config="${ALLOY_CONFIG_FILE:-$HOME/.config/alloy-dev/config}"
  # Preserve an explicitly exported runtime root (certification / tests) across
  # example sourcing, which otherwise hard-assigns the production default.
  local explicit_runtime="${ALLOY_RUNTIME_ROOT:-}"
  local explicit_first_port="${ALLOY_FIRST_AGENT_PORT:-}"

  # shellcheck disable=SC1090
  source "$example"

  if [[ -f "$user_config" ]]; then
    # shellcheck disable=SC1090
    source "$user_config"
  fi

  ALLOY_CONFIG_FILE="$user_config"
  # Precedence: explicit export (cert/test) > config file > example > default.
  if [[ -n "$explicit_runtime" ]]; then
    ALLOY_RUNTIME_ROOT="$explicit_runtime"
  fi
  ALLOY_RUNTIME_ROOT="${ALLOY_RUNTIME_ROOT:-$(alloy_default_runtime_root)}"
  if [[ -n "$explicit_first_port" ]]; then
    ALLOY_FIRST_AGENT_PORT="$explicit_first_port"
  fi
  alloy_resolve_runtime_paths "$ALLOY_RUNTIME_ROOT"
  export ALLOY_CONFIG_FILE
  # Default constants come from the Shared Read Core (one source of truth), so
  # the inspection and mutation runtimes can never disagree on a default.
  ALLOY_MAX_AGENTS="${ALLOY_MAX_AGENTS:-$ALLOY_RC_DEFAULT_MAX_AGENTS}"
  # Runtime Resource Orchestration V1 — observational only (Runtime Registry &
  # Inspection V1 does not enforce or act on this; it is reported by alloy-ro).
  ALLOY_MAX_ACTIVE_RUNTIMES="${ALLOY_MAX_ACTIVE_RUNTIMES:-$ALLOY_RC_DEFAULT_MAX_ACTIVE_RUNTIMES}"
  ALLOY_CANONICAL_PORT="${ALLOY_CANONICAL_PORT:-$ALLOY_RC_DEFAULT_CANONICAL_PORT}"
  ALLOY_FIRST_AGENT_PORT="${ALLOY_FIRST_AGENT_PORT:-$ALLOY_RC_DEFAULT_FIRST_AGENT_PORT}"
  ALLOY_BASE_REMOTE="${ALLOY_BASE_REMOTE:-$ALLOY_RC_DEFAULT_BASE_REMOTE}"
  ALLOY_BASE_BRANCH="${ALLOY_BASE_BRANCH:-$ALLOY_RC_DEFAULT_BASE_BRANCH}"
  ALLOY_WEB_DIR="${ALLOY_WEB_DIR:-$ALLOY_RC_DEFAULT_WEB_DIR}"
  ALLOY_PM="${ALLOY_PM:-npm}"
  NODE_OPTIONS_DEFAULT="${NODE_OPTIONS_DEFAULT:---max-old-space-size=4096}"
  ALLOY_CLEAN_ARTIFACT_AGE_HOURS="${ALLOY_CLEAN_ARTIFACT_AGE_HOURS:-24}"
  ALLOY_VALIDATE_POLL_SECONDS="${ALLOY_VALIDATE_POLL_SECONDS:-5}"
  ALLOY_VALIDATE_HEARTBEAT_STALE_SECONDS="${ALLOY_VALIDATE_HEARTBEAT_STALE_SECONDS:-90}"
  export ALLOY_FIRST_AGENT_PORT ALLOY_MAX_AGENTS
}

alloy_ensure_runtime_dirs() {
  alloy_resolve_runtime_paths "${ALLOY_RUNTIME_ROOT:-}"
  mkdir -p \
    "$ALLOY_METADATA_DIR" \
    "$ALLOY_PIDS_DIR" \
    "$ALLOY_LOGS_DIR" \
    "$ALLOY_LOCKS_DIR" \
    "${ALLOY_VALIDATE_QUEUE_DIR:-$ALLOY_LOCKS_DIR/validate.queue}" \
    "${ALLOY_VALIDATE_RESULTS_DIR:-$ALLOY_RUNTIME_ROOT/validate-results}"
}

# True when the resolved runtime root is a certification/test fixture tree.
alloy_runtime_is_fixture() {
  local root="${ALLOY_RUNTIME_ROOT:-}"
  [[ "${ALLOY_ENGINEERING_CERTIFY:-0}" == "1" ]] && return 0
  [[ "${ALLOY_PRODUCT_CERTIFY:-0}" == "1" ]] && return 0
  [[ "${ALLOY_TEST_FIXTURE:-0}" == "1" ]] && return 0
  case "$root" in
    /tmp/alloy-*-cert.*|/tmp/alloy-*-cert.*/|/tmp/alloy-*-cert.*/*) return 0 ;;
    /tmp/alloy-*-fixture.*|/tmp/alloy-*-fixture.*/|/tmp/alloy-*-fixture.*/*) return 0 ;;
    /tmp/alloy-p*-fixture.*|/tmp/alloy-p*-fixture.*/|/tmp/alloy-p*-fixture.*/*) return 0 ;;
    /private/tmp/alloy-*-cert.*|/private/tmp/alloy-*-cert.*/*) return 0 ;;
    /private/tmp/alloy-*-fixture.*|/private/tmp/alloy-*-fixture.*/*) return 0 ;;
    /private/tmp/alloy-p*-fixture.*|/private/tmp/alloy-p*-fixture.*/*) return 0 ;;
  esac
  return 1
}

# During certification/tests, prefer fixture ports (e.g. 3911+) so real operator
# slots 3011–3016 may remain occupied. Port refusal still uses global lsof on the
# configured fixture port — it must not require real managed ports to be free.
alloy_refuse_occupied_port() {
  local port="$1"
  local context="${2:-}"
  # Scope: "loopback" asks only whether 127.0.0.1/::1 (or a wildcard covering
  # them) is taken. That is the right question for a dev server that binds
  # loopback only, and it stops Tailscale Serve's permanent tailnet-address
  # listeners from reading as "this port is occupied".
  local scope="${3:-global}"
  local owner
  if [[ "$scope" == "loopback" ]]; then
    owner="$(alloy_rc_loopback_port_owner "$port")"
  else
    owner="$(alloy_rc_port_owner "$port")"
  fi
  case "$owner" in
    owned\ *)
      local pid="${owner#owned }"
      if [[ -n "$context" ]]; then
        alloy_die "port $port is already in use by PID $pid ($context). Refusing to choose a different port."
      fi
      alloy_die "port $port is already in use by PID $pid. Refusing to choose a different port."
      ;;
    unknown)
      # Refusing here is the point. The alternative — proceeding because the
      # probe failed — is how a second server lands on a port that is already
      # serving another slot, and that collision is only visible afterwards.
      alloy_die "port $port ownership could not be determined (listener probe unavailable)${context:+ ($context)}. Refusing to bind a port that cannot be proven free."
      ;;
  esac
}

alloy_confirm() {
  local prompt="${1:-Continue?}"
  local reply=""
  if [[ ! -t 0 ]]; then
    alloy_die "interactive confirmation required (stdin is not a TTY): $prompt"
  fi
  printf '%s [y/N] ' "$prompt" >&2
  read -r reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *) alloy_die "aborted" ;;
  esac
}

alloy_validate_slot() {
  local slot="$1"
  [[ "$slot" =~ ^[1-9][0-9]*$ ]] || alloy_die "invalid slot '$slot' (expected integer 1-${ALLOY_MAX_AGENTS})"
  if (( slot < 1 || slot > ALLOY_MAX_AGENTS )); then
    alloy_die "invalid slot '$slot' (expected 1-${ALLOY_MAX_AGENTS})"
  fi
}

alloy_validate_initiative() {
  local name="$1"
  [[ -n "$name" ]] || alloy_die "initiative name is required"
  [[ "$name" =~ ^[a-z0-9]+([_-][a-z0-9]+)*$ ]] || \
    alloy_die "invalid initiative name '$name' (use lowercase letters, digits, hyphen/underscore)"
}

alloy_validate_agent() {
  local agent="$1"
  case "$agent" in
    cursor|claude) ;;
    *) alloy_die "invalid agent type '$agent' (expected cursor|claude)" ;;
  esac
}

alloy_slot_to_port() {
  local slot="$1"
  alloy_validate_slot "$slot"
  echo $(( ALLOY_FIRST_AGENT_PORT + slot - 1 ))
}

alloy_worktree_name() {
  local slot="$1"
  local initiative="$2"
  printf 'wt%s-%s' "$slot" "$initiative"
}

alloy_branch_name() {
  local agent="$1"
  local slot="$2"
  local initiative="$3"
  printf 'agent/%s/%s-%s' "$agent" "$slot" "$initiative"
}

alloy_metadata_path() {
  local name="$1"
  printf '%s/%s.env' "$ALLOY_METADATA_DIR" "$name"
}

# --- Director-facing route for a lane's app ---
#
# WHY THIS IS PART OF STARTING A SERVER. Execution is on the Mac mini; the
# Director drives Vacilando from a MacBook. A dev server that is running but not
# routed is invisible to the operator, and the obvious link — localhost:PORT —
# means the MacBook when clicked there. Routing is therefore not a separate
# setup step somebody remembers; it is part of what "the server is available"
# means, so every lane inherits it and no lane needs a hand-written config.
#
# Per-port HTTPS on the tailnet hostname Tailscale Serve already publishes. Not
# a path mount: the app stays at the root so absolute /_next asset paths and the
# HMR socket keep working. Not the raw tailnet IP: plain HTTP on an IP literal
# breaks Secure cookies and cannot appear in an OAuth redirect allowlist, and
# the human sign-in ceremony has to live on this origin.
#
# Best effort by construction. A missing or unconfigured Tailscale must never
# stop a dev server from starting — the server is still correct locally, it is
# only the remote route that is absent, and lane-app-url reports that honestly
# as `no_serve_mapping_for_port` rather than emitting a URL that cannot connect.
alloy_tailscale_bin() {
  if command -v tailscale >/dev/null 2>&1; then command -v tailscale; return 0; fi
  [[ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]] \
    && printf '/Applications/Tailscale.app/Contents/MacOS/Tailscale' && return 0
  return 1
}

alloy_ensure_director_route() {
  local port="$1" ts
  [[ -n "$port" ]] || return 0
  [[ "${ALLOY_DIRECTOR_ROUTE:-1}" == "1" ]] || return 0
  ts="$(alloy_tailscale_bin)" || return 0
  # Idempotent: if the mapping is already published, adding it again is a no-op
  # but we avoid the call so a normal restart is quiet.
  if "$ts" serve status 2>/dev/null | grep -q ":${port}\b"; then return 0; fi
  "$ts" serve --bg "--https=${port}" "http://127.0.0.1:${port}" >/dev/null 2>&1 || return 0
  return 0
}

alloy_remove_director_route() {
  local port="$1" ts
  [[ -n "$port" ]] || return 0
  [[ "${ALLOY_DIRECTOR_ROUTE:-1}" == "1" ]] || return 0
  ts="$(alloy_tailscale_bin)" || return 0
  "$ts" serve "--https=${port}" off >/dev/null 2>&1 || return 0
  return 0
}

# --- Dev-server lifecycle audit ---
#
# THE GAP THIS CLOSES. During capacity certification the server on slot 1
# disappeared from the measurement cohort twice, and there was NO WAY TO SAY WHO
# STOPPED IT. The report had to read "another lane's agent probably stopped it",
# which is inference, not evidence. Every canonical path that starts or stops a
# dev server ran without leaving a durable trace, so the only record of a
# lifecycle action was the side effect: a pid file that had vanished.
#
# This is an AUDIT LOG over the canonical operations, not a second registry. The
# pid files and metadata remain the authority on what IS; this records what
# HAPPENED, so a future cohort invalidation can name the action instead of
# guessing at it.
#
# The distinction that matters most is the one it makes possible: a server that
# stopped WITH a matching event was stopped by someone through a sanctioned
# path, and a server that vanished with NO event was killed outside the
# lifecycle. Those are different problems and they were previously identical.
alloy_server_audit_path() {
  printf '%s/dev-server-lifecycle.jsonl' "${ALLOY_RUNTIME_ROOT}"
}

# Who is doing this? Derived, never guessed: an explicit actor wins, then the
# lane/run this shell is executing for, then the toolkit itself.
alloy_server_audit_actor() {
  if [[ -n "${ALLOY_SERVER_AUDIT_ACTOR:-}" ]]; then printf '%s' "$ALLOY_SERVER_AUDIT_ACTOR"; return; fi
  if [[ -n "${VACILANDO_RUN_ID:-}" || -n "${VACILANDO_LANE_ID:-}" ]]; then printf 'lane-agent'; return; fi
  if [[ -n "${ALLOY_CAPACITY_OVERRIDE:-}" ]]; then printf 'capacity-experiment'; return; fi
  printf 'toolkit'
}

# One line per canonical lifecycle action. Best effort by construction: an audit
# write must never be able to fail a dev-server operation, because a lost log
# line is a smaller problem than a server that would not stop.
alloy_record_server_lifecycle() {
  local action="$1" name="$2" outcome="$3" reason="${4:-}" prev_pid="${5:-}" new_pid="${6:-}"
  local path ts
  path="$(alloy_server_audit_path)" || return 0
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$(dirname "$path")" 2>/dev/null || return 0
  printf '{"at":"%s","action":"%s","worktree":"%s","slot":%s,"port":%s,"previous_pid":%s,"new_pid":%s,"actor":"%s","lane_id":%s,"run_id":%s,"reason":"%s","outcome":"%s","toolkit":"%s"}\n' \
    "$ts" "$action" "$name" \
    "${ALLOY_WORKTREE_SLOT:-null}" "${PORT:-null}" \
    "${prev_pid:-null}" "${new_pid:-null}" \
    "$(alloy_server_audit_actor)" \
    "$([[ -n "${VACILANDO_LANE_ID:-}" ]] && printf '"%s"' "$VACILANDO_LANE_ID" || printf 'null')" \
    "$([[ -n "${VACILANDO_RUN_ID:-}" ]] && printf '"%s"' "$VACILANDO_RUN_ID" || printf 'null')" \
    "${reason//\"/}" "$outcome" \
    "$(basename "$(dirname "${ALLOY_LOCAL_DEV_ROOT:-/unknown}")" 2>/dev/null)" \
    >>"$path" 2>/dev/null || true
  return 0
}

alloy_pid_path() {
  local name="$1"
  printf '%s/%s.pid' "$ALLOY_PIDS_DIR" "$name"
}

alloy_log_path() {
  local name="$1"
  printf '%s/%s.log' "$ALLOY_LOGS_DIR" "$name"
}

alloy_validate_log_path() {
  printf '%s/validate.log' "$ALLOY_LOGS_DIR"
}

alloy_write_kv_file() {
  local path="$1"
  shift
  local tmp dir
  dir="$(dirname "$path")"
  mkdir -p "$dir"
  tmp="$(mktemp "${path}.XXXXXX")"
  {
    for pair in "$@"; do
      printf '%s\n' "$pair"
    done
  } >"$tmp"
  mv "$tmp" "$path"
}

# Optional metadata fields. Absent from a metadata file when a worktree was
# created by a Phase 1/2 command rather than alloy-sprint-start, or when the
# sprint never set them.
#
# These MUST be cleared before sourcing any metadata file. Metadata is sourced
# into the caller's scope, so a field absent from file B silently retains the
# value sourced from file A. That is how alloy-worker-status attributed slot 2's
# sprint name to slot 3: wt3's metadata has no ALLOY_SPRINT_NAME, so
# "${ALLOY_SPRINT_NAME:-fallback}" never reached its fallback — the variable was
# set, just set by the previous row. Mandatory fields are guarded by the
# assertions in alloy_load_metadata; optional fields had no such guard.
#
# Trust rule: a surface may state only what it read. An absent field must read
# as absent, never as the last slot that had one.
# The canonical field list lives in the Shared Read Core (single schema); this
# is a reference to it, not a second copy.
ALLOY_OPTIONAL_METADATA_FIELDS="$ALLOY_RC_METADATA_OPTIONAL_FIELDS"

alloy_reset_optional_metadata() {
  local key
  for key in $ALLOY_OPTIONAL_METADATA_FIELDS; do
    unset "$key"
  done
}

alloy_load_metadata() {
  local name="$1"
  local path
  path="$(alloy_metadata_path "$name")"
  [[ -f "$path" ]] || alloy_die "unknown worktree metadata: $name ($path)"
  alloy_reset_optional_metadata
  # shellcheck disable=SC1090
  source "$path"
  [[ "${ALLOY_WORKTREE_NAME:-}" == "$name" ]] || \
    alloy_die "metadata name mismatch for $name (found '${ALLOY_WORKTREE_NAME:-}')"
  [[ -n "${ALLOY_WORKTREE_PATH:-}" ]] || alloy_die "metadata missing ALLOY_WORKTREE_PATH for $name"
  [[ -n "${ALLOY_WORKTREE_BRANCH:-}" ]] || alloy_die "metadata missing ALLOY_WORKTREE_BRANCH for $name"
  [[ -n "${ALLOY_WORKTREE_SLOT:-}" ]] || alloy_die "metadata missing ALLOY_WORKTREE_SLOT for $name"
  [[ -n "${PORT:-}" ]] || alloy_die "metadata missing PORT for $name"
  [[ -n "${ALLOY_AGENT:-}" ]] || alloy_die "metadata missing ALLOY_AGENT for $name"
}

# Metadata discovery is owned by the Shared Read Core. (The slot lookup there
# PARSES metadata rather than sourcing it — same result, and it removes an
# executable-file source from this path.)
alloy_list_metadata_names() {
  alloy_rc_list_metadata "$ALLOY_METADATA_DIR"
}

alloy_find_metadata_by_slot() {
  alloy_rc_resolve_slot "$ALLOY_METADATA_DIR" "$1"
}

# Normalize a git remote URL for comparison: scp-style and URL forms of the
# same remote must compare equal (git@host:owner/repo.git == https://host/owner/repo).
alloy_normalize_remote_url() {
  local url="$1"
  url="${url%.git}"
  url="${url#ssh://}"
  url="${url#https://}"
  url="${url#http://}"
  url="${url#git://}"
  url="${url#*@}"          # strip user@
  url="${url/://}"          # scp-style host:path -> host/path
  printf '%s' "$url"
}

# Verify ALLOY_REPO is a usable canonical checkout.
#
# Scope note (honest naming): this verifies that the canonical repo is a real,
# reachable, non-worktree checkout with the expected remote. It does NOT verify
# that the agent is standing in it, and it cannot — a misrooted agent never
# invokes the toolkit at all. Ambient root identity is answered by alloy-root
# (TM-2), not here.
alloy_verify_canonical_repo() {
  local repo="${ALLOY_REPO:-}"
  [[ -n "$repo" ]] || alloy_die "ALLOY_REPO is not set"
  if [[ ! -d "$repo/.git" && ! -f "$repo/.git" ]]; then
    alloy_die "ALLOY_REPO is not a git repository: $repo"
  fi
  # A linked worktree has .git as a FILE containing "gitdir:". The canonical
  # checkout must be the real clone: managed worktrees are cut from it, and a
  # worktree-of-a-worktree is never the intended root.
  if [[ -f "$repo/.git" ]]; then
    alloy_die "ALLOY_REPO is a linked git worktree, not the canonical checkout: $repo"
  fi
  (
    cd "$repo"
    git rev-parse --is-inside-work-tree >/dev/null 2>&1
  ) || alloy_die "cannot access git repository at $repo"

  local remote_url
  remote_url="$(cd "$repo" && git remote get-url "$ALLOY_BASE_REMOTE" 2>/dev/null || true)"
  if [[ -z "$remote_url" ]]; then
    alloy_die "remote '$ALLOY_BASE_REMOTE' missing in $repo"
  fi
  # Exact identity when configured; otherwise a heuristic that says so.
  local expected="${ALLOY_REPO_EXPECTED_REMOTE:-}"
  if [[ -n "$expected" ]]; then
    local got_n exp_n
    got_n="$(alloy_normalize_remote_url "$remote_url")"
    exp_n="$(alloy_normalize_remote_url "$expected")"
    if [[ "$got_n" != "$exp_n" ]]; then
      alloy_die "ALLOY_REPO remote mismatch: $repo points at '$remote_url', expected '$expected' (ALLOY_REPO_EXPECTED_REMOTE)"
    fi
  elif [[ "$remote_url" != *alloy* && "$remote_url" != *Alloy* ]]; then
    alloy_warn "remote URL does not look like Alloy (name heuristic, not verification): $remote_url"
  fi
}

alloy_git() {
  local repo="$1"
  shift
  git -C "$repo" "$@"
}

alloy_repo_fetch() {
  local repo="$1"
  alloy_git "$repo" fetch "$ALLOY_BASE_REMOTE" --prune
}

alloy_base_ref() {
  printf '%s/%s' "$ALLOY_BASE_REMOTE" "$ALLOY_BASE_BRANCH"
}

# Refresh the base ref in the canonical repo. Linked worktrees share the object
# store, so one fetch makes every slot's ahead/behind current. Returns non-zero
# when the refresh could not happen (offline, no repo) so callers can say so
# rather than silently reporting against a stale ref.
alloy_refresh_base_ref() {
  local repo="${ALLOY_REPO:-}"
  [[ -n "$repo" && -d "$repo/.git" ]] || return 1
  GIT_TERMINAL_PROMPT=0 git -C "$repo" fetch --quiet \
    "$ALLOY_BASE_REMOTE" "$ALLOY_BASE_BRANCH" >/dev/null 2>&1 || return 1
  return 0
}

# Describe the base ref an ahead/behind count is measured against, including how
# stale it is.
#
# Trust rule: ahead/behind is computed against whatever origin/staging happens
# to be cached locally, and the reporting paths never fetch. A worktree 1481
# commits behind can therefore print "behind: 0" — technically true of the
# cached ref, operationally a lie. The count is not wrong; the count is
# *relative*, and a surface that prints it must say relative to what.
alloy_base_ref_status() {
  local repo="${ALLOY_REPO:-}"
  local base sha age
  base="$(alloy_base_ref)"
  sha="unknown"
  age="never fetched"
  if [[ -n "$repo" && -d "$repo/.git" ]]; then
    sha="$(git -C "$repo" rev-parse --short "$base" 2>/dev/null || echo "unknown")"
    local fetch_head="$repo/.git/FETCH_HEAD"
    if [[ -f "$fetch_head" ]]; then
      local mtime now delta
      mtime="$(stat -f %m "$fetch_head" 2>/dev/null || stat -c %Y "$fetch_head" 2>/dev/null || echo "")"
      if [[ -n "$mtime" ]]; then
        now="$(date +%s)"
        delta=$((now - mtime))
        if (( delta < 90 )); then age="fetched ${delta}s ago"
        elif (( delta < 5400 )); then age="fetched $((delta / 60))m ago"
        elif (( delta < 172800 )); then age="fetched $((delta / 3600))h ago"
        else age="fetched $((delta / 86400))d ago"
        fi
      fi
    fi
  fi
  printf '%s @ %s (%s)' "$base" "$sha" "$age"
}

alloy_port_listener_pid() {
  alloy_rc_port_pid "$1"
}

# FAILS CLOSED. "I could not look" must answer the same as "occupied" here: the
# only action this gates is binding a port, and binding one that is already
# serving another slot is the collision this guard exists to prevent. A false
# "free" is unrecoverable in the way a false "busy" is not.
alloy_port_in_use() {
  local port="$1"
  ! alloy_rc_port_known_free "$port"
}

# For callers that need the distinction rather than the decision.
alloy_port_owner() {
  alloy_rc_port_owner "$1"
}

# Gracefully terminate a PID and its immediate children; return 0 once it is gone,
# 1 if it survives the grace period (caller decides; we never auto-SIGKILL).
#
# Lives here rather than inside alloy-dev-stop because it now has a second
# legitimate caller: alloy-dev-reclaim, which stops a PROVEN foreign dev server.
# Copying it would have been a second owner of "how Alloy ends a server", and the
# `-P` scoping is exactly the part nobody should re-derive.
alloy_stop_pid_tree() {
  local target="$1" i
  if alloy_have_cmd pkill; then
    pkill -TERM -P "$target" 2>/dev/null || true
  fi
  kill -TERM "$target" 2>/dev/null || true
  for i in 1 2 3 4 5 6 7 8 9 10; do
    alloy_pid_alive "$target" || return 0
    sleep 0.5
  done
  return 1
}

alloy_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

alloy_process_command() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null || true
}

# `lsof` lives in /usr/sbin on macOS, which is NOT on every PATH this toolkit runs under.
# Resolving it by name alone silently loses the cwd signal, and ownership then falls back to
# matching the worktree path inside a command line — which `npm run start` and `next-server` do not
# contain. A managed production server was therefore classified `stale` while serving correctly, and
# `browser-auth verify` refuses a server it cannot call toolkit-owned. Dev only escaped this by the
# accident of its own command string.
# ONE resolver, in the shared read core. This was a second copy, and the copy in
# read-core.sh — the one the port probe uses — was the one that lacked the
# fallback, so hardening this half fixed cwd lookups while port ownership stayed
# broken. Delegating is the whole point.
alloy_lsof_bin() {
  alloy_rc_lsof_bin
}

alloy_process_cwd() {
  local pid="$1"
  local lsof_bin
  if lsof_bin="$(alloy_lsof_bin)"; then
    "$lsof_bin" -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {print substr($0,2); exit}'
    return 0
  fi
  return 1
}

# Returns 0 when PID appears to belong to the given worktree path.
# True when a process serves a worktree.
#
# Three signals, cheapest first. `alloy_process_cwd` needs lsof, and lsof is not
# present on every host we run on — when it is missing the cwd signal silently
# yields nothing, so the command-line signal has to carry the judgement. That is
# where the npm wrapper defeats it: `alloy-dev-start` records the PID of
# `npm run dev`, whose command line names no path at all, while the child it
# spawns (`next dev` under the worktree's own node_modules) names the worktree
# in full. Judging the wrapper alone therefore reported a healthy, toolkit-owned
# server as `stale` and `alloy-agent-verify` refused to run against it.
#
# So the third signal asks the process tree: a supervisor belongs to the
# worktree its children serve. Descendants only — a parent shell's cwd says
# nothing about what this process is running.
alloy_pid_belongs_to_worktree() {
  local pid="$1"
  local worktree_path="$2"
  local cmd cwd resolved_wt resolved_cwd
  alloy_pid_alive "$pid" || return 1
  resolved_wt="$(alloy_realpath "$worktree_path")"
  cmd="$(alloy_process_command "$pid")"
  cwd="$(alloy_process_cwd "$pid" 2>/dev/null || true)"
  if [[ -n "$cwd" ]]; then
    resolved_cwd="$(alloy_realpath "$cwd")"
    if [[ "$resolved_cwd" == "$resolved_wt" || "$resolved_cwd" == "$resolved_wt"/* ]]; then
      return 0
    fi
  fi
  if [[ "$cmd" == *"$worktree_path"* || "$cmd" == *"$resolved_wt"* ]]; then
    return 0
  fi
  alloy_pid_tree_serves_worktree "$pid" "$worktree_path" "$resolved_wt"
}

# Depth-bounded descendant walk. The bound is not decoration: a cycle in a
# malformed ps table would otherwise spin forever, and a real supervisor chain
# (npm -> node -> next-server) is three deep.
alloy_pid_tree_serves_worktree() {
  local root="$1"
  local worktree_path="$2"
  local resolved_wt="${3:-$worktree_path}"
  local table frontier depth next child ppid ccmd

  table="$(ps -eo pid=,ppid=,command= 2>/dev/null || true)"
  [[ -n "$table" ]] || return 1

  frontier=" $root "
  for depth in 1 2 3 4; do
    next=""
    # `read` splits on IFS and discards the column padding ps emits; parsing the
    # line by hand mistook that padding for an empty first field.
    while read -r child ppid ccmd; do
      [[ -n "$child" && -n "$ppid" ]] || continue
      [[ "$frontier" == *" $ppid "* ]] || continue
      if [[ "$ccmd" == *"$worktree_path"* || "$ccmd" == *"$resolved_wt"* ]]; then
        return 0
      fi
      next="$next$child "
    done <<< "$table"
    [[ -n "${next// /}" ]] || return 1
    frontier=" $next"
  done
  return 1
}

alloy_read_pid_file() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  tr -d '[:space:]' <"$path"
}

alloy_remove_dead_pid_file() {
  local name="$1"
  local path pid
  path="$(alloy_pid_path "$name")"
  [[ -f "$path" ]] || return 0
  pid="$(alloy_read_pid_file "$path" || true)"
  if [[ -z "${pid:-}" ]] || ! alloy_pid_alive "$pid"; then
    rm -f "$path"
    alloy_info "removed dead PID record: $path"
    return 0
  fi
  return 1
}

alloy_realpath() {
  local target="$1"
  if [[ -d "$target" ]]; then
    (cd "$target" && pwd -P)
    return 0
  fi
  if [[ -e "$target" ]]; then
    local dir base
    dir="$(dirname "$target")"
    base="$(basename "$target")"
    printf '%s/%s\n' "$(cd "$dir" && pwd -P)" "$base"
    return 0
  fi
  printf '%s\n' "$target"
}

alloy_worktree_is_dirty() {
  local path="$1"
  local out
  out="$(alloy_git "$path" status --porcelain 2>/dev/null || true)"
  # Ignore the non-secret agent marker if a checkout lacks a matching gitignore rule.
  out="$(printf '%s\n' "$out" | grep -vE '^\?\? \.env\.local\.agent$' || true)"
  [[ -n "$out" ]]
}

# Dirty-state evaluation (the "ignore agent marker + next-env.d.ts" business
# rule) is owned by the Shared Read Core, so the mutation and inspection runtimes
# can never classify the same worktree differently.
alloy_worktree_dirty_porcelain() {
  alloy_rc_dirty_porcelain "$1"
}

# stdout: clean | next-env-only | dirty
alloy_worktree_dirty_classification() {
  alloy_rc_dirty_classification "$1" "${ALLOY_WEB_DIR:-web}"
}

alloy_current_branch() {
  local path="$1"
  alloy_git "$path" rev-parse --abbrev-ref HEAD
}

alloy_dir_size() {
  local path="$1"
  if [[ -d "$path" ]]; then
    du -sh "$path" 2>/dev/null | awk '{print $1}'
  else
    printf 'missing'
  fi
}

# Raw byte size of a regular file. Owned by the Shared Read Core.
alloy_file_byte_size() {
  alloy_rc_file_bytes "$1"
}

# Human-readable IEC size. Owned by the Shared Read Core (identical contract).
alloy_human_bytes() {
  alloy_rc_human_bytes "$1"
}

# Human-readable size for a file or directory. Never reads file contents.
# stdout: size string, or "unknown" when size cannot be determined.
alloy_path_size_human() {
  local path="$1"
  local bytes size
  if [[ -f "$path" ]]; then
    if bytes="$(alloy_file_byte_size "$path" 2>/dev/null)"; then
      alloy_human_bytes "$bytes"
      return 0
    fi
    size="$(du -h "$path" 2>/dev/null | awk '{print $1; exit}')"
    if [[ -n "$size" ]]; then
      printf '%s' "$size"
      return 0
    fi
    printf 'unknown'
    return 1
  fi
  if [[ -d "$path" ]]; then
    size="$(du -sh "$path" 2>/dev/null | awk '{print $1}')"
    if [[ -n "$size" ]]; then
      printf '%s' "$size"
      return 0
    fi
    printf 'unknown'
    return 1
  fi
  printf 'unknown'
  return 1
}

alloy_file_mtime_human() {
  local path="$1"
  stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$path" 2>/dev/null \
    || stat -c '%y' "$path" 2>/dev/null | cut -c1-16 \
    || printf 'unknown'
}

# The full typecheck's heap is a RESOURCE CONTRACT, not a config preference.
# alloy-config.example declares 8192 and web/package.json declares 8192, but an
# installed config can drift below that; this host's was pinned at 4096, which
# is why `vac run typecheck` died with SIGABRT (reported as class=config) while
# `typecheck:tests` — which carries a hardcoded 8192 fallback — passed. A floor
# enforced here means config drift can no longer undersize the compiler.
#
# MEASURED on this host (not assumed), same commit, same tsconfig.build.json:
#   --max-old-space-size=4096 -> rc=134 SIGABRT, class=config, aborted after 98s,
#                                peak RSS 4177MB (it ran into its own ceiling)
#   --max-old-space-size=8192 -> rc=0, class=ok, finished in 86s,
#                                peak RSS 4399MB
# The compiler genuinely needs ~4.4GB for the full build graph, so 4096 is
# structurally insufficient rather than merely tight. 8192 clears the measured
# peak with roughly 1.9x headroom; it is not a blind increase.
ALLOY_TYPECHECK_MIN_HEAP_MB="${ALLOY_TYPECHECK_MIN_HEAP_MB:-8192}"

alloy_apply_heap_floor() {
  # $1 = command string. Raises --max-old-space-size below the floor; adds it to
  # a bare `node …tsc` invocation that declares none.
  local cmd="$1" floor="${ALLOY_TYPECHECK_MIN_HEAP_MB}" declared=""
  [[ -n "$cmd" ]] || { printf '%s' "$cmd"; return 0; }
  declared="$(printf '%s' "$cmd" | sed -n 's/.*--max-old-space-size=\([0-9][0-9]*\).*/\1/p')"
  if [[ -n "$declared" ]]; then
    if (( declared < floor )); then
      printf '%s' "$cmd" | sed "s/--max-old-space-size=${declared}/--max-old-space-size=${floor}/"
      printf 'note: raised typecheck heap %sMB -> %sMB (broker resource contract)\n' \
        "$declared" "$floor" >&2
      return 0
    fi
    printf '%s' "$cmd"
    return 0
  fi
  if [[ "$cmd" == node[[:space:]]* ]]; then
    printf '%s' "${cmd/node /node --max-old-space-size=${floor} }"
    return 0
  fi
  printf '%s' "$cmd"
}

alloy_export_node_defaults() {
  export NODE_OPTIONS="${NODE_OPTIONS:-$NODE_OPTIONS_DEFAULT}"
}

# Force spawned dev/build processes to run under NATIVE arm64 on Apple Silicon — the fix
# for the intermittent "Cannot find module '../lightningcss.darwin-x64.node'" (and
# next-swc) build error. A universal `node` inherits the launching shell's arch, and on
# this machine the toolkit's shells vary (some run under Rosetta/x64), so the Next process
# nondeterministically runs x64 and then cannot load the arm64 native modules the worktree
# installed. arm64 is the native, correct arch here, so we pin to it deterministically.
#   * Hardware is detected via `hw.optional.arm64` (NOT `uname -m`, which reports the
#     current process arch — under Rosetta that is already x86_64, which would disable the
#     fix exactly when it is needed).
#   * We launch the SYSTEM /bin/bash (a universal binary) because the PATH `bash` may be an
#     x86_64-only Homebrew build that `arch -arm64` cannot execute — verified before use.
# No-op on Intel macOS and Linux. (A worktree whose node_modules were installed for x64 is
# the inverse mismatch and must be reinstalled arm64 — see alloy_warn_node_modules_arch.)
alloy_native_arch_prefix() {
  [[ "$(uname -s)" == "Darwin" ]] || return 0
  [[ "$(sysctl -n hw.optional.arm64 2>/dev/null)" == "1" ]] || return 0
  command -v arch >/dev/null 2>&1 || return 0
  arch -arm64 /bin/bash -c true >/dev/null 2>&1 || return 0
  printf 'arch -arm64 '
}

# Warn (with the exact remedy) when this is an arm64 Mac but a worktree's node_modules were
# installed for x86_64 — the inverse of the arch mismatch the launcher forces arm64 to fix.
# Such a worktree cannot run under the (correct) arm64 launch until its deps are reinstalled.
alloy_warn_node_modules_arch() {
  local web_dir="$1"
  [[ "$(uname -s)" == "Darwin" && "$(sysctl -n hw.optional.arm64 2>/dev/null)" == "1" ]] || return 0
  local nm="${web_dir}/node_modules"
  if [[ -d "${nm}/lightningcss-darwin-x64" && ! -d "${nm}/lightningcss-darwin-arm64" ]]; then
    alloy_warn "node_modules in ${web_dir} were installed for x86_64, but this Mac is arm64 — native modules (lightningcss/next-swc) will not load under the native arm64 server. Reinstall arm64:  (cd ${web_dir} && rm -rf node_modules && npm install)"
  fi
}

alloy_web_dir_for() {
  local worktree_path="$1"
  printf '%s/%s' "$worktree_path" "$ALLOY_WEB_DIR"
}

# --- Server readiness: registered is not runnable ---
#
# THE DEFECT THIS CLOSES. wt3-communications-inbound-sms held slot 3 and port
# 3013 as a fully registered, server-capable worktree, and could not start a
# server at all — its web/ has no node_modules, so `next dev` died with
# `sh: next: command not found` in a log nobody was reading. The capacity
# experiment counted it as one of the host's server slots and only discovered
# otherwise by trying. A 17-hour `s.end("ok")` stub had been left listening on
# that same port, which is what a fake server is FOR: it makes an unrunnable
# slot look ready.
#
# The cause is that a worktree can be registered two ways and only one of them
# provisions dependencies. alloy-sprint-start installs them; alloy-worktree-adopt
# is deliberately a "registers reality" tool that creates nothing — no Git state,
# no server, and no node_modules. Every worktree that entered the fleet by
# adoption (the Mac mini migration batch, and now every lane created through the
# Vacilando wizard) was registered as server-capable while being unable to start.
#
# So server capability is MEASURED, never assumed, and the answer is a reason
# rather than a boolean, because "no" without "why" is what sent a capacity
# experiment looking at the wrong thing.
#
#   ready                the dev command can actually start
#   no_worktree          the registered directory is gone
#   no_web_dir           no web/ under it
#   no_manifest          no web/package.json
#   dependencies_missing web/node_modules absent — install, do not stub
#   dev_binary_missing   dependencies are installed but the binary the dev
#                        command actually needs is not among them
#
# The binary check is derived from the dev script, never hardcoded to Next.
# ALLOY_DEV_COMMAND is configurable, and a worktree whose dev command is not Next
# must not be declared unrunnable because a Next binary is absent — that would be
# the same mistake in the other direction.
alloy_server_readiness_for_path() {
  local path="$1"
  local web_dir dev_script
  [[ -n "$path" && -d "$path" ]] || { printf 'no_worktree'; return 1; }
  web_dir="$(alloy_web_dir_for "$path")"
  [[ -d "$web_dir" ]] || { printf 'no_web_dir'; return 1; }
  [[ -f "${web_dir}/package.json" ]] || { printf 'no_manifest'; return 1; }
  # An empty node_modules is not installed dependencies. A partially removed tree
  # reads as present to `-d` and fails at `next dev` exactly like an absent one.
  if [[ ! -d "${web_dir}/node_modules" ]] || [[ -z "$(ls -A "${web_dir}/node_modules" 2>/dev/null)" ]]; then
    printf 'dependencies_missing'; return 1
  fi
  dev_script="$(sed -n 's/.*"dev"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${web_dir}/package.json" 2>/dev/null | head -1)"
  if [[ "$dev_script" == *next* ]] && [[ ! -x "${web_dir}/node_modules/.bin/next" ]]; then
    printf 'dev_binary_missing'; return 1
  fi
  printf 'ready'
  return 0
}

# The remediation that belongs with each reason. An operator reading a refusal
# should not have to go and look this up.
alloy_server_readiness_remedy() {
  case "$1" in
    dependencies_missing|dev_binary_missing)
      printf 'run: alloy-worktree-provision %s — the guarded installer (one install slot, no symlinked node_modules)' "$2" ;;
    no_worktree)   printf 'the registered worktree directory is gone — reconcile the registration' ;;
    no_web_dir|no_manifest) printf 'this worktree has no web app; it is not server-capable' ;;
    *) printf '' ;;
  esac
}

# True when a process command line is an active Playwright *test runner*
# (not hostnames, sandbox policy JSON, browsers, or inspection tools).
alloy_command_is_playwright_test_runner() {
  local cmd="$1"
  [[ -n "$cmd" ]] || return 1

  case "$cmd" in
    *cursorsandbox*|*Cursor\ Helper*|*extension-host*|*Extension\ Host*)
      return 1
      ;;
  esac
  case "$cmd" in
    *Claude\ Helper*|*Chrome\ Helper*|*browser\ helper*|*headless_shell*)
      return 1
      ;;
  esac
  case "$cmd" in
    *alloy-health*|*alloy-audit*|*alloy-ai-health*|*alloy_command_is_playwright_test_runner*|*alloy_count_playwright_test_runners*)
      return 1
      ;;
  esac
  if [[ "$cmd" =~ (^|[[:space:]])(/usr/bin/)?(grep|egrep|fgrep|rg|awk|curl|wget)([[:space:]]|$) ]]; then
    return 1
  fi

  # Download CDNs / URLs are never local test runners.
  if [[ "$cmd" == *playwright.azureedge.net* || "$cmd" == *https://*playwright* || "$cmd" == *http://*playwright* ]]; then
    return 1
  fi

  # Policy JSON / allowlists mentioning playwright.
  if [[ "$cmd" == *networkAllowlist* || "$cmd" == *policy-json* || "$cmd" == *"--policy"* ]]; then
    return 1
  fi

  # Explicit `playwright test` argv form (npm/npx/bin).
  if [[ "$cmd" =~ (^|[[:space:]/])playwright[[:space:]]+test([[:space:]]|$) ]]; then
    return 0
  fi

  # Packaged runner executables require a `test` argument (not bare package-path match).
  if [[ "$cmd" == *"/playwright/cli.js"* || "$cmd" == *"/@playwright/test"* ]]; then
    if [[ "$cmd" =~ [[:space:]]test([[:space:]]|$) ]]; then
      return 0
    fi
  fi

  return 1
}

# True when a process command line is an Alloy heavyweight validator (not sandboxes / inspectors).
alloy_command_is_active_validator() {
  local cmd="$1"
  [[ -n "$cmd" ]] || return 1

  # Cursor / IDE helpers and network-policy sandboxes.
  case "$cmd" in
    *cursorsandbox*|*Cursor\ Helper*|*extension-host*|*Extension\ Host*)
      return 1
      ;;
  esac

  # The health/audit/AI-health inspection pipeline itself.
  case "$cmd" in
    *alloy-health*|*alloy-audit*|*alloy-ai-health*|*alloy_command_is_active_validator*|*alloy_print_active_validators*|*alloy_command_is_playwright_test_runner*)
      return 1
      ;;
  esac
  if [[ "$cmd" =~ (^|[[:space:]])(/usr/bin/)?(grep|egrep|fgrep|rg|awk)([[:space:]]|$) ]]; then
    return 1
  fi

  # TypeScript compiler (binary path or argv0 tsc).
  if [[ "$cmd" == *"/typescript/bin/tsc"* || "$cmd" == *"/bin/tsc "* || "$cmd" == *"/bin/tsc" ]]; then
    return 0
  fi
  if [[ "$cmd" =~ (^|[[:space:]])tsc([[:space:]]|$) ]]; then
    return 0
  fi

  # Vitest runner.
  if [[ "$cmd" == *"/vitest/vitest.js"* || "$cmd" == *"/vitest/vitest.mjs"* || "$cmd" == *"/bin/vitest"* ]]; then
    return 0
  fi
  if [[ "$cmd" =~ (^|[[:space:]])vitest([[:space:]]|$) ]]; then
    return 0
  fi

  # Next production build (not mere `next dev`).
  if [[ "$cmd" =~ (^|[[:space:]/])next[[:space:]]+build([[:space:]]|$) ]]; then
    return 0
  fi

  # Playwright test runners (shared classifier).
  if alloy_command_is_playwright_test_runner "$cmd"; then
    return 0
  fi

  # Toolkit heavy validation entrypoint.
  if [[ "$cmd" =~ (^|[[:space:]/])alloy-validate([[:space:]]|$) ]]; then
    return 0
  fi

  return 1
}

alloy_print_active_validators() {
  local line pid cmd
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    pid="${line%% *}"
    cmd="${line#* }"
    if alloy_command_is_active_validator "$cmd"; then
      printf '%s %s\n' "$pid" "$cmd"
    fi
  done < <(ps -axo pid=,command= 2>/dev/null || true)
}
