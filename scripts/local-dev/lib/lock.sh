#!/usr/bin/env bash
# Host-wide validation lease (macOS-friendly; no flock).
# One heavy_validate lease at a time across all worktrees.
# shellcheck shell=bash

# Status reporting needs the capability/detection helpers. Several entry points (alloy-audit,
# alloy-health, install.sh) source lock.sh without them, so pull them in idempotently rather than
# making every caller remember.
if ! declare -f alloy_detect_unbrokered_heavy >/dev/null 2>&1; then
  _alloy_lock_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=validate-caps.sh
  [[ -f "${_alloy_lock_lib_dir}/validate-caps.sh" ]] && source "${_alloy_lock_lib_dir}/validate-caps.sh"
fi

alloy_validate_owner_file() {
  printf '%s/owner.env' "$ALLOY_VALIDATE_LOCK_DIR"
}

# Records the process-group id of the currently executing owned job, so an abandoned tree can be
# reaped later (see lib/validate-caps.sh).
alloy_validate_pgid_file() {
  printf '%s/validate.pgid' "${ALLOY_RUNTIME_DIR:-$HOME/.local/state/alloy-dev}"
}

alloy_validate_heartbeat_file() {
  printf '%s/heartbeat' "$ALLOY_VALIDATE_LOCK_DIR"
}

alloy_validate_queue_dir() {
  printf '%s' "${ALLOY_VALIDATE_QUEUE_DIR:-${ALLOY_LOCKS_DIR}/validate.queue}"
}

alloy_validate_results_dir() {
  printf '%s' "${ALLOY_VALIDATE_RESULTS_DIR:-${ALLOY_RUNTIME_ROOT}/validate-results}"
}

alloy_validate_lock_held() {
  [[ -d "$ALLOY_VALIDATE_LOCK_DIR" ]]
}

alloy_validate_now_epoch() {
  date +%s
}

# Microsecond-ish sort key for FIFO (macOS-safe; no %N).
alloy_validate_queue_key() {
  python3 -c 'import time; print("%.0f" % (time.time() * 1e6))' 2>/dev/null \
    || printf '%s%05d' "$(date +%s)" "$RANDOM"
}

alloy_validate_print_owner() {
  local owner
  owner="$(alloy_validate_owner_file)"
  if [[ -f "$owner" ]]; then
    # shellcheck disable=SC1090
    source "$owner"
    printf 'lease worktree=%s slot=%s branch=%s commit=%s kind=%s pid=%s started=%s heartbeat=%s request_id=%s command=%s\n' \
      "${ALLOY_VALIDATE_WORKTREE:-?}" \
      "${ALLOY_VALIDATE_SLOT:-?}" \
      "${ALLOY_VALIDATE_BRANCH:-?}" \
      "${ALLOY_VALIDATE_COMMIT:-?}" \
      "${ALLOY_VALIDATE_KIND:-?}" \
      "${ALLOY_VALIDATE_PID:-?}" \
      "${ALLOY_VALIDATE_STARTED:-?}" \
      "${ALLOY_VALIDATE_HEARTBEAT:-?}" \
      "${ALLOY_VALIDATE_REQUEST_ID:-?}" \
      "${ALLOY_VALIDATE_COMMAND:-?}"
  else
    printf 'lock directory exists but owner.env is missing: %s\n' "$ALLOY_VALIDATE_LOCK_DIR"
  fi
}

