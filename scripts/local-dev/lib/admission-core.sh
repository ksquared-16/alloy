#!/usr/bin/env bash
# lib/admission-core.sh — Shared Read Core: Runtime Intent & Admission Contract V1.
#
# The single owner of the DECLARE phase of runtime resource orchestration
# (observe → declare → actuate). Given a sprint's manifest posture and the
# observed runtime capacity, it answers, deterministically and read-only:
#
#   1. Does this sprint need a runtime?
#   2. What isolation class does it require?
#   3. May that request be admitted under current capacity?
#   4. Which runtime disposition applies (none / shared-readonly / shared-mutable
#      / dedicated-disposable / dedicated-certified)?
#   5. If refused, why (a stable reason code)?
#   6. What valid next actions are available (declarative; never executed here)?
#
# CONSTITUTION (Runtime Resource Orchestration R2 — DECLARE, never actuate):
#   Pure, deterministic, read-only. Same posture + same observed capacity → same
#   result. This module MUST NOT provision, start, stop, attach, detach, lease,
#   reclaim, or mutate any runtime; it never touches Docker or Supabase; it never
#   writes runtime state. It reads posture through the canonical manifest reader
#   (JSON, PARSED — never sourced as shell) and reads capacity/registry through
#   the runtime Shared Read Core (lib/runtime-core.sh). Admission is NOT
#   provisioning and reserves nothing: an admitted runtime may not yet exist.
#
# Naming: functions `alloy_ad_*`; resolved values `ALLOY_AD_*`; evaluation output
# is exposed as `_AD_*` globals set by alloy_ad_evaluate (like _RO_* in alloy-ro).
# shellcheck shell=bash

[[ -n "${ALLOY_AD_CORE_LOADED:-}" ]] && return 0
ALLOY_AD_CORE_LOADED=1

_ALLOY_AD_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/read-core.sh
source "${_ALLOY_AD_LIB_DIR}/read-core.sh"
# shellcheck source=lib/runtime-core.sh
source "${_ALLOY_AD_LIB_DIR}/runtime-core.sh"

ALLOY_AD_SCHEMA_VERSION=1
_ALLOY_AD_MANIFEST_IO="${_ALLOY_AD_LIB_DIR}/manifest-io.mjs"

# Canonical posture vocabulary — a REFERENCE to lib/manifest-io.mjs, restated
# here only for fail-closed validation (never a parallel schema). If the manifest
# schema grows a value, resolution below fails closed until it is mapped here.
ALLOY_AD_MUTATIONS="read-only shared-read-only isolated-mutable"
ALLOY_AD_TENANT_CLASSES="none shared disposable production-like"

# Canonical isolation classes (identical set to lib/runtime-core.sh registry
# classes, plus `none` for the no-runtime posture and `invalid` for fail-closed).
ALLOY_AD_ISOLATION_CLASSES="none shared-readonly shared-mutable dedicated-disposable dedicated-certified"

# --- config resolution -------------------------------------------------------
alloy_ad_init() {
  [[ "${ALLOY_AD_READY:-0}" == "1" ]] && return 0
  alloy_rt_init                      # brings up ALLOY_RT_* (runtime root, max, registry dir)
  ALLOY_AD_RUNTIME_ROOT="$ALLOY_RC_RUNTIME_ROOT"
  ALLOY_AD_MANIFESTS_DIR="$ALLOY_RC_RUNTIME_ROOT/manifests"
  ALLOY_AD_INTENTS_DIR="$ALLOY_RC_RUNTIME_ROOT/intents"
  ALLOY_AD_READY=1
}

