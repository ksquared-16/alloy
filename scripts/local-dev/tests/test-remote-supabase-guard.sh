#!/usr/bin/env bash
# Focused tests for ALLOY_BLOCK_REMOTE_SUPABASE across BOTH tiers.
#
# The guard asserts "this run must not reach a remote Supabase". That assertion spans two
# independent paths, and a test of the helper function alone proves neither:
#   * agent env file (prepare)  — client NEXT_PUBLIC_SUPABASE_URL, blocked by omission
#   * trusted server env (start) — server SUPABASE_URL/DATABASE_URL, blocked by refusal
# Fixture values only — never reads or prints real service-role values.
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

TMP="$(mktemp -d /tmp/alloy-guard.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

HOSTED="$TMP/env.hosted"
LOCAL="$TMP/env.local"

cat >"$HOSTED" <<'EOF'
SUPABASE_URL=https://example-project.supabase.co
DATABASE_URL=postgresql://postgres:fixture@db.example-project.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=fixture-not-a-real-key
EOF

cat >"$LOCAL" <<'EOF'
SUPABASE_URL=http://127.0.0.1:56321
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres
SUPABASE_SERVICE_ROLE_KEY=fixture-not-a-real-key
EOF

# Each case runs in a subshell: the loader exports into the current shell by design.
load_trusted() {
  local source="$1" guard="$2"
  (
    export ALLOY_SERVER_ENV_SOURCE="$source"
    export ALLOY_BLOCK_REMOTE_SUPABASE="$guard"
    alloy_load_trusted_server_env_exports >/dev/null 2>&1
  )
}

# ── Tier 2: trusted server env (start path) ──────────────────────────────────

if load_trusted "$LOCAL" "1"; then
  pass "guard=1 + local trusted source loads"
else
  fail "guard=1 + local trusted source must load (co-located runs depend on it)"
fi

if load_trusted "$HOSTED" "1"; then
  fail "guard=1 + hosted trusted source must FAIL CLOSED (server reads the database)"
else
  pass "guard=1 + hosted trusted source fails closed"
fi

# The guard is opt-in. Default-off behavior must not regress for normal linked-project work.
if load_trusted "$HOSTED" "0"; then
  pass "guard=0 + hosted trusted source still loads (guard stays opt-in)"
else
  fail "guard=0 must not block a hosted trusted source"
fi

# No hosted value may survive for a caller to use after a refusal. alloy_die exits the shell, so
# this must be read through a command substitution: if the guard fires the subshell dies and yields
# empty; only a loader that wrongly kept going could echo a hosted URL back.
LEAKED="$(
  export ALLOY_SERVER_ENV_SOURCE="$HOSTED" ALLOY_BLOCK_REMOTE_SUPABASE="1"
  alloy_load_trusted_server_env_exports >/dev/null 2>&1
  printf '%s' "${SUPABASE_URL:-}"
)" || true
if [[ "$LEAKED" != *"supabase.co"* ]]; then
  pass "refusal leaves no usable hosted SUPABASE_URL"
else
  fail "hosted SUPABASE_URL survived the guard"
fi

# ── Tier 1: helper classification (unchanged contract) ───────────────────────

(
  export ALLOY_BLOCK_REMOTE_SUPABASE="1"
  alloy_is_production_supabase_url "http://127.0.0.1:56321"
) && fail "127.0.0.1 must never classify as production" \
  || pass "local URL is not production even with guard=1"

(
  export ALLOY_BLOCK_REMOTE_SUPABASE="1"
  alloy_is_production_supabase_url "https://example-project.supabase.co"
) && pass "hosted URL classifies as production with guard=1" \
  || fail "hosted URL must classify as production with guard=1"

echo
echo "Remote-Supabase guard results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
