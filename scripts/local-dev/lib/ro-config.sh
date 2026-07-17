#!/usr/bin/env bash
# lib/ro-config.sh — Non-executing configuration & metadata reader for the
# alloy-ro Autonomous Inspection Surface.
#
# CONSTITUTION (Autonomous Inspection Surface V1, requirement 4):
#   The read-only surface MUST NOT `source` user-writable configuration or
#   runtime `.env` files as shell code. This module parses KEY=VALUE lines with
#   a fail-closed allowlist and refuses any value that carries shell-active
#   syntax. Nothing here executes file contents, writes files, or creates
#   directories.
#
# Threat model: `~/.config/alloy-dev/config` and `<runtime>/metadata/*.env` are
# user-writable. A hostile value such as
#     ALLOY_REPO="$(rm -rf ~)"
# must never execute. Because this reader never sources, and rejects any value
# containing `$(`, backticks, or shell metacharacters, such a value is inert:
# it is refused and the caller falls back to a safe default.
#
# shellcheck shell=bash

# --- primitive: last KEY=VALUE on a file, quote-stripped, NO expansion --------
#
# Prints the raw right-hand side of the last `KEY=...` (optionally `export KEY=`)
# assignment in <file>. Strips one matching surrounding quote pair. Drops an
# inline `# comment` only for unquoted values. Returns 1 when the key is absent
# or the file is unreadable. Performs no expansion and no validation — callers
# must validate before use.
alloy_ro_kv_raw() {
  local file="$1" key="$2"
  [[ -r "$file" ]] || return 1
  local line rhs found=1
  # Read the whole file; last assignment wins (matches shell precedence without
  # executing anything).
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      *"$key"=*) : ;;
      *) continue ;;
    esac
    # Require the key at the start (allowing leading spaces and an `export`).
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?"$key"=(.*)$ ]]; then
      rhs="${BASH_REMATCH[2]}"
    else
      continue
    fi
    # Strip one surrounding matching quote pair; otherwise take up to whitespace
    # or an inline comment.
    case "$rhs" in
      \"*)
        rhs="${rhs#\"}"
        rhs="${rhs%%\"*}"
        ;;
      \'*)
        rhs="${rhs#\'}"
        rhs="${rhs%%\'*}"
        ;;
      *)
        rhs="${rhs%%#*}"
        rhs="${rhs%%[[:space:]]*}"
        ;;
    esac
    found=0
  done <"$file"
  [[ "$found" -eq 0 ]] || return 1
  printf '%s' "$rhs"
}

# --- guard: reject shell-active values ---------------------------------------
#
# Returns 0 only when <value> is a safe literal: no command substitution, no
# backticks, no redirection/pipe/list operators, no backslash escapes, no
# newlines, and no residual `$` (all legitimate expansions are resolved before
# this check). Fail closed: anything unexpected is unsafe.
alloy_ro_is_safe_value() {
  local v="$1"
  # Command substitution / process substitution.
  case "$v" in
    *'$('*|*'`'*|*'<('*|*'>('*) return 1 ;;
  esac
  # Shell metacharacters that could chain or redirect commands.
  case "$v" in
    *';'*|*'|'*|*'&'*|*'>'*|*'<'*|*'\'*) return 1 ;;
  esac
  # Any residual dollar means an expansion we did not whitelist — refuse.
  case "$v" in
    *'$'*) return 1 ;;
  esac
  # Embedded newline (parameter capture can carry one).
  case "$v" in
    *$'\n'*) return 1 ;;
  esac
  return 0
}

