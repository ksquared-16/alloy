#!/usr/bin/env bash
# lib/actuation-exec.sh — R3 execution state machine + operation handlers.
#
# The dispatch layer. Sourced ONLY by the mutating CLI alloy-runtime-actuate (never
# by alloy-ro). It drives the atomic sequence (Decision 3):
#   1 load intent · 2 validate identity+freshness · 3 live R2 evaluate ·
#   4 confirm op ∈ allowed next actions · 5 reserve under durable lock ·
#   6 claim for one attempt · 7 dispatch bounded adapter op · verify via R1.
#
# It NEVER decides policy (R2 owns it), NEVER sequences missions or retries
# (Director owns that), and NEVER lets a zero provider exit code mean success —
# success requires independent R1 observation + an R3 verification judgement.
# shellcheck shell=bash

[[ -n "${ALLOY_ACT_EXEC_LOADED:-}" ]] && return 0
ALLOY_ACT_EXEC_LOADED=1

_ALLOY_ACT_EXEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/actuation-core.sh
source "${_ALLOY_ACT_EXEC_DIR}/actuation-core.sh"
# shellcheck source=lib/actuation-adapter.sh
source "${_ALLOY_ACT_EXEC_DIR}/actuation-adapter.sh"

_ALLOY_ACT_REGISTER_CMD="${_ALLOY_ACT_EXEC_DIR}/../alloy-runtime-register"

# ---------------------------------------------------------------------------
# verification (R3 JUDGEMENT over authoritative R1 observation). R3 does not build
# a second inspection engine — it reads runtime-core fields and compares.
#   dedicated desired = observably active AND health healthy
#   attach     desired = target observably present (active or partial)
#   retire     desired = target observably absent
# ---------------------------------------------------------------------------
alloy_act_verify_active_healthy() {
  local ns="$1" st health
  st="$(alloy_rt_ns_field "$ns" container_state)"
  health="$(alloy_rt_ns_field "$ns" health)"
  [[ "$st" == "active" && "$health" == "healthy" ]]
}
alloy_act_verify_present() {
  local st; st="$(alloy_rt_ns_field "$1" container_state)"
  [[ "$st" == "active" || "$st" == "partial" ]]
}
alloy_act_verify_absent() {
  local st; st="$(alloy_rt_ns_field "$1" container_state)"
  [[ "$st" == "absent" ]]
}

# Compose the R0 registry owner to register/update runtime identity (never a parallel
# registry). Best-effort; a registration failure does not fabricate success.
alloy_act_register_runtime() {
  local ns="$1" mission="$2" iso="$3"
  [[ -x "$_ALLOY_ACT_REGISTER_CMD" ]] || return 1
  "$_ALLOY_ACT_REGISTER_CMD" "$ns" --owner "$mission" --class "$iso" --force >/dev/null 2>&1
}

# Registry ownership check for retire (never name inference).
alloy_act_registry_owner_class() {
  local ns="$1" id
  id="$(alloy_rt_registry_id_for_namespace "$ns" 2>/dev/null || true)"
  [[ -n "$id" ]] || return 1
  printf '%s\x1f%s' \
    "$(alloy_rt_reg_get "$(alloy_rt_registry_path "$id")" ALLOY_RT_OWNER_MISSION_KEY 2>/dev/null || true)" \
    "$(alloy_rt_reg_get "$(alloy_rt_registry_path "$id")" ALLOY_RT_RUNTIME_CLASS 2>/dev/null || true)"
}

