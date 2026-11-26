#!/usr/bin/env bash
# lib/actuation-adapter.sh — the ADAPTER BOUNDARY for Runtime Actuation V1 (R3).
#
# The data plane. The control plane (actuation-core.sh) dispatches provider-neutral
# operations here; only allowlisted, code-owned provider adapters below ever touch
# Docker/Supabase. HARD CONSTRAINTS (mission Adapter constraints):
#   - NO generic shell adapter, NO arbitrary-command argument. An adapter constructs
#     ONLY fixed, allowlisted argv; every interpolated value is validated against a
#     strict code-owned format first.
#   - The intent, persisted state, Director input, and CLI never supply shell
#     fragments, executable command names, Docker args, compose paths, or arbitrary
#     environment variables. The only inputs an adapter accepts are a validated
#     canonical namespace and isolation class.
#   - Bounded execution time; controlled/redacted output only; typed error classes;
#     never an automatic SIGKILL; deterministic postcondition expectations; fixture
#     substitution for tests.
#
# Result protocol (stdout, parsed by the core — never eval'd):
#   status=ok|rejected|unavailable|timeout|unhealthy
#   detail=<short, redacted, single-line>   (optional)
# Exit code mirrors status (0 iff ok) as defence in depth; the core trusts `status=`.
# shellcheck shell=bash

[[ -n "${ALLOY_ACT_ADAPTER_LOADED:-}" ]] && return 0
ALLOY_ACT_ADAPTER_LOADED=1

_ALLOY_ACT_ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/actuation-adapter-fixture.sh
source "${_ALLOY_ACT_ADAPTER_DIR}/actuation-adapter-fixture.sh"
# shellcheck source=lib/actuation-adapter-supabase.sh
source "${_ALLOY_ACT_ADAPTER_DIR}/actuation-adapter-supabase.sh"

# Adapters allowed to run against REAL infrastructure. `fixture` is permitted only
# under a fixture/cert runtime root (enforced in alloy_act_adapter_select).
ALLOY_ACT_ADAPTERS="fixture supabase"

# Canonical namespace format an adapter will act on: R3-MINTED names only. This is
# the isolation guarantee — an adapter never touches a namespace it did not mint.
ALLOY_ACT_NS_RE='^alloy-r3-[a-z0-9][a-z0-9-]*$'

alloy_act_ns_is_valid() { [[ "$1" =~ $ALLOY_ACT_NS_RE ]]; }

# Select + validate the adapter. fixture is refused outside a fixture/cert root so a
# real operator run cannot silently no-op through the fake provider.
alloy_act_adapter_select() {
  local provider="$1" a ok=0
  for a in $ALLOY_ACT_ADAPTERS; do [[ "$provider" == "$a" ]] && ok=1; done
  [[ "$ok" -eq 1 ]] || { printf 'status=rejected\ndetail=unknown-adapter\n'; return 2; }
  if [[ "$provider" == "fixture" ]] && ! alloy_runtime_is_fixture; then
    printf 'status=rejected\ndetail=fixture-adapter-refused-outside-fixture-root\n'; return 2
  fi
  ALLOY_ACT_ADAPTER="$provider"
  return 0
}

# Bounded execution WITHOUT automatic SIGKILL. Runs cmd in the background; on
# deadline returns 124 and prints the still-running PID (for reconcile/observe to
# resolve), leaving the provider process to finish rather than force-killing it.
alloy_act_run_bounded() {
  local secs="$1"; shift
  [[ "$secs" =~ ^[0-9]+$ ]] || secs=300
  "$@" & local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if (( waited >= secs )); then printf '%s' "$pid"; return 124; fi
    sleep 1; waited=$(( waited + 1 ))
  done
  wait "$pid"; return $?
}

# Provider-neutral dispatch. Only two DATA-PLANE mutations exist: provision, retire.
# attach/detach are control-plane relationship ops (no adapter); reconcile uses R1.
alloy_act_adapter_provision() {
  local ns="$1" iso="$2"
  alloy_act_ns_is_valid "$ns" || { printf 'status=rejected\ndetail=namespace-not-r3-minted\n'; return 2; }
  case "${ALLOY_ACT_ADAPTER:-}" in
    fixture)  alloy_adapter_fixture_provision "$ns" "$iso" ;;
    supabase) alloy_adapter_supabase_provision "$ns" "$iso" ;;
    *) printf 'status=rejected\ndetail=no-adapter-selected\n'; return 2 ;;
  esac
}

alloy_act_adapter_retire() {
  local ns="$1"
  alloy_act_ns_is_valid "$ns" || { printf 'status=rejected\ndetail=namespace-not-r3-minted\n'; return 2; }
  case "${ALLOY_ACT_ADAPTER:-}" in
    fixture)  alloy_adapter_fixture_retire "$ns" ;;
    supabase) alloy_adapter_supabase_retire "$ns" ;;
    *) printf 'status=rejected\ndetail=no-adapter-selected\n'; return 2 ;;
  esac
}

# Parse a `status=` value out of adapter output (last one wins; ignores anything else).
alloy_act_adapter_status_of() {
  local out="$1" line st=""
  while IFS= read -r line; do
    case "$line" in status=*) st="${line#status=}" ;; esac
  done <<<"$out"
  printf '%s' "$st"
}

# Map an adapter status to (execution-state, result-code, retryable). Prints three
# space-separated tokens. This is the ONLY place provider status becomes a taxonomy.
alloy_act_adapter_classify() {
  case "$1" in
    ok)          printf 'ok ok false' ;;
    rejected)    printf 'failed provider-rejected false' ;;
    unavailable) printf 'failed provider-unavailable true' ;;
    timeout)     printf 'timed_out timeout true' ;;
    unhealthy)   printf 'failed provider-rejected false' ;;
    *)           printf 'failed internal-execution-failure false' ;;
  esac
}
