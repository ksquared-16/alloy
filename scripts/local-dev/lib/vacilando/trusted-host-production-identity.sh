#!/usr/bin/env bash
# Trusted Host Action child — prove the deployed-primary credential RESOLVES and
# name, in public terms only, which project it reaches.
#
# WHY A PROBE AT ALL. `assertProductionApplyPreconditions` proof 6 requires that
# the executor be running with sanctioned production credentials resolving to the
# requested target. Nothing could satisfy that honestly by inspection: the
# credential lives in the trusted env source and is deliberately unreachable from
# any lane. So the trusted host asks the credential about itself, in its own
# process, and returns only facts that are already public.
#
# WHAT IT PRINTS. Two labelled lines and nothing else:
#   DB_PROJECT_REF=<ref|host>     derived from the DATABASE_URL HOST component
#   API_PROJECT_REF=<ref>         derived from the public Supabase API URL
# Neither is a secret: a hostname and a project ref are published by the
# deployment itself. The connection string never reaches stdout, this file, or
# the calling process.
#
# Args: <out_file> <err_file>
set -euo pipefail

OUT_FILE="${1:?out file required}"
ERR_FILE="${2:?stderr file required}"

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

if ! alloy_load_trusted_server_env_exports; then
  echo "trusted_credential_unavailable" >"$ERR_FILE"
  exit 42
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "trusted_credential_unavailable" >"$ERR_FILE"
  exit 42
fi

# Host component only. Everything before the last '@' is credential material and
# is discarded before anything is printed or stored.
DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-zA-Z0-9+.-]+://##; s#^[^@]*@##; s#[:/?].*$##')"
unset DATABASE_URL || true

# `db.<ref>.supabase.co` yields the project ref directly. A pooler host does not
# carry the ref in the HOST — it carries it in the username, which is credential
# material — so the host itself is reported instead of digging for it. A host is
# a public fact; a username is not.
DB_REF="$(printf '%s' "$DB_HOST" | sed -E 's#^db\.([a-z0-9]{16,32})\.supabase\.(co|com)$#\1#')"

API_URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
API_HOST="$(printf '%s' "$API_URL" | sed -E 's#^[a-zA-Z0-9+.-]+://##; s#[:/?].*$##')"
API_REF="$(printf '%s' "$API_HOST" | sed -E 's#^([a-z0-9]{16,32})\.supabase\.(co|com)$#\1#')"

unset PGPASSWORD SUPABASE_SERVICE_ROLE_KEY || true

{
  printf 'DB_PROJECT_REF=%s\n' "$DB_REF"
  printf 'API_PROJECT_REF=%s\n' "$API_REF"
} >"$OUT_FILE"

: >"$ERR_FILE"
exit 0