# Stale when holder PID is dead OR heartbeat older than ALLOY_VALIDATE_HEARTBEAT_STALE_SECONDS.
alloy_validate_lock_stale() {
  local owner pid hb_file hb_epoch now max_age
  owner="$(alloy_validate_owner_file)"
  [[ -f "$owner" ]] || return 0
  # shellcheck disable=SC1090
  source "$owner"
  pid="${ALLOY_VALIDATE_PID:-}"
  if [[ -z "$pid" ]] || ! alloy_pid_alive "$pid"; then
    return 0
  fi
  max_age="${ALLOY_VALIDATE_HEARTBEAT_STALE_SECONDS:-90}"
  hb_file="$(alloy_validate_heartbeat_file)"
  if [[ -f "$hb_file" ]]; then
    hb_epoch="$(tr -d '[:space:]' <"$hb_file" 2>/dev/null || true)"
    now="$(alloy_validate_now_epoch)"
    if [[ "$hb_epoch" =~ ^[0-9]+$ ]] && (( now - hb_epoch > max_age )); then
      return 0
    fi
  fi
  # Legacy leases without heartbeat: only PID liveness (above) applies.
  return 1
}

alloy_validate_release_lock() {
  if [[ -d "$ALLOY_VALIDATE_LOCK_DIR" ]]; then
    rm -rf "$ALLOY_VALIDATE_LOCK_DIR"
  fi
}

alloy_validate_queue_register() {
  local request_id="$1"
  local worktree="$2"
  local kind="$3"
  local qdir entry
  qdir="$(alloy_validate_queue_dir)"
  mkdir -p "$qdir"
  entry="${qdir}/$(alloy_validate_queue_key)_${request_id}"
  {
    printf 'ALLOY_VALIDATE_REQUEST_ID="%s"\n' "$request_id"
    printf 'ALLOY_VALIDATE_WORKTREE="%s"\n' "$worktree"
    printf 'ALLOY_VALIDATE_KIND="%s"\n' "$kind"
    printf 'ALLOY_VALIDATE_PID="%s"\n' "$$"
    printf 'ALLOY_VALIDATE_QUEUED_AT="%s"\n' "$(alloy_iso_now)"
  } >"$entry"
  printf '%s\n' "$entry"
}

alloy_validate_queue_unregister() {
  local entry="${1:-}"
  [[ -n "$entry" && -f "$entry" ]] && rm -f "$entry"
}

alloy_validate_queue_position() {
  local entry="$1"
  local qdir base i=0
  qdir="$(alloy_validate_queue_dir)"
  [[ -d "$qdir" ]] || { printf '0\n'; return; }
  base="$(basename "$entry")"
  while IFS= read -r qname; do
    i=$((i + 1))
    if [[ "$qname" == "$base" ]]; then
      printf '%s\n' "$i"
      return
    fi
  done < <(ls -1 "$qdir" 2>/dev/null | sort)
  printf '0\n'
}

# True when this waiter is the oldest live queue entry.
alloy_validate_queue_is_head() {
  local entry="$1"
  local qdir first f pid
  qdir="$(alloy_validate_queue_dir)"
  [[ -d "$qdir" ]] || return 0
  while IFS= read -r qname; do
    f="${qdir}/${qname}"
    [[ -f "$f" ]] || continue
    # shellcheck disable=SC1090
    source "$f"
    pid="${ALLOY_VALIDATE_PID:-}"
    if [[ -z "$pid" ]] || ! alloy_pid_alive "$pid"; then
      rm -f "$f"
      continue
    fi
    first="$f"
    break
  done < <(ls -1 "$qdir" 2>/dev/null | sort)
  [[ -n "$first" && "$first" == "$entry" ]]
}

