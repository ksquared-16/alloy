#!/usr/bin/env bash
# Atomic directory-based validation lock (macOS-friendly; no flock).
# shellcheck shell=bash

alloy_validate_owner_file() {
  printf '%s/owner.env' "$ALLOY_VALIDATE_LOCK_DIR"
}

alloy_validate_lock_held() {
  [[ -d "$ALLOY_VALIDATE_LOCK_DIR" ]]
}

alloy_validate_print_owner() {
  local owner
  owner="$(alloy_validate_owner_file)"
  if [[ -f "$owner" ]]; then
    # shellcheck disable=SC1090
    source "$owner"
    printf 'worktree=%s kind=%s pid=%s started=%s command=%s\n' \
      "${ALLOY_VALIDATE_WORKTREE:-?}" \
      "${ALLOY_VALIDATE_KIND:-?}" \
      "${ALLOY_VALIDATE_PID:-?}" \
      "${ALLOY_VALIDATE_STARTED:-?}" \
      "${ALLOY_VALIDATE_COMMAND:-?}"
  else
    printf 'lock directory exists but owner.env is missing: %s\n' "$ALLOY_VALIDATE_LOCK_DIR"
  fi
}

alloy_validate_lock_stale() {
  local owner pid
  owner="$(alloy_validate_owner_file)"
  [[ -f "$owner" ]] || return 0
  # shellcheck disable=SC1090
  source "$owner"
  pid="${ALLOY_VALIDATE_PID:-}"
  if [[ -z "$pid" ]] || ! alloy_pid_alive "$pid"; then
    return 0
  fi
  return 1
}

alloy_validate_release_lock() {
  if [[ -d "$ALLOY_VALIDATE_LOCK_DIR" ]]; then
    rm -rf "$ALLOY_VALIDATE_LOCK_DIR"
  fi
}

alloy_validate_acquire_lock() {
  local worktree="$1"
  local kind="$2"
  local command="$3"
  local poll="${ALLOY_VALIDATE_POLL_SECONDS:-5}"
  local owner

  alloy_ensure_runtime_dirs

  while true; do
    if mkdir "$ALLOY_VALIDATE_LOCK_DIR" 2>/dev/null; then
      owner="$(alloy_validate_owner_file)"
      {
        printf 'ALLOY_VALIDATE_WORKTREE="%s"\n' "$worktree"
        printf 'ALLOY_VALIDATE_KIND="%s"\n' "$kind"
        printf 'ALLOY_VALIDATE_PID="%s"\n' "$$"
        printf 'ALLOY_VALIDATE_STARTED="%s"\n' "$(alloy_iso_now)"
        printf 'ALLOY_VALIDATE_COMMAND=%q\n' "$command"
      } >"$owner"

      # shellcheck disable=SC2064
      trap 'alloy_validate_release_lock' EXIT INT TERM HUP
      return 0
    fi

    if alloy_validate_lock_held; then
      if alloy_validate_lock_stale; then
        alloy_warn "removing stale validation lock (owner PID dead)"
        alloy_validate_release_lock
        continue
      fi
      alloy_info "validation lock held:"
      alloy_validate_print_owner
      alloy_info "waiting ${poll}s (Ctrl-C to exit without taking the lock)..."
      sleep "$poll" || exit 130
    fi
  done
}
