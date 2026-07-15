#!/usr/bin/env bash
# Disposable fixture tests for Alloy local-dev Phase 2 (managed agents).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_eq() {
  local want="$1" got="$2" msg="$3"
  if [[ "$want" == "$got" ]]; then pass "$msg"; else fail "$msg (want='$want' got='$got')"; fi
}

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-local-dev-p2.out 2>/tmp/alloy-local-dev-p2.err; then
    pass "$msg"
  else
    fail "$msg"
    sed -n '1,40p' /tmp/alloy-local-dev-p2.err >&2 || true
  fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-local-dev-p2.out 2>/tmp/alloy-local-dev-p2.err; then
    fail "$msg (expected non-zero)"
  else
    pass "$msg"
  fi
}

echo "== Phase 2 syntax checks =="
for f in \
  "$ROOT"/lib/agent.sh \
  "$ROOT"/lib/common.sh \
  "$ROOT"/shell-aliases.sh \
  "$ROOT"/alloy-agent-create \
  "$ROOT"/alloy-agent-open \
  "$ROOT"/alloy-agent-status \
  "$ROOT"/alloy-agent-close \
  "$ROOT"/alloy-agent-instructions \
  "$ROOT"/alloy-ai-health \
  "$ROOT"/tests/run-phase2-tests.sh \
  "$ROOT"/tests/test-ai-health.sh
do
  bash -n "$f"
  pass "bash -n $(basename "$f")"
done

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x "$ROOT"/lib/agent.sh "$ROOT"/alloy-agent-* "$ROOT"/alloy-ai-health || fail "shellcheck Phase 2"
else
  echo "INFO: shellcheck not installed; skipped"
fi

