#!/usr/bin/env bash
# lib/actuation-adapter-fixture.sh — hermetic fixture adapter for R3 tests.
#
# Substitutes for a real provider. It performs NO real Docker/Supabase action; it
# instead edits the R1 docker-ps FIXTURE file (ALLOY_RT_PS_FIXTURE) so that
# authoritative R1 observation independently reflects the simulated result. This is
# how provisioning/attach/retire/verification/timeout/crash are proven deterministically
# without touching real infrastructure. Permitted only under a fixture/cert root
# (enforced by alloy_act_adapter_select).
#
# Injected controls (test-owned):
#   ALLOY_ACT_FIXTURE_PROVISION_RESULT ∈ ok|rejected|unavailable|timeout|unhealthy  (default ok)
#   ALLOY_ACT_FIXTURE_RETIRE_RESULT    ∈ ok|rejected|timeout                        (default ok)
# shellcheck shell=bash

_ALLOY_FX_SEP=$'\x1f'

# Emit a supabase container row (9 fields; matches runtime-core's ps format).
_alloy_fx_row() {
  printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' "$@"
}

# Append a stack for <ns> to the ps fixture. <mode> = healthy | unhealthy.
_alloy_fx_append_stack() {
  local ns="$1" mode="$2" f="${ALLOY_RT_PS_FIXTURE:-}"
  [[ -n "$f" ]] || return 0
  local dbstate reststate
  if [[ "$mode" == "healthy" ]]; then dbstate=running; reststate=running; else dbstate=exited; reststate=exited; fi
  {
    _alloy_fx_row "fx-$ns-db"   "supabase_db_$ns"   "supabase/postgres" "$dbstate"  "Up" "5432/tcp"  "$ns" "" db
    _alloy_fx_row "fx-$ns-kong" "supabase_kong_$ns" "supabase/kong"     "$dbstate"  "Up" "8000/tcp"  "$ns" "" kong
    _alloy_fx_row "fx-$ns-auth" "supabase_auth_$ns" "supabase/gotrue"   "$dbstate"  "Up" ""          "$ns" "" auth
    _alloy_fx_row "fx-$ns-rest" "supabase_rest_$ns" "postgrest"         "$reststate" "Up" ""         "$ns" "" rest
  } >>"$f"
}

# Remove all rows for <ns> from the ps fixture (namespace field is column 7).
_alloy_fx_remove_stack() {
  local ns="$1" f="${ALLOY_RT_PS_FIXTURE:-}"
  [[ -n "$f" && -f "$f" ]] || return 0
  local tmp; tmp="$(mktemp "${f}.XXXXXX")"
  awk -F"$_ALLOY_FX_SEP" -v ns="$ns" '($7 != ns)' "$f" >"$tmp" 2>/dev/null || cp "$f" "$tmp"
  mv "$tmp" "$f"
}

alloy_adapter_fixture_provision() {
  local ns="$1" iso="$2"
  local result="${ALLOY_ACT_FIXTURE_PROVISION_RESULT:-ok}"
  case "$result" in
    ok)          _alloy_fx_append_stack "$ns" healthy;   printf 'status=ok\ndetail=fixture-provisioned\n'; return 0 ;;
    unhealthy)   _alloy_fx_append_stack "$ns" unhealthy; printf 'status=ok\ndetail=fixture-provisioned-unhealthy\n'; return 0 ;;
    rejected)    printf 'status=rejected\ndetail=fixture-rejected\n'; return 1 ;;
    unavailable) printf 'status=unavailable\ndetail=fixture-unavailable\n'; return 1 ;;
    timeout)     printf 'status=timeout\ndetail=fixture-timeout\n'; return 1 ;;
    *)           printf 'status=rejected\ndetail=fixture-unknown-result\n'; return 1 ;;
  esac
}

alloy_adapter_fixture_retire() {
  local ns="$1"
  local result="${ALLOY_ACT_FIXTURE_RETIRE_RESULT:-ok}"
  case "$result" in
    ok)       _alloy_fx_remove_stack "$ns"; printf 'status=ok\ndetail=fixture-retired\n'; return 0 ;;
    rejected) printf 'status=rejected\ndetail=fixture-retire-rejected\n'; return 1 ;;
    timeout)  printf 'status=timeout\ndetail=fixture-retire-timeout\n'; return 1 ;;
    *)        printf 'status=rejected\ndetail=fixture-unknown-result\n'; return 1 ;;
  esac
}
