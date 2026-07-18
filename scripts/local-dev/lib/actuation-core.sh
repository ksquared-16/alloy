#!/usr/bin/env bash
# lib/actuation-core.sh — Runtime Actuation V1 (R3): the bounded EXECUTOR.
#
# The single owner of the ACTUATE phase of runtime resource orchestration
# (observe → declare → actuate). Given an ALREADY-ADMITTED Runtime Intent, it:
#
#   1. Re-invokes the authoritative R2 evaluator LIVE (never re-implements policy).
#   2. Atomically RESERVES capacity for a dedicated provision (and only then).
#   3. CLAIMS the reservation for exactly one bounded execution attempt.
#   4. Dispatches a provider-neutral operation through an allowlisted ADAPTER.
#   5. VERIFIES the result through authoritative R1 observation (a zero provider
#      exit code is NOT success).
#   6. Records authoritative EXECUTION state and a typed result.
#
# CONSTITUTION (R3 — execute, never decide policy):
#   - Runtime Intent (R2) is the SOLE policy owner. R3 calls alloy_ad_evaluate and
#     consumes its decision + allowed_next_actions; it never re-derives posture,
#     isolation class, capacity policy, admission, or reason codes.
#   - Director is the SOLE orchestration owner. R3 never sequences missions, chooses
#     an alternate intent/target, owns operator approval, or decides orchestration
#     retries. It only CLASSIFIES a terminal result as retryable for Director.
#   - Control plane (this file) is separate from the data plane (the adapter). No
#     provider process call, Docker/Supabase argument, compose path, shell fragment,
#     or arbitrary environment variable is ever accepted from an intent, a record,
#     Director, or the CLI. There is NO generic "run command" primitive.
#   - Records are written atomically and PARSED, never sourced (Shared Read Core).
#   - Secrets are unreachable by construction: R3 reads runtime state only through
#     lib/runtime-core.sh (field-restricted docker ps/stats) and never persists
#     provider output, tokens, env, or command text.
#
# Naming: functions `alloy_act_*`; resolved config `ALLOY_ACT_*`; evaluation output
# is exposed as `_ACT_*` globals (like `_AD_*` in admission-core).
# shellcheck shell=bash

[[ -n "${ALLOY_ACT_CORE_LOADED:-}" ]] && return 0
ALLOY_ACT_CORE_LOADED=1

_ALLOY_ACT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/read-core.sh
source "${_ALLOY_ACT_LIB_DIR}/read-core.sh"
# shellcheck source=lib/runtime-core.sh
source "${_ALLOY_ACT_LIB_DIR}/runtime-core.sh"
# shellcheck source=lib/admission-core.sh
source "${_ALLOY_ACT_LIB_DIR}/admission-core.sh"

ALLOY_ACT_SCHEMA_VERSION=1

# Reservation TTL is a CODE-OWNED toolkit setting (not tenant/intent configuration).
# Default 300s; overridable only via ALLOY_ACT_RESERVATION_TTL with bounded validation.
ALLOY_ACT_RESERVATION_TTL_DEFAULT=300
ALLOY_ACT_RESERVATION_TTL_MIN=30
ALLOY_ACT_RESERVATION_TTL_MAX=3600
# Execution claim lease bound (a secondary liveness bound; PID liveness is primary).
ALLOY_ACT_CLAIM_LEASE_DEFAULT=600

# Canonical V1 operator operations. Each has a distinct owner/precondition and is
# NEVER flattened into an equivalent provider call. `reconcile` is not a repair verb.
ALLOY_ACT_OPERATIONS="provision attach detach retire reconcile"

# Execution lifecycle states (only states the architecture justifies).
ALLOY_ACT_EXEC_STATES="pending claimed executing verifying succeeded failed timed_out conflicted cancelled stale"
ALLOY_ACT_EXEC_TERMINAL="succeeded failed timed_out conflicted cancelled stale"
# Reservation lifecycle states.
ALLOY_ACT_RESV_STATES="held consumed expired released conflict"
ALLOY_ACT_RESV_TERMINAL="consumed expired released conflict"

# ---------------------------------------------------------------------------
# config / init
# ---------------------------------------------------------------------------
alloy_act_init() {
  [[ "${ALLOY_ACT_READY:-0}" == "1" ]] && return 0
  alloy_ad_init                        # brings up ALLOY_RT_* + ALLOY_AD_* (root, max, registry, intents)
  ALLOY_ACT_RUNTIME_ROOT="$ALLOY_RC_RUNTIME_ROOT"
  ALLOY_ACT_RESERVATIONS_DIR="$ALLOY_RC_RUNTIME_ROOT/reservations"
  ALLOY_ACT_EXECUTIONS_DIR="$ALLOY_RC_RUNTIME_ROOT/executions"
  ALLOY_ACT_LOCK_DIR="$ALLOY_RC_RUNTIME_ROOT/locks/runtime-actuation"
  ALLOY_ACT_READY=1
}

# Create only R3-owned record directories (like intent/register do explicitly).
alloy_act_ensure_dirs() {
  mkdir -p "$ALLOY_ACT_RESERVATIONS_DIR" "$ALLOY_ACT_EXECUTIONS_DIR" "$ALLOY_ACT_LOCK_DIR"
}

# Resolve the effective reservation TTL (code-owned; bounded; never from a record).
alloy_act_reservation_ttl() {
  local ttl="${ALLOY_ACT_RESERVATION_TTL:-$ALLOY_ACT_RESERVATION_TTL_DEFAULT}"
  [[ "$ttl" =~ ^[0-9]+$ ]] || ttl="$ALLOY_ACT_RESERVATION_TTL_DEFAULT"
  if (( ttl < ALLOY_ACT_RESERVATION_TTL_MIN )); then ttl="$ALLOY_ACT_RESERVATION_TTL_MIN"; fi
  if (( ttl > ALLOY_ACT_RESERVATION_TTL_MAX )); then ttl="$ALLOY_ACT_RESERVATION_TTL_MAX"; fi
  printf '%s' "$ttl"
}

# ---------------------------------------------------------------------------
# time (injectable for tests) — reading the clock is a read, not a mutation.
# ---------------------------------------------------------------------------
alloy_act_iso_now() {
  [[ -n "${ALLOY_ACT_EVAL_NOW:-}" ]] && { printf '%s' "$ALLOY_ACT_EVAL_NOW"; return 0; }
  alloy_iso_now
}