TMP="$(mktemp -d /tmp/alloy-local-dev-p2.XXXXXX)"
RUNTIME=""
cleanup() {
  if [[ -n "${RUNTIME}" && -d "${RUNTIME}/pids" ]]; then
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
mkdir -p "$WTROOT" "$RUNTIME" "$CONFIG_DIR"

echo "== Build disposable git fixture =="
git init --bare "$ORIGIN" >/dev/null
git clone "$ORIGIN" "$CANON" >/dev/null 2>&1
git -C "$CANON" checkout -b staging >/dev/null 2>&1 || git -C "$CANON" checkout -B staging
git -C "$CANON" config user.email "local-dev-test@example.com"
git -C "$CANON" config user.name "Local Dev Test"
mkdir -p "$CANON/web"
cat >"$CANON/web/package.json" <<'EOF'
{
  "name": "fixture-web",
  "private": true,
  "scripts": {
    "dev": "node -e \"require('http').createServer((q,s)=>{s.end('ok')}).listen(Number(process.env.PORT||3000))\"",
    "build": "node -e \"console.log('build-ok')\"",
    "verify:module-imports": "node -e \"console.log('imports-ok')\""
  }
}
EOF
printf 'fixture\n' >"$CANON/README.md"
git -C "$CANON" add .
git -C "$CANON" commit -m "fixture base" >/dev/null
git -C "$CANON" push -u origin staging >/dev/null

TRUSTED_SRC="$TMP/trusted-server.env"
cat >"$TRUSTED_SRC" <<'EOF'
SUPABASE_SERVICE_ROLE_KEY="fixture-service-role-phase2-never-real"
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
ALLOY_SERVER_ENV_SOURCE="$TRUSTED_SRC"
ALLOY_TYPECHECK_COMMAND='node -e "console.log(\"tc-ok\")"'
ALLOY_TEST_COMMAND='node -e "console.log(\"test-ok\")"'
ALLOY_BUILD_COMMAND='npm run build'
ALLOY_PLAYWRIGHT_COMMAND='node -e "console.log(\"pw-ok\")"'
ALLOY_IMPORTS_COMMAND='npm run verify:module-imports'
NODE_OPTIONS_DEFAULT="--max-old-space-size=4096"
ALLOY_VALIDATE_POLL_SECONDS="1"
ALLOY_SLOT_3_ROLE="Performance"
ALLOY_SLOT_3_DEFAULT_AGENT="cursor"
EOF

export ALLOY_CONFIG_FILE="$CONFIG_DIR/config"
CFG=(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config")

echo "== Phase 2 functional tests =="

# Auto-assign first free slot (1) with permanent default agent (cursor).
assert_ok "agent-create auto slot 1" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" auto-one

[[ -d "$WTROOT/wt1-auto-one" ]] && pass "auto worktree path" || fail "auto worktree path"
[[ -f "$WTROOT/wt1-auto-one/.alloy-agent-instructions.md" ]] && pass "instructions file" || fail "instructions file"
grep -q 'ALLOY_AGENT_ROLE=' "$RUNTIME/metadata/wt1-auto-one.env" && pass "agent role metadata" || fail "agent role metadata"
grep -q 'Product implementation' "$RUNTIME/metadata/wt1-auto-one.env" && pass "slot 1 permanent role" || fail "slot 1 permanent role"
grep -q 'ALLOY_AGENT_STATUS="active"' "$RUNTIME/metadata/wt1-auto-one.env" && pass "agent status active" || fail "agent status active"
grep -q 'PORT="3011"' "$RUNTIME/metadata/wt1-auto-one.env" && pass "auto port 3011" || fail "auto port 3011"
grep -q 'ALLOY_AGENT="cursor"' "$RUNTIME/metadata/wt1-auto-one.env" && pass "slot 1 default cursor" || fail "slot 1 default cursor"

# Explicit slot 3 Performance personality.
assert_ok "agent-create --slot 3" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" queue-perf --slot 3

grep -q 'ALLOY_WORKTREE_SLOT="3"' "$RUNTIME/metadata/wt3-queue-perf.env" && pass "slot 3 assigned" || fail "slot 3 assigned"
grep -q 'PORT="3013"' "$RUNTIME/metadata/wt3-queue-perf.env" && pass "port 3013" || fail "port 3013"
grep -q 'Performance' "$RUNTIME/metadata/wt3-queue-perf.env" && pass "performance role" || fail "performance role"
grep -q 'slot 3' "$WTROOT/wt3-queue-perf/.alloy-agent-instructions.md" && pass "instructions mention slot 3" || fail "instructions mention slot"

# Slot 2 default agent is claude when omitted.
assert_ok "agent-create slot 2 default claude" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" arch-pass --slot 2

grep -q 'ALLOY_AGENT="claude"' "$RUNTIME/metadata/wt2-arch-pass.env" && pass "slot 2 default claude" || fail "slot 2 default claude"

assert_fail "occupied slot rejected" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" again --slot 1

STATUS_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-status")"
echo "$STATUS_OUT" | grep -q "wt1-auto-one" && pass "status lists agent" || fail "status lists agent"
echo "$STATUS_OUT" | grep -q "Permanent slot map" && pass "status shows slot map" || fail "status shows slot map"
echo "$STATUS_OUT" | grep -q "assigned (wt3-queue-perf)" && pass "status marks slot 3 assigned" || fail "status marks slot 3"

INSTR="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-instructions" 3)"
echo "$INSTR" | grep -q "3013" && pass "instructions include port" || fail "instructions include port"
echo "$INSTR" | grep -q "wt3-queue-perf" && pass "instructions include worktree" || fail "instructions include worktree"

if command -v pbcopy >/dev/null 2>&1; then
  assert_ok "instructions --copy" \
    env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-instructions" 3 --copy
else
  echo "INFO: pbcopy missing; --copy skipped"
fi

assert_ok "agent-open dry-run" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_AGENT_OPEN_DRY_RUN=1 \
  "$ROOT/alloy-agent-open" 3

assert_ok "agent-open --with-server dry-run" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_AGENT_OPEN_DRY_RUN=1 \
  "$ROOT/alloy-agent-open" 3 --with-server

[[ -f "$RUNTIME/pids/wt3-queue-perf.pid" ]] && pass "server pid after --with-server" || fail "server pid after --with-server"

# Second --with-server must not duplicate (already running path).
OUT_DUP="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_AGENT_OPEN_DRY_RUN=1 \
  "$ROOT/alloy-agent-open" 3 --with-server 2>&1)"
echo "$OUT_DUP" | grep -Eqi 'already running|no duplicate' && pass "open refuses duplicate server" || fail "open refuses duplicate server"

assert_ok "agent-close" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-close" 3

[[ -d "$WTROOT/wt3-queue-perf" ]] && pass "close keeps worktree" || fail "close keeps worktree"
[[ -f "$RUNTIME/metadata/wt3-queue-perf.env" ]] && pass "close keeps metadata" || fail "close keeps metadata"
grep -q 'ALLOY_AGENT_STATUS="closed"' "$RUNTIME/metadata/wt3-queue-perf.env" && pass "close marks closed" || fail "close marks closed"
[[ ! -f "$RUNTIME/pids/wt3-queue-perf.pid" ]] && pass "close stopped server" || fail "close stopped server"

CLOSE_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-close" 1 2>&1 || true)"
echo "$CLOSE_OUT" | grep -qi 'Worktree was NOT removed' && pass "close reminds worktree kept" || fail "close reminds worktree kept"

assert_ok "ai-health read-only" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-ai-health"

# Fill remaining slots then refuse create.
assert_ok "fill slot 4" env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" s4 --slot 4
assert_ok "fill slot 5" env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" s5 --slot 5
assert_ok "fill slot 6" env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" s6 --slot 6
assert_fail "no free slots" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-create" overflow

# Resolve by name
assert_ok "status by name" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-agent-status" wt1-auto-one

echo
echo "== Focused AI-health suite =="
set +e
bash "$ROOT/tests/test-ai-health.sh"
ai_rc=$?
set -e
if [[ "$ai_rc" -eq 0 ]]; then
  pass "focused AI-health suite"
else
  fail "focused AI-health suite"
fi

echo
echo "Phase 2 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
