#!/usr/bin/env bash
# Trusted-host child: lookup / create / bind / verify / revoke the staging
# certification principal. Never prints passwords, JWTs, or database URLs.
# Usage: trusted-host-ensure-cert-principal.sh <mode>
# Modes: lookup | create | set-password | assign-role | verify | revoke
set -euo pipefail

MODE="${1:?mode required}"
EMAIL="${CERT_OPERATOR_EMAIL:-cert.operator@northwind.invalid}"
ORG_SLUG="${CERT_PRINCIPAL_ORG_SLUG:-demo-childcare-co-c144769f}"
ROLE_KEY="${CERT_PRINCIPAL_ROLE:-admin}"

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
  printf '%s\n' '{"ok":false,"code":"trusted_credential_unavailable"}'
  exit 42
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

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf '%s\n' '{"ok":false,"code":"trusted_credential_unavailable"}'
  exit 42
fi

SAFE_DATABASE_URL="$(sanitize_database_url "$DATABASE_URL")"
unset DATABASE_URL || true

sql_literal() {
  python3 -c 'import sys; v=sys.argv[1].replace("\x27", "\x27\x27"); print("\x27"+v+"\x27")' "$1"
}

run_sql() {
  local sql="$1"
  psql "$SAFE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t --no-psqlrc -c "$sql"
}

SUPABASE_API_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"

redact_file() {
  local f="$1"
  if [[ -f "$f" ]]; then
    sed -E -i.bak \
      -e 's#postgresql://[^[:space:]]+#postgresql://[redacted]#g' \
      -e 's#postgres://[^[:space:]]+#postgres://[redacted]#g' \
      -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted_jwt]/g' \
      "$f" 2>/dev/null || true
    rm -f "${f}.bak" 2>/dev/null || true
  fi
}

lookup_user() {
  run_sql "SELECT COALESCE((
    SELECT json_build_object(
      'ok', true,
      'found', true,
      'user_id', u.id::text,
      'email_domain', split_part(u.email, '@', 2),
      'confirmed', (u.email_confirmed_at IS NOT NULL),
      'banned', (u.banned_until IS NOT NULL AND u.banned_until > now()),
      'has_password', (u.encrypted_password IS NOT NULL AND length(u.encrypted_password) > 0)
    )
    FROM auth.users u
    WHERE lower(u.email) = lower($(sql_literal "$EMAIL")::text)
      AND u.deleted_at IS NULL
    LIMIT 1
  ), json_build_object('ok', true, 'found', false, 'code', 'principal_missing'))::text;"
}

case "$MODE" in
  lookup)
    lookup_user
    ;;
  create)
    if [[ -z "$SERVICE_KEY" || -z "$SUPABASE_API_URL" ]]; then
      printf '%s\n' '{"ok":false,"code":"admin_api_unavailable"}'
      exit 43
    fi
    if [[ -z "${CERT_OPERATOR_PASSWORD:-}" ]]; then
      printf '%s\n' '{"ok":false,"code":"password_missing"}'
      exit 44
    fi
    existing="$(lookup_user)"
    if echo "$existing" | grep -q '"found": true'; then
      printf '%s\n' '{"ok":true,"already":true,"code":"principal_exists"}'
      exit 0
    fi
    payload="$(python3 - <<PY
import json, os
print(json.dumps({
  "email": os.environ["CERT_OPERATOR_EMAIL"],
  "password": os.environ["CERT_OPERATOR_PASSWORD"],
  "email_confirm": True,
  "user_metadata": {
    "full_name": "Staging Certification Operator (non-human)",
    "alloy_fixture": True,
    "alloy_certification_principal": True,
    "purpose": "access_identity_v2_staging_certification",
  },
  "app_metadata": {
    "provider": "email",
    "providers": ["email"],
    "alloy_certification_principal": True,
  },
}))
PY
)"
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    chmod 600 "$tmp"
    printf '%s' "$payload" >"$tmp"
    code="$(curl -sS -o /tmp/vac-cert-principal-create.out -w '%{http_code}' \
      -X POST "${SUPABASE_API_URL%/}/auth/v1/admin/users" \
      -H "apikey: ${SERVICE_KEY}" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      --data-binary @"$tmp" || true)"
    redact_file /tmp/vac-cert-principal-create.out
    rm -f "$tmp"
    if [[ "$code" != "200" && "$code" != "201" ]]; then
      printf '%s\n' "{\"ok\":false,\"code\":\"create_http_${code}\"}"
      exit 45
    fi
    printf '%s\n' '{"ok":true,"created":true}'
    ;;
  set-password)
    if [[ -z "$SERVICE_KEY" || -z "$SUPABASE_API_URL" || -z "${CERT_OPERATOR_PASSWORD:-}" ]]; then
      printf '%s\n' '{"ok":false,"code":"admin_api_unavailable"}'
      exit 43
    fi
    user_json="$(lookup_user)"
    user_id="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read() or "{}"); print(d.get("user_id") or "")' <<<"$user_json")"
    if [[ -z "$user_id" ]]; then
      printf '%s\n' '{"ok":false,"code":"principal_missing"}'
      exit 46
    fi
    payload="$(python3 - <<PY
