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

# Production default runtime root (path name only — never secrets).
alloy_default_runtime_root() {
  printf '%s/.local/state/alloy-dev' "$HOME"
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
  ALLOY_AUTH_DIR="${ALLOY_RUNTIME_ROOT}/auth"
  ALLOY_BROWSER_PIDS_DIR="${ALLOY_RUNTIME_ROOT}/browser-pids"
  ALLOY_BROWSER_PROFILES_DIR="${ALLOY_RUNTIME_ROOT}/browser-profiles"
  ALLOY_EVIDENCE_DIR="${ALLOY_RUNTIME_ROOT}/evidence"
  ALLOY_INITIATIVES_DIR="${ALLOY_RUNTIME_ROOT}/initiatives"
  # Export so nested env/subprocess invocations cannot fall back to production.
  export ALLOY_RUNTIME_ROOT ALLOY_METADATA_DIR ALLOY_PIDS_DIR ALLOY_LOGS_DIR \
    ALLOY_LOCKS_DIR ALLOY_VALIDATE_LOCK_DIR ALLOY_AUTH_DIR \
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
  export ALLOY_FIRST_AGENT_PORT ALLOY_MAX_AGENTS
}

alloy_ensure_runtime_dirs() {
  alloy_resolve_runtime_paths "${ALLOY_RUNTIME_ROOT:-}"
  mkdir -p \
    "$ALLOY_METADATA_DIR" \
    "$ALLOY_PIDS_DIR" \
    "$ALLOY_LOGS_DIR" \
    "$ALLOY_LOCKS_DIR"
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
  local pid
  if pid="$(alloy_port_listener_pid "$port" 2>/dev/null)"; then
    if [[ -n "$context" ]]; then
      alloy_die "port $port is already in use by PID $pid ($context). Refusing to choose a different port."
    fi
    alloy_die "port $port is already in use by PID $pid. Refusing to choose a different port."
  fi
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

# Filtered porcelain (ignores agent marker files). stdout only.
alloy_worktree_dirty_porcelain() {
  local path="$1"
  local out
  out="$(alloy_git "$path" status --porcelain 2>/dev/null || true)"
  printf '%s\n' "$out" | grep -vE '^\?\? \.env\.local\.agent$' || true
}

# stdout: clean | next-env-only | dirty
# next-env-only: sole dirty path is ALLOY_WEB_DIR/next-env.d.ts (Next.js dev regeneration).
alloy_worktree_dirty_classification() {
  local path="$1"
  local web_rel="${ALLOY_WEB_DIR:-web}/next-env.d.ts"
  local out line file_path
  out="$(alloy_worktree_dirty_porcelain "$path")"
  if [[ -z "$out" ]]; then
    printf 'clean'
    return
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    file_path="${line:3}"
    if [[ "$file_path" == "$web_rel" ]]; then
      continue
    fi
    printf 'dirty'
    return
  done <<<"$out"
  printf 'next-env-only'
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

# Raw byte size of a regular file (BSD stat -f %z, GNU stat -c %s). Never reads contents.
alloy_file_byte_size() {
  local path="$1"
  local bytes=""
  [[ -f "$path" ]] || return 1
  bytes="$(stat -f '%z' "$path" 2>/dev/null || stat -c '%s' "$path" 2>/dev/null || true)"
  [[ -n "$bytes" ]] || return 1
  printf '%s' "$bytes"
}

alloy_human_bytes() {
  local bytes="$1"
  [[ "$bytes" =~ ^[0-9]+$ ]] || return 1
  if alloy_have_cmd numfmt; then
    numfmt --to=iec-i --suffix=B "$bytes" 2>/dev/null && return 0
  fi
  # Portable fallback when numfmt is unavailable (common on macOS).
  awk -v b="$bytes" 'BEGIN {
    split("B KB MB GB TB", u, " ");
    i = 1; v = b + 0;
    while (v >= 1024 && i < 5) { v /= 1024; i++ }
    if (i == 1) printf "%d%s\n", v, u[i];
    else printf "%.1f%s\n", v, u[i];
  }'
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

alloy_export_node_defaults() {
  export NODE_OPTIONS="${NODE_OPTIONS:-$NODE_OPTIONS_DEFAULT}"
}

alloy_web_dir_for() {
  local worktree_path="$1"
  printf '%s/%s' "$worktree_path" "$ALLOY_WEB_DIR"
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
