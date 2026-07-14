#!/usr/bin/env bash
# Shared helpers for Alloy local-dev Phase 1 toolkit.
# shellcheck shell=bash

set -euo pipefail

ALLOY_LOCAL_DEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

alloy_die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

alloy_info() {
  printf '%s\n' "$*"
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

alloy_load_config() {
  local example="${ALLOY_LOCAL_DEV_ROOT}/alloy-config.example"
  local user_config="${ALLOY_CONFIG_FILE:-$HOME/.config/alloy-dev/config}"

  # shellcheck disable=SC1090
  source "$example"

  if [[ -f "$user_config" ]]; then
    # shellcheck disable=SC1090
    source "$user_config"
  fi

  ALLOY_CONFIG_FILE="$user_config"
  ALLOY_RUNTIME_ROOT="${ALLOY_RUNTIME_ROOT:-$HOME/.local/state/alloy-dev}"
  ALLOY_METADATA_DIR="${ALLOY_RUNTIME_ROOT}/metadata"
  ALLOY_PIDS_DIR="${ALLOY_RUNTIME_ROOT}/pids"
  ALLOY_LOGS_DIR="${ALLOY_RUNTIME_ROOT}/logs"
  ALLOY_LOCKS_DIR="${ALLOY_RUNTIME_ROOT}/locks"
  ALLOY_VALIDATE_LOCK_DIR="${ALLOY_LOCKS_DIR}/validate.lock"
  ALLOY_MAX_AGENTS="${ALLOY_MAX_AGENTS:-6}"
  ALLOY_CANONICAL_PORT="${ALLOY_CANONICAL_PORT:-3000}"
  ALLOY_FIRST_AGENT_PORT="${ALLOY_FIRST_AGENT_PORT:-3011}"
  ALLOY_BASE_REMOTE="${ALLOY_BASE_REMOTE:-origin}"
  ALLOY_BASE_BRANCH="${ALLOY_BASE_BRANCH:-staging}"
  ALLOY_WEB_DIR="${ALLOY_WEB_DIR:-web}"
  ALLOY_PM="${ALLOY_PM:-npm}"
  NODE_OPTIONS_DEFAULT="${NODE_OPTIONS_DEFAULT:---max-old-space-size=4096}"
  ALLOY_CLEAN_ARTIFACT_AGE_HOURS="${ALLOY_CLEAN_ARTIFACT_AGE_HOURS:-24}"
  ALLOY_VALIDATE_POLL_SECONDS="${ALLOY_VALIDATE_POLL_SECONDS:-5}"
}

alloy_ensure_runtime_dirs() {
  mkdir -p \
    "$ALLOY_METADATA_DIR" \
    "$ALLOY_PIDS_DIR" \
    "$ALLOY_LOGS_DIR" \
    "$ALLOY_LOCKS_DIR"
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
  local tmp
  tmp="$(mktemp "${path}.XXXXXX")"
  {
    for pair in "$@"; do
      printf '%s\n' "$pair"
    done
  } >"$tmp"
  mv "$tmp" "$path"
}

alloy_load_metadata() {
  local name="$1"
  local path
  path="$(alloy_metadata_path "$name")"
  [[ -f "$path" ]] || alloy_die "unknown worktree metadata: $name ($path)"
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

alloy_list_metadata_names() {
  local f base
  shopt -s nullglob
  for f in "$ALLOY_METADATA_DIR"/*.env; do
    base="$(basename "$f" .env)"
    printf '%s\n' "$base"
  done
  shopt -u nullglob
}

alloy_find_metadata_by_slot() {
  local slot="$1"
  local name meta_slot
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    meta_slot="$(
      # shellcheck disable=SC1090
      source "$(alloy_metadata_path "$name")"
      printf '%s' "${ALLOY_WORKTREE_SLOT:-}"
    )"
    if [[ "$meta_slot" == "$slot" ]]; then
      printf '%s\n' "$name"
      return 0
    fi
  done < <(alloy_list_metadata_names)
  return 1
}

alloy_verify_canonical_repo() {
  local repo="${ALLOY_REPO:-}"
  [[ -n "$repo" ]] || alloy_die "ALLOY_REPO is not set"
  [[ -d "$repo/.git" || -f "$repo/.git" ]] || \
    alloy_die "ALLOY_REPO is not a git repository: $repo"
  (
    cd "$repo"
    git rev-parse --is-inside-work-tree >/dev/null 2>&1
  ) || alloy_die "cannot access git repository at $repo"

  local remote_url expected=""
  remote_url="$(cd "$repo" && git remote get-url "$ALLOY_BASE_REMOTE" 2>/dev/null || true)"
  if [[ -z "$remote_url" ]]; then
    alloy_die "remote '$ALLOY_BASE_REMOTE' missing in $repo"
  fi
  if [[ "$remote_url" != *alloy* && "$remote_url" != *Alloy* ]]; then
    alloy_warn "remote URL does not look like Alloy: $remote_url"
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

alloy_port_listener_pid() {
  local port="$1"
  local line pid
  if alloy_have_cmd lsof; then
    line="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}' || true)"
    if [[ -n "${line:-}" ]]; then
      printf '%s\n' "$line"
      return 0
    fi
  fi
  return 1
}

alloy_port_in_use() {
  local port="$1"
  alloy_port_listener_pid "$port" >/dev/null 2>&1
}

alloy_refuse_occupied_port() {
  local port="$1"
  local context="${2:-}"
  local pid
  if pid="$(alloy_port_listener_pid "$port" 2>/dev/null)"; then
    if [[ -n "$context" ]]; then
      alloy_die "port $port is already in use by PID $pid ($context). Refusing to choose a different port."
    fi
    alloy_die "port $port is already in use by PID $pid. Refusing to choose a different port."
  fi
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

alloy_process_cwd() {
  local pid="$1"
  if alloy_have_cmd lsof; then
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {print substr($0,2); exit}'
    return 0
  fi
  return 1
}

# Returns 0 when PID appears to belong to the given worktree path.
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

alloy_human_bytes() {
  local bytes="$1"
  if alloy_have_cmd numfmt; then
    numfmt --to=iec --suffix=B "$bytes" 2>/dev/null || echo "${bytes}B"
  else
    echo "${bytes}B"
  fi
}

alloy_export_node_defaults() {
  export NODE_OPTIONS="${NODE_OPTIONS:-$NODE_OPTIONS_DEFAULT}"
}

alloy_web_dir_for() {
  local worktree_path="$1"
  printf '%s/%s' "$worktree_path" "$ALLOY_WEB_DIR"
}