import json, os
print(json.dumps({"password": os.environ["CERT_OPERATOR_PASSWORD"], "email_confirm": True}))
PY
)"
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    chmod 600 "$tmp"
    printf '%s' "$payload" >"$tmp"
    code="$(curl -sS -o /tmp/vac-cert-principal-pw.out -w '%{http_code}' \
      -X PUT "${SUPABASE_API_URL%/}/auth/v1/admin/users/${user_id}" \
      -H "apikey: ${SERVICE_KEY}" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      --data-binary @"$tmp" || true)"
    redact_file /tmp/vac-cert-principal-pw.out
    rm -f "$tmp"
    if [[ "$code" != "200" ]]; then
      printf '%s\n' "{\"ok\":false,\"code\":\"set_password_http_${code}\"}"
      exit 45
    fi
    printf '%s\n' '{"ok":true,"rotated":true}'
    ;;
  assign-role)
    run_sql "INSERT INTO public.user_roles (user_id, org_id, role)
SELECT u.id, o.id, $(sql_literal "$ROLE_KEY")
FROM auth.users u
JOIN public.orgs o ON (o.slug = $(sql_literal "$ORG_SLUG") OR o.name = 'Firefly Early Learning')
WHERE lower(u.email) = lower($(sql_literal "$EMAIL"))
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.org_id = o.id AND ur.role = $(sql_literal "$ROLE_KEY")
  )
LIMIT 1;
SELECT json_build_object('ok', true, 'assigned', true)::text;"
    ;;
  verify)
    if [[ -z "$ANON_KEY" || -z "$SUPABASE_API_URL" || -z "${CERT_OPERATOR_PASSWORD:-}" ]]; then
      printf '%s\n' '{"ok":false,"code":"verify_api_unavailable"}'
      exit 43
    fi
    payload="$(python3 - <<PY
import json, os
print(json.dumps({
  "email": os.environ["CERT_OPERATOR_EMAIL"],
  "password": os.environ["CERT_OPERATOR_PASSWORD"],
}))
PY
)"
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    chmod 600 "$tmp"
    printf '%s' "$payload" >"$tmp"
    code="$(curl -sS -o /tmp/vac-cert-principal-verify.out -w '%{http_code}' \
      -X POST "${SUPABASE_API_URL%/}/auth/v1/token?grant_type=password" \
      -H "apikey: ${ANON_KEY}" \
      -H "Content-Type: application/json" \
      --data-binary @"$tmp" || true)"
    redact_file /tmp/vac-cert-principal-verify.out
    rm -f "$tmp"
    if [[ "$code" != "200" ]]; then
      printf '%s\n' "{\"ok\":false,\"code\":\"login_verify_http_${code}\"}"
      exit 47
    fi
    printf '%s\n' '{"ok":true,"verified":true}'
    ;;
  revoke)
    run_sql "UPDATE auth.users
SET banned_until = 'infinity'::timestamptz, updated_at = now()
WHERE lower(email) = lower($(sql_literal "$EMAIL"))
  AND deleted_at IS NULL;
SELECT json_build_object('ok', true, 'revoked', true)::text;"
    ;;
  *)
    printf '%s\n' '{"ok":false,"code":"unknown_mode"}'
    exit 48
    ;;
esac

unset SAFE_DATABASE_URL PGPASSWORD SUPABASE_SERVICE_ROLE_KEY SERVICE_KEY ANON_KEY CERT_OPERATOR_PASSWORD || true
exit 0