# --- controlled expansion for config values ----------------------------------
#
# Expands ONLY a fixed whitelist of path variables ($HOME and the already
# resolved ALLOY_RO_* bases). Refuses (returns 1) if the value carries command
# substitution/backticks, or if any `$` remains after whitelisted expansion.
# Prints the resolved value on success.
alloy_ro_expand_value() {
  local v="$1"
  # Reject the truly dangerous forms up front, before any substitution.
  case "$v" in
    *'$('*|*'`'*|*'<('*|*'>('*) return 1 ;;
    *';'*|*'|'*|*'&'*|*'\'*) return 1 ;;
  esac
  # Whitelisted, brace and bare forms. Longer names first so ${ALLOY_REPO} is
  # handled before a hypothetical ${ALLOY}.
  v="${v//\$\{HOME\}/$HOME}";                          v="${v//\$HOME/$HOME}"
  v="${v//\$\{ALLOY_REPO\}/${ALLOY_RO_REPO:-}}";       v="${v//\$ALLOY_REPO/${ALLOY_RO_REPO:-}}"
  v="${v//\$\{ALLOY_RUNTIME_ROOT\}/${ALLOY_RO_RUNTIME_ROOT:-}}"
  v="${v//\$ALLOY_RUNTIME_ROOT/${ALLOY_RO_RUNTIME_ROOT:-}}"
  v="${v//\$\{ALLOY_WORKTREE_ROOT\}/${ALLOY_RO_WORKTREE_ROOT:-}}"
  v="${v//\$ALLOY_WORKTREE_ROOT/${ALLOY_RO_WORKTREE_ROOT:-}}"
  v="${v//\$\{ALLOY_CONFIG_DIR\}/${ALLOY_RO_CONFIG_DIR:-}}"
  v="${v//\$ALLOY_CONFIG_DIR/${ALLOY_RO_CONFIG_DIR:-}}"
  # Anything still carrying `$` (or a metacharacter) is unsafe.
  alloy_ro_is_safe_value "$v" || return 1
  printf '%s' "$v"
}

# --- config file resolution (paths only; never sourced) ----------------------
#
# Sets ALLOY_RO_CFG_EXAMPLE (repo-trusted) and ALLOY_RO_CFG_USER (user-writable).
alloy_ro_config_files() {
  ALLOY_RO_CFG_EXAMPLE="${ALLOY_LOCAL_DEV_ROOT}/alloy-config.example"
  ALLOY_RO_CFG_USER="${ALLOY_CONFIG_FILE:-$HOME/.config/alloy-dev/config}"
}

# Fetch a config key with example→user precedence (user wins), validated and
# expanded. Prints the resolved value, or nothing (return 1) when unset/unsafe.
alloy_ro_config_get() {
  local key="$1" raw="" val="" cand="" got=1
  local f
  for f in "$ALLOY_RO_CFG_EXAMPLE" "$ALLOY_RO_CFG_USER"; do
    [[ -r "$f" ]] || continue
    if raw="$(alloy_ro_kv_raw "$f" "$key")"; then
      # A later file (user config) overrides an earlier one — but only when its
      # value is safe. A refused value must NOT erase an earlier accepted one.
      if cand="$(alloy_ro_expand_value "$raw")"; then
        val="$cand"
        got=0
      else
        # Unsafe value: fail closed for this key; keep any earlier safe value.
        printf 'alloy-ro: refused unsafe value for %s in %s (ignored; using default)\n' \
          "$key" "$f" >&2
      fi
    fi
  done
  [[ "$got" -eq 0 ]] || return 1
  printf '%s' "$val"
}

