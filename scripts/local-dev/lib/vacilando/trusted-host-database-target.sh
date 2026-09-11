#!/usr/bin/env bash
# Shared database-target routing for the trusted-host SQL children.
#
# ── WHY THIS FILE EXISTS ──
#
# The write child (apply) chose its database from the requested environment. The
# read child (run-sql) did not take an environment at all and always loaded the
# deployed credential. So one governed migration request could read its ledger
# from deployed and write to certification. A version present on deployed and
# absent on certification would then be classified "already applied" and
# skipped, and the action would report success having changed nothing.
#
# Both children now route through this one function, and the ROUTING RULES are
# not written here: they come from trusted-host-database-target.mjs, the
# canonical owner. This file reads the credential the owner names and proves the
# connection matches the shape the owner requires.
#
# Exit codes are the established contract:
#   42 trusted_credential_unavailable
#   44 target_environment_mismatch
#   45 target_resolution_failed
#
# On success it sets ALLOY_RESOLVED_DATABASE_URL and ALLOY_RESOLVED_TARGET_ID.
# The credential value is never printed, never passed as an argument, and never
# reaches node.

# Resolve and prove the target for one environment.
#   $1 environment, $2 path to write refusals to
alloy_resolve_trusted_database_target() {
  local environment="$1" err_file="$2"
  local target_mjs="${ALLOY_TARGET_MJS:-${BASH_SOURCE[0]%/*}/trusted-host-database-target.mjs}"

  ALLOY_RESOLVED_DATABASE_URL=""
  ALLOY_RESOLVED_TARGET_ID=""

  if [[ -z "$environment" ]]; then
    echo "target_resolution_failed: no environment supplied to the trusted database child" >"$err_file"
    return 45
  fi

  # The rules live in the canonical module. If it cannot be consulted we refuse
  # rather than falling back to a second copy of the rules kept here -- a
  # fallback is how the two copies diverge in the first place.
  local node_bin
  node_bin="$(command -v node 2>/dev/null || true)"
  if [[ -z "$node_bin" || ! -f "$target_mjs" ]]; then
    echo "target_resolution_failed: canonical database target resolver is unavailable (node=${node_bin:-<none>} module=${target_mjs})" >"$err_file"
    return 45
  fi

  local described
  if ! described="$("$node_bin" "$target_mjs" describe-sh "$environment" 2>/dev/null)"; then
    echo "target_resolution_failed: canonical database target resolver failed for environment '${environment}'" >"$err_file"
    return 45
  fi

  local ok="" code="" detail="" target_id="" cred_env="" cred_loader="" expect_local="" expect_port="" cert_port=""
  local key value
  # Read, never eval: the detail line can legitimately contain shell metacharacters.
  while IFS='=' read -r key value; do
    case "$key" in
      ALLOY_TARGET_OK) ok="$value" ;;
      ALLOY_TARGET_CODE) code="$value" ;;
      ALLOY_TARGET_DETAIL) detail="$value" ;;
      ALLOY_TARGET_ID) target_id="$value" ;;
      ALLOY_TARGET_CREDENTIAL_ENV) cred_env="$value" ;;
      ALLOY_TARGET_CREDENTIAL_LOADER) cred_loader="$value" ;;
      ALLOY_TARGET_EXPECT_LOCAL) expect_local="$value" ;;
      ALLOY_TARGET_EXPECT_PORT) expect_port="$value" ;;
      ALLOY_TARGET_CERTIFICATION_PORT) cert_port="$value" ;;
    esac
  done <<< "$described"

  if [[ "$ok" != "1" ]]; then
    echo "${code:-target_resolution_failed}: ${detail:-environment '${environment}' has no registered database target}" >"$err_file"
    return 45
  fi

  # ── LOAD THE CREDENTIAL THE OWNER NAMED ──
  local resolved=""
  case "$cred_loader" in
    explicit_env)
      # Sourcing common.sh DEFINES alloy_load_config; it does not RUN it. Without
      # this call the host config is written and inert -- the value sits in
      # ~/.config/alloy-dev/config and never reaches the shell, so a correctly
      # configured host still refuses. Measured: the config was published and the
      # child still exited 42.
      if [[ -z "${!cred_env:-}" ]] && declare -F alloy_load_config >/dev/null 2>&1; then
        alloy_load_config >/dev/null 2>&1 || true
      fi
      resolved="${!cred_env:-}"
      if [[ -z "$resolved" ]]; then
        echo "trusted_credential_unavailable: ${cred_env} is not set; environment '${environment}' requires an explicit connection" >"$err_file"
        return 42
      fi
      ;;
    trusted_server_env)
      if ! alloy_load_trusted_server_env_exports; then
        echo "trusted_credential_unavailable" >"$err_file"
        return 42
      fi
      resolved="${!cred_env:-}"
      if [[ -z "$resolved" ]]; then
        echo "trusted_credential_unavailable" >"$err_file"
        return 42
      fi
      ;;
    *)
      echo "target_resolution_failed: unknown credential loader '${cred_loader}' for environment '${environment}'" >"$err_file"
      return 45
      ;;
  esac

  # ── THE GUARD: PROVE THE TARGET BEFORE THE FIRST STATEMENT ──
  #
  # A hard refusal, not a warning. This is the check whose absence meant a
  # request labelled certification could have reached deployed infrastructure.
  local db_host db_port host_is_local
  db_host="$(printf '%s' "$resolved" | sed -E 's#^[a-z+]+://([^@/]*@)?([^/:?]+).*#\2#')"
  db_port="$(printf '%s' "$resolved" | sed -nE 's#^[a-z+]+://([^@/]*@)?[^/:?]+:([0-9]+).*#\2#p')"
  case "$db_host" in
    127.0.0.1|localhost|::1|0.0.0.0) host_is_local=1 ;;
    *) host_is_local=0 ;;
  esac

  if [[ "$expect_local" == "1" ]]; then
    if [[ "$host_is_local" != "1" || "$db_port" != "$expect_port" ]]; then
      echo "target_environment_mismatch: environment '${environment}' resolved to ${db_host}:${db_port:-<none>}, which is not ${target_id}" >"$err_file"
      return 44
    fi
  elif [[ "$host_is_local" == "1" && -n "$cert_port" && "$db_port" == "$cert_port" ]]; then
    # The quieter half of the same bug: a deployed migration silently applied to
    # the throwaway stack reports success while changing nothing that matters.
    echo "target_environment_mismatch: environment '${environment}' resolved to the local certification database" >"$err_file"
    return 44
  fi

  ALLOY_RESOLVED_DATABASE_URL="$resolved"
  ALLOY_RESOLVED_TARGET_ID="$target_id"

  # ── REPORT WHAT WAS ACTUALLY USED ──
  #
  # The caller asserts that the ledger read, the postcondition read and the
  # write all landed on ONE target. It cannot do that by trusting that it passed
  # the same string three times -- that would only prove it repeated itself. So
  # each child records the target it really resolved, and the caller compares.
  if [[ -n "${ALLOY_TARGET_REPORT_FILE:-}" ]]; then
    printf '%s\n' "$target_id" >"$ALLOY_TARGET_REPORT_FILE" 2>/dev/null || true
  fi
  return 0
}
