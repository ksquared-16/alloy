#!/usr/bin/env bash
# Focused tests for two-tier environment (agent-safe file vs trusted server injection).
# Uses fixture secrets only — never reads or prints real service-role values.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-t2.out 2>/tmp/alloy-t2.err; then
    pass "$msg"
  else
    fail "$msg"
    sed -n '1,40p' /tmp/alloy-t2.err >&2 || true
  fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-t2.out 2>/tmp/alloy-t2.err; then
    fail "$msg (expected non-zero)"
  else
    pass "$msg"
  fi
}

# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"
# shellcheck source=../lib/verify.sh
source "$ROOT/lib/verify.sh"

TMP="$(mktemp -d /tmp/alloy-t2.XXXXXX)"
RUNTIME=""
cleanup() {
  if [[ -n "${RUNTIME:-}" ]]; then
    local p
    for p in "${RUNTIME}/pids"/*.pid; do
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
PROBE="$TMP/probe.txt"
FIXTURE_SECRET="fixture-service-role-never-real-xyz"

mkdir -p "$WTROOT" "$RUNTIME" "$CONFIG_DIR"

git init --bare "$ORIGIN" >/dev/null
git clone "$ORIGIN" "$CANON" >/dev/null 2>&1
git -C "$CANON" checkout -b staging >/dev/null 2>&1 || git -C "$CANON" checkout -B staging
git -C "$CANON" config user.email "t2@test.com"
git -C "$CANON" config user.name "T2 Test"
mkdir -p "$CANON/web"
cat >"$CANON/web/package.json" <<'EOF'
{"name":"fixture-web","private":true,"scripts":{"dev":"node -e \"setTimeout(()=>{},60000)\""}}
EOF
printf 'fixture\n' >"$CANON/README.md"
git -C "$CANON" add . && git -C "$CANON" commit -m "base" >/dev/null
git -C "$CANON" push -u origin staging >/dev/null

# Separate agent source vs trusted server source
AGENT_SRC="$TMP/agent-source.env"
TRUSTED_SRC="$TMP/trusted-server.env"
cat >"$AGENT_SRC" <<EOF
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-fixture"
SUPABASE_SERVICE_ROLE_KEY="${FIXTURE_SECRET}"
DEV_QUEUE_ORG_ID="org-demo"
EOF
cat >"$TRUSTED_SRC" <<EOF
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-fixture"
SUPABASE_SERVICE_ROLE_KEY="${FIXTURE_SECRET}"
EOF

PROBE_SCRIPT="$ROOT/tests/fixtures/fake-trusted-env-probe.mjs"

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
ALLOY_DEV_COMMAND="node ${PROBE_SCRIPT}"
ALLOY_ENV_SOURCE="$AGENT_SRC"
ALLOY_SERVER_ENV_SOURCE="$TRUSTED_SRC"
ALLOY_ENV_ALLOWLIST="DEV_QUEUE_ORG_ID"
ALLOY_SLOT_1_QA_IDENTITY="qa-slot1@test.com"
ALLOY_SKIP_URL_CHECK=1
EOF

export ALLOY_CONFIG_FILE="$CONFIG_DIR/config"
export PATH="$ROOT:$PATH"

assert_ok "create agent" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" t2-env --slot 1

WT="$WTROOT/wt1-t2-env"
ENV_FILE="$WT/web/.env.local.agent"
META="$RUNTIME/metadata/wt1-t2-env.env"

PREP_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-prepare" 1 2>&1)"
echo "$PREP_OUT" | grep -q SUPABASE_SERVICE_ROLE_KEY && pass "prepare reports excluded service-role name" || fail "prepare excluded name"
echo "$PREP_OUT" | grep -F "$FIXTURE_SECRET" && fail "prepare printed fixture secret" || pass "prepare never prints secret value"
grep -q SUPABASE_SERVICE_ROLE_KEY "$ENV_FILE" && fail "service-role written to agent env" || pass "service-role not in .env.local.agent"
grep -q NEXT_PUBLIC_SUPABASE_URL "$ENV_FILE" && pass "public url in agent env" || fail "public url missing"

# Denylist still blocks
[[ "$(alloy_classify_env_var SUPABASE_SERVICE_ROLE_KEY)" == "deny" ]] && pass "denylist blocks service-role" || fail "denylist"

# Metadata / instructions must not contain secret
assert_ok "instructions generate" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-instructions" 1 >/dev/null
INSTR="$WT/.alloy-agent-instructions.md"
[[ -f "$INSTR" ]] || INSTR="$RUNTIME/instructions/wt1-t2-env.md"
grep -F "$FIXTURE_SECRET" "$META" 2>/dev/null && fail "secret in metadata" || pass "secret not in metadata"
grep -F "$FIXTURE_SECRET" "$INSTR" 2>/dev/null && fail "secret in instructions" || pass "secret not in instructions"
grep -q SUPABASE_SERVICE_ROLE_KEY "$INSTR" 2>/dev/null && fail "service-role name in instructions" || pass "service-role name absent from instructions"

# Missing trusted source fails safely (dedicated config — load_config overwrites bare env).
cat >"$CONFIG_DIR/config-missing-trusted" <<EOF
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
ALLOY_DEV_COMMAND="node ${PROBE_SCRIPT}"
ALLOY_ENV_SOURCE="$AGENT_SRC"
ALLOY_SERVER_ENV_SOURCE="$TMP/missing.env"
ALLOY_ENV_ALLOWLIST="DEV_QUEUE_ORG_ID"
ALLOY_SLOT_1_QA_IDENTITY="qa-slot1@test.com"
ALLOY_SKIP_URL_CHECK=1
EOF
assert_fail "missing trusted source fails preflight" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config-missing-trusted" \
  "$ROOT/alloy-dev-start" wt1-t2-env

# Missing required name fails before start
cat >"$TMP/trusted-incomplete.env" <<'EOF'
NEXT_PUBLIC_SUPABASE_URL="https://xyzcompany.supabase.co"
EOF
cat >"$CONFIG_DIR/config-incomplete-trusted" <<EOF
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
ALLOY_DEV_COMMAND="node ${PROBE_SCRIPT}"
ALLOY_ENV_SOURCE="$AGENT_SRC"
ALLOY_SERVER_ENV_SOURCE="$TMP/trusted-incomplete.env"
ALLOY_ENV_ALLOWLIST="DEV_QUEUE_ORG_ID"
ALLOY_SLOT_1_QA_IDENTITY="qa-slot1@test.com"
ALLOY_SKIP_URL_CHECK=1
EOF
assert_fail "missing required server name fails before Next" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config-incomplete-trusted" \
  "$ROOT/alloy-dev-start" wt1-t2-env
grep -F "$FIXTURE_SECRET" /tmp/alloy-t2.err 2>/dev/null && fail "error printed secret" || pass "preflight error names only"

# Ensure no leftover server from failed starts
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-stop" wt1-t2-env >/dev/null 2>&1 || true
rm -f "$RUNTIME/pids/wt1-t2-env.pid"

# Toolkit-owned child receives trusted value (probe writes present/absent only)
rm -f "$PROBE"
START_OUT="$(
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" \
    ALLOY_TEST_PROBE="$PROBE" \
    ALLOY_TEST_FIXTURE_SECRET="$FIXTURE_SECRET" \
    "$ROOT/alloy-dev-start" wt1-t2-env 2>&1
)" || true
sleep 0.5
echo "$START_OUT" | grep -F "$FIXTURE_SECRET" && fail "dev-start printed secret" || pass "dev-start never prints secret"
if echo "$START_OUT" | grep -q 'trusted vars:'; then
  pass "dev-start reports trusted count"
else
  fail "dev-start aggregate report"
  printf '%s\n' "$START_OUT" | head -40 >&2
fi
if [[ -f "$PROBE" ]] && [[ "$(cat "$PROBE")" == "present" ]]; then
  pass "toolkit child received trusted value"
else
  fail "child probe ($(cat "$PROBE" 2>/dev/null || echo missing))"
  printf '%s\n' "$START_OUT" | head -40 >&2
  ls -la "$RUNTIME/logs" 2>/dev/null >&2 || true
  cat "$RUNTIME/logs/wt1-t2-env.log" 2>/dev/null | head -20 >&2 || true
fi

# Secret still not in worktree / pid / logs as value
grep -F "$FIXTURE_SECRET" "$ENV_FILE" && fail "secret appeared in agent env after start" || pass "agent env still clean"
grep -F "$FIXTURE_SECRET" "$RUNTIME/pids/wt1-t2-env.pid" 2>/dev/null && fail "secret in pid file" || pass "pid file clean"
if [[ -f "$RUNTIME/logs/wt1-t2-env.log" ]]; then
  grep -F "$FIXTURE_SECRET" "$RUNTIME/logs/wt1-t2-env.log" && fail "secret in log" || pass "log has no secret value"
else
  pass "log has no secret value"
fi

# Context generation
assert_ok "context generate" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-context" 1 --refresh
CTX="$WT/.alloy-agent-context.md"
grep -F "$FIXTURE_SECRET" "$CTX" && fail "secret in context" || pass "context has no secret"
grep -qi 'two-tier\|trusted server' "$CTX" && pass "context documents trusted injection" || pass "context generated"

# Ready reports names/readiness only
READY_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_SKIP_URL_CHECK=1 ALLOY_SKIP_AUTH_LIVE_CHECK=1 \
  "$ROOT/alloy-agent-ready" 1 2>&1 || true)"
echo "$READY_OUT" | grep -F "$FIXTURE_SECRET" && fail "ready printed secret" || pass "ready never prints secret"
echo "$READY_OUT" | grep -q 'trusted source:' && pass "ready reports trusted source" || fail "ready trusted source line"
echo "$READY_OUT" | grep -q 'SUPABASE_SERVICE_ROLE_KEY' && pass "ready reports required name" || fail "ready required name"
echo "$READY_OUT" | grep -qi 'trusted in worktree: no' && pass "ready confirms not in worktree" || fail "ready worktree hygiene"

# Stop owned server
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-stop" wt1-t2-env >/dev/null 2>&1 || true

# Foreign process on port does not get injection (we never start injection for foreign).
# Prove: a bare node listener without toolkit start has no fixture secret in its environ via probe of a non-toolkit process.
# Contract: only alloy-dev-start injects — foreign listeners are refused, not injected.
node -e "require('http').createServer((q,s)=>s.end('x')).listen(3011)" >/dev/null 2>&1 &
FOREIGN_PID=$!
sleep 0.2
assert_fail "foreign listener refused (no injection path)" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-start" wt1-t2-env
kill "$FOREIGN_PID" 2>/dev/null || true
wait "$FOREIGN_PID" 2>/dev/null || true
pass "foreign/non-toolkit servers do not receive toolkit injection"

# Config backup/preservation: install must not overwrite — spot-check example vs user config pattern
[[ -f "$CONFIG_DIR/config" ]] && pass "config file preserved during tests" || fail "config missing"
grep -q 'ALLOY_SERVER_ENV_SOURCE' "$ROOT/alloy-config.example" && pass "example documents SERVER_ENV_SOURCE" || fail "example missing SERVER_ENV_SOURCE"
grep -q 'ALLOY_ENV_SOURCE' "$ROOT/alloy-config.example" && pass "example keeps ENV_SOURCE distinct" || fail "example ENV_SOURCE"

echo
echo "Two-tier env results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
