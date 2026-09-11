#!/usr/bin/env bash
# Trusted Host Action child — apply one committed migration file.
# Never prints credentials. Args: <migration_file> <out_file> <stderr_file>
set -euo pipefail

MIG_FILE="${1:?migration file required}"
OUT_FILE="${2:?out file required}"
ERR_FILE="${3:?stderr file required}"
# The requested environment SELECTS the database. It used to be absent here
# entirely, which is how a request labelled `certification` could reach a
# deployed pooler: the child simply used whichever DATABASE_URL the trusted
# host had. Absent is not defaulted — it refuses.
MIG_ENVIRONMENT="${4:-}"

CANONICAL="${ALLOY_CANONICAL_ROOT:-${ALLOY_REPO:-/Users/Kelly/Alloy}}"
export ALLOY_REPO="$CANONICAL"
export ALLOY_SERVER_ENV_SOURCE="${ALLOY_SERVER_ENV_SOURCE:-$CANONICAL/web/.env.local}"

TOOLKIT="${ALLOY_TOOLKIT_DIR:-$CANONICAL/scripts/local-dev}"
if [[ -f "${VACILANDO_CHECKOUT:-}/scripts/local-dev/lib/verify.sh" ]]; then
  TOOLKIT="${VACILANDO_CHECKOUT}/scripts/local-dev"
elif [[ -f "${ALLOY_WORKTREE:-}/scripts/local-dev/lib/verify.sh" ]]; then
  TOOLKIT="${ALLOY_WORKTREE}/scripts/local-dev"
fi

# shellcheck disable=SC1091
source "$TOOLKIT/lib/common.sh"
# shellcheck disable=SC1091
source "$TOOLKIT/lib/verify.sh"

unset ALLOY_BLOCK_REMOTE_SUPABASE || true

if [[ -z "$MIG_ENVIRONMENT" ]]; then
  echo "target_resolution_failed: no environment supplied to the apply child" >"$ERR_FILE"
  exit 45
fi

# ── THE DATABASE IS CHOSEN BY THE ENVIRONMENT, NEVER BY WHAT HAPPENS TO EXIST ──
case "$MIG_ENVIRONMENT" in
  certification|cert)
    # The local certification stack has its own credential, supplied explicitly.
    # It is NOT read from the server env, because that file is the deployed
    # credential and reading it here is the whole defect.
    # Sourcing common.sh DEFINES alloy_load_config; it does not RUN it. Without
    # this call the host config is written and inert — the value sits in
    # ~/.config/alloy-dev/config and never reaches the shell, so a correctly
    # configured host still refuses. Measured: the config was published and the
    # child still exited 42.
    if [[ -z "${ALLOY_CERT_DATABASE_URL:-}" ]] && declare -F alloy_load_config >/dev/null 2>&1; then
      alloy_load_config >/dev/null 2>&1 || true
    fi
    if [[ -z "${ALLOY_CERT_DATABASE_URL:-}" ]]; then
      echo "trusted_credential_unavailable: ALLOY_CERT_DATABASE_URL is not set; certification migrations require an explicit local certification connection" >"$ERR_FILE"
      exit 42
    fi
    DATABASE_URL="$ALLOY_CERT_DATABASE_URL"
    EXPECT_LOCAL=1
    ;;
  staging)
    if ! alloy_load_trusted_server_env_exports; then
      echo "trusted_credential_unavailable" >"$ERR_FILE"
      exit 42
    fi
    if [[ -z "${DATABASE_URL:-}" ]]; then
      echo "trusted_credential_unavailable" >"$ERR_FILE"
      exit 42
    fi
    EXPECT_LOCAL=0
    ;;
  *)
    echo "target_resolution_failed: environment '$MIG_ENVIRONMENT' has no registered database target" >"$ERR_FILE"
    exit 45
    ;;
esac

