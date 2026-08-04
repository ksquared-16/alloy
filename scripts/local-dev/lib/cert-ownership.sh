#!/usr/bin/env bash
# =============================================================================
# Certification database ownership — THE guard.
#
# `exclusive-certification-db` used to be advisory: every destructive entry point
# was free to stop, reset or reseed the shared certification stack without ever
# asking who owned it. During one Interactive Tour certification run the tenant,
# an unmerged migration, deterministic fixtures, scoped credentials and browser
# evidence were destroyed three times — the last time while the exclusive permit
# was held. Advisory ownership is not ownership.
#
# This file is the single place that answers "may this operation proceed?".
# Destructive commands call `alloy_cert_guard` BEFORE any side effect. There is
# deliberately no second copy of this logic anywhere in the toolkit: subtly
# different ownership checks scattered across scripts are how the original hole
# stayed open.
#
# SINGLE SOURCE OF TRUTH. Ownership is the `alloy-compute` permit store. This
# file reads it; it never maintains a parallel ownership record that could
# disagree. The stack lease (`alloy-stack`) remains a separate, weaker concept —
# see the relationship rule below.
#
#   permit  = who may DESTROY the certification database
#   lease   = who is USING the shared stack
#
# A lease says "I am here". A permit says "I own this, and destroying it is mine
# to do." Holding a lease NEVER authorises a destructive operation. Holding the
# permit implies the right to hold a lease.
# =============================================================================

ALLOY_CERT_RESOURCE="exclusive-certification-db"
ALLOY_CERT_COMPUTE_STATE_DIR="${ALLOY_COMPUTE_STATE_DIR:-$HOME/.local/state/alloy/compute}"

# Operations that may only ever be performed by the exclusive owner.
#
#   destroy-db     database reset / schema replacement
#   replay         destructive migration replay
#   seed           tenant seed or fixture replacement
#   wipe-tenant    zero-survivor cleanup, promotion cleanup, tenant deletion
#   volumes        volume discard or replacement
#   stop-stack     stopping the shared stack out from under a certification run
#   reap           generic cleanup/reaper sweeps
#
# The first five REQUIRE the permit even when nobody owns it: an ordinary stack
# lease is explicitly insufficient for destroying a shared database. `stop-stack`
# and `reap` are permitted when no live owner exists, because stopping an unowned
# idle stack is ordinary housekeeping.
ALLOY_CERT_OPS_REQUIRING_PERMIT="destroy-db replay seed wipe-tenant volumes"
ALLOY_CERT_OPS_OWNER_ONLY_IF_OWNED="stop-stack reap"

_cert_field() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -1; }