# ISO-8601 (UTC, "...Z") -> epoch seconds. BSD date then GNU date. "" on failure.
alloy_act_iso_to_epoch() {
  local iso="$1" e
  [[ "$iso" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || { printf ''; return 1; }
  e="$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null)" \
    || e="$(date -u -d "$iso" +%s 2>/dev/null)" || { printf ''; return 1; }
  printf '%s' "$e"
}

alloy_act_epoch_now() {
  local iso; iso="$(alloy_act_iso_now)"
  alloy_act_iso_to_epoch "$iso"
}

# epoch -> ISO-8601 UTC.
alloy_act_epoch_to_iso() {
  local e="$1"
  date -u -j -f "%s" "$e" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -d "@$e" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || printf ''
}

# Claim-lease backstop (C-2): a claim's PID liveness alone cannot distinguish a
# reused PID, so a claim is honoured only while its lease has not elapsed. Returns
# true when the lease is empty (no bound — legacy/unclaimed) OR now < lease. If the
# clock cannot be read, fail closed toward "still active" (never falsely free a slot).
alloy_act_lease_active() {
  local lease_iso="$1" now_e lease_e
  [[ -n "$lease_iso" ]] || return 0
  now_e="$(alloy_act_epoch_now)"; lease_e="$(alloy_act_iso_to_epoch "$lease_iso" 2>/dev/null || true)"
  [[ -n "$now_e" && -n "$lease_e" ]] || return 0
  (( now_e < lease_e ))
}

# ---------------------------------------------------------------------------
# hashing & sanitisation (deterministic; no timestamp, no randomness)
# ---------------------------------------------------------------------------
# Stable 12-hex short hash of the joined arguments (record/identity fingerprints).
alloy_act_hash() {
  local joined; joined="$(printf '%s\x1f' "$@")"
  { printf '%s' "$joined" | shasum -a 256 2>/dev/null || printf '%s' "$joined" | sha256sum 2>/dev/null; } \
    | cut -c1-12
}

# Lowercase, restrict to [a-z0-9-], collapse repeats, trim — for namespace/lock keys.
alloy_act_slug() {
  local s; s="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
  s="$(printf '%s' "$s" | sed -E 's/-+/-/g; s/^-//; s/-$//')"
  printf '%s' "$s"
}

# ---------------------------------------------------------------------------
# identities (five explicit roles; all deterministic, none time-based)
# ---------------------------------------------------------------------------
# Intent identity — immutable content fingerprint of the persisted R2 intent.
alloy_act_intent_fingerprint() {
  local mission="$1" wt="$2" iso="$3" mut="$4" ten="$5" declared_at="$6" supersedes="$7"
  alloy_act_hash "intent" "$mission" "$wt" "$iso" "$mut" "$ten" "$declared_at" "$supersedes"
}

# Admission fingerprint — the decision shape R3 was authorised against (audit + exec id).
alloy_act_admission_fingerprint() {
  local iso="$1" decision="$2" reason="$3" cap="$4"
  alloy_act_hash "adm" "$iso" "$decision" "$reason" "$cap"
}

# Resource identity — the canonical R0 target namespace (join key), NEVER a provider
# name alone. For a not-yet-existing dedicated runtime it is MINTED deterministically
# so duplicate delivery targets the same namespace (idempotency), never a new one.
alloy_act_mint_namespace() {
  local mission="$1" wt="$2" iso="$3" base h
  base="$(alloy_act_slug "$mission")"; [[ -n "$base" ]] || base="mission"
  # keep the human-readable base bounded; the hash guarantees global uniqueness/isolation
  base="${base:0:24}"; base="${base%-}"
  h="$(alloy_act_hash "ns" "$mission" "$wt" "$iso")"
  printf 'alloy-r3-%s-%s' "$base" "${h:0:8}"
}

# Execution identity — deterministic for (this admitted intent, this operation, this
# resource, this admission shape). Duplicate delivery ⇒ same id ⇒ idempotency applies.
alloy_act_execution_id() {
  local mission="$1" wt="$2" iso="$3" op="$4" ns="$5" adm_fp="$6"
  printf 'exec-%s' "$(alloy_act_hash "exec" "$mission" "$wt" "$iso" "$op" "$ns" "$adm_fp")"
}

# Reservation identity — the capacity claim for (this intent, this resource).
alloy_act_reservation_id() {
  local mission="$1" wt="$2" iso="$3" ns="$4"
  printf 'resv-%s' "$(alloy_act_hash "resv" "$mission" "$wt" "$iso" "$ns")"
}

# Attempt identity — unique per bounded attempt: <exec-id>.a<N> where N is the next
# attempt ordinal (count of prior attempts + 1). Monotonic; not time-based.
alloy_act_next_attempt_id() {
  local exec_id="$1" n
  n="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_ATTEMPT_COUNT 2>/dev/null || printf 0)"
  [[ "$n" =~ ^[0-9]+$ ]] || n=0
  printf '%s.a%s' "$exec_id" "$(( n + 1 ))"
}

# ---------------------------------------------------------------------------
# record paths + safe accessors (parsed, never sourced)
# ---------------------------------------------------------------------------
alloy_act_reservation_path() {
  local s; s="$(printf '%s' "$1" | tr -c 'a-zA-Z0-9_.-' '_')"
  printf '%s/%s.env' "$ALLOY_ACT_RESERVATIONS_DIR" "$s"
}
alloy_act_execution_path() {
  local s; s="$(printf '%s' "$1" | tr -c 'a-zA-Z0-9_.-' '_')"
  printf '%s/%s.env' "$ALLOY_ACT_EXECUTIONS_DIR" "$s"
}
alloy_act_execution_log_path() {
  local s; s="$(printf '%s' "$1" | tr -c 'a-zA-Z0-9_.-' '_')"
  printf '%s/%s.log' "$ALLOY_ACT_EXECUTIONS_DIR" "$s"
}

alloy_act_resv_exists() { [[ -f "$(alloy_act_reservation_path "$1")" ]]; }
alloy_act_exec_exists() { [[ -f "$(alloy_act_execution_path "$1")" ]]; }

alloy_act_resv_get() {
  local p; p="$(alloy_act_reservation_path "$1")"; [[ -f "$p" ]] || return 1
  alloy_rc_meta_get "$p" "$2"
}
alloy_act_exec_get() {
  local p; p="$(alloy_act_execution_path "$1")"; [[ -f "$p" ]] || return 1
  alloy_rc_meta_get "$p" "$2"
}

alloy_act_reservation_ids() {
  local dir="$ALLOY_ACT_RESERVATIONS_DIR" f
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob; for f in "$dir"/*.env; do basename "$f" .env; done; shopt -u nullglob
}
alloy_act_execution_ids() {
  local dir="$ALLOY_ACT_EXECUTIONS_DIR" f
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob; for f in "$dir"/*.env; do basename "$f" .env; done; shopt -u nullglob
}

# ---------------------------------------------------------------------------
# append-only execution event log ({at, attempt, phase, event, detail}).
# NEVER records provider stdout/stderr, secrets, tokens, env, or command text.
# ---------------------------------------------------------------------------
alloy_act_log_event() {
  local exec_id="$1" attempt="$2" phase="$3" event="$4" detail="${5:-}"
  local logp; logp="$(alloy_act_execution_log_path "$exec_id")"
  mkdir -p "$(dirname "$logp")"
  # sanitise the human detail defensively (values here are code-authored, but stay safe)
  detail="$(printf '%s' "$detail" | tr -d '\r' | tr '\n' ' ')"
  printf '{"at":"%s","attempt":"%s","phase":"%s","event":"%s","detail":"%s"}\n' \
    "$(alloy_act_iso_now)" \
    "$(alloy_rc_json_escape "$attempt")" \
    "$(alloy_rc_json_escape "$phase")" \
    "$(alloy_rc_json_escape "$event")" \
    "$(alloy_rc_json_escape "$detail")" >>"$logp"
}

# ---------------------------------------------------------------------------
# state model
# ---------------------------------------------------------------------------
alloy_act_exec_is_terminal() {
  local s; for s in $ALLOY_ACT_EXEC_TERMINAL; do [[ "$1" == "$s" ]] && return 0; done; return 1
}
alloy_act_resv_is_terminal() {
  local s; for s in $ALLOY_ACT_RESV_TERMINAL; do [[ "$1" == "$s" ]] && return 0; done; return 1
}
alloy_act_is_valid_operation() {
  local o; for o in $ALLOY_ACT_OPERATIONS; do [[ "$1" == "$o" ]] && return 0; done; return 1
}

# Capacity units a request reserves (selective accounting — Decision 3). R3 does
# NOT re-derive the capacity formula: for a `provision` it reserves exactly the
# number R2's live evaluation already computed (_AD_CAPACITY_REQUIRED, 0 or 1);
# attach/detach/retire/reconcile create/claim no new runtime and reserve 0.
alloy_act_capacity_units_for() {
  local op="$1" ad_capacity_required="$2"
  [[ "$ad_capacity_required" =~ ^[0-9]+$ ]] || ad_capacity_required=0
  if [[ "$op" == "provision" ]]; then printf '%s' "$ad_capacity_required"; else printf 0; fi
}

# ---------------------------------------------------------------------------
# durable lock (mkdir-atomic + PID staleness; survives process restart).
# PID reuse alone does not establish ownership: an owner file also records the
# lock key + start time, and staleness requires the recorded PID to be dead.
# ---------------------------------------------------------------------------
alloy_act_lock_dir_for() { printf '%s/%s.lock' "$ALLOY_ACT_LOCK_DIR" "$(alloy_act_slug "$1")"; }

alloy_act_lock_owner_pid() {
  local d="$1" f="$d/owner.env"
  [[ -f "$f" ]] || { printf ''; return 1; }
  alloy_rc_meta_get "$f" ALLOY_ACT_LOCK_PID 2>/dev/null || printf ''
}

# Acquire <key> for <holder>. Non-blocking: returns 1 immediately if held by a LIVE
# owner. A stale lock (recorded PID dead) is reclaimed. Caller must release.
alloy_act_lock_acquire() {
  local key="$1" holder="${2:-r3}" d pid
  d="$(alloy_act_lock_dir_for "$key")"
  mkdir -p "$ALLOY_ACT_LOCK_DIR"
  if mkdir "$d" 2>/dev/null; then
    alloy_write_kv_file "$d/owner.env" \
      "ALLOY_ACT_LOCK_KEY=\"${key}\"" \
      "ALLOY_ACT_LOCK_HOLDER=\"${holder}\"" \
      "ALLOY_ACT_LOCK_PID=\"$$\"" \
      "ALLOY_ACT_LOCK_STARTED=\"$(alloy_act_iso_now)\""
    printf '%s' "$d"; return 0
  fi
  # Held. If owner.env is not yet present, the winner may be mid-initialisation (it
  # atomically mkdir'd the dir but has not yet written owner.env). Give it a brief
  # grace window to appear BEFORE concluding the lock is stale — otherwise a concurrent
  # acquirer could reclaim a lock whose owner is still initialising (a TOCTOU that would
  # let two executions both "hold" the same resource). A live owner writes owner.env in
  # microseconds (mktemp+rename), so this rarely engages.
  local _g
  pid="$(alloy_act_lock_owner_pid "$d" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    for _g in 1 2 3 4 5 6 7 8 9 10; do
      sleep 0.05 2>/dev/null || sleep 1
      pid="$(alloy_act_lock_owner_pid "$d" 2>/dev/null || true)"
      [[ -n "$pid" ]] && break
    done
  fi
  # Genuinely held by a live owner → busy.
  if [[ -n "$pid" ]] && alloy_rc_pid_alive "$pid"; then
    return 1
  fi
  # PID provably dead, or owner.env never appeared after the grace window (crashed
  # mid-init) → reclaim. mkdir atomicity still lets only one reclaimer win.
  rm -rf "$d"
  if mkdir "$d" 2>/dev/null; then
    alloy_write_kv_file "$d/owner.env" \
      "ALLOY_ACT_LOCK_KEY=\"${key}\"" \
      "ALLOY_ACT_LOCK_HOLDER=\"${holder}\"" \
      "ALLOY_ACT_LOCK_PID=\"$$\"" \
      "ALLOY_ACT_LOCK_STARTED=\"$(alloy_act_iso_now)\""
    printf '%s' "$d"; return 0
  fi
  return 1
}

alloy_act_lock_release() {
  local key="$1" d; d="$(alloy_act_lock_dir_for "$key")"
  # Only release a lock this process owns.
  local pid; pid="$(alloy_act_lock_owner_pid "$d" 2>/dev/null || true)"
  [[ "$pid" == "$$" ]] && rm -rf "$d"
  return 0
}

# ---------------------------------------------------------------------------
# reservation-aware capacity accounting.
#
# R3 does NOT re-implement the R2 capacity FORMULA (max/active come from R2's owner);
# it adds an execution-plane overlay: a HELD reservation that consumes capacity but is
# not yet reflected in the observed active count must be subtracted so two contenders
# cannot both win one remaining slot.
#
#   effective_remaining = max( 0, configured_max − active_runtimes − held_capacity_units )
#
# A held reservation counts against capacity while it is live: state==held AND
# (not past expiry, OR its claiming execution PID is still alive). This makes expiry
# free capacity ONLY for genuinely abandoned reservations (Decision 4).
# ---------------------------------------------------------------------------
alloy_act_reservation_is_live() {
  local rid="$1" state exp_iso claim_pid claim_lease now_e exp_e
  state="$(alloy_act_resv_get "$rid" ALLOY_RESV_STATE 2>/dev/null || true)"
  [[ "$state" == "held" ]] || return 1
  claim_pid="$(alloy_act_resv_get "$rid" ALLOY_RESV_CLAIM_PID 2>/dev/null || true)"
  claim_lease="$(alloy_act_resv_get "$rid" ALLOY_RESV_CLAIM_LEASE 2>/dev/null || true)"
  # A live claim keeps the reservation live regardless of the reservation timestamp —
  # but ONLY while its lease holds (C-2 backstop: bounds a reused-PID capacity leak).
  [[ -n "$claim_pid" ]] && alloy_rc_pid_alive "$claim_pid" && alloy_act_lease_active "$claim_lease" && return 0
  exp_iso="$(alloy_act_resv_get "$rid" ALLOY_RESV_EXPIRES_AT 2>/dev/null || true)"
  now_e="$(alloy_act_epoch_now)"; exp_e="$(alloy_act_iso_to_epoch "$exp_iso" 2>/dev/null || true)"
  [[ -n "$now_e" && -n "$exp_e" ]] || return 0   # can't compute expiry ⇒ treat as live (fail-closed)
  (( now_e < exp_e ))
}

alloy_act_held_capacity_units() {
  local rid units total=0
  while IFS= read -r rid; do
    [[ -n "$rid" ]] || continue
    alloy_act_reservation_is_live "$rid" || continue
    units="$(alloy_act_resv_get "$rid" ALLOY_RESV_CAPACITY_UNITS 2>/dev/null || printf 0)"
    [[ "$units" =~ ^[0-9]+$ ]] || units=0
    total=$(( total + units ))
  done < <(alloy_act_reservation_ids)
  printf '%s' "$total"
}

# Effective remaining capacity (reservation-aware). active/max come from R2's owner.
alloy_act_effective_remaining() {
  local active max held rem
  active="$(alloy_rt_active_runtime_count)"; [[ "$active" =~ ^[0-9]+$ ]] || active=0
  max="$ALLOY_RT_MAX_ACTIVE"; [[ "$max" =~ ^[0-9]+$ ]] || max=0
  held="$(alloy_act_held_capacity_units)"
  rem=$(( max - active - held ))
  if (( rem < 0 )); then rem=0; fi
  printf '%s' "$rem"
}

# ---------------------------------------------------------------------------
# reconciliation of expired/abandoned reservations (capacity bookkeeping ONLY).
# Never marks execution successful, never tears down providers, never retries.
# ---------------------------------------------------------------------------
alloy_act_expire_reservation() {
  local rid="$1" reason="${2:-ttl-expired}"
  alloy_act_resv_exists "$rid" || return 1
  local state; state="$(alloy_act_resv_get "$rid" ALLOY_RESV_STATE || true)"
  [[ "$state" == "held" ]] || return 0
  alloy_act_resv_set_state "$rid" expired "$reason"
}

# ---------------------------------------------------------------------------
# reservation record writers (atomic; immutable head rewritten on state change).
# ---------------------------------------------------------------------------
alloy_act_write_reservation() {
  # args: rid mission wt iso ns units state expires_at admission_fp exec_id created_at
  local rid="$1" mission="$2" wt="$3" iso="$4" ns="$5" units="$6" state="$7" \
        expires_at="$8" adm_fp="$9" exec_id="${10}" created_at="${11}"
  local path; path="$(alloy_act_reservation_path "$rid")"
  alloy_write_kv_file "$path" \
    "ALLOY_RESV_SCHEMA_VERSION=${ALLOY_ACT_SCHEMA_VERSION}" \
    "ALLOY_RESV_ID=\"${rid}\"" \
    "ALLOY_RESV_MISSION_KEY=\"${mission}\"" \
    "ALLOY_RESV_WORKTREE=\"${wt}\"" \
    "ALLOY_RESV_ISOLATION_CLASS=\"${iso}\"" \
    "ALLOY_RESV_TARGET_NAMESPACE=\"${ns}\"" \
    "ALLOY_RESV_CAPACITY_UNITS=${units}" \
    "ALLOY_RESV_STATE=\"${state}\"" \
    "ALLOY_RESV_CREATED_AT=\"${created_at}\"" \
    "ALLOY_RESV_EXPIRES_AT=\"${expires_at}\"" \
    "ALLOY_RESV_ADMISSION_FINGERPRINT=\"${adm_fp}\"" \
    "ALLOY_RESV_EXECUTION_ID=\"${exec_id}\"" \
    "ALLOY_RESV_CLAIM_PID=\"\"" \
    "ALLOY_RESV_CLAIM_LEASE=\"\"" \
    "ALLOY_RESV_UPDATED_AT=\"${created_at}\""
}

# Transition a reservation's state, preserving all other fields (parsed, never sourced).
alloy_act_resv_set_state() {
  local rid="$1" new="$2" note="${3:-}"
  local path; path="$(alloy_act_reservation_path "$rid")"; [[ -f "$path" ]] || return 1
  local g; g() { alloy_rc_meta_get "$path" "$1" 2>/dev/null || printf ''; }
  alloy_write_kv_file "$path" \
    "ALLOY_RESV_SCHEMA_VERSION=$(g ALLOY_RESV_SCHEMA_VERSION)" \
    "ALLOY_RESV_ID=\"$(g ALLOY_RESV_ID)\"" \
    "ALLOY_RESV_MISSION_KEY=\"$(g ALLOY_RESV_MISSION_KEY)\"" \
    "ALLOY_RESV_WORKTREE=\"$(g ALLOY_RESV_WORKTREE)\"" \
    "ALLOY_RESV_ISOLATION_CLASS=\"$(g ALLOY_RESV_ISOLATION_CLASS)\"" \
    "ALLOY_RESV_TARGET_NAMESPACE=\"$(g ALLOY_RESV_TARGET_NAMESPACE)\"" \
    "ALLOY_RESV_CAPACITY_UNITS=$(g ALLOY_RESV_CAPACITY_UNITS)" \
    "ALLOY_RESV_STATE=\"${new}\"" \
    "ALLOY_RESV_CREATED_AT=\"$(g ALLOY_RESV_CREATED_AT)\"" \
    "ALLOY_RESV_EXPIRES_AT=\"$(g ALLOY_RESV_EXPIRES_AT)\"" \
    "ALLOY_RESV_ADMISSION_FINGERPRINT=\"$(g ALLOY_RESV_ADMISSION_FINGERPRINT)\"" \
    "ALLOY_RESV_EXECUTION_ID=\"$(g ALLOY_RESV_EXECUTION_ID)\"" \
    "ALLOY_RESV_CLAIM_PID=\"$(g ALLOY_RESV_CLAIM_PID)\"" \
    "ALLOY_RESV_CLAIM_LEASE=\"$(g ALLOY_RESV_CLAIM_LEASE)\"" \
    "ALLOY_RESV_STATE_NOTE=\"${note}\"" \
    "ALLOY_RESV_UPDATED_AT=\"$(alloy_act_iso_now)\""
}

# Record a live claim PID + lease onto the reservation (keeps it live past its
# timestamp while the claim PID is alive AND the lease holds — C-2 backstop).
alloy_act_resv_set_claim_pid() {
  local rid="$1" pid="$2" lease="${3:-}"
  local path; path="$(alloy_act_reservation_path "$rid")"; [[ -f "$path" ]] || return 1
  local g; g() { alloy_rc_meta_get "$path" "$1" 2>/dev/null || printf ''; }
  alloy_write_kv_file "$path" \
    "ALLOY_RESV_SCHEMA_VERSION=$(g ALLOY_RESV_SCHEMA_VERSION)" \
    "ALLOY_RESV_ID=\"$(g ALLOY_RESV_ID)\"" \
    "ALLOY_RESV_MISSION_KEY=\"$(g ALLOY_RESV_MISSION_KEY)\"" \
    "ALLOY_RESV_WORKTREE=\"$(g ALLOY_RESV_WORKTREE)\"" \
    "ALLOY_RESV_ISOLATION_CLASS=\"$(g ALLOY_RESV_ISOLATION_CLASS)\"" \
    "ALLOY_RESV_TARGET_NAMESPACE=\"$(g ALLOY_RESV_TARGET_NAMESPACE)\"" \
    "ALLOY_RESV_CAPACITY_UNITS=$(g ALLOY_RESV_CAPACITY_UNITS)" \
    "ALLOY_RESV_STATE=\"$(g ALLOY_RESV_STATE)\"" \
    "ALLOY_RESV_CREATED_AT=\"$(g ALLOY_RESV_CREATED_AT)\"" \
    "ALLOY_RESV_EXPIRES_AT=\"$(g ALLOY_RESV_EXPIRES_AT)\"" \
    "ALLOY_RESV_ADMISSION_FINGERPRINT=\"$(g ALLOY_RESV_ADMISSION_FINGERPRINT)\"" \
    "ALLOY_RESV_EXECUTION_ID=\"$(g ALLOY_RESV_EXECUTION_ID)\"" \
    "ALLOY_RESV_CLAIM_PID=\"${pid}\"" \
    "ALLOY_RESV_CLAIM_LEASE=\"${lease}\"" \
    "ALLOY_RESV_UPDATED_AT=\"$(alloy_act_iso_now)\""
}

# ---------------------------------------------------------------------------
# attachment records — the worktree↔runtime RELATIONSHIP (an R3-owned concern,
# distinct from R0 runtime identity). One per worktree. Parsed, never sourced.
# ---------------------------------------------------------------------------
alloy_act_attachment_dir() { printf '%s/attachments' "$ALLOY_ACT_RUNTIME_ROOT"; }
alloy_act_attachment_path() {
  local s; s="$(printf '%s' "$1" | tr -c 'a-zA-Z0-9_.-' '_')"
  printf '%s/%s.env' "$(alloy_act_attachment_dir)" "$s"
}
alloy_act_attachment_exists() { [[ -f "$(alloy_act_attachment_path "$1")" ]]; }
alloy_act_attachment_get() {
  local p; p="$(alloy_act_attachment_path "$1")"; [[ -f "$p" ]] || return 1
  alloy_rc_meta_get "$p" "$2"
}
alloy_act_write_attachment() {
  # args: worktree mission ns iso kind(dedicated|shared) exec_id
  local wt="$1" mission="$2" ns="$3" iso="$4" kind="$5" exec_id="$6"
  local path; path="$(alloy_act_attachment_path "$wt")"
  mkdir -p "$(alloy_act_attachment_dir)"
  alloy_write_kv_file "$path" \
    "ALLOY_ATTACH_SCHEMA_VERSION=${ALLOY_ACT_SCHEMA_VERSION}" \
    "ALLOY_ATTACH_WORKTREE=\"${wt}\"" \
    "ALLOY_ATTACH_MISSION_KEY=\"${mission}\"" \
    "ALLOY_ATTACH_TARGET_NAMESPACE=\"${ns}\"" \
    "ALLOY_ATTACH_ISOLATION_CLASS=\"${iso}\"" \
    "ALLOY_ATTACH_KIND=\"${kind}\"" \
    "ALLOY_ATTACH_EXECUTION_ID=\"${exec_id}\"" \
    "ALLOY_ATTACH_CREATED_AT=\"$(alloy_act_iso_now)\""
}
alloy_act_remove_attachment() {
  local p; p="$(alloy_act_attachment_path "$1")"; [[ -f "$p" ]] && rm -f "$p"; return 0
}
# How many worktrees are attached to a namespace (for detach orphan-safety).
alloy_act_attachment_count_for_ns() {
  local ns="$1" wt n=0 dir; dir="$(alloy_act_attachment_dir)"
  [[ -d "$dir" ]] || { printf 0; return 0; }
  local f
  shopt -s nullglob
  for f in "$dir"/*.env; do
    [[ "$(alloy_rc_meta_get "$f" ALLOY_ATTACH_TARGET_NAMESPACE 2>/dev/null || true)" == "$ns" ]] && n=$((n+1))
  done
  shopt -u nullglob
  printf '%s' "$n"
}

# ---------------------------------------------------------------------------
# execution record writers (immutable head; rewritten on transition).
# ---------------------------------------------------------------------------
alloy_act_write_execution() {
  # args: exec_id mission wt iso op ns resv_id adapter initiated_by decision_at_dispatch
  local exec_id="$1" mission="$2" wt="$3" iso="$4" op="$5" ns="$6" resv_id="$7" \
        adapter="$8" initiated_by="$9" decision="${10}"
  local now; now="$(alloy_act_iso_now)"
  local path; path="$(alloy_act_execution_path "$exec_id")"
  alloy_write_kv_file "$path" \
    "ALLOY_EXEC_SCHEMA_VERSION=${ALLOY_ACT_SCHEMA_VERSION}" \
    "ALLOY_EXEC_ID=\"${exec_id}\"" \
    "ALLOY_EXEC_MISSION_KEY=\"${mission}\"" \
    "ALLOY_EXEC_WORKTREE=\"${wt}\"" \
    "ALLOY_EXEC_ISOLATION_CLASS=\"${iso}\"" \
    "ALLOY_EXEC_OPERATION=\"${op}\"" \
    "ALLOY_EXEC_TARGET_NAMESPACE=\"${ns}\"" \
    "ALLOY_EXEC_RESERVATION_ID=\"${resv_id}\"" \
    "ALLOY_EXEC_ADAPTER=\"${adapter}\"" \
    "ALLOY_EXEC_INITIATED_BY=\"${initiated_by}\"" \
    "ALLOY_EXEC_ADMISSION_DECISION_AT_DISPATCH=\"${decision}\"" \
    "ALLOY_EXEC_STATE=\"pending\"" \
    "ALLOY_EXEC_RESULT_CODE=\"\"" \
    "ALLOY_EXEC_RETRYABLE=\"\"" \
    "ALLOY_EXEC_DESIRED_STATE_REACHED=\"unknown\"" \
    "ALLOY_EXEC_CLAIM_PID=\"\"" \
    "ALLOY_EXEC_CLAIM_LEASE_UNTIL=\"\"" \
    "ALLOY_EXEC_ATTEMPT_COUNT=0" \
    "ALLOY_EXEC_STARTED_AT=\"${now}\"" \
    "ALLOY_EXEC_ENDED_AT=\"\"" \
    "ALLOY_EXEC_UPDATED_AT=\"${now}\""
}

# Merge-update selected fields on the execution head (parsed, never sourced).
# Usage: alloy_act_exec_update <exec_id> KEY VALUE [KEY VALUE ...]
alloy_act_exec_update() {
  local exec_id="$1"; shift
  local path; path="$(alloy_act_execution_path "$exec_id")"; [[ -f "$path" ]] || return 1
  local -A over=()
  while [[ $# -ge 2 ]]; do over["$1"]="$2"; shift 2; done
  local g; g() { alloy_rc_meta_get "$path" "$1" 2>/dev/null || printf ''; }
  local v_state="${over[ALLOY_EXEC_STATE]-$(g ALLOY_EXEC_STATE)}"
  local v_result="${over[ALLOY_EXEC_RESULT_CODE]-$(g ALLOY_EXEC_RESULT_CODE)}"
  local v_retry="${over[ALLOY_EXEC_RETRYABLE]-$(g ALLOY_EXEC_RETRYABLE)}"
  local v_desired="${over[ALLOY_EXEC_DESIRED_STATE_REACHED]-$(g ALLOY_EXEC_DESIRED_STATE_REACHED)}"
  local v_cpid="${over[ALLOY_EXEC_CLAIM_PID]-$(g ALLOY_EXEC_CLAIM_PID)}"
  local v_lease="${over[ALLOY_EXEC_CLAIM_LEASE_UNTIL]-$(g ALLOY_EXEC_CLAIM_LEASE_UNTIL)}"
  local v_attempts="${over[ALLOY_EXEC_ATTEMPT_COUNT]-$(g ALLOY_EXEC_ATTEMPT_COUNT)}"
  local v_ended="${over[ALLOY_EXEC_ENDED_AT]-$(g ALLOY_EXEC_ENDED_AT)}"
  local v_resv="${over[ALLOY_EXEC_RESERVATION_ID]-$(g ALLOY_EXEC_RESERVATION_ID)}"
  alloy_write_kv_file "$path" \
    "ALLOY_EXEC_SCHEMA_VERSION=$(g ALLOY_EXEC_SCHEMA_VERSION)" \
    "ALLOY_EXEC_ID=\"$(g ALLOY_EXEC_ID)\"" \
    "ALLOY_EXEC_MISSION_KEY=\"$(g ALLOY_EXEC_MISSION_KEY)\"" \
    "ALLOY_EXEC_WORKTREE=\"$(g ALLOY_EXEC_WORKTREE)\"" \
    "ALLOY_EXEC_ISOLATION_CLASS=\"$(g ALLOY_EXEC_ISOLATION_CLASS)\"" \
    "ALLOY_EXEC_OPERATION=\"$(g ALLOY_EXEC_OPERATION)\"" \
    "ALLOY_EXEC_TARGET_NAMESPACE=\"$(g ALLOY_EXEC_TARGET_NAMESPACE)\"" \
    "ALLOY_EXEC_RESERVATION_ID=\"${v_resv}\"" \
    "ALLOY_EXEC_ADAPTER=\"$(g ALLOY_EXEC_ADAPTER)\"" \
    "ALLOY_EXEC_INITIATED_BY=\"$(g ALLOY_EXEC_INITIATED_BY)\"" \
    "ALLOY_EXEC_ADMISSION_DECISION_AT_DISPATCH=\"$(g ALLOY_EXEC_ADMISSION_DECISION_AT_DISPATCH)\"" \
    "ALLOY_EXEC_STATE=\"${v_state}\"" \
    "ALLOY_EXEC_RESULT_CODE=\"${v_result}\"" \
    "ALLOY_EXEC_RETRYABLE=\"${v_retry}\"" \
    "ALLOY_EXEC_DESIRED_STATE_REACHED=\"${v_desired}\"" \
    "ALLOY_EXEC_CLAIM_PID=\"${v_cpid}\"" \
    "ALLOY_EXEC_CLAIM_LEASE_UNTIL=\"${v_lease}\"" \
    "ALLOY_EXEC_ATTEMPT_COUNT=${v_attempts}" \
    "ALLOY_EXEC_STARTED_AT=\"$(g ALLOY_EXEC_STARTED_AT)\"" \
    "ALLOY_EXEC_ENDED_AT=\"${v_ended}\"" \
    "ALLOY_EXEC_UPDATED_AT=\"$(alloy_act_iso_now)\""
}

# Mark a terminal state + result classification, stamping ended_at.
alloy_act_exec_terminal() {
  local exec_id="$1" state="$2" result="$3" retryable="$4" desired="${5:-unknown}"
  alloy_act_exec_update "$exec_id" \
    ALLOY_EXEC_STATE "$state" \
    ALLOY_EXEC_RESULT_CODE "$result" \
    ALLOY_EXEC_RETRYABLE "$retryable" \
    ALLOY_EXEC_DESIRED_STATE_REACHED "$desired" \
    ALLOY_EXEC_ENDED_AT "$(alloy_act_iso_now)"
}

# Is an execution's claim currently live? (PID primary; lease is a secondary bound.)
alloy_act_exec_claim_live() {
  local exec_id="$1" pid lease
  pid="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_CLAIM_PID 2>/dev/null || true)"
  lease="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_CLAIM_LEASE_UNTIL 2>/dev/null || true)"
  # C-2: PID liveness AND the claim lease (bounds a reused-PID false-live claim).
  [[ -n "$pid" ]] && alloy_rc_pid_alive "$pid" && alloy_act_lease_active "$lease"
}

# ===========================================================================
# LIVE AUTHORIZATION — re-invoke the authoritative R2 evaluator and derive the
# execution authority for one operation. Sets _ACT_* globals. NEVER re-implements
# policy; NEVER chooses an alternate posture or target.
#
# Sets: _ACT_AUTHORIZED(bool) _ACT_RESULT_CODE _ACT_ISO _ACT_DECISION
#       _ACT_REASON _ACT_CAPACITY_REQUIRED _ACT_STALE _ACT_TARGET_NS
#       _ACT_NEXT_ACTIONS _ACT_INTENT_FP _ACT_ADM_FP _ACT_HUMAN
# ===========================================================================
alloy_act_authorize() {
  local wt="$1" op="$2"
  _ACT_AUTHORIZED=false; _ACT_RESULT_CODE=""; _ACT_HUMAN=""; _ACT_TARGET_NS=""
  _ACT_ISO=""; _ACT_DECISION=""; _ACT_REASON=""; _ACT_CAPACITY_REQUIRED=0
  _ACT_STALE=false; _ACT_NEXT_ACTIONS=""; _ACT_INTENT_FP=""; _ACT_ADM_FP=""

  # 1) A recorded intent MUST exist (the persisted, identity-checked declaration).
  if ! alloy_ad_intent_exists "$wt"; then
    _ACT_RESULT_CODE="intent-not-admitted"; _ACT_HUMAN="no runtime intent recorded for '$wt'"; return 0
  fi
  local r_mut r_ten r_iso r_mission r_declared r_supersedes
  r_mut="$(alloy_ad_intent_get "$wt" ALLOY_INTENT_POSTURE_MUTATION 2>/dev/null || true)"
  r_ten="$(alloy_ad_intent_get "$wt" ALLOY_INTENT_POSTURE_TENANT 2>/dev/null || true)"
  r_iso="$(alloy_ad_intent_get "$wt" ALLOY_INTENT_ISOLATION_CLASS 2>/dev/null || true)"
  r_mission="$(alloy_ad_intent_get "$wt" ALLOY_INTENT_MISSION_KEY 2>/dev/null || true)"
  r_declared="$(alloy_ad_intent_get "$wt" ALLOY_INTENT_DECLARED_AT 2>/dev/null || true)"
  r_supersedes="$(alloy_ad_intent_get "$wt" ALLOY_INTENT_SUPERSEDES_COUNT 2>/dev/null || printf 0)"

  # 2) Re-read posture + coordination and RE-EVALUATE LIVE via the R2 owner.
  alloy_ad_read_posture "$wt"
  local cur_iso coord
  cur_iso="$(alloy_ad_resolve_isolation "$_AD_MUTATION" "$_AD_TENANT")"
  coord="$(alloy_ad_intent_coordination "$wt")"
  alloy_ad_evaluate "$_AD_MUTATION" "$_AD_TENANT" "$coord"   # sets _AD_* (decision, reason, capacity)

  _ACT_ISO="$_AD_ISOLATION"; _ACT_DECISION="$_AD_DECISION"; _ACT_REASON="$_AD_REASON_CODE"
  _ACT_CAPACITY_REQUIRED="$_AD_CAPACITY_REQUIRED"; _ACT_NEXT_ACTIONS="$_AD_NEXT_ACTIONS"
  _ACT_INTENT_FP="$(alloy_act_intent_fingerprint "$r_mission" "$wt" "$r_iso" "$r_mut" "$r_ten" "$r_declared" "$r_supersedes")"
  _ACT_ADM_FP="$(alloy_act_admission_fingerprint "$_AD_ISOLATION" "$_AD_DECISION" "$_AD_REASON_CODE" "$_AD_CAPACITY_REQUIRED")"

  # 3) Staleness: current posture must still resolve to the recorded class.
  if [[ "$_AD_MUTATION" != "$r_mut" || "$_AD_TENANT" != "$r_ten" || "$cur_iso" != "$r_iso" ]]; then
    _ACT_STALE=true
    _ACT_RESULT_CODE="stale-admission"
    _ACT_HUMAN="recorded intent posture drifted (was ${r_mut}/${r_ten}->${r_iso}, now ${_AD_MUTATION}/${_AD_TENANT}->${cur_iso})"
    return 0
  fi

  # 4) The requested operation must be authorised by the LIVE decision.
  case "$op" in
    provision)
      case "$_AD_DECISION" in
        admitted-dedicated)    _ACT_TARGET_NS="$(alloy_act_mint_namespace "$r_mission" "$wt" "$_AD_ISOLATION")" ;;
        admitted-shared-new)   _ACT_TARGET_NS="$(alloy_act_mint_namespace "$r_mission" "$wt" "$_AD_ISOLATION")" ;;
        admitted-shared-existing)
          _ACT_RESULT_CODE="unsupported-operation"
          _ACT_HUMAN="decision '${_AD_DECISION}' authorises attach (use existing shared runtime), not provision"; return 0 ;;
        *) _ACT_RESULT_CODE="intent-not-admitted"
           _ACT_HUMAN="provision requires a live admitted provisioning decision; got '${_AD_DECISION}'"; return 0 ;;
      esac
      ;;
    attach)
      if [[ "$_AD_DECISION" == "admitted-shared-existing" ]]; then
        _ACT_TARGET_NS="$_AD_SHARED_CANDIDATE"
        [[ -n "$_ACT_TARGET_NS" ]] || { _ACT_RESULT_CODE="target-not-found"; _ACT_HUMAN="admitted-shared-existing but no shared candidate observed"; return 0; }
      else
        _ACT_RESULT_CODE="intent-not-admitted"
        _ACT_HUMAN="attach requires a live admitted-shared-existing decision; got '${_AD_DECISION}'"; return 0
      fi
      ;;
    detach|retire)
      # These act on an EXISTING relationship/runtime; their target is derived from
      # the recorded attachment, and their ownership preconditions are enforced by
      # the dispatcher (never by name inference). Authorisation of the *policy* here
      # only requires that the intent is not stale (checked above) and admitted-shaped.
      local at_ns; at_ns="$(alloy_act_attachment_get "$wt" ALLOY_ATTACH_TARGET_NAMESPACE 2>/dev/null || true)"
      _ACT_TARGET_NS="$at_ns"
      ;;
    reconcile)
      : # reconcile resolves its own target from an execution id / worktree
      ;;
    *) _ACT_RESULT_CODE="invalid-execution-request"; _ACT_HUMAN="unknown operation '$op'"; return 0 ;;
  esac

  _ACT_AUTHORIZED=true
  _ACT_HUMAN="authorised: ${op} under live decision ${_AD_DECISION}"
  return 0
}

# ===========================================================================
# ATOMIC RESERVE — under the global capacity lock, confirm the capacity
# opportunity still exists and write the reservation. Returns 0 on reserve, sets
# _ACT_RESV_ID; on failure sets _ACT_RESULT_CODE and returns 1.
# ===========================================================================
alloy_act_reserve() {
  local mission="$1" wt="$2" iso="$3" ns="$4" op="$5" adm_fp="$6"
  _ACT_RESV_ID=""; _ACT_RESULT_CODE=""
  local units; units="$(alloy_act_capacity_units_for "$op" "$_ACT_CAPACITY_REQUIRED")"
  local rid; rid="$(alloy_act_reservation_id "$mission" "$wt" "$iso" "$ns")"
  local now iso_now ttl exp_e now_e exp_iso
  iso_now="$(alloy_act_iso_now)"; ttl="$(alloy_act_reservation_ttl)"
  now_e="$(alloy_act_epoch_now)"
  if [[ -n "$now_e" ]]; then exp_e=$(( now_e + ttl )); exp_iso="$(alloy_act_epoch_to_iso "$exp_e")"; else exp_iso=""; fi

  alloy_act_ensure_dirs
  # Zero-unit reservations (attach/detach/retire/reconcile) need no capacity gate.
  if [[ "$units" -eq 0 ]]; then
    # A prior live reservation for this resource with 0 units is fine to reuse.
    if alloy_act_resv_exists "$rid" && [[ "$(alloy_act_resv_get "$rid" ALLOY_RESV_STATE)" == "held" ]]; then
      _ACT_RESV_ID="$rid"; return 0
    fi
    alloy_act_write_reservation "$rid" "$mission" "$wt" "$iso" "$ns" 0 held "$exp_iso" "$adm_fp" "" "$iso_now"
    _ACT_RESV_ID="$rid"; return 0
  fi

  # Capacity-consuming: serialize the opportunity check + write under one lock.
  local lockd
  if ! lockd="$(alloy_act_lock_acquire capacity "reserve:${rid}")"; then
    _ACT_RESULT_CODE="reservation-conflict"; return 1
  fi
  # shellcheck disable=SC2064
  trap "alloy_act_lock_release capacity" RETURN

  # Reuse an existing live reservation for this exact resource (idempotent reserve).
  if alloy_act_resv_exists "$rid"; then
    local st; st="$(alloy_act_resv_get "$rid" ALLOY_RESV_STATE || true)"
    if [[ "$st" == "held" ]] && alloy_act_reservation_is_live "$rid"; then
      _ACT_RESV_ID="$rid"; alloy_act_lock_release capacity; trap - RETURN; return 0
    fi
  fi

  local rem; rem="$(alloy_act_effective_remaining)"
  if (( rem < units )); then
    _ACT_RESULT_CODE="reservation-capacity-exhausted"
    alloy_act_lock_release capacity; trap - RETURN; return 1
  fi
  alloy_act_write_reservation "$rid" "$mission" "$wt" "$iso" "$ns" "$units" held "$exp_iso" "$adm_fp" "" "$iso_now"
  _ACT_RESV_ID="$rid"
  alloy_act_lock_release capacity; trap - RETURN
  return 0
}

# Claim a reservation for one execution: record the claim PID/lease and bind it to
# the execution id. Keeps the reservation live past its timestamp while PID alive.
alloy_act_claim_reservation() {
  local rid="$1" exec_id="$2"
  local lease_e lease_iso now_e
  now_e="$(alloy_act_epoch_now)"
  if [[ -n "$now_e" ]]; then lease_e=$(( now_e + ALLOY_ACT_CLAIM_LEASE_DEFAULT )); lease_iso="$(alloy_act_epoch_to_iso "$lease_e")"; else lease_iso=""; fi
  # Same lease on both the reservation and the execution head so both liveness
  # checks (capacity + idempotency) enforce the identical bound (C-2).
  alloy_act_resv_set_claim_pid "$rid" "$$" "$lease_iso"
  alloy_act_exec_update "$exec_id" \
    ALLOY_EXEC_CLAIM_PID "$$" \
    ALLOY_EXEC_CLAIM_LEASE_UNTIL "$lease_iso"
}

# ===========================================================================
# read-surface JSON emitters (consumed by alloy-ro read verbs; alloy-ro writes
# nothing). Deterministic; parsed-never-sourced sources.
# ===========================================================================
alloy_act_emit_reservation_json() {
  local rid="$1" p; p="$(alloy_act_reservation_path "$rid")"
  local g; g() { alloy_rc_meta_get "$p" "$1" 2>/dev/null || printf ''; }
  local live=false; alloy_act_reservation_is_live "$rid" 2>/dev/null && live=true
  printf '{'
  alloy_rc_json_kv_raw schema_version "$(g ALLOY_RESV_SCHEMA_VERSION)"; printf ','
  alloy_rc_json_kv reservation_id "$(g ALLOY_RESV_ID)"; printf ','
  alloy_rc_json_kv mission_key "$(g ALLOY_RESV_MISSION_KEY)"; printf ','
  alloy_rc_json_kv worktree "$(g ALLOY_RESV_WORKTREE)"; printf ','
  alloy_rc_json_kv isolation_class "$(g ALLOY_RESV_ISOLATION_CLASS)"; printf ','
  alloy_rc_json_kv target_namespace "$(g ALLOY_RESV_TARGET_NAMESPACE)"; printf ','
  alloy_rc_json_kv_raw capacity_units "$(g ALLOY_RESV_CAPACITY_UNITS)"; printf ','
  alloy_rc_json_kv state "$(g ALLOY_RESV_STATE)"; printf ','
  alloy_rc_json_kv_raw live "$live"; printf ','
  alloy_rc_json_kv created_at "$(g ALLOY_RESV_CREATED_AT)"; printf ','
  alloy_rc_json_kv expires_at "$(g ALLOY_RESV_EXPIRES_AT)"; printf ','
  alloy_rc_json_kv execution_id "$(g ALLOY_RESV_EXECUTION_ID)"
  printf '}'
}

alloy_act_emit_execution_json() {
  local exec_id="$1" p; p="$(alloy_act_execution_path "$exec_id")"
  local g; g() { alloy_rc_meta_get "$p" "$1" 2>/dev/null || printf ''; }
  local claim_live=false; alloy_act_exec_claim_live "$exec_id" 2>/dev/null && claim_live=true
  printf '{'
  alloy_rc_json_kv_raw schema_version "$(g ALLOY_EXEC_SCHEMA_VERSION)"; printf ','
  alloy_rc_json_kv execution_id "$(g ALLOY_EXEC_ID)"; printf ','
  alloy_rc_json_kv mission_key "$(g ALLOY_EXEC_MISSION_KEY)"; printf ','
  alloy_rc_json_kv worktree "$(g ALLOY_EXEC_WORKTREE)"; printf ','
  alloy_rc_json_kv isolation_class "$(g ALLOY_EXEC_ISOLATION_CLASS)"; printf ','
  alloy_rc_json_kv operation "$(g ALLOY_EXEC_OPERATION)"; printf ','
  alloy_rc_json_kv target_namespace "$(g ALLOY_EXEC_TARGET_NAMESPACE)"; printf ','
  alloy_rc_json_kv reservation_id "$(g ALLOY_EXEC_RESERVATION_ID)"; printf ','
  alloy_rc_json_kv adapter "$(g ALLOY_EXEC_ADAPTER)"; printf ','
  alloy_rc_json_kv state "$(g ALLOY_EXEC_STATE)"; printf ','
  alloy_rc_json_kv result_code "$(g ALLOY_EXEC_RESULT_CODE)"; printf ','
  alloy_rc_json_kv retryable "$(g ALLOY_EXEC_RETRYABLE)"; printf ','
  alloy_rc_json_kv desired_state_reached "$(g ALLOY_EXEC_DESIRED_STATE_REACHED)"; printf ','
  alloy_rc_json_kv_raw claim_live "$claim_live"; printf ','
  alloy_rc_json_kv_raw attempt_count "$(g ALLOY_EXEC_ATTEMPT_COUNT)"; printf ','
  alloy_rc_json_kv initiated_by "$(g ALLOY_EXEC_INITIATED_BY)"; printf ','
  alloy_rc_json_kv started_at "$(g ALLOY_EXEC_STARTED_AT)"; printf ','
  alloy_rc_json_kv ended_at "$(g ALLOY_EXEC_ENDED_AT)"
  printf '}'
}

# Reservation-aware capacity snapshot (read-only overlay on R2's capacity).
alloy_act_emit_capacity_json() {
  local active max held rem
  active="$(alloy_rt_active_runtime_count)"; [[ "$active" =~ ^[0-9]+$ ]] || active=0
  max="$ALLOY_RT_MAX_ACTIVE"; [[ "$max" =~ ^[0-9]+$ ]] || max=0
  held="$(alloy_act_held_capacity_units)"; rem="$(alloy_act_effective_remaining)"
  printf '{'
  alloy_rc_json_kv_raw schema_version "$ALLOY_ACT_SCHEMA_VERSION"; printf ','
  alloy_rc_json_kv contract "runtime-actuation-capacity"; printf ','
  alloy_rc_json_kv_raw configured_max_runtimes "$max"; printf ','
  alloy_rc_json_kv_raw observed_active_runtimes "$active"; printf ','
  alloy_rc_json_kv_raw held_reservation_units "$held"; printf ','
  alloy_rc_json_kv_raw effective_remaining "$rem"; printf ','
  alloy_rc_json_kv note "reservation-aware overlay; R2 owns the max/active formula, R3 subtracts live held reservations"
  printf '}'
}
