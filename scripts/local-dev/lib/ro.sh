#!/usr/bin/env bash
# lib/ro.sh — Read-only helpers for the alloy-ro Autonomous Inspection Surface.
#
# CONSTITUTION: nothing in this file may write files, create directories, modify
# git state, fetch from the network, signal processes, or execute user-supplied
# strings. It performs read-only inspection only:
#   - git: through alloy_ro_git, which asserts a read-only subcommand allowlist;
#   - processes: `ps`/`lsof` inspection (never `kill`);
#   - filesystem: globbing and `stat` (never `mkdir`/`rm`/redirection to files).
#
# shellcheck shell=bash

ALLOY_RO_VERSION="1.0.0"

# --- read-only git ------------------------------------------------------------
#
# Runs `git -C <dir> <subcommand> ...` ONLY for a fixed allowlist of read-only
# subcommands. Any other subcommand is a programming error and aborts — this is
# what makes "alloy-ro cannot mutate git" structurally true rather than merely
# intended. Optional locks and terminal prompts are disabled so a read can never
# block, take a lock, or reach the network.
alloy_ro_git() {
  local dir="$1" sub="$2"
  shift 2
  case "$sub" in
    rev-parse|status|rev-list|symbolic-ref|show-ref|for-each-ref|cat-file|describe)
      : ;;
    remote)
      # Only the read-only `remote get-url` form.
      [[ "${1:-}" == "get-url" ]] || {
        printf 'alloy-ro: internal: refused non-read-only git remote form\n' >&2
        return 97
      }
      ;;
    config)
      # Only `config --get`.
      [[ "${1:-}" == "--get" ]] || {
        printf 'alloy-ro: internal: refused non-read-only git config form\n' >&2
        return 97
      }
      ;;
    *)
      printf 'alloy-ro: internal: refused non-allowlisted git subcommand: %s\n' "$sub" >&2
      return 97
      ;;
  esac
  GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 \
    git --no-optional-locks -C "$dir" "$sub" "$@" 2>/dev/null
}

# Directory that is a git work tree? (read-only)
alloy_ro_is_git_worktree() {
  local dir="$1"
  [[ -d "$dir" ]] || return 1
  alloy_ro_git "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

alloy_ro_git_toplevel() {
  local dir="$1"
  alloy_ro_git "$dir" rev-parse --show-toplevel 2>/dev/null
}

alloy_ro_git_branch() {
  local dir="$1"
  alloy_ro_git "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || printf '?'
}

# clean | dirty  (agent env marker and Next-generated next-env.d.ts ignored,
# matching the toolkit's own dirty semantics). Never writes.
alloy_ro_git_dirty() {
  local dir="$1" web_rel="${ALLOY_RO_WEB_DIR:-web}/next-env.d.ts"
  local out line path
  out="$(alloy_ro_git "$dir" status --porcelain 2>/dev/null || true)"
  [[ -n "$out" ]] || { printf 'clean'; return; }
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    path="${line:3}"
    [[ "$path" == ".env.local.agent" ]] && continue
    [[ "$path" == "$web_rel" ]] && continue
    printf 'dirty'; return
  done <<<"$out"
  printf 'clean'
}

# Ahead/behind HEAD vs the configured base ref, using ONLY the locally cached
# ref (never fetches). Prints "<ahead>/<behind>" or "?/?".
alloy_ro_git_ahead_behind() {
  local dir="$1" base="${ALLOY_RO_BASE_REMOTE}/${ALLOY_RO_BASE_BRANCH}"
  local ahead behind
  ahead="$(alloy_ro_git "$dir" rev-list --count "${base}..HEAD" 2>/dev/null || echo '?')"
  behind="$(alloy_ro_git "$dir" rev-list --count "HEAD..${base}" 2>/dev/null || echo '?')"
  printf '%s/%s' "${ahead:-?}" "${behind:-?}"
}

alloy_ro_base_ref_sha() {
  local dir="${ALLOY_RO_REPO:-}"
  [[ -n "$dir" && -d "$dir/.git" ]] || { printf 'unknown'; return; }
  alloy_ro_git "$dir" rev-parse --short "${ALLOY_RO_BASE_REMOTE}/${ALLOY_RO_BASE_BRANCH}" 2>/dev/null \
    || printf 'unknown'
}

# --- process / port inspection (read-only) -----------------------------------
#
# PID listening on a TCP port, or empty. Uses lsof read-only; never signals.
alloy_ro_port_pid() {
  local port="$1" pid=""
  command -v lsof >/dev/null 2>&1 || return 1
  pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}' || true)"
  [[ -n "$pid" ]] || return 1
  printf '%s' "$pid"
}

alloy_ro_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null   # signal 0: existence check only, delivers nothing
}

# --- filesystem inspection (read-only) ---------------------------------------
#
# List managed worktree metadata basenames (without ".env"). If the metadata
# directory does not exist, prints nothing and returns 0 — a read command must
# treat missing runtime state as "no state", never create it.
alloy_ro_list_metadata() {
  local dir="${ALLOY_RO_METADATA_DIR}" f base
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob
  for f in "$dir"/*.env; do
    base="$(basename "$f" .env)"
    printf '%s\n' "$base"
  done
  shopt -u nullglob
}

alloy_ro_metadata_path() {
  printf '%s/%s.env' "${ALLOY_RO_METADATA_DIR}" "$1"
}

# Resolve a target (slot number or worktree name) to a metadata basename.
# Prints the name and returns 0, or returns 1 (not found). Read-only.
alloy_ro_resolve_target() {
  local target="$1" name meta slot
  if [[ "$target" =~ ^[0-9]+$ ]]; then
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      slot="$(alloy_ro_meta_get "$(alloy_ro_metadata_path "$name")" ALLOY_WORKTREE_SLOT 2>/dev/null || true)"
      if [[ "$slot" == "$target" ]]; then
        printf '%s' "$name"; return 0
      fi
    done < <(alloy_ro_list_metadata)
    return 1
  fi
  [[ -f "$(alloy_ro_metadata_path "$target")" ]] || return 1
  printf '%s' "$target"
}

# File byte size (BSD/GNU stat); never reads contents. Prints integer or "".
alloy_ro_file_bytes() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  stat -f '%z' "$path" 2>/dev/null || stat -c '%s' "$path" 2>/dev/null || return 1
}

alloy_ro_file_mtime() {
  local path="$1"
  stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%SZ' "$path" 2>/dev/null \
    || stat -c '%y' "$path" 2>/dev/null | cut -c1-19 \
    || printf 'unknown'
}

alloy_ro_human_bytes() {
  local b="$1"
  [[ "$b" =~ ^[0-9]+$ ]] || { printf 'unknown'; return; }
  awk -v b="$b" 'BEGIN{split("B KB MB GB TB",u," ");i=1;v=b+0;
    while(v>=1024&&i<5){v/=1024;i++} if(i==1)printf "%d%s",v,u[i]; else printf "%.1f%s",v,u[i]}'
}

# --- JSON emission (read-only string building) -------------------------------
#
# Escape a scalar for embedding in a JSON string literal.
alloy_ro_json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# Emit a JSON "key":"value" pair (string). Caller manages commas/braces.
alloy_ro_json_kv() {
  printf '"%s":"%s"' "$(alloy_ro_json_escape "$1")" "$(alloy_ro_json_escape "$2")"
}

# Emit a JSON "key":<raw> pair (number/bool/pre-formed). Caller manages commas.
alloy_ro_json_kv_raw() {
  printf '"%s":%s' "$(alloy_ro_json_escape "$1")" "$2"
}
