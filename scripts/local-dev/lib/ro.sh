#!/usr/bin/env bash
# lib/ro.sh — Inspection-runtime ADAPTER over the Shared Read Core.
#
# After the Shared Read Core extraction this file owns no read interpretation.
# It sources lib/read-core.sh (via ro-config.sh's include, and directly for
# standalone sourcing) and exposes the `alloy_ro_*` helper names the alloy-ro
# dispatcher uses, each delegating to the canonical `alloy_rc_*` implementation.
# The dirty helper maps the read core's three-state classification onto the
# dispatcher's clean|dirty view without re-deriving the ignore rule.
#
# shellcheck shell=bash

_ALLOY_RO_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/read-core.sh
source "${_ALLOY_RO_LIB_DIR}/read-core.sh"

ALLOY_RO_VERSION="$ALLOY_RC_VERSION"

# --- git (delegated) ---------------------------------------------------------
alloy_ro_git()             { alloy_rc_git "$@"; }
alloy_ro_is_git_worktree() { alloy_rc_is_git_worktree "$@"; }
alloy_ro_git_toplevel()    { alloy_rc_git_toplevel "$@"; }
alloy_ro_git_branch()      { alloy_rc_git_branch "$@"; }

# clean | dirty — maps the read core's clean|next-env-only|dirty classification.
alloy_ro_git_dirty() {
  local c
  c="$(alloy_rc_dirty_classification "$1" "${ALLOY_RO_WEB_DIR:-web}")"
  [[ "$c" == "dirty" ]] && printf 'dirty' || printf 'clean'
}

alloy_ro_git_ahead_behind() {
  alloy_rc_ahead_behind "$1" "${ALLOY_RO_BASE_REMOTE}/${ALLOY_RO_BASE_BRANCH}"
}

alloy_ro_base_ref_sha() {
  alloy_rc_base_ref_sha "${ALLOY_RO_REPO:-}" "${ALLOY_RO_BASE_REMOTE}/${ALLOY_RO_BASE_BRANCH}"
}

# --- process / port (delegated) ----------------------------------------------
alloy_ro_port_pid()  { alloy_rc_port_pid "$@"; }
alloy_ro_pid_alive() { alloy_rc_pid_alive "$@"; }

# --- metadata (delegated; dispatcher globals bound here) ---------------------
alloy_ro_list_metadata() { alloy_rc_list_metadata "${ALLOY_RO_METADATA_DIR}"; }
alloy_ro_metadata_path() { alloy_rc_metadata_path "${ALLOY_RO_METADATA_DIR}" "$1"; }

alloy_ro_resolve_target() {
  local target="$1"
  if [[ "$target" =~ ^[0-9]+$ ]]; then
    alloy_rc_resolve_slot "${ALLOY_RO_METADATA_DIR}" "$target"; return $?
  fi
  [[ -f "$(alloy_rc_metadata_path "${ALLOY_RO_METADATA_DIR}" "$target")" ]] || return 1
  printf '%s' "$target"
}

# --- formatting (delegated) --------------------------------------------------
alloy_ro_file_bytes()  { alloy_rc_file_bytes "$@"; }
alloy_ro_file_mtime()  { alloy_rc_file_mtime "$@"; }
alloy_ro_human_bytes() { alloy_rc_human_bytes "$@"; }

# --- JSON (delegated) --------------------------------------------------------
alloy_ro_json_escape() { alloy_rc_json_escape "$@"; }
alloy_ro_json_kv()     { alloy_rc_json_kv "$@"; }
alloy_ro_json_kv_raw() { alloy_rc_json_kv_raw "$@"; }
