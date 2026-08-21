#!/usr/bin/env bash
# Trusted Host Action child — run committed staging application certification.
# Never prints credentials. Args: <suite_dir> <json_out> <stderr_file> [spec...]
set -euo pipefail

SUITE_DIR="${1:?suite dir required}"
OUT_FILE="${2:?out file required}"
ERR_FILE="${3:?stderr file required}"
shift 3

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

if ! alloy_load_trusted_server_env_exports; then
  echo "trusted_credential_unavailable" >"$ERR_FILE"
  exit 42
fi

SECRET_FILE="${ALLOY_RUNTIME_ROOT:-$HOME/.local/state/alloy-dev}/vacilando/trusted-secrets/staging-certification-principal.env"
if [[ -f "$SECRET_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRET_FILE"
  set +a
fi

# Read-only default. Mutating certification is never implied by suite capability.
if [[ "${CERT_WRITE_POLICY:-read_only}" != "mutate" ]]; then
  export CERT_ALLOW_WRITES=0
  export CERT_ALLOW_WRITES=0
else
  if [[ "${CERT_OPERATOR_APPROVED_MUTATION:-}" != "1" ]]; then
    echo "mutation_not_authorized" >"$ERR_FILE"
    exit 43
  fi
  export CERT_ALLOW_WRITES=1
  export CERT_ALLOW_WRITES=1
fi

if [[ -z "${CERT_APP_URL:-${CERT_APP_URL:-}}" ]]; then
  echo "staging_deployment_unavailable" >"$ERR_FILE"
  exit 44
fi
export CERT_APP_URL="${CERT_APP_URL:-$CERT_APP_URL}"
export CERT_APP_URL="$CERT_APP_URL"

if [[ -z "${CERT_OPERATOR_EMAIL:-${CERT_OPERATOR_EMAIL:-}}" || -z "${CERT_OPERATOR_PASSWORD:-${CERT_OPERATOR_PASSWORD:-}}" ]]; then
  echo "staging_certification_principal_unavailable" >"$ERR_FILE"
  exit 45
fi
export CERT_OPERATOR_EMAIL="${CERT_OPERATOR_EMAIL:-$CERT_OPERATOR_EMAIL}"
export CERT_OPERATOR_PASSWORD="${CERT_OPERATOR_PASSWORD:-$CERT_OPERATOR_PASSWORD}"
export CERT_OPERATOR_EMAIL="$CERT_OPERATOR_EMAIL"
export CERT_OPERATOR_PASSWORD="$CERT_OPERATOR_PASSWORD"

PLAYWRIGHT_BIN="${PLAYWRIGHT_BIN:-}"
if [[ -z "$PLAYWRIGHT_BIN" ]]; then
  if [[ -x "$SUITE_DIR/web/node_modules/.bin/playwright" ]]; then
    PLAYWRIGHT_BIN="$SUITE_DIR/web/node_modules/.bin/playwright"
  elif [[ -x "${VACILANDO_CHECKOUT:-}/web/node_modules/.bin/playwright" ]]; then
    PLAYWRIGHT_BIN="${VACILANDO_CHECKOUT}/web/node_modules/.bin/playwright"
  else
    PLAYWRIGHT_BIN="$(command -v playwright || true)"
  fi
fi
if [[ -z "$PLAYWRIGHT_BIN" ]]; then
  echo "playwright_unavailable" >"$ERR_FILE"
  exit 46
fi

mkdir -p "$(dirname "$OUT_FILE")" "$(dirname "$ERR_FILE")"
CONFIG="${CERT_PLAYWRIGHT_CONFIG:-$SUITE_DIR/certification/playwright.config.ts}"

set +e
"$PLAYWRIGHT_BIN" test -c "$CONFIG" --reporter=json "$@" >"$OUT_FILE" 2>"$ERR_FILE"
EXIT=$?
set -e

# Never leave credential-shaped strings in captured logs.
if [[ -f "$ERR_FILE" ]]; then
  sed -E -i.bak \
    -e 's#postgresql://[^[:space:]]+#postgresql://[redacted]#g' \
    -e 's#postgres://[^[:space:]]+#postgres://[redacted]#g' \
    -e 's/CERT_OPERATOR_PASSWORD[^[:space:]]*/CERT_OPERATOR_PASSWORD=[redacted]/g' \
    "$ERR_FILE" 2>/dev/null || true
  rm -f "${ERR_FILE}.bak" 2>/dev/null || true
fi

unset CERT_OPERATOR_PASSWORD CERT_OPERATOR_PASSWORD CERT_OPERATOR_EMAIL CERT_OPERATOR_EMAIL || true
exit "$EXIT"
