#!/usr/bin/env bash
# lib/ro-config.sh — Inspection-runtime ADAPTER over the Shared Read Core.
#
# After the Shared Read Core extraction, this file owns no read interpretation.
# It sources lib/read-core.sh and exposes the `alloy_ro_*` config names the
# alloy-ro dispatcher uses, each delegating to the canonical `alloy_rc_*`
# implementation. The ALLOY_RO_* globals are mirrors of the ALLOY_RC_* values so
# the dispatcher is unchanged. One implementation (read-core), many interfaces.
#
# shellcheck shell=bash

_ALLOY_RO_CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/read-core.sh
source "${_ALLOY_RO_CONFIG_DIR}/read-core.sh"

# Thin delegations (kept for the dispatcher and unit tests).
alloy_ro_kv_raw()        { alloy_rc_kv_raw "$@"; }
alloy_ro_is_safe_value() { alloy_rc_is_safe_value "$@"; }
alloy_ro_expand_value()  { alloy_rc_expand_value "$@"; }
alloy_ro_config_get()    { alloy_rc_config_get "$@"; }
alloy_ro_meta_get()      { alloy_rc_meta_get "$@"; }

# Resolve config into the read core, then mirror ALLOY_RC_* → ALLOY_RO_* so the
# alloy-ro dispatcher keeps its existing variable names.
alloy_ro_config_init() {
  alloy_rc_config_init
  ALLOY_RO_CFG_EXAMPLE="$ALLOY_RC_CFG_EXAMPLE"
  ALLOY_RO_CFG_USER="$ALLOY_RC_CFG_USER"
  ALLOY_RO_REPO="$ALLOY_RC_REPO"
  ALLOY_RO_RUNTIME_ROOT="$ALLOY_RC_RUNTIME_ROOT"
  ALLOY_RO_WORKTREE_ROOT="$ALLOY_RC_WORKTREE_ROOT"
  ALLOY_RO_CONFIG_DIR="$ALLOY_RC_CONFIG_DIR"
  ALLOY_RO_BASE_REMOTE="$ALLOY_RC_BASE_REMOTE"
  ALLOY_RO_BASE_BRANCH="$ALLOY_RC_BASE_BRANCH"
  ALLOY_RO_WEB_DIR="$ALLOY_RC_WEB_DIR"
  ALLOY_RO_FIRST_AGENT_PORT="$ALLOY_RC_FIRST_AGENT_PORT"
  ALLOY_RO_CANONICAL_PORT="$ALLOY_RC_CANONICAL_PORT"
  ALLOY_RO_MAX_AGENTS="$ALLOY_RC_MAX_AGENTS"
  ALLOY_RO_METADATA_DIR="$ALLOY_RC_METADATA_DIR"
  ALLOY_RO_PIDS_DIR="$ALLOY_RC_PIDS_DIR"
  ALLOY_RO_LOGS_DIR="$ALLOY_RC_LOGS_DIR"
  ALLOY_RO_LOCKS_DIR="$ALLOY_RC_LOCKS_DIR"
  ALLOY_RO_AUTH_DIR="$ALLOY_RC_AUTH_DIR"
  ALLOY_RO_EVIDENCE_DIR="$ALLOY_RC_EVIDENCE_DIR"
  ALLOY_RO_BROWSER_PIDS_DIR="$ALLOY_RC_BROWSER_PIDS_DIR"
  ALLOY_RO_INITIATIVES_DIR="$ALLOY_RC_INITIATIVES_DIR"
}