# Deterministic timestamp. Reading the clock is a read, not a mutation (the core
# already reads mtimes via stat). ALLOY_AD_EVAL_NOW pins it for reproducible tests.
alloy_ad_iso_now() {
  [[ -n "${ALLOY_AD_EVAL_NOW:-}" ]] && { printf '%s' "$ALLOY_AD_EVAL_NOW"; return 0; }
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# ===========================================================================
# Manifest posture (read through the canonical reader; PARSED, never sourced).
# ===========================================================================
alloy_ad_manifest_path() { printf '%s/%s.json' "$ALLOY_AD_MANIFESTS_DIR" "$1"; }

# Read one manifest field via the canonical JSON reader. Exit codes distinguish
# the failure modes the posture reader must tell apart:
#   0 value printed · 1 manifest absent · 2 node unavailable · 3 manifest malformed
alloy_ad_manifest_get() {
  local wt="$1" key="$2" path out
  path="$(alloy_ad_manifest_path "$wt")"
  [[ -f "$path" ]] || return 1
  command -v node >/dev/null 2>&1 || return 2
  # manifest-io.mjs `get` reads JSON.parse (never sources); a malformed file makes
  # it throw → non-zero. We never source the manifest ourselves.
  out="$(node "$_ALLOY_AD_MANIFEST_IO" get "$path" "$key" 2>/dev/null)" || return 3
  printf '%s' "$out"
}

alloy_ad_manifest_exists() { [[ -f "$(alloy_ad_manifest_path "$1")" ]]; }

# Resolve posture into _AD_MUTATION / _AD_TENANT / _AD_POSTURE_SOURCE.
# _AD_POSTURE_SOURCE ∈ manifest-declared | manifest-absent | manifest-malformed |
#                      node-unavailable
# Absent/empty/undeclared values are surfaced as "undeclared" (a value, not a guess).
alloy_ad_read_posture() {
  local wt="$1" mut ten rc=0
  # Guard the substitution so a manifest-get failure (absent/malformed/no-node)
  # is classified here rather than aborting the caller under `set -e`.
  mut="$(alloy_ad_manifest_get "$wt" posture.mutation)" || rc=$?
  case "$rc" in
    1) _AD_MUTATION="absent"; _AD_TENANT="absent"; _AD_POSTURE_SOURCE="manifest-absent"; return 0 ;;
    2) _AD_MUTATION="unknown"; _AD_TENANT="unknown"; _AD_POSTURE_SOURCE="node-unavailable"; return 0 ;;
    3) _AD_MUTATION="unknown"; _AD_TENANT="unknown"; _AD_POSTURE_SOURCE="manifest-malformed"; return 0 ;;
  esac
  ten="$(alloy_ad_manifest_get "$wt" posture.tenant_class 2>/dev/null || true)"
  [[ -n "$mut" ]] || mut="undeclared"
  [[ -n "$ten" ]] || ten="undeclared"
  # Guard against shell-active junk sneaking out of a hand-edited manifest value.
  alloy_rc_is_safe_value "$mut" || mut="unknown"
  alloy_rc_is_safe_value "$ten" || ten="unknown"
  _AD_MUTATION="$mut"; _AD_TENANT="$ten"; _AD_POSTURE_SOURCE="manifest-declared"
}

# Derive a stable mission key from the manifest. Preference: initiative_key →
# sprint_name → worktree name. Sanitised to the registry owner grammar so it can
# join to ALLOY_RT_OWNER_MISSION_KEY. Deterministic.
alloy_ad_mission_key() {
  local wt="$1" v
  for key in initiative_key sprint_name; do
    v="$(alloy_ad_manifest_get "$wt" "$key" 2>/dev/null || true)"
    case "$v" in ""|null|undeclared|unknown) continue ;; esac
    alloy_rc_is_safe_value "$v" || continue
    if [[ "$v" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then printf '%s' "$v"; return 0; fi
  done
  printf '%s' "$wt"
}

# ===========================================================================
# Canonical isolation resolver — ONE owner. Any unsupported or contradictory
# combination fails closed to `invalid` (never guessed, never silently coerced,
# never downgraded to a cheaper class).
# ===========================================================================
alloy_ad_resolve_isolation() {
  local mut="$1" ten="$2"
  case "${mut}|${ten}" in
    "read-only|none")                  printf 'none' ;;
    "read-only|shared")                printf 'shared-readonly' ;;
    "shared-read-only|shared")         printf 'shared-readonly' ;;
    "isolated-mutable|disposable")     printf 'dedicated-disposable' ;;
    "isolated-mutable|production-like") printf 'dedicated-certified' ;;
    "shared-read-only|production-like") printf 'dedicated-certified' ;;
    "isolated-mutable|shared")         printf 'shared-mutable' ;;
    *)                                 printf 'invalid' ;;
  esac
}

