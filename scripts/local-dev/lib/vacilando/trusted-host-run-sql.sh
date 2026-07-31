#!/usr/bin/env bash
# Trusted Host Action child — loads DATABASE_URL privately and runs read-only SQL.
# Never prints credentials. Args: <sql_file> <out_file> <stderr_file>
set -euo pipefail

SQL_FILE="${1:?sql file required}"
OUT_FILE="${2:?out file required}"
ERR_FILE="${3:?err file required}"

CANONICAL="${ALLOY_CANONICAL_ROOT:-${ALLOY_REPO:-/Users/Kelly/Alloy}}"
export ALLOY_REPO="$CANONICAL"
export ALLOY_SERVER_ENV_SOURCE="${ALLOY_SERVER_ENV_SOURCE:-$CANONICAL/web/.env.local}"

TOOLKIT="${ALLOY_TOOLKIT_DIR:-$CANONICAL/scripts/local-dev}"
# Prefer live Vacilando checkout toolkit if present
if [[ -f "${VACILANDO_CHECKOUT:-}/scripts/local-dev/lib/verify.sh" ]]; then
  TOOLKIT="${VACILANDO_CHECKOUT}/scripts/local-dev"
elif [[ -f "${ALLOY_WORKTREE:-}/scripts/local-dev/lib/verify.sh" ]]; then
  TOOLKIT="${ALLOY_WORKTREE}/scripts/local-dev"
fi

# shellcheck disable=SC1091
source "$TOOLKIT/lib/common.sh"
# shellcheck disable=SC1091
source "$TOOLKIT/lib/verify.sh"

# Host trusted actions intentionally talk to the approved deployed DB.
unset ALLOY_BLOCK_REMOTE_SUPABASE || true

if ! alloy_load_trusted_server_env_exports; then
  echo "trusted_credential_unavailable" >"$ERR_FILE"
  exit 42
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "trusted_credential_unavailable" >"$ERR_FILE"
  exit 42
fi

# psql rejects some pooler query params (e.g. pgbouncer=true). Strip known-unsupported
# params in-process; never echo the URL.
sanitize_database_url() {
  local url="$1"
  # Drop unsupported query keys while preserving the rest of the URI.
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

SAFE_DATABASE_URL="$(sanitize_database_url "$DATABASE_URL")"
unset DATABASE_URL || true

# Read-only transaction where supported.
{
  echo "BEGIN TRANSACTION READ ONLY;"
  cat "$SQL_FILE"
  echo ";"
  echo "COMMIT;"
} | psql "$SAFE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t --no-psqlrc >"$OUT_FILE" 2>"$ERR_FILE"
EXIT=$?

unset SAFE_DATABASE_URL PGPASSWORD SUPABASE_SERVICE_ROLE_KEY || true

# Scrub any accidental URL fragments from stderr file (defense in depth).
if [[ -f "$ERR_FILE" ]]; then
  sed -E -i.bak 's#postgresql://[^[:space:]]+#postgresql://[redacted]#g; s#postgres://[^[:space:]]+#postgres://[redacted]#g' "$ERR_FILE" 2>/dev/null || true
  rm -f "${ERR_FILE}.bak" 2>/dev/null || true
fi

exit "$EXIT"