# A HEARTBEAT IS ONLY MEANINGFUL WHILE THE LEASE IS HELD.
#
# THE DEFECT THIS CLOSES. `alloy-validate` moved to the S5 broker as the single
# capacity authority and stopped taking the validate mutex — "One decision, not
# two" — but a heartbeat loop from the old mutex model survived it. Every
# fifteen seconds it wrote into a lock directory that is never created, and the
# shell printed
#
#   lock.sh: line 167: .../locks/validate.lock/heartbeat: No such file or directory
#
# into the middle of a real typecheck, which still exited 0. A writer with no
# reader, failing silently, in a mechanism whose entire job is to prove liveness.
#
# This now refuses rather than writing into nowhere, and says so through its
# exit status so a caller that DOES hold the lease can treat a failed heartbeat
# as the liveness failure it is.
# Does THIS process hold the validation lease right now?
#
# Not "is a lease held" — that was already answerable — but "is it mine". The
# heartbeat loop needs the second question, because refreshing someone else's
# heartbeat is how a dead lease keeps looking alive.
alloy_validate_lock_held_by_self() {
  local owner held_pid
  [[ -d "$ALLOY_VALIDATE_LOCK_DIR" ]] || return 1
  owner="$(alloy_validate_owner_file)"
  [[ -f "$owner" ]] || return 1
  held_pid="$(grep -m1 '^ALLOY_VALIDATE_PID=' "$owner" 2>/dev/null | cut -d'"' -f2)"
  [[ -n "$held_pid" && "$held_pid" == "$$" ]]
}

alloy_validate_write_heartbeat() {
  local now owner
  [[ -d "$ALLOY_VALIDATE_LOCK_DIR" ]] || return 1
  owner="$(alloy_validate_owner_file)"
  if [[ -f "$owner" ]]; then
    local held_pid
    held_pid="$(grep -m1 '^ALLOY_VALIDATE_PID=' "$owner" 2>/dev/null | cut -d'"' -f2)"
    # Only the holder refreshes the holder's heartbeat. Anyone else writing it
    # would keep a dead lease looking alive.
    [[ -z "$held_pid" || "$held_pid" == "$$" ]] || return 1
  fi
  now="$(alloy_validate_now_epoch)"
  printf '%s\n' "$now" >"$(alloy_validate_heartbeat_file)" || return 1
  # Refresh owner.env heartbeat field when possible.
  local owner
  owner="$(alloy_validate_owner_file)"
  if [[ -f "$owner" ]]; then
    if grep -q '^ALLOY_VALIDATE_HEARTBEAT=' "$owner" 2>/dev/null; then
      # macOS sed -i requires extension arg
      sed -i.bak "s/^ALLOY_VALIDATE_HEARTBEAT=.*/ALLOY_VALIDATE_HEARTBEAT=\"$(alloy_iso_now)\"/" "$owner" 2>/dev/null || true
      rm -f "${owner}.bak"
    fi
  fi
}