# Why a posture is invalid (stable reason-code slug). Only called when resolution
# returned `invalid`.
alloy_ad_invalid_reason_code() {
  local mut="$1" ten="$2"
  case "$mut" in absent) printf 'posture-undeclared'; return ;; unknown) printf 'posture-malformed'; return ;; esac
  case "$ten" in absent) printf 'posture-undeclared'; return ;; unknown) printf 'posture-malformed'; return ;; esac
  # Both fields present but not a supported/known enum value, or an unsupported pair.
  local known_mut=0 known_ten=0 m t
  for m in $ALLOY_AD_MUTATIONS undeclared; do [[ "$mut" == "$m" ]] && known_mut=1; done
  for t in $ALLOY_AD_TENANT_CLASSES undeclared; do [[ "$ten" == "$t" ]] && known_ten=1; done
  if [[ "$mut" == undeclared || "$ten" == undeclared ]]; then printf 'posture-undeclared'; return; fi
  if [[ "$known_mut" -eq 0 || "$known_ten" -eq 0 ]]; then printf 'posture-malformed'; return; fi
  printf 'invalid-posture-combination'
}

# ===========================================================================
# Shared-runtime compatibility (registry-backed; conservative / fail-closed).
#
# A runtime is compatible shared capacity for <want_class> ONLY when it is a
# REGISTERED record whose declared class matches, whose owner is explicitly known
# (never inferred), and whose containers are currently observed (usable). An
# unregistered/discovered runtime has unknown class and unknown owner and is
# therefore NEVER treated as compatible shared capacity (semantic 11).
# ===========================================================================
alloy_ad_compatible_shared_runtime() {
  local want="$1" id path class owner prov ns st
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    path="$(alloy_rt_registry_path "$id")"
    class="$(alloy_rt_reg_get "$path" ALLOY_RT_RUNTIME_CLASS 2>/dev/null || true)"
    [[ "$class" == "$want" ]] || continue
    owner="$(alloy_rt_reg_get "$path" ALLOY_RT_OWNER_MISSION_KEY 2>/dev/null || true)"
    prov="$(alloy_rt_reg_get "$path" ALLOY_RT_OWNER_PROVENANCE 2>/dev/null || true)"
    # Unknown ownership is not compatible capacity.
    [[ -n "$owner" && "$owner" != "unknown" && "$prov" == "explicit-arg" ]] || continue
    ns="$(alloy_rt_reg_get "$path" ALLOY_RT_PROJECT_NAMESPACE 2>/dev/null || true)"
    [[ -n "$ns" ]] || continue
    # Must be observably present to be attachable (orphaned records are not capacity).
    st="$(alloy_rt_ns_field "$ns" container_state)"
    [[ "$st" == "active" || "$st" == "partial" ]] || continue
    printf '%s' "$ns"; return 0
  done < <(alloy_rt_registry_ids)
  return 1
}

# ===========================================================================
# Capacity snapshot → _AD_CURRENT_ACTIVE / _AD_MAX / _AD_REMAINING / _AD_OVER_BUDGET.
# Fail-closed: remaining never goes negative; an over-budget state authorises no
# additional allocation (semantic 6).
# ===========================================================================
alloy_ad_capacity_snapshot() {
  _AD_CURRENT_ACTIVE="$(alloy_rt_active_runtime_count)"; [[ "$_AD_CURRENT_ACTIVE" =~ ^[0-9]+$ ]] || _AD_CURRENT_ACTIVE=0
  _AD_MAX="$ALLOY_RT_MAX_ACTIVE"; [[ "$_AD_MAX" =~ ^[0-9]+$ ]] || _AD_MAX=0
  if [[ "$_AD_CURRENT_ACTIVE" -gt "$_AD_MAX" ]]; then
    _AD_REMAINING=0; _AD_OVER_BUDGET=true
  else
    _AD_REMAINING=$(( _AD_MAX - _AD_CURRENT_ACTIVE )); _AD_OVER_BUDGET=false
  fi
}