# Resolve the minimal base configuration the surface needs, in dependency order,
# into ALLOY_RO_* globals with safe defaults. Idempotent; never writes anything.
alloy_ro_config_init() {
  [[ "${ALLOY_RO_CONFIG_READY:-0}" == "1" ]] && return 0
  alloy_ro_config_files
  ALLOY_RO_CONFIG_REJECTED=""

  # Order matters: REPO/RUNTIME_ROOT/WORKTREE_ROOT feed later expansions.
  ALLOY_RO_REPO="$(alloy_ro_config_get ALLOY_REPO || true)"
  ALLOY_RO_RUNTIME_ROOT="$(alloy_ro_config_get ALLOY_RUNTIME_ROOT || true)"
  [[ -n "$ALLOY_RO_RUNTIME_ROOT" ]] || ALLOY_RO_RUNTIME_ROOT="$HOME/.local/state/alloy-dev"
  ALLOY_RO_WORKTREE_ROOT="$(alloy_ro_config_get ALLOY_WORKTREE_ROOT || true)"
  [[ -n "$ALLOY_RO_WORKTREE_ROOT" ]] || ALLOY_RO_WORKTREE_ROOT="$HOME/Code/alloy-worktrees"
  ALLOY_RO_CONFIG_DIR="$(alloy_ro_config_get ALLOY_CONFIG_DIR || true)"
  [[ -n "$ALLOY_RO_CONFIG_DIR" ]] || ALLOY_RO_CONFIG_DIR="$HOME/.config/alloy-dev"

  ALLOY_RO_BASE_REMOTE="$(alloy_ro_config_get ALLOY_BASE_REMOTE || true)"
  [[ -n "$ALLOY_RO_BASE_REMOTE" ]] || ALLOY_RO_BASE_REMOTE="origin"
  ALLOY_RO_BASE_BRANCH="$(alloy_ro_config_get ALLOY_BASE_BRANCH || true)"
  [[ -n "$ALLOY_RO_BASE_BRANCH" ]] || ALLOY_RO_BASE_BRANCH="staging"
  ALLOY_RO_WEB_DIR="$(alloy_ro_config_get ALLOY_WEB_DIR || true)"
  [[ -n "$ALLOY_RO_WEB_DIR" ]] || ALLOY_RO_WEB_DIR="web"

  ALLOY_RO_FIRST_AGENT_PORT="$(alloy_ro_config_get ALLOY_FIRST_AGENT_PORT || true)"
  [[ "$ALLOY_RO_FIRST_AGENT_PORT" =~ ^[0-9]+$ ]] || ALLOY_RO_FIRST_AGENT_PORT="3011"
  ALLOY_RO_CANONICAL_PORT="$(alloy_ro_config_get ALLOY_CANONICAL_PORT || true)"
  [[ "$ALLOY_RO_CANONICAL_PORT" =~ ^[0-9]+$ ]] || ALLOY_RO_CANONICAL_PORT="3000"
  ALLOY_RO_MAX_AGENTS="$(alloy_ro_config_get ALLOY_MAX_AGENTS || true)"
  [[ "$ALLOY_RO_MAX_AGENTS" =~ ^[0-9]+$ ]] || ALLOY_RO_MAX_AGENTS="6"

  # Derived runtime path NAMES (never created here).
  ALLOY_RO_METADATA_DIR="$ALLOY_RO_RUNTIME_ROOT/metadata"
  ALLOY_RO_PIDS_DIR="$ALLOY_RO_RUNTIME_ROOT/pids"
  ALLOY_RO_LOGS_DIR="$ALLOY_RO_RUNTIME_ROOT/logs"
  ALLOY_RO_LOCKS_DIR="$ALLOY_RO_RUNTIME_ROOT/locks"
  ALLOY_RO_AUTH_DIR="$ALLOY_RO_RUNTIME_ROOT/auth"
  ALLOY_RO_EVIDENCE_DIR="$ALLOY_RO_RUNTIME_ROOT/evidence"
  ALLOY_RO_BROWSER_PIDS_DIR="$ALLOY_RO_RUNTIME_ROOT/browser-pids"
  ALLOY_RO_INITIATIVES_DIR="$ALLOY_RO_RUNTIME_ROOT/initiatives"

  ALLOY_RO_CONFIG_READY=1
}

# Read a single field from a metadata `.env` file WITHOUT sourcing it. Metadata
# values are toolkit-written literals (paths, names, timestamps, integers); any
# non-literal value is refused (fail closed). Prints the value or returns 1.
alloy_ro_meta_get() {
  local file="$1" key="$2" raw=""
  raw="$(alloy_ro_kv_raw "$file" "$key")" || return 1
  if alloy_ro_is_safe_value "$raw"; then
    printf '%s' "$raw"
    return 0
  fi
  printf 'alloy-ro: refused unsafe metadata value for %s in %s (ignored)\n' \
    "$key" "$file" >&2
  return 1
}
