#!/usr/bin/env bash
# Disposable fixture tests for Alloy local-dev Phase 1.
# Does not touch real Alloy production branches or worktrees.
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
  if "$@" >/tmp/alloy-local-dev-test.out 2>/tmp/alloy-local-dev-test.err; then
    pass "$msg"
  else
    fail "$msg"
    sed -n '1,40p' /tmp/alloy-local-dev-test.err >&2 || true
  fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-local-dev-test.out 2>/tmp/alloy-local-dev-test.err; then
    fail "$msg (expected non-zero)"
  else
    pass "$msg"
  fi
}

echo "== Syntax checks =="
for f in \
  "$ROOT"/install.sh \
  "$ROOT"/lib/common.sh \
  "$ROOT"/lib/lock.sh \
  "$ROOT"/tests/run-phase1-tests.sh \
  "$ROOT"/alloy-worktree-create \
  "$ROOT"/alloy-worktree-sync \
  "$ROOT"/alloy-worktree-remove \
  "$ROOT"/alloy-dev-start \
  "$ROOT"/alloy-dev-stop \
  "$ROOT"/alloy-dev-status \
  "$ROOT"/alloy-validate \
  "$ROOT"/alloy-health \
  "$ROOT"/alloy-audit \
  "$ROOT"/alloy-clean
do
  bash -n "$f"
  pass "bash -n $(basename "$f")"