# ===========================================================================
# Allowed next actions — DECLARATIVE tokens for a future Director. R2 executes
# none of them. Keyed by decision. Space-separated.
# ===========================================================================
alloy_ad_next_actions() {
  case "$1" in
    admitted-none)                          printf 'proceed-without-runtime' ;;
    admitted-shared-existing)               printf 'use-existing-shared-runtime record-attachment-intent' ;;
    admitted-shared-new)                    printf 'provision-new-shared-runtime record-intent' ;;
    admitted-dedicated)                     printf 'provision-dedicated-runtime record-intent' ;;
    refused-capacity)                       printf 'await-capacity release-active-runtime raise-max-active-runtimes' ;;
    refused-coordination-required)          printf 'declare-coordination revise-posture-to-isolated-tenant' ;;
    refused-no-compatible-shared-runtime)   printf 'coordinate-existing-shared-runtime revise-posture' ;;
    refused-certification-requires-dedicated) printf 'remove-coordination-declaration provision-dedicated-runtime' ;;
    refused-invalid-posture)                printf 'correct-manifest-posture' ;;
    *)                                       printf 'none' ;;
  esac
}

# ===========================================================================
# THE admission evaluator. Pure function of (mutation, tenant, coordination) and
# the observed capacity/registry state. Sets _AD_* output globals. Deterministic.
#
#   coordination ∈ declared | none   (default none)
# ===========================================================================
alloy_ad_evaluate() {
  local mut="$1" ten="$2" coordination="${3:-none}"

  alloy_ad_capacity_snapshot   # sets _AD_CURRENT_ACTIVE/_MAX/_REMAINING/_OVER_BUDGET

  _AD_ISOLATION="$(alloy_ad_resolve_isolation "$mut" "$ten")"
  _AD_SHARED_CANDIDATE=""
  _AD_SHARED_CANDIDATE_REQUIRED=false
  _AD_CAPACITY_REQUIRED=0
  _AD_RUNTIME_REQUIRED=false

  if [[ "$_AD_ISOLATION" == "invalid" ]]; then
    _AD_RUNTIME_REQUIRED="unknown"
    _AD_DECISION="refused-invalid-posture"
    _AD_REASON_CODE="$(alloy_ad_invalid_reason_code "$mut" "$ten")"
    case "$_AD_REASON_CODE" in
      posture-undeclared) _AD_HUMAN_REASON="posture is undeclared; nothing coherent to admit (declare posture.mutation and posture.tenant_class)" ;;
      posture-malformed)  _AD_HUMAN_REASON="posture could not be read as a valid manifest posture; fail closed" ;;
      *)                  _AD_HUMAN_REASON="posture combination mutation='${mut}' tenant_class='${ten}' is not a supported isolation mapping; fail closed" ;;
    esac
    _AD_NEXT_ACTIONS="$(alloy_ad_next_actions refused-invalid-posture)"
    return 0
  fi

  case "$_AD_ISOLATION" in
    none)
      _AD_RUNTIME_REQUIRED=false
      _AD_DECISION="admitted-none"
      _AD_REASON_CODE="posture-requires-no-runtime"
      _AD_HUMAN_REASON="posture requires no runtime; zero runtime capacity is consumed (admitted even when over budget)"
      ;;

    shared-readonly)
      _AD_RUNTIME_REQUIRED=true
      _AD_SHARED_CANDIDATE_REQUIRED=true
      _AD_SHARED_CANDIDATE="$(alloy_ad_compatible_shared_runtime shared-readonly || true)"
      if [[ -n "$_AD_SHARED_CANDIDATE" ]]; then
        _AD_CAPACITY_REQUIRED=0
        _AD_DECISION="admitted-shared-existing"
        _AD_REASON_CODE="compatible-shared-runtime-available"
        _AD_HUMAN_REASON="a compatible shared-readonly runtime is already available; attaching consumes no additional runtime capacity"
      else
        _AD_CAPACITY_REQUIRED=1
        if [[ "$_AD_REMAINING" -ge 1 ]]; then
          _AD_DECISION="admitted-shared-new"
          _AD_REASON_CODE="new-shared-runtime-within-capacity"
          _AD_HUMAN_REASON="no compatible shared runtime exists; creating one consumes one runtime unit and capacity is available"
        else
          _AD_DECISION="refused-capacity"
          _AD_REASON_CODE="capacity-exhausted"
          _AD_HUMAN_REASON="one runtime unit is required to create a shared runtime but no capacity remains (fail-closed; an over-budget state grants nothing)"
        fi
      fi
      ;;

    shared-mutable)
      _AD_RUNTIME_REQUIRED=true
      _AD_SHARED_CANDIDATE_REQUIRED=true
      if [[ "$coordination" != "declared" ]]; then
        _AD_CAPACITY_REQUIRED=0
        _AD_DECISION="refused-coordination-required"
        _AD_REASON_CODE="coordination-required"
        _AD_HUMAN_REASON="shared-mutable is discouraged and must not be admitted without an explicit coordination declaration; none was provided"
      else
        _AD_SHARED_CANDIDATE="$(alloy_ad_compatible_shared_runtime shared-mutable || true)"
        if [[ -n "$_AD_SHARED_CANDIDATE" ]]; then
          _AD_CAPACITY_REQUIRED=0
          _AD_DECISION="admitted-shared-existing"
          _AD_REASON_CODE="compatible-shared-runtime-available"
          _AD_HUMAN_REASON="coordination declared and a compatible shared-mutable runtime is available; attaching consumes no additional runtime capacity"
        else
          _AD_CAPACITY_REQUIRED=1
          _AD_DECISION="refused-no-compatible-shared-runtime"
          _AD_REASON_CODE="no-compatible-shared-runtime"
          _AD_HUMAN_REASON="coordination declared but no compatible shared-mutable runtime exists; V1 will not unilaterally create a shared-mutable runtime"
        fi
      fi
      ;;

    dedicated-disposable)
      _AD_RUNTIME_REQUIRED=true
      _AD_CAPACITY_REQUIRED=1
      if [[ "$_AD_REMAINING" -ge 1 ]]; then
        _AD_DECISION="admitted-dedicated"
        _AD_REASON_CODE="dedicated-runtime-within-capacity"
        _AD_HUMAN_REASON="a dedicated disposable runtime is required and capacity is available for one runtime unit"
      else
        _AD_DECISION="refused-capacity"
        _AD_REASON_CODE="capacity-exhausted"
        _AD_HUMAN_REASON="one runtime unit is required for a dedicated runtime but no capacity remains (fail-closed; no fallback to shared)"
      fi
      ;;

    dedicated-certified)
      _AD_RUNTIME_REQUIRED=true
      # A certified posture can never be satisfied by a shared runtime (semantic 9)
      # and never falls back to shared (semantic 12). A coordination/share request
      # against a certified posture is refused explicitly, not silently downgraded.
      if [[ "$coordination" == "declared" ]]; then
        _AD_CAPACITY_REQUIRED=0
        _AD_DECISION="refused-certification-requires-dedicated"
        _AD_REASON_CODE="certification-forbids-shared"
        _AD_HUMAN_REASON="a certified (production-like) posture cannot share a runtime; remove the coordination declaration and use a dedicated runtime"
      else
        _AD_CAPACITY_REQUIRED=1
        if [[ "$_AD_REMAINING" -ge 1 ]]; then
          _AD_DECISION="admitted-dedicated"
          _AD_REASON_CODE="dedicated-runtime-within-capacity"
          _AD_HUMAN_REASON="a dedicated certified runtime is required and capacity is available for one runtime unit"
        else
          _AD_DECISION="refused-capacity"
          _AD_REASON_CODE="capacity-exhausted"
          _AD_HUMAN_REASON="one runtime unit is required for a dedicated certified runtime but no capacity remains (fail-closed; no fallback to shared)"
        fi
      fi
      ;;
  esac

  _AD_NEXT_ACTIONS="$(alloy_ad_next_actions "$_AD_DECISION")"
}