_cert_proc_start_of() { ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//'; }
_cert_proc_cmd_of()   { ps -o command= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//' | cut -c1-120; }

# Same identity derivation `alloy-compute` and `alloy-stack` use, so a holder
# name means exactly one thing across the toolkit.
alloy_cert_self_holder() {
  local d="${ALLOY_WORKTREE_PATH:-$PWD}" root
  root="$(cd "$d" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null || echo "$d")"
  basename "$root"
}

alloy_cert_permit_dir() { printf '%s/%s\n' "$ALLOY_CERT_COMPUTE_STATE_DIR" "$ALLOY_CERT_RESOURCE"; }

# Liveness by process fingerprint, not elapsed time. A pid alone is not evidence:
# pids wrap, so the recorded start time and command line must still match.
alloy_cert_holder_alive() {
  local f="$1" pid rec_start rec_cmd
  [[ -f "$f" ]] || return 1
  pid="$(_cert_field "$f" PID)"
  [[ -n "$pid" ]] || return 0                        # no pid recorded → never presume dead
  kill -0 "$pid" 2>/dev/null || return 1
  rec_start="$(_cert_field "$f" PID_START)"; rec_cmd="$(_cert_field "$f" PID_CMD)"
  [[ -z "$rec_start" && -z "$rec_cmd" ]] && return 0 # legacy permit + live pid → preserve
  [[ -n "$rec_start" && "$rec_start" != "$(_cert_proc_start_of "$pid")" ]] && return 1
  [[ -n "$rec_cmd"   && "$rec_cmd"   != "$(_cert_proc_cmd_of   "$pid")" ]] && return 1
  return 0
}

# Print the current owner's holder name, or nothing. A permit whose process is
# provably gone is reported as no owner — but it is NOT deleted here. Removing
# another worker's permit is a decision, not a side effect of asking a question;
# it belongs to `alloy-compute recover`.
alloy_cert_current_owner() {
  local dir f holder
  dir="$(alloy_cert_permit_dir)"
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob
  for f in "$dir"/*.permit; do
    holder="$(_cert_field "$f" HOLDER)"
    [[ -n "$holder" ]] || holder="$(basename "$f" .permit)"
    if alloy_cert_holder_alive "$f"; then
      printf '%s\n' "$holder"
      shopt -u nullglob
      return 0
    fi
  done
  shopt -u nullglob
  return 0
}

alloy_cert_owner_permit_file() {
  local owner="$1"
  printf '%s/%s.permit\n' "$(alloy_cert_permit_dir)" "$owner"
}

# Human-readable ownership block, used by both the guard's refusal and status output.
alloy_cert_describe_owner() {
  local owner="$1" f
  f="$(alloy_cert_owner_permit_file "$owner")"
  printf '  owner:      %s\n' "$owner"
  printf '  worktree:   %s\n' "$(_cert_field "$f" WORKTREE)"
  printf '  acquired:   %s\n' "$(_cert_field "$f" CREATED)"
  local reason; reason="$(_cert_field "$f" REASON)"
  [[ -n "$reason" ]] && printf '  purpose:    %s\n' "$reason"
  local pid; pid="$(_cert_field "$f" PID)"
  [[ -n "$pid" ]] && printf '  pid:        %s (%s)\n' "$pid" "$(kill -0 "$pid" 2>/dev/null && echo live || echo gone)"
  return 0
}

_cert_op_in() {
  local needle="$1" haystack="$2" w
  for w in $haystack; do [[ "$w" == "$needle" ]] && return 0; done
  return 1
}

# -----------------------------------------------------------------------------
# THE guard. Call before any destructive side effect.
#
#   alloy_cert_guard <operation> [human description]
#
# Exits non-zero (and prints why) when the operation is not permitted. Returns 0
# when it may proceed. It never performs the operation and never mutates state.
# -----------------------------------------------------------------------------
alloy_cert_guard() {
  local op="${1:-}" what="${2:-$1}"
  [[ -n "$op" ]] || { printf '\033[31m✗ alloy_cert_guard called without an operation\033[0m\n' >&2; return 2; }

  # An explicit, audited escape hatch for the one case the guard cannot judge:
  # a human deciding to override. It is deliberately loud and never set by any
  # toolkit command.
  if [[ "${ALLOY_CERT_OWNERSHIP_OVERRIDE:-}" == "i-accept-destroying-another-workers-certification" ]]; then
    printf '\033[33m!\033[0m ownership override in effect — %s proceeding despite ownership\n' "$op" >&2
    return 0
  fi

  local self owner
  self="$(alloy_cert_self_holder)"
  owner="$(alloy_cert_current_owner)"

  # Caller owns it: everything is allowed, including owned cleanup.
  if [[ -n "$owner" && "$owner" == "$self" ]]; then
    return 0
  fi

  if [[ -n "$owner" ]]; then
    printf '\033[31m✗ refused: %s\033[0m\n' "$what" >&2
    printf '  operation:  %s\n' "$op" >&2
    printf '  requested by: %s\n' "$self" >&2
    alloy_cert_describe_owner "$owner" >&2
    printf '\n  The certification database is exclusively owned. Stopping, resetting or\n' >&2
    printf '  reseeding it now would destroy another worker'"'"'s tenant and evidence.\n\n' >&2
    printf '  Safe next action:\n' >&2
    printf '    alloy-compute status %s          # see the owner and purpose\n' "$ALLOY_CERT_RESOURCE" >&2
    printf '    alloy-compute acquire %s --wait  # queue until it is free\n' "$ALLOY_CERT_RESOURCE" >&2
    printf '  If the owner is genuinely gone:\n' >&2
    printf '    alloy-compute recover %s         # evidence-based, refuses a live owner\n' "$ALLOY_CERT_RESOURCE" >&2
    return 1
  fi

  # No live owner. Database-destroying operations still require the permit: an
  # ordinary stack lease is not authority to destroy a shared database.
  if _cert_op_in "$op" "$ALLOY_CERT_OPS_REQUIRING_PERMIT"; then
    printf '\033[31m✗ refused: %s\033[0m\n' "$what" >&2
    printf '  operation:  %s\n' "$op" >&2
    printf '  requested by: %s\n' "$self" >&2
    printf '  owner:      (none)\n\n' >&2
    printf '  This operation destroys shared certification state, so it requires the\n' >&2
    printf '  exclusive permit — holding a stack lease is not sufficient.\n\n' >&2
    printf '  Safe next action:\n' >&2
    printf '    alloy-compute acquire %s --reason "..."\n' "$ALLOY_CERT_RESOURCE" >&2
    return 1
  fi

  # stop-stack / reap with no live owner: ordinary housekeeping.
  return 0
}
