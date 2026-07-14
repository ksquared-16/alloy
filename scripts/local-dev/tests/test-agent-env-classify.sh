#!/usr/bin/env bash
# Focused tests for safe environment variable classification (fail-closed).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"
# shellcheck source=../lib/verify.sh
source "$ROOT/lib/verify.sh"

classify() { alloy_classify_env_var "$1"; }

[[ "$(classify ALLOY_AGENT_ENV)" == "allow" ]] && pass "builtin ALLOY_AGENT_ENV allowed" || fail "ALLOY_AGENT_ENV"
[[ "$(classify ALLOY_UNKNOWN_FEATURE_FLAG)" == "ambiguous" ]] && pass "unknown ALLOY_* ambiguous (rejected at prepare)" || fail "unknown ALLOY"
[[ "$(classify ALLOY_API_TOKEN)" == "deny" ]] && pass "ALLOY_*_TOKEN denied" || fail "ALLOY_API_TOKEN"
[[ "$(classify ALLOY_SLOT_SECRET)" == "deny" ]] && pass "ALLOY_*_SECRET denied" || fail "ALLOY_SLOT_SECRET"
[[ "$(classify ALLOY_SIGNING_KEY)" == "deny" ]] && pass "ALLOY_SIGNING denied" || fail "ALLOY_SIGNING_KEY"
[[ "$(classify NEXT_PUBLIC_SUPABASE_URL)" == "allow" ]] && pass "NEXT_PUBLIC_* allowed" || fail "NEXT_PUBLIC"
[[ "$(classify SUPABASE_SERVICE_ROLE_KEY)" == "deny" ]] && pass "service role denied" || fail "service role"

# Configured allowlist cannot override denylist.
ALLOY_ENV_ALLOWLIST="ALLOY_API_TOKEN SUPABASE_SERVICE_ROLE_KEY DEV_QUEUE_ORG_ID"
[[ "$(classify ALLOY_API_TOKEN)" == "deny" ]] && pass "allowlist cannot override TOKEN deny" || fail "allowlist override TOKEN"
[[ "$(classify SUPABASE_SERVICE_ROLE_KEY)" == "deny" ]] && pass "allowlist cannot override service role" || fail "allowlist override secret"

# Configured allowlist can add safe explicit names.
[[ "$(classify DEV_QUEUE_ORG_ID)" == "allow" ]] && pass "configured allowlist copies safe name" || fail "configured allowlist"

echo
echo "Env classify results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