# ===========================================================================
# Intent artifact (persisted declaration; parsed, never sourced — like the
# runtime registry). Written ONLY by alloy-runtime-intent (mutating, outside
# alloy-ro). Admission itself is ephemeral and always recomputed live.
# ===========================================================================
alloy_ad_intent_path() {
  local sanitized; sanitized="$(printf '%s' "$1" | tr -c 'a-zA-Z0-9_.-' '_')"
  printf '%s/%s.env' "$ALLOY_AD_INTENTS_DIR" "$sanitized"
}
alloy_ad_intent_exists() { [[ -f "$(alloy_ad_intent_path "$1")" ]]; }
alloy_ad_intent_get() {
  local wt="$1" key="$2" path
  path="$(alloy_ad_intent_path "$wt")"
  [[ -f "$path" ]] || return 1
  alloy_rc_meta_get "$path" "$key"
}
# The coordination declaration a recorded intent carries (default none).
alloy_ad_intent_coordination() {
  local c; c="$(alloy_ad_intent_get "$1" ALLOY_INTENT_COORDINATION 2>/dev/null || true)"
  [[ "$c" == "declared" ]] && printf 'declared' || printf 'none'
}

# ===========================================================================
# JSON emission for the admission record. Deterministic; timestamp is provenance,
# not part of the decision (pin with ALLOY_AD_EVAL_NOW for byte-stable output).
# _AD_* must already be set by alloy_ad_evaluate.
# ===========================================================================
alloy_ad_emit_next_actions_json() {
  local first=1 a
  printf '['
  for a in $_AD_NEXT_ACTIONS; do
    [[ "$first" -eq 1 ]] || printf ','; first=0
    printf '"%s"' "$(alloy_rc_json_escape "$a")"
  done
  printf ']'
}