# Args: worktree kind command [slot branch commit request_id]
alloy_validate_acquire_lock() {
  local worktree="$1"
  local kind="$2"
  local command="$3"
  local slot="${4:-}"
  local branch="${5:-}"
  local commit="${6:-}"
  local request_id="${7:-}"
  local poll="${ALLOY_VALIDATE_POLL_SECONDS:-5}"
  local owner queue_entry pos

  alloy_ensure_runtime_dirs
  mkdir -p "$(alloy_validate_queue_dir)"

  if [[ -z "$request_id" ]]; then
    request_id="req_$(alloy_validate_queue_key)_$$"
  fi
  export ALLOY_VALIDATE_ACTIVE_REQUEST_ID="$request_id"

  # Reuse early registration from run_validate when present (FIFO barge fix).
  if [[ -n "${ALLOY_VALIDATE_QUEUE_ENTRY:-}" && -f "${ALLOY_VALIDATE_QUEUE_ENTRY}" ]]; then
    queue_entry="$ALLOY_VALIDATE_QUEUE_ENTRY"
  else
    queue_entry="$(alloy_validate_queue_register "$request_id" "$worktree" "$kind")"
  fi
  # shellcheck disable=SC2064
  trap 'alloy_validate_queue_unregister "'"$queue_entry"'"; alloy_validate_release_lock' EXIT INT TERM HUP

  while true; do
    # FIFO: only the head waiter may attempt the mkdir.
    if ! alloy_validate_queue_is_head "$queue_entry"; then
      pos="$(alloy_validate_queue_position "$queue_entry")"
      if alloy_validate_lock_held; then
        alloy_info "validation lease held (queue position ${pos}):"
        alloy_validate_print_owner
      else
        alloy_info "waiting for validation queue (position ${pos})..."
      fi
      sleep "$poll" || exit 130
      continue
    fi

    if mkdir "$ALLOY_VALIDATE_LOCK_DIR" 2>/dev/null; then
      owner="$(alloy_validate_owner_file)"
      {
        printf 'ALLOY_VALIDATE_WORKTREE="%s"\n' "$worktree"
        printf 'ALLOY_VALIDATE_SLOT="%s"\n' "$slot"
        printf 'ALLOY_VALIDATE_BRANCH="%s"\n' "$branch"
        printf 'ALLOY_VALIDATE_COMMIT="%s"\n' "$commit"
        printf 'ALLOY_VALIDATE_KIND="%s"\n' "$kind"
        printf 'ALLOY_VALIDATE_PID="%s"\n' "$$"
        printf 'ALLOY_VALIDATE_STARTED="%s"\n' "$(alloy_iso_now)"
        printf 'ALLOY_VALIDATE_HEARTBEAT="%s"\n' "$(alloy_iso_now)"
        printf 'ALLOY_VALIDATE_REQUEST_ID="%s"\n' "$request_id"
        printf 'ALLOY_VALIDATE_COMMAND=%q\n' "$command"
      } >"$owner"
      alloy_validate_write_heartbeat
      alloy_validate_queue_unregister "$queue_entry"
      queue_entry=""
      unset ALLOY_VALIDATE_QUEUE_ENTRY
      # Holder trap: release lease on exit (queue already cleared).
      # shellcheck disable=SC2064
      trap 'alloy_validate_release_lock' EXIT INT TERM HUP
      return 0
    fi

    if alloy_validate_lock_held; then
      if alloy_validate_lock_stale; then
        alloy_warn "removing stale validation lease (dead PID or heartbeat timeout)"
        alloy_validate_release_lock
        continue
      fi
      pos="$(alloy_validate_queue_position "$queue_entry")"
      alloy_info "validation lease held (queue position ${pos}):"
      alloy_validate_print_owner
      alloy_info "waiting ${poll}s (Ctrl-C to exit without taking the lease)..."
      sleep "$poll" || exit 130
    fi
  done
}

alloy_validate_status() {
  alloy_ensure_runtime_dirs
  # S5 IS THE CAPACITY AUTHORITY. Status reads the claim ledger, not a lease of
  # its own — `alloy-validate` no longer holds one. Reporting an unheld mutex as
  # "(idle)" while S5 held four claims would be exactly the misleading status
  # this section was rewritten to stop producing.
  echo "== governed validation (S5) =="
  local s5_dir s5_script
  s5_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd || true)"
  s5_script="${s5_dir}/vac-validate-status.mjs"
  if [[ -n "$s5_dir" && -f "$s5_script" ]] && command -v node >/dev/null 2>&1; then
    node "$s5_script" || echo "(S5 ledger unreadable)"
  else
    echo "(S5 ledger reader unavailable)"
  fi
  echo
  echo "== validation queue =="
  local qdir f
  qdir="$(alloy_validate_queue_dir)"
  if [[ ! -d "$qdir" ]] || [[ -z "$(ls -A "$qdir" 2>/dev/null)" ]]; then
    echo "(empty)"
    # NOT a bare `return`: the unbrokered/host report must run even with an empty queue — an empty
    # queue plus a saturated host is precisely the state that used to print a bare, misleading `idle`.
    alloy_validate_report_unbrokered
    return 0
  fi
  local i=0
  while IFS= read -r qname; do
    f="${qdir}/${qname}"
    [[ -f "$f" ]] || continue
    i=$((i + 1))
    # shellcheck disable=SC1090
    source "$f"
    printf '%s. worktree=%s kind=%s pid=%s request_id=%s queued=%s\n' \
      "$i" \
      "${ALLOY_VALIDATE_WORKTREE:-?}" \
      "${ALLOY_VALIDATE_KIND:-?}" \
      "${ALLOY_VALIDATE_PID:-?}" \
      "${ALLOY_VALIDATE_REQUEST_ID:-?}" \
      "${ALLOY_VALIDATE_QUEUED_AT:-?}"
  done < <(ls -1 "$qdir" 2>/dev/null | sort)
  alloy_validate_report_unbrokered
}

