#!/usr/bin/env bash
# Disposable fixture tests for Alloy local-dev Phase 3 (verification bootstrap).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$ROOT/tests/fixtures"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-p3.out 2>/tmp/alloy-p3.err; then
    pass "$msg"
  else
    fail "$msg"
    sed -n '1,30p' /tmp/alloy-p3.err >&2 || true
  fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-p3.out 2>/tmp/alloy-p3.err; then
    fail "$msg (expected non-zero)"
  else
    pass "$msg"
  fi
}

echo "== Phase 3 syntax checks =="
for f in \
  "$ROOT"/lib/verify.sh \
  "$ROOT"/alloy-agent-prepare \
  "$ROOT"/alloy-agent-login \
  "$ROOT"/alloy-agent-ready \
  "$ROOT"/alloy-agent-verify \
  "$ROOT"/alloy-agent-browser-stop \
  "$ROOT"/alloy-agent-context \
  "$ROOT"/alloy-agent-evidence \
  "$ROOT"/tests/run-phase3-tests.sh
do
  bash -n "$f"
  pass "bash -n $(basename "$f")"
done

TMP="$(mktemp -d /tmp/alloy-p3.XXXXXX)"
RUNTIME=""
cleanup() {
  if [[ -n "${RUNTIME}" ]]; then
    local p
    for p in "${RUNTIME}/pids"/*.pid "${RUNTIME}/browser-pids"/*.pid; do
      [[ -f "$p" ]] || continue
      kill "$(tr -d '[:space:]' <"$p")" 2>/dev/null || true
    done
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

ORIGIN="$TMP/origin.git"
CANON="$TMP/canon"
WTROOT="$TMP/worktrees"
RUNTIME="$TMP/runtime"
CONFIG_DIR="$TMP/config"
mkdir -p "$WTROOT" "$RUNTIME" "$CONFIG_DIR"

git init --bare "$ORIGIN" >/dev/null
git clone "$ORIGIN" "$CANON" >/dev/null 2>&1
git -C "$CANON" checkout -b staging >/dev/null 2>&1 || git -C "$CANON" checkout -B staging
git -C "$CANON" config user.email "p3@test.com"
git -C "$CANON" config user.name "P3 Test"
mkdir -p "$CANON/web"
cat >"$CANON/web/package.json" <<'EOF'
{"name":"fixture-web","private":true,"scripts":{"dev":"node -e \"require('http').createServer((q,s)=>{s.end('ok')}).listen(Number(process.env.PORT||3000))\""}}
EOF
printf 'fixture\n' >"$CANON/README.md"
git -C "$CANON" add . && git -C "$CANON" commit -m "base" >/dev/null
git -C "$CANON" push -u origin staging >/dev/null

# Canonical env source with allow + deny + ambiguous
cat >"$CANON/web/.env.local" <<'EOF'
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.public"
SUPABASE_SERVICE_ROLE_KEY="secret-service-role-never-copy"
STRIPE_SECRET_KEY="placeholder-not-a-real-key"
DEV_QUEUE_ORG_ID="org-demo-123"
MYSTERY_CONFIG="should-fail-ambiguous"
PORT=3000
EOF

cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_CONFIG_DIR="$CONFIG_DIR"
ALLOY_BIN_DIR="$TMP/bin"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_CANONICAL_PORT="3000"
ALLOY_FIRST_AGENT_PORT="3011"
ALLOY_MAX_AGENTS="6"
ALLOY_PM="npm"
ALLOY_WEB_DIR="web"
ALLOY_DEV_COMMAND='node -e "require(\"http\").createServer((q,s)=>{s.end(\"ok\")}).listen(Number(process.env.PORT||3000))"'
ALLOY_ENV_SOURCE="$CANON/web/.env.local"
ALLOY_ENV_ALLOWLIST="DEV_QUEUE_ORG_ID"
ALLOY_SLOT_1_QA_IDENTITY="qa-slot1@test.com"
ALLOY_AGENT_LOGIN_SCRIPT="$FIXTURES/fake-agent-login-capture.mjs"
ALLOY_AGENT_AUTH_CHECK_SCRIPT="$FIXTURES/fake-agent-auth-check.mjs"
ALLOY_AGENT_VERIFY_SCRIPT="$FIXTURES/fake-agent-verify.mjs"
ALLOY_SKIP_URL_CHECK=1
EOF

export ALLOY_CONFIG_FILE="$CONFIG_DIR/config"
export PATH="$ROOT:$PATH"

assert_ok "create agent" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" p3-one --slot 1

WT="$WTROOT/wt1-p3-one"
[[ -d "$WT" ]] && pass "worktree exists" || fail "worktree missing"

# Ambiguous var fails closed
cat >"$CANON/web/.env.local" <<'EOF'
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon"
MYSTERY_CONFIG="ambiguous"
EOF
assert_fail "ambiguous env rejected" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-prepare" 1

# Restore source without ambiguous
cat >"$CANON/web/.env.local" <<'EOF'
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon"
SUPABASE_SERVICE_ROLE_KEY="secret"
DEV_QUEUE_ORG_ID="org-demo"
EOF

PREP_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-prepare" 1 2>&1)"
echo "$PREP_OUT" | grep -q "Copied" && pass "prepare reports copied names" || fail "prepare copied report"
echo "$PREP_OUT" | grep -q "SUPABASE_SERVICE_ROLE_KEY" && pass "prepare reports excluded secret" || fail "prepare excluded report"
echo "$PREP_OUT" | grep -qi "secret-service\|eyJhbG" && fail "prepare printed secret value" || pass "values never printed"

file_mode() {
  stat -f '%OLp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null || echo ""
}

ENV_FILE="$WT/web/.env.local.agent"
[[ -f "$ENV_FILE" ]] && pass "agent env created" || fail "agent env missing"
[[ "$(file_mode "$ENV_FILE")" == "600" ]] && pass "agent env chmod 600" || fail "agent env permissions"
grep -q SUPABASE_SERVICE_ROLE_KEY "$ENV_FILE" && fail "secret in agent env" || pass "secret not copied"
grep -q NEXT_PUBLIC_SUPABASE_URL "$ENV_FILE" && pass "public url copied" || fail "public url missing"

assert_fail "silent overwrite refused" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-prepare" 1

assert_ok "overwrite with --force" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-prepare" 1 --force

# Git ignore
git -C "$WT" status --porcelain | grep -q '.env.local.agent' && fail "agent env tracked" || pass "agent env git-ignored"

assert_ok "dev-start" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-start" wt1-p3-one

export ALLOY_AGENT_LOGIN_SCRIPT="$FIXTURES/fake-agent-login-capture.mjs"
assert_ok "login capture" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-login" 1

STORAGE="$RUNTIME/auth/slot1/storage-state.json"
[[ -f "$STORAGE" ]] && pass "storage state created" || fail "storage missing"
[[ "$(file_mode "$STORAGE")" == "600" ]] && pass "storage chmod 600" || fail "storage permissions"

# duplicate browser: simulate an owned live browser PID (not the test shell).
sleep 120 &
BROWSER_PID=$!
echo "$BROWSER_PID" >"$RUNTIME/browser-pids/slot1.pid"
cat >"$RUNTIME/browser-pids/slot1.meta" <<META
ALLOY_BROWSER_SLOT="1"
ALLOY_BROWSER_PID="${BROWSER_PID}"
ALLOY_BROWSER_PROFILE="$RUNTIME/browser-profiles/slot1"
ALLOY_BROWSER_WORKTREE="wt1-p3-one"
META
assert_fail "duplicate browser refused" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-login" 1
kill "$BROWSER_PID" 2>/dev/null || true
wait "$BROWSER_PID" 2>/dev/null || true
rm -f "$RUNTIME/browser-pids/slot1.pid" "$RUNTIME/browser-pids/slot1.meta"

# expired state
echo 'EXPIRED' >"$STORAGE"
chmod 600 "$STORAGE"
python3 -c "import json; json.dump({'cookies':[]}, open('$STORAGE','w'))" 2>/dev/null || echo '{"cookies":[{"name":"x","value":"EXPIRED"}]}' >"$STORAGE"
chmod 600 "$STORAGE"
echo '{"cookies":[{"name":"x","value":"EXPIRED"}]}' >"$STORAGE"
chmod 600 "$STORAGE"
STATUS="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_SKIP_AUTH_LIVE_CHECK=0 "$ROOT/alloy-agent-status" 1)"
echo "$STATUS" | grep -q 'auth:.*expired' && pass "expired auth reported" || echo "$STATUS" | grep -q 'auth:' && pass "auth status reported" || fail "auth status"

echo '{"cookies":[{"name":"x","value":"ok"}]}' >"$STORAGE"
chmod 600 "$STORAGE"

assert_ok "context generate" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-context" 1 --refresh
[[ -f "$WT/.alloy-agent-context.md" ]] && pass "context file" || fail "context file"

READY_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_SKIP_URL_CHECK=1 "$ROOT/alloy-agent-ready" 1 2>&1 || true)"
echo "$READY_OUT" | grep -q 'Result: READY' && pass "ready when prerequisites met" || fail "ready check (got: $READY_OUT)"

assert_ok "focused verify" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-verify" 1 authenticated-home

EVIDENCE="$RUNTIME/evidence/wt1-p3-one"
[[ -d "$EVIDENCE" ]] && pass "evidence dir" || fail "evidence dir"
assert_ok "evidence list" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-evidence" 1

# production host rejected
assert_fail "production host rejected" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_VERIFY_BASE_URL="https://workwithalloy.com" \
  "$ROOT/alloy-agent-verify" 1 route /workspace

# browser stop owned only (use background sleep, not test shell PID)
sleep 120 &
BROWSER_PID=$!
echo "$BROWSER_PID" >"$RUNTIME/browser-pids/slot1.pid"
cat >"$RUNTIME/browser-pids/slot1.meta" <<META
ALLOY_BROWSER_SLOT="1"
ALLOY_BROWSER_PID="${BROWSER_PID}"
ALLOY_BROWSER_PROFILE="$RUNTIME/browser-profiles/slot1"
ALLOY_BROWSER_WORKTREE="wt1-p3-one"
META
assert_ok "browser stop owned" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-browser-stop" 1
wait "$BROWSER_PID" 2>/dev/null || true

# classify env unit tests via sourced helpers
# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"
# shellcheck source=../lib/verify.sh
source "$ROOT/lib/verify.sh"
[[ "$(alloy_classify_env_var SUPABASE_SERVICE_ROLE_KEY)" == "deny" ]] && pass "classify deny secret" || fail "classify deny"
[[ "$(alloy_classify_env_var NEXT_PUBLIC_SUPABASE_URL)" == "allow" ]] && pass "classify allow public" || fail "classify public"
[[ "$(alloy_classify_env_var MYSTERY_CONFIG)" == "ambiguous" ]] && pass "classify ambiguous" || fail "classify ambiguous"

echo
echo "Phase 3 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