# Emit the full admission record. Args: <mission_key> <worktree> <mutation>
# <tenant> <posture_source> <coordination> <docker_available:true|false>
alloy_ad_emit_admission_json() {
  local mission="$1" wt="$2" mut="$3" ten="$4" psource="$5" coord="$6" docker="$7"
  printf '{'
  alloy_rc_json_kv_raw schema_version "$ALLOY_AD_SCHEMA_VERSION"; printf ','
  alloy_rc_json_kv contract "runtime-intent-admission"; printf ','
  alloy_rc_json_kv mission_key "$mission"; printf ','
  alloy_rc_json_kv worktree "$wt"; printf ','
  printf '"posture":{'
  alloy_rc_json_kv mutation "$mut"; printf ','
  alloy_rc_json_kv tenant_class "$ten"
  printf '},'
  alloy_rc_json_kv isolation_class "$_AD_ISOLATION"; printf ','
  alloy_rc_json_kv coordination "$coord"; printf ','
  alloy_rc_json_kv_raw runtime_required "$( [[ "$_AD_RUNTIME_REQUIRED" == "unknown" ]] && echo '"unknown"' || echo "$_AD_RUNTIME_REQUIRED" )"; printf ','
  alloy_rc_json_kv_raw shared_candidate_required "$_AD_SHARED_CANDIDATE_REQUIRED"; printf ','
  alloy_rc_json_kv shared_candidate "${_AD_SHARED_CANDIDATE:-}"; printf ','
  alloy_rc_json_kv_raw capacity_required "$_AD_CAPACITY_REQUIRED"; printf ','
  alloy_rc_json_kv_raw current_active_runtimes "$_AD_CURRENT_ACTIVE"; printf ','
  alloy_rc_json_kv_raw configured_max_runtimes "$_AD_MAX"; printf ','
  alloy_rc_json_kv_raw remaining_capacity "$_AD_REMAINING"; printf ','
  alloy_rc_json_kv_raw over_budget "$_AD_OVER_BUDGET"; printf ','
  alloy_rc_json_kv decision "$_AD_DECISION"; printf ','
  alloy_rc_json_kv reason_code "$_AD_REASON_CODE"; printf ','
  alloy_rc_json_kv human_reason "$_AD_HUMAN_REASON"; printf ','
  printf '"allowed_next_actions":'; alloy_ad_emit_next_actions_json; printf ','
  alloy_rc_json_kv evaluated_at "$(alloy_ad_iso_now)"; printf ','
  printf '"input_provenance":{'
  alloy_rc_json_kv posture_source "$psource"; printf ','
  alloy_rc_json_kv manifest_path "$(alloy_ad_manifest_path "$wt")"; printf ','
  alloy_rc_json_kv coordination_source "$( alloy_ad_intent_exists "$wt" && echo recorded-intent || echo none )"; printf ','
  alloy_rc_json_kv capacity_source "$( [[ "$docker" == "true" ]] && echo live-docker-observation || echo docker-unavailable )"; printf ','
  alloy_rc_json_kv registry_dir "$ALLOY_AD_INTENTS_DIR"; printf ','
  alloy_rc_json_kv runtime_registry_dir "$ALLOY_RT_REGISTRY_DIR"
  printf '}'
  printf '}'
}