# ── THE GUARD: PROVE THE TARGET BEFORE THE FIRST STATEMENT ──
#
# A hard refusal, not a warning. This is the check whose absence meant a
# certification request could have written to deployed infrastructure.
DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z+]+://([^@/]*@)?([^/:?]+).*#\2#')"
DB_PORT="$(printf '%s' "$DATABASE_URL" | sed -nE 's#^[a-z+]+://([^@/]*@)?[^/:?]+:([0-9]+).*#\2#p')"
case "$DB_HOST" in
  127.0.0.1|localhost|::1|0.0.0.0) HOST_IS_LOCAL=1 ;;
  *) HOST_IS_LOCAL=0 ;;
esac

if [[ "$EXPECT_LOCAL" == "1" ]]; then
  if [[ "$HOST_IS_LOCAL" != "1" || "$DB_PORT" != "54422" ]]; then
    echo "target_environment_mismatch: environment '$MIG_ENVIRONMENT' resolved to ${DB_HOST}:${DB_PORT:-<none>}, which is not the local certification database" >"$ERR_FILE"
    exit 44
  fi
elif [[ "$HOST_IS_LOCAL" == "1" && "$DB_PORT" == "54422" ]]; then
  echo "target_environment_mismatch: environment '$MIG_ENVIRONMENT' resolved to the local certification database" >"$ERR_FILE"
  exit 44
fi

sanitize_database_url() {
  local url="$1"
  url="$(printf '%s' "$url" | sed -E \
    -e 's/([?&])pgbouncer=[^&]*&/\1/g' \
    -e 's/([?&])pgbouncer=[^&]*$//g' \
    -e 's/([?&])statement_timeout=[^&]*&/\1/g' \
    -e 's/([?&])statement_timeout=[^&]*$//g' \
    -e 's/\?&/?/g' \
    -e 's/\?$//' \
    -e 's/&&/\&/g')"
  printf '%s' "$url"
}

# ── THE POSTGRES CLIENT IS RESOLVED, NOT ASSUMED ──
#
# The same defect as in trusted-host-run-sql.sh, and it hid behind that one: fixing the READ path
# let the ledger preflight pass, and the apply then failed here for the identical reason one step
# later. Homebrew's libpq is keg-only, so `brew install libpq` alone leaves psql off PATH; the known
# location is consulted directly rather than force-linking host-global state.
resolve_psql() {
  if command -v psql >/dev/null 2>&1; then
    command -v psql
    return 0
  fi
  local candidate
  for candidate in \
    /opt/homebrew/opt/libpq/bin/psql \
    /usr/local/opt/libpq/bin/psql \
    /opt/homebrew/bin/psql \
    /usr/local/bin/psql \
    /Applications/Postgres.app/Contents/Versions/latest/bin/psql
  do
    [[ -x "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

if ! PSQL_BIN="$(resolve_psql)"; then
  {
    printf 'trusted_host_dependency_missing dependency=psql\n'
    printf 'No PostgreSQL client found on PATH or at the known keg-only locations.\n'
    printf 'Install with: brew install libpq  (keg-only; this script resolves it directly)\n'
  } >"$ERR_FILE"
  exit 43
fi

SAFE_DATABASE_URL="$(sanitize_database_url "$DATABASE_URL")"
unset DATABASE_URL || true

"$PSQL_BIN" "$SAFE_DATABASE_URL" -X -v ON_ERROR_STOP=1 --no-psqlrc -f "$MIG_FILE" >"$OUT_FILE" 2>"$ERR_FILE"
EXIT=$?

unset SAFE_DATABASE_URL PGPASSWORD SUPABASE_SERVICE_ROLE_KEY || true

if [[ -f "$ERR_FILE" ]]; then
  sed -E -i.bak 's#postgresql://[^[:space:]]+#postgresql://[redacted]#g; s#postgres://[^[:space:]]+#postgres://[redacted]#g' "$ERR_FILE" 2>/dev/null || true
  rm -f "${ERR_FILE}.bak" 2>/dev/null || true
fi

exit "$EXIT"