# Report heavy work running WITHOUT a lease, plus host load.
#
# `idle` used to be printed while the machine sat at load 100+ because raw `npx vitest` / `npx tsc`
# take no lease. A status that cannot see the contention it exists to manage is worse than no status:
# it actively tells the next worker the host is free.
alloy_validate_report_unbrokered() {
  local owned_pgid=""
  local pgf
  pgf="$(alloy_validate_pgid_file)"
  [[ -f "$pgf" ]] && owned_pgid="$(cat "$pgf" 2>/dev/null || true)"

  local rows
  rows="$(alloy_detect_unbrokered_heavy "$owned_pgid" 2>/dev/null || true)"

  echo
  echo "== host =="
  printf 'load average (1m): %s\n' "$(alloy_host_load_1m)"

  echo
  echo "== unbrokered heavy jobs =="
  if [[ -z "$rows" ]]; then
    echo "(none detected)"
    return 0
  fi
  local pid pgid etime cmd wt
  while IFS=$'\t' read -r pid pgid etime cmd; do
    [[ -n "$pid" ]] || continue
    wt="$(alloy_guess_worktree_for_cmd "$cmd")"
    printf 'pid=%s pgid=%s elapsed=%s worktree=%s\n  cmd=%s\n' \
      "$pid" "$pgid" "$etime" "${wt:-unknown}" "$cmd"
    # Adoption is deliberately NOT automatic: the broker did not spawn this tree, so it cannot prove
    # ownership, and killing another worker's valid work is a worse failure than contention.
    printf '  resolution: MANUAL — not broker-owned, cannot be safely adopted. Ask its worker to stop it, or: kill -TERM -%s\n' "$pgid"
  done <<< "$rows"
  echo
  echo "NOTE: these hold no lease. Heavy work must go through: vac run typecheck|typecheck:tests|build|test"
}

# Cancel a waiter by request_id, or INT the holder if it matches.
alloy_validate_cancel() {
  local request_id="${1:-}"
  [[ -n "$request_id" ]] || { echo "usage: alloy-validate cancel <request_id>" >&2; return 2; }
  alloy_ensure_runtime_dirs
  local qdir f found=0
  qdir="$(alloy_validate_queue_dir)"
  if [[ -d "$qdir" ]]; then
    for f in "$qdir"/*; do
      [[ -f "$f" ]] || continue
      # shellcheck disable=SC1090
      source "$f"
      if [[ "${ALLOY_VALIDATE_REQUEST_ID:-}" == "$request_id" ]]; then
        local wpid="${ALLOY_VALIDATE_PID:-}"
        rm -f "$f"
        if [[ -n "$wpid" ]] && alloy_pid_alive "$wpid"; then
          kill -INT "$wpid" 2>/dev/null || true
        fi
        echo "cancelled waiter request_id=$request_id"
        found=1
      fi
    done
  fi
  if alloy_validate_lock_held; then
    local owner
    owner="$(alloy_validate_owner_file)"
    # shellcheck disable=SC1090
    source "$owner"
    if [[ "${ALLOY_VALIDATE_REQUEST_ID:-}" == "$request_id" ]]; then
      local hpid="${ALLOY_VALIDATE_PID:-}"
      if [[ -n "$hpid" ]] && alloy_pid_alive "$hpid"; then
        kill -INT "$hpid" 2>/dev/null || true
        echo "signalled holder request_id=$request_id pid=$hpid"
        found=1
      fi
    fi
  fi
  [[ "$found" -eq 1 ]] || { echo "no lease/waiter for request_id=$request_id" >&2; return 1; }
}