# ---------------------------------------------------------------------------
# operation handlers. Each sets the execution to a terminal state and returns.
# Signature: <exec_id> <attempt_id> <mission> <wt> <iso> <ns> <resv_id> <adapter>
# ---------------------------------------------------------------------------
_alloy_act_do_provision() {
  local exec_id="$1" attempt="$2" mission="$3" wt="$4" iso="$5" ns="$6" resv_id="$7" adapter="$8"

  # Idempotent short-circuit: runtime already observably active AND owned by this
  # mission ⇒ do NOT provision a second runtime (survives execution-record loss).
  local oc reg_owner=""; oc="$(alloy_act_registry_owner_class "$ns" 2>/dev/null || true)"
  reg_owner="${oc%%$'\x1f'*}"
  if alloy_act_verify_active_healthy "$ns" && [[ -n "$reg_owner" && "$reg_owner" == "$mission" ]]; then
    alloy_act_write_attachment "$wt" "$mission" "$ns" "$iso" dedicated "$exec_id"
    [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" consumed "idempotent-existing"
    alloy_act_log_event "$exec_id" "$attempt" provision idempotent-existing "runtime already active+owned"
    alloy_act_exec_terminal "$exec_id" succeeded ok false true
    return 0
  fi

  local out status state result retry
  out="$(alloy_act_adapter_provision "$ns" "$iso")" || true
  status="$(alloy_act_adapter_status_of "$out")"
  read -r state result retry < <(alloy_act_adapter_classify "$status")
  alloy_act_log_event "$exec_id" "$attempt" provision "adapter-$status" "ns=$ns"

  if [[ "$status" != "ok" ]]; then
    if [[ "$status" == "timeout" ]]; then
      # Ambiguous: provider may have partially created the runtime. Do NOT release
      # the reservation or assume success — leave for reconcile via R1.
      alloy_act_exec_terminal "$exec_id" timed_out ambiguous-provider-result true unknown
    else
      # Clear failure — nothing created; free the reserved capacity.
      [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" released "provider-$status"
      alloy_act_exec_terminal "$exec_id" failed "$result" "$retry" false
    fi
    return 0
  fi

  # provider reported success — VERIFY independently before believing it.
  alloy_act_exec_update "$exec_id" ALLOY_EXEC_STATE verifying
  if alloy_act_verify_active_healthy "$ns"; then
    alloy_act_register_runtime "$ns" "$mission" "$iso" || \
      alloy_act_log_event "$exec_id" "$attempt" register register-failed "non-fatal; runtime verified"
    alloy_act_write_attachment "$wt" "$mission" "$ns" "$iso" dedicated "$exec_id"
    [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" consumed "provisioned"
    alloy_act_log_event "$exec_id" "$attempt" verify desired-reached "active+healthy"
    alloy_act_exec_terminal "$exec_id" succeeded ok false true
  else
    # Provider success but verification failed — NOT success.
    [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" released "verification-failed"
    alloy_act_log_event "$exec_id" "$attempt" verify desired-not-reached "provider ok but not active+healthy"
    alloy_act_exec_terminal "$exec_id" failed verification-failed false false
  fi
  return 0
}

_alloy_act_do_attach() {
  local exec_id="$1" attempt="$2" mission="$3" wt="$4" iso="$5" ns="$6" resv_id="$7"
  # Attach establishes a relationship only; it never mutates the shared runtime.
  if ! alloy_act_verify_present "$ns"; then
    alloy_act_log_event "$exec_id" "$attempt" attach target-not-found "ns=$ns"
    alloy_act_exec_terminal "$exec_id" failed target-not-found true false
    return 0
  fi
  alloy_act_write_attachment "$wt" "$mission" "$ns" "$iso" shared "$exec_id"
  if alloy_act_attachment_exists "$wt" && alloy_act_verify_present "$ns"; then
    alloy_act_log_event "$exec_id" "$attempt" attach attached "relationship recorded; shared runtime untouched"
    alloy_act_exec_terminal "$exec_id" succeeded ok false true
  else
    alloy_act_exec_terminal "$exec_id" failed verification-failed true false
  fi
  return 0
}

_alloy_act_do_detach() {
  local exec_id="$1" attempt="$2" mission="$3" wt="$4" iso="$5" ns="$6" resv_id="$7"
  if ! alloy_act_attachment_exists "$wt"; then
    alloy_act_log_event "$exec_id" "$attempt" detach no-attachment "$wt"
    alloy_act_exec_terminal "$exec_id" failed invalid-execution-request false false
    return 0
  fi
  local kind at_ns
  kind="$(alloy_act_attachment_get "$wt" ALLOY_ATTACH_KIND 2>/dev/null || true)"
  at_ns="$(alloy_act_attachment_get "$wt" ALLOY_ATTACH_TARGET_NAMESPACE 2>/dev/null || true)"
  # Orphan-safety: detaching a DEDICATED runtime's relationship would orphan an
  # ownership state that requires Director policy (retire, not detach). Fail closed.
  if [[ "$kind" == "dedicated" ]]; then
    alloy_act_log_event "$exec_id" "$attempt" detach refuse-orphan "dedicated attachment requires retire"
    alloy_act_exec_terminal "$exec_id" failed non-retryable-invariant-violation false false
    return 0
  fi
  # Shared: remove the relationship only; never mutate the shared runtime.
  alloy_act_remove_attachment "$wt"
  alloy_act_log_event "$exec_id" "$attempt" detach detached "shared runtime untouched (ns=$at_ns)"
  alloy_act_exec_terminal "$exec_id" succeeded ok false true
  return 0
}

_alloy_act_do_retire() {
  local exec_id="$1" attempt="$2" mission="$3" wt="$4" iso="$5" ns="$6" resv_id="$7" adapter="$8"
  if [[ -z "$ns" ]]; then
    alloy_act_exec_terminal "$exec_id" failed target-not-found false false; return 0
  fi
  # OWNERSHIP PROOF (never name inference): registry record + owner==mission + class dedicated-*.
  local oc reg_owner reg_class
  oc="$(alloy_act_registry_owner_class "$ns" 2>/dev/null || true)"
  reg_owner="${oc%%$'\x1f'*}"; reg_class="${oc##*$'\x1f'}"
  if [[ -z "$reg_owner" || "$reg_owner" != "$mission" ]]; then
    alloy_act_log_event "$exec_id" "$attempt" retire ownership-not-proven "owner='$reg_owner' mission='$mission'"
    alloy_act_exec_terminal "$exec_id" failed non-retryable-invariant-violation false false; return 0
  fi
  case "$reg_class" in
    dedicated-disposable|dedicated-certified) : ;;
    *) alloy_act_log_event "$exec_id" "$attempt" retire refuse-non-dedicated "class='$reg_class'"
       alloy_act_exec_terminal "$exec_id" failed non-retryable-invariant-violation false false; return 0 ;;
  esac
  # For the real adapter, require its durable ownership record too (defence in depth).
  if [[ "$adapter" == "supabase" ]] && ! alloy_adapter_supabase_has_ownership "$ns"; then
    alloy_act_log_event "$exec_id" "$attempt" retire no-adapter-ownership "$ns"
    alloy_act_exec_terminal "$exec_id" failed non-retryable-invariant-violation false false; return 0
  fi

  local out status state result retry
  out="$(alloy_act_adapter_retire "$ns")" || true
  status="$(alloy_act_adapter_status_of "$out")"
  read -r state result retry < <(alloy_act_adapter_classify "$status")
  alloy_act_log_event "$exec_id" "$attempt" retire "adapter-$status" "ns=$ns"

  if [[ "$status" != "ok" ]]; then
    if [[ "$status" == "timeout" ]]; then
      alloy_act_exec_terminal "$exec_id" timed_out ambiguous-provider-result true unknown
    else
      alloy_act_exec_terminal "$exec_id" failed "$result" "$retry" false
    fi
    return 0
  fi
  # Verify ABSENCE via R1 before believing teardown.
  if alloy_act_verify_absent "$ns"; then
    alloy_act_remove_attachment "$wt"
    # Capacity is freed because the runtime is no longer observed active. The R0
    # registry record naturally becomes 'orphaned' (R0 semantics); cleanup of the
    # orphaned record is a Director/operator follow-up (R3 does not delete R0 files).
    alloy_act_log_event "$exec_id" "$attempt" retire absent "runtime torn down; capacity freed"
    alloy_act_exec_terminal "$exec_id" succeeded ok false true
  else
    alloy_act_log_event "$exec_id" "$attempt" retire still-present "observed after retire"
    alloy_act_exec_terminal "$exec_id" failed desired-state-not-reached true false
  fi
  return 0
}

# ---------------------------------------------------------------------------
# reconciliation — bounded (Decision 2). Inspect an incomplete/ambiguous attempt,
# invoke R1, complete bookkeeping when evidence is CONCLUSIVE, release abandoned
# reservations, classify for Director-owned retry. It NEVER re-runs a destructive
# action, reinterprets desired state, chooses another target, or overrides R2.
# ---------------------------------------------------------------------------
alloy_act_reconcile_execution() {
  local exec_id="$1"
  alloy_act_exec_exists "$exec_id" || return 1
  local st op ns mission iso resv_id
  st="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_STATE)"
  op="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_OPERATION)"
  ns="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_TARGET_NAMESPACE)"
  mission="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_MISSION_KEY)"
  iso="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_ISOLATION_CLASS)"
  resv_id="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_RESERVATION_ID)"

  # A live claim means the execution is genuinely still in progress — do not touch.
  if ! alloy_act_exec_is_terminal "$st" && alloy_act_exec_claim_live "$exec_id"; then
    return 0
  fi

  # Reconcilable states: any non-terminal (interrupted) execution, OR a terminal
  # `timed_out` (an ambiguous provider result the spec requires be resolved via R1).
  # All other terminals are settled and left untouched.
  if ! alloy_act_exec_is_terminal "$st" || [[ "$st" == "timed_out" ]]; then
    case "$op" in
      provision)
        if alloy_act_verify_active_healthy "$ns"; then
          alloy_act_register_runtime "$ns" "$mission" "$iso" || true
          local wt; wt="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_WORKTREE)"
          alloy_act_write_attachment "$wt" "$mission" "$ns" "$iso" dedicated "$exec_id"
          [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" consumed "reconcile-adopt"
          alloy_act_log_event "$exec_id" reconcile adopt succeeded "R1 shows active+healthy"
          alloy_act_exec_terminal "$exec_id" succeeded ok false true
        elif alloy_act_verify_absent "$ns"; then
          [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" released "reconcile-absent"
          alloy_act_log_event "$exec_id" reconcile absent failed "R1 shows nothing created"
          alloy_act_exec_terminal "$exec_id" failed desired-state-not-reached true false
        else
          # partial/unhealthy — inconclusive for success; classify retryable for Director.
          [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" released "reconcile-inconclusive"
          alloy_act_log_event "$exec_id" reconcile inconclusive timed_out "R1 partial/unhealthy"
          alloy_act_exec_terminal "$exec_id" timed_out ambiguous-provider-result true unknown
        fi
        ;;
      retire)
        if alloy_act_verify_absent "$ns"; then
          local wt2; wt2="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_WORKTREE)"
          alloy_act_remove_attachment "$wt2"
          alloy_act_log_event "$exec_id" reconcile absent succeeded "teardown confirmed by R1"
          alloy_act_exec_terminal "$exec_id" succeeded ok false true
        else
          alloy_act_log_event "$exec_id" reconcile still-present timed_out "R1 still observes target"
          alloy_act_exec_terminal "$exec_id" timed_out ambiguous-provider-result true unknown
        fi
        ;;
      *)
        alloy_act_log_event "$exec_id" reconcile classify failed "interrupted $op; no data-plane effect"
        alloy_act_exec_terminal "$exec_id" failed internal-execution-failure true false
        ;;
    esac
  fi

  # Release an abandoned reservation whose execution is now terminal (bookkeeping only).
  if [[ -n "$resv_id" ]] && alloy_act_resv_exists "$resv_id"; then
    local rstate; rstate="$(alloy_act_resv_get "$resv_id" ALLOY_RESV_STATE)"
    if [[ "$rstate" == "held" ]] && ! alloy_act_reservation_is_live "$resv_id"; then
      alloy_act_resv_set_state "$resv_id" released "reconcile-abandoned"
    fi
  fi
  return 0
}

# Expire abandoned held reservations across the board (TTL bookkeeping only).
alloy_act_reconcile_expiry() {
  local rid state
  while IFS= read -r rid; do
    [[ -n "$rid" ]] || continue
    state="$(alloy_act_resv_get "$rid" ALLOY_RESV_STATE 2>/dev/null || true)"
    [[ "$state" == "held" ]] || continue
    alloy_act_reservation_is_live "$rid" && continue
    alloy_act_resv_set_state "$rid" expired "ttl-expired-or-abandoned"
  done < <(alloy_act_reservation_ids)
}

# Reconcile every non-terminal execution + abandoned reservation for a worktree.
alloy_act_reconcile_for_worktree() {
  local wt="$1" eid ewt
  while IFS= read -r eid; do
    [[ -n "$eid" ]] || continue
    ewt="$(alloy_act_exec_get "$eid" ALLOY_EXEC_WORKTREE 2>/dev/null || true)"
    [[ "$ewt" == "$wt" ]] || continue
    alloy_act_reconcile_execution "$eid"
  done < <(alloy_act_execution_ids)
  alloy_act_reconcile_expiry
}

# ---------------------------------------------------------------------------
# THE DRIVER — one bounded execution attempt for one admitted intent + operation.
# Sets _EXEC_* result globals for the CLI. Returns 0 always (result is in the record).
# ---------------------------------------------------------------------------
_alloy_act_emit_from_record() {
  local exec_id="$1"
  _EXEC_ID="$exec_id"
  _EXEC_STATE="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_STATE 2>/dev/null || true)"
  _EXEC_RESULT="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_RESULT_CODE 2>/dev/null || true)"
  _EXEC_RETRYABLE="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_RETRYABLE 2>/dev/null || true)"
  _EXEC_DESIRED="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_DESIRED_STATE_REACHED 2>/dev/null || true)"
}

alloy_act_execute() {
  local wt="$1" op="$2" adapter="$3" initiated_by="$4"
  # This orchestration manages its own control flow and records every outcome; a
  # false [[ ]] / (( )) side-effect guard must not abort it under the CLI's set -e.
  # errexit stays off for the remainder of the process (the CLI only prints + exits
  # with an explicit code afterwards, and every identity check uses explicit alloy_die).
  set +e
  _EXEC_ID=""; _EXEC_STATE=""; _EXEC_RESULT=""; _EXEC_RETRYABLE=""; _EXEC_DESIRED=""
  alloy_act_init; alloy_act_ensure_dirs

  # reconcile is a distinct, non-mutating-to-data-plane path.
  if [[ "$op" == "reconcile" ]]; then
    alloy_act_reconcile_for_worktree "$wt"
    _EXEC_STATE="reconciled"; _EXEC_RESULT="ok"; _EXEC_RETRYABLE="false"; _EXEC_DESIRED="n/a"
    return 0
  fi

  # STEPS 1-4: load intent, validate freshness, live R2 evaluate, authorise operation.
  # (authorize is READ-ONLY — pure reads/evaluation — so it is safe to run concurrently
  # before the per-resource lock is taken.)
  alloy_act_authorize "$wt" "$op"
  local mission iso ns adm_fp
  mission="$(alloy_ad_intent_get "$wt" ALLOY_INTENT_MISSION_KEY 2>/dev/null || true)"
  [[ -n "$mission" ]] || mission="$(alloy_ad_mission_key "$wt")"
  iso="$_ACT_ISO"; ns="$_ACT_TARGET_NS"; adm_fp="$_ACT_ADM_FP"
  local exec_id; exec_id="$(alloy_act_execution_id "$mission" "$wt" "$iso" "$op" "$ns" "$adm_fp")"

  # C-0: serialize the ENTIRE per-resource critical section (idempotency read →
  # reserve → claim → dispatch) under ONE durable per-resource lock, acquired BEFORE
  # any shared reservation/execution state is read-modified. A concurrent delivery for
  # the same resource that cannot take the lock returns 'already-in-progress' and
  # mutates NOTHING (no reservation, no execution bookkeeping, no capacity effect).
  # Only an authorised operation has a resource (ns); an unauthorised/no-resource path
  # merely records an idempotent terminal and needs no lock.
  local rlock=""
  if [[ -n "$ns" ]]; then
    rlock="resource-${ns}"
    if ! alloy_act_lock_acquire "$rlock" "exec:${exec_id}" >/dev/null; then
      _EXEC_ID="$exec_id"
      if alloy_act_exec_exists "$exec_id"; then _alloy_act_emit_from_record "$exec_id"
      else _EXEC_STATE="in-progress"; _EXEC_DESIRED="unknown"; fi
      _EXEC_RESULT="already-in-progress"; _EXEC_RETRYABLE="false"
      return 0
    fi
    # shellcheck disable=SC2064
    trap "alloy_act_lock_release '$rlock'" RETURN
  fi

  # IDEMPOTENCY over an existing execution head (now serialized per resource).
  if alloy_act_exec_exists "$exec_id"; then
    local st; st="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_STATE)"
    if [[ "$st" == "succeeded" ]]; then _alloy_act_emit_from_record "$exec_id"; _EXEC_RESULT="reuse-terminal"; return 0; fi
    if ! alloy_act_exec_is_terminal "$st"; then
      if alloy_act_exec_claim_live "$exec_id"; then
        _alloy_act_emit_from_record "$exec_id"; _EXEC_RESULT="already-in-progress"; _EXEC_RETRYABLE="false"; return 0
      fi
      # crash: non-terminal head + dead claim → reconcile first.
      alloy_act_reconcile_execution "$exec_id"
      st="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_STATE)"
      if alloy_act_exec_is_terminal "$st"; then _alloy_act_emit_from_record "$exec_id"; return 0; fi
    else
      # C-1: a retryable/ambiguous terminal (e.g. timed_out) is RECONCILED via R1 first
      # on redelivery; R3 NEVER silently re-dispatches a provider mutation. A genuine
      # retry is Director's explicit decision, not an automatic effect of redelivery.
      local rc; rc="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_RETRYABLE)"
      if [[ "$rc" == "true" ]]; then
        alloy_act_reconcile_execution "$exec_id"
        _alloy_act_emit_from_record "$exec_id"; _EXEC_RESULT="reconciled-terminal"; return 0
      fi
      _alloy_act_emit_from_record "$exec_id"; _EXEC_RESULT="reuse-terminal"; return 0
    fi
  fi

  # NOT AUTHORISED → terminal (no reservation, no provider effect).
  if [[ "$_ACT_AUTHORIZED" != "true" ]]; then
    alloy_act_exec_exists "$exec_id" || alloy_act_write_execution "$exec_id" "$mission" "$wt" "$iso" "$op" "$ns" "" "$adapter" "$initiated_by" "$_ACT_DECISION"
    local tstate=failed; [[ "$_ACT_RESULT_CODE" == "stale-admission" ]] && tstate=stale
    alloy_act_exec_terminal "$exec_id" "$tstate" "$_ACT_RESULT_CODE" false unknown
    alloy_act_log_event "$exec_id" "-" authorize refused "$_ACT_RESULT_CODE"
    _alloy_act_emit_from_record "$exec_id"; return 0
  fi

  alloy_act_exec_exists "$exec_id" || alloy_act_write_execution "$exec_id" "$mission" "$wt" "$iso" "$op" "$ns" "" "$adapter" "$initiated_by" "$_ACT_DECISION"

  # STEP 5: reserve (ONLY provision consumes capacity; others carry no reservation).
  local resv_id=""
  if [[ "$op" == "provision" ]]; then
    if ! alloy_act_reserve "$mission" "$wt" "$iso" "$ns" "$op" "$adm_fp"; then
      alloy_act_exec_terminal "$exec_id" conflicted "$_ACT_RESULT_CODE" true unknown
      alloy_act_log_event "$exec_id" "-" reserve refused "$_ACT_RESULT_CODE"
      _alloy_act_emit_from_record "$exec_id"; return 0
    fi
    resv_id="$_ACT_RESV_ID"
    alloy_act_exec_update "$exec_id" ALLOY_EXEC_RESERVATION_ID "$resv_id"
  fi

  # STEP 6: claim for one attempt (the per-resource lock from C-0 is already held).
  local attempt_id prior_attempts
  attempt_id="$(alloy_act_next_attempt_id "$exec_id")"
  prior_attempts="$(alloy_act_exec_get "$exec_id" ALLOY_EXEC_ATTEMPT_COUNT)"; [[ "$prior_attempts" =~ ^[0-9]+$ ]] || prior_attempts=0
  alloy_act_exec_update "$exec_id" ALLOY_EXEC_STATE claimed ALLOY_EXEC_ATTEMPT_COUNT "$(( prior_attempts + 1 ))"
  [[ -n "$resv_id" ]] && alloy_act_claim_reservation "$resv_id" "$exec_id"
  alloy_act_log_event "$exec_id" "$attempt_id" claim claimed "op=$op ns=$ns adapter=$adapter"

  # STEP 7: dispatch the bounded adapter operation (data plane) + verify (R1).
  if [[ "$op" == "provision" || "$op" == "retire" ]]; then
    if ! alloy_act_adapter_select "$adapter" >/dev/null; then
      alloy_act_exec_terminal "$exec_id" failed provider-unavailable true false
      [[ -n "$resv_id" ]] && alloy_act_resv_set_state "$resv_id" released "adapter-refused"
      alloy_act_log_event "$exec_id" "$attempt_id" dispatch adapter-refused "$adapter"
      _alloy_act_emit_from_record "$exec_id"; return 0
    fi
  fi
  alloy_act_exec_update "$exec_id" ALLOY_EXEC_STATE executing
  case "$op" in
    provision) _alloy_act_do_provision "$exec_id" "$attempt_id" "$mission" "$wt" "$iso" "$ns" "$resv_id" "$adapter" ;;
    attach)    _alloy_act_do_attach    "$exec_id" "$attempt_id" "$mission" "$wt" "$iso" "$ns" "$resv_id" ;;
    detach)    _alloy_act_do_detach    "$exec_id" "$attempt_id" "$mission" "$wt" "$iso" "$ns" "$resv_id" ;;
    retire)    _alloy_act_do_retire    "$exec_id" "$attempt_id" "$mission" "$wt" "$iso" "$ns" "$resv_id" "$adapter" ;;
  esac

  # The per-resource lock (if held) is released by the RETURN trap set above.
  _alloy_act_emit_from_record "$exec_id"
  return 0
}