done

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x "$ROOT"/lib/*.sh "$ROOT"/install.sh || fail "shellcheck reported issues"
else
  echo "INFO: shellcheck not installed; skipped"
fi

TMP="$(mktemp -d /tmp/alloy-local-dev-fixture.XXXXXX)"
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
BIN="$TMP/bin"
mkdir -p "$WTROOT" "$RUNTIME" "$CONFIG_DIR" "$BIN"

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

cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_CONFIG_DIR="$CONFIG_DIR"
ALLOY_BIN_DIR="$BIN"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_CANONICAL_PORT="3000"
ALLOY_FIRST_AGENT_PORT="3011"
ALLOY_MAX_AGENTS="6"
ALLOY_PM="npm"
ALLOY_WEB_DIR="web"
ALLOY_DEV_COMMAND='node -e "require(\"http\").createServer((q,s)=>{s.end(\"ok\")}).listen(Number(process.env.PORT||3000))"'
ALLOY_TYPECHECK_COMMAND='node -e "console.log(\"tc-ok\")"'
ALLOY_TEST_COMMAND='node -e "console.log(\"test-ok\")"'
ALLOY_BUILD_COMMAND='npm run build'
ALLOY_PLAYWRIGHT_COMMAND='node -e "console.log(\"pw-ok\")"'
ALLOY_IMPORTS_COMMAND='npm run verify:module-imports'
NODE_OPTIONS_DEFAULT="--max-old-space-size=4096"
ALLOY_VALIDATE_POLL_SECONDS="1"
EOF

export ALLOY_CONFIG_FILE="$CONFIG_DIR/config"
export PATH="$ROOT:$PATH"

echo "== Functional fixture tests =="

assert_fail "invalid slot rejected" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-create" 0 bad cursor

assert_fail "invalid slot 7 rejected" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-create" 7 bad cursor

assert_ok "create slot 1" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-create" 1 fixture-one cursor

[[ -d "$WTROOT/wt1-fixture-one" ]] && pass "worktree path exists" || fail "worktree path missing"
[[ -f "$WTROOT/wt1-fixture-one/.env.local.agent" ]] && pass "agent env created" || fail "agent env missing"
[[ -f "$RUNTIME/metadata/wt1-fixture-one.env" ]] && pass "metadata created" || fail "metadata missing"

node -e 'require("http").createServer().listen(3012)' >/dev/null 2>&1 &
OCC_PID=$!
sleep 0.4
assert_fail "occupied port rejected on create" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-create" 2 fixture-two cursor
kill "$OCC_PID" 2>/dev/null || true
wait "$OCC_PID" 2>/dev/null || true

assert_ok "create slot 2 after port free" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-create" 2 fixture-two claude

assert_ok "dev-start slot1" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-start" wt1-fixture-one

assert_fail "duplicate server start rejected" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-start" wt1-fixture-one

echo 999999 >"$RUNTIME/pids/wt2-fixture-two.pid"
assert_ok "dev-start clears dead pid and starts" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-start" wt2-fixture-two

echo dirty >"$WTROOT/wt1-fixture-one/README.md"
assert_fail "dirty sync rejected" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-sync" wt1-fixture-one
git -C "$WTROOT/wt1-fixture-one" checkout -- README.md

printf '\nsecond\n' >>"$CANON/README.md"
git -C "$CANON" add README.md
git -C "$CANON" commit -m "staging advance" >/dev/null
git -C "$CANON" push origin staging >/dev/null
assert_ok "clean sync rebases" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-sync" wt1-fixture-one

LOCK_DIR="$RUNTIME/locks/validate.lock"
rm -rf "$LOCK_DIR"
# Hold lock with a dedicated long-lived owner process.
sleep 30 &
HOLDER_PID=$!
mkdir "$LOCK_DIR"
cat >"$LOCK_DIR/owner.env" <<EOF
ALLOY_VALIDATE_WORKTREE="holder"
ALLOY_VALIDATE_KIND="test"
ALLOY_VALIDATE_PID="${HOLDER_PID}"
ALLOY_VALIDATE_STARTED="now"
ALLOY_VALIDATE_COMMAND="sleep"
EOF

# Waiter should observe the owner then exit on SIGTERM (trap not installed until acquire).
set +e
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_VALIDATE_POLL_SECONDS=1 \
  "$ROOT/alloy-validate" wt1-fixture-one typecheck >/tmp/alloy-validate-wait.out 2>&1 &
WAIT_PID=$!
sleep 1.2
kill "$WAIT_PID" 2>/dev/null || true
wait "$WAIT_PID" 2>/dev/null
WAIT_RC=$?
set -e
grep -q "validation lock held" /tmp/alloy-validate-wait.out && pass "validate reports lock owner while busy" || fail "validate did not report lock owner"
if [[ -d "$LOCK_DIR" ]]; then
  pass "foreign lock remains after waiter kill"
else
  fail "waiter incorrectly removed foreign lock"
fi
kill "$HOLDER_PID" 2>/dev/null || true
wait "$HOLDER_PID" 2>/dev/null || true
rm -rf "$LOCK_DIR"
[[ "$WAIT_RC" -ne 0 ]] && pass "waiter exited non-zero under contention" || fail "waiter unexpectedly succeeded"

assert_ok "validate succeeds and releases lock" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-validate" wt1-fixture-one typecheck
[[ ! -d "$LOCK_DIR" ]] && pass "lock cleaned after success" || fail "lock directory remains after success"

set +e
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-validate" wt1-fixture-one command -- \
  node -e 'process.exit(7)'
rc=$?
set -e
assert_eq "7" "$rc" "validate returns underlying exit code"
[[ ! -d "$LOCK_DIR" ]] && pass "lock cleaned after command failure" || fail "lock remains after command failure"

STATUS_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-status" || true)"
echo "$STATUS_OUT" | grep -q "wt1-fixture-one" && pass "status lists worktree" || fail "status missing worktree"
echo "$STATUS_OUT" | grep -Eq "running|foreign-port-owner" && pass "status shows active state" || fail "status missing running state"

REPORT_OUT="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-clean" report)"
echo "$REPORT_OUT" | grep -q "No deletions performed" && pass "clean report-only" || fail "clean report"

git -C "$WTROOT/wt2-fixture-two" commit --allow-empty -m "unmerged work" >/dev/null
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-stop" wt2-fixture-two >/dev/null || true
assert_fail "remove rejects unmerged branch" \
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-worktree-remove" wt2-fixture-two

# Install preserves existing config under a fake HOME
HOME_TMP="$TMP/home"
mkdir -p "$HOME_TMP/.config/alloy-dev" "$HOME_TMP/bin"
printf 'PRESERVE=1\nALLOY_REPO="%s"\n' "$CANON" >"$HOME_TMP/.config/alloy-dev/config"
HOME="$HOME_TMP" bash "$ROOT/install.sh" >/tmp/alloy-install.out
grep -q "Preserved existing config" /tmp/alloy-install.out && pass "install preserves config" || fail "install overwrite"
grep -q "PRESERVE=1" "$HOME_TMP/.config/alloy-dev/config" && pass "config contents preserved" || fail "config contents changed"

env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-dev-stop" wt1-fixture-one >/dev/null || true

echo
echo "Results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
