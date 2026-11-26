#!/usr/bin/env bash
# Focused tests for Managed Sprint Operations V1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-sprint-ops.out 2>/tmp/alloy-sprint-ops.err; then
    pass "$msg"
  else
    fail "$msg"
    sed -n '1,50p' /tmp/alloy-sprint-ops.err >&2 || true
    sed -n '1,20p' /tmp/alloy-sprint-ops.out >&2 || true
  fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-sprint-ops.out 2>/tmp/alloy-sprint-ops.err; then
    fail "$msg (expected non-zero)"
    sed -n '1,20p' /tmp/alloy-sprint-ops.out >&2 || true
  else
    pass "$msg"
  fi
}

assert_contains() {
  local msg="$1" needle="$2" file="${3:-/tmp/alloy-sprint-ops.out}"
  if grep -qF "$needle" "$file" 2>/dev/null; then
    pass "$msg"
  else
    fail "$msg (missing '$needle' in $file)"
    sed -n '1,40p' "$file" >&2 || true
  fi
}

echo "== Sprint ops syntax =="
for f in \
  "$ROOT"/lib/sprint-ops.sh \
  "$ROOT"/alloy-sprint-start \
  "$ROOT"/alloy-worker-pause \
  "$ROOT"/alloy-worker-resume \
  "$ROOT"/alloy-worker-doctor \
  "$ROOT"/alloy-sprint-finish \
  "$ROOT"/alloy-worker-status \
  "$ROOT"/tests/test-sprint-ops.sh
do
  bash -n "$f"
  pass "bash -n $(basename "$f")"
done

TMP="$(mktemp -d /tmp/alloy-sprint-ops.XXXXXX)"
RUNTIME=""
UNRELATED_PID=""
cleanup() {
  if [[ -n "${UNRELATED_PID}" ]]; then
    kill "$UNRELATED_PID" 2>/dev/null || true
  fi
  if [[ -n "${RUNTIME}" && -d "${RUNTIME}/pids" ]]; then
    local p
    for p in "${RUNTIME}/pids"/*.pid "${RUNTIME}/pids"/*.provider.pid; do
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
FAKE_BIN="$TMP/bin"
mkdir -p "$WTROOT" "$RUNTIME" "$CONFIG_DIR" "$FAKE_BIN"

# Fake package manager — records installs, never touches real npm.
cat >"$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "fake-npm $*" >>"${ALLOY_TEST_NPM_LOG:-/tmp/fake-npm.log}"
if [[ "${1:-}" == "install" ]]; then
  mkdir -p node_modules
  printf 'installed\n' >node_modules/.alloy-fake
fi
if [[ "${1:-}" == "run" && "${2:-}" == "dev" ]]; then
  exec node -e "require('http').createServer((q,s)=>{s.end('ok')}).listen(Number(process.env.PORT||3000))"
fi
exit 0
EOF
chmod +x "$FAKE_BIN/npm"

# Unrelated sleep process — pause must not kill it.
sleep 3600 &
UNRELATED_PID=$!

echo "== Build disposable git fixture =="
git init --bare "$ORIGIN" >/dev/null
git clone "$ORIGIN" "$CANON" >/dev/null 2>&1
git -C "$CANON" checkout -b staging >/dev/null 2>&1 || git -C "$CANON" checkout -B staging
git -C "$CANON" config user.email "sprint-ops-test@example.com"
git -C "$CANON" config user.name "Sprint Ops Test"
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
# Minimal env source for prepare
cat >"$CANON/web/.env.local" <<'EOF'
NEXT_PUBLIC_APP_URL=http://localhost:3000
DEV_QUEUE_ORG_ID=org-fixture
PORT=3000
NODE_ENV=development
SUPABASE_SERVICE_ROLE_KEY=fixture-service-role-not-real
EOF
printf 'fixture\n' >"$CANON/README.md"
printf 'node_modules/\n.env*.local\n.env.local.agent\n' >"$CANON/.gitignore"
git -C "$CANON" add .
git -C "$CANON" commit -m "fixture" >/dev/null
git -C "$CANON" push -u origin staging >/dev/null 2>&1

cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_CONFIG_DIR="$CONFIG_DIR"
ALLOY_BIN_DIR="$TMP/bin-install"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_CANONICAL_PORT="3000"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
ALLOY_PM="npm"
ALLOY_WEB_DIR="web"
ALLOY_DEV_COMMAND='node -e "require(\"http\").createServer((q,s)=>{s.end(\"ok\")}).listen(Number(process.env.PORT||3000))"'
ALLOY_TYPECHECK_COMMAND='node -e "console.log(\"tc-ok\")"'
ALLOY_TEST_COMMAND='node -e "console.log(\"test-ok\")"'
ALLOY_BUILD_COMMAND='node -e "console.log(\"build-ok\")"'
ALLOY_PLAYWRIGHT_COMMAND='node -e "console.log(\"pw-ok\")"'
ALLOY_IMPORTS_COMMAND='node -e "console.log(\"imports-ok\")"'
NODE_OPTIONS_DEFAULT="--max-old-space-size=512"
ALLOY_ENV_SOURCE="$CANON/web/.env.local"
ALLOY_SERVER_ENV_SOURCE="$CANON/web/.env.local"
ALLOY_ENV_ALLOWLIST="DEV_QUEUE_ORG_ID"
ALLOY_MAX_ACTIVE_PROVIDERS="2"
ALLOY_MAX_RUNNING_SERVERS="1"
ALLOY_MAX_CONCURRENT_INSTALLS="1"
ALLOY_MAX_CONCURRENT_HEAVY_JOBS="1"
ALLOY_MEMORY_PRESSURE_THRESHOLD="off"
EOF

export PATH="$FAKE_BIN:$PATH"
export ALLOY_CONFIG_FILE="$CONFIG_DIR/config"
export ALLOY_TEST_FIXTURE=1
export ALLOY_AGENT_OPEN_DRY_RUN=1
export ALLOY_TEST_NPM_LOG="$TMP/npm.log"
export ALLOY_SKIP_AUTH_LIVE_CHECK=1

env_cmd() {
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" \
    ALLOY_RUNTIME_ROOT="$RUNTIME" \
    ALLOY_FIRST_AGENT_PORT=3911 \
    ALLOY_TEST_FIXTURE=1 \
    ALLOY_AGENT_OPEN_DRY_RUN=1 \
    ALLOY_SKIP_AUTH_LIVE_CHECK=1 \
    PATH="$FAKE_BIN:$PATH" \
    "$@"
}

echo "== sprint-start into open slot =="
assert_ok "sprint-start slot 1" \
  env_cmd "$ROOT/alloy-sprint-start" sprint-one --provider cursor --slot 1 --without-server --dry-run-open

[[ -d "$WTROOT/wt1-sprint-one" ]] && pass "worktree created" || fail "worktree missing"
[[ -f "$RUNTIME/metadata/wt1-sprint-one.env" ]] && pass "metadata registered" || fail "metadata missing"
grep -q 'PORT="3911"' "$RUNTIME/metadata/wt1-sprint-one.env" && pass "permanent port 3911" || fail "port mapping"
grep -q 'ALLOY_SPRINT_NAME="sprint-one"' "$RUNTIME/metadata/wt1-sprint-one.env" && pass "sprint name recorded" || fail "sprint name"
[[ -d "$WTROOT/wt1-sprint-one/web/node_modules" ]] && pass "worktree-local deps installed" || fail "deps missing"
[[ ! -L "$WTROOT/wt1-sprint-one/web/node_modules" ]] && pass "node_modules not a symlink" || fail "symlinked node_modules"
[[ -f "$WTROOT/wt1-sprint-one/.alloy-agent-instructions.md" ]] && pass "instructions generated" || fail "instructions"

echo "== reject occupied slot =="
assert_fail "occupied slot rejected" \
  env_cmd "$ROOT/alloy-sprint-start" sprint-dup --provider cursor --slot 1 --without-server --dry-run-open

echo "== status table =="
assert_ok "worker-status table" env_cmd "$ROOT/alloy-worker-status"
assert_contains "status shows slot 1" "sprint-one" /tmp/alloy-sprint-ops.out
assert_contains "status shows free slot" "(free)" /tmp/alloy-sprint-ops.out

echo "== start server then pause/resume =="
assert_ok "dev-start slot1" env_cmd "$ROOT/alloy-dev-start" wt1-sprint-one
sleep 0.5
# Register a fake owned provider PID (sleep in worktree cwd)
(
  cd "$WTROOT/wt1-sprint-one"
  sleep 3600 &
  echo $! >"$RUNTIME/pids/wt1-sprint-one.provider.pid"
  cat >"$RUNTIME/pids/wt1-sprint-one.provider.meta" <<META
ALLOY_PROVIDER_PID="$!"
ALLOY_PROVIDER_WORKTREE="$WTROOT/wt1-sprint-one"
ALLOY_PROVIDER_SESSION_ID="sess-fixture-1"
ALLOY_PROVIDER_REGISTERED_AT="2026-01-01T00:00:00Z"
META
)

assert_ok "pause slot 1" env_cmd "$ROOT/alloy-worker-pause" 1
[[ -f "$RUNTIME/pause-state/wt1-sprint-one.env" ]] && pass "pause state recorded" || fail "pause state missing"
grep -q 'ALLOY_PAUSE_SERVER_WAS="running"' "$RUNTIME/pause-state/wt1-sprint-one.env" && pass "pre-pause server=running" || fail "server was not running"
grep -q 'ALLOY_WORKER_LIFECYCLE="paused"' "$RUNTIME/metadata/wt1-sprint-one.env" && pass "lifecycle paused" || fail "lifecycle not paused"
[[ -f "$WTROOT/wt1-sprint-one/.alloy-continuation.md" ]] && pass "continuation record written" || fail "continuation missing"
# Dirty work preserved: create a file before resume
printf 'wip\n' >"$WTROOT/wt1-sprint-one/WIP.txt"
[[ -f "$WTROOT/wt1-sprint-one/WIP.txt" ]] && pass "dirty work present before resume" || fail "wip missing"

# Server should be stopped after pause
SERVER_AFTER="$(env_cmd bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/agent.sh"; alloy_load_config; alloy_load_metadata wt1-sprint-one; alloy_server_state_for wt1-sprint-one')"
[[ "$SERVER_AFTER" == "stopped" || "$SERVER_AFTER" == "stale" ]] && pass "server stopped after pause" || fail "server state=$SERVER_AFTER"

# Unrelated process still alive
if kill -0 "$UNRELATED_PID" 2>/dev/null; then
  pass "unrelated process untouched by pause"
else
  fail "unrelated process was killed"
fi

assert_ok "resume slot 1" env_cmd "$ROOT/alloy-worker-resume" 1 --no-provider
[[ -f "$WTROOT/wt1-sprint-one/WIP.txt" ]] && pass "dirty work preserved across resume" || fail "wip lost"
grep -q 'PORT="3911"' "$RUNTIME/metadata/wt1-sprint-one.env" && pass "same port after resume" || fail "port changed"
grep -q 'ALLOY_WORKTREE_PATH="'"$WTROOT"'/wt1-sprint-one"' "$RUNTIME/metadata/wt1-sprint-one.env" && pass "same worktree after resume" || fail "path changed"
# Server should be restarted because pre-pause was running
sleep 0.5
SERVER_RESUME="$(env_cmd bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/agent.sh"; alloy_load_config; alloy_load_metadata wt1-sprint-one; alloy_server_state_for wt1-sprint-one')"
[[ "$SERVER_RESUME" == "running" ]] && pass "server restored after resume" || fail "server not restored ($SERVER_RESUME)"

echo "== avoid restarting previously stopped server =="
assert_ok "pause again" env_cmd "$ROOT/alloy-worker-pause" 1
# Force pause-state to remember server was stopped
sed -i.bak 's/ALLOY_PAUSE_SERVER_WAS="running"/ALLOY_PAUSE_SERVER_WAS="stopped"/' \
  "$RUNTIME/pause-state/wt1-sprint-one.env"
assert_ok "resume without server" env_cmd "$ROOT/alloy-worker-resume" 1 --no-provider
SERVER_SKIP="$(env_cmd bash -c 'source "'"$ROOT"'/lib/common.sh"; source "'"$ROOT"'/lib/agent.sh"; alloy_load_config; alloy_load_metadata wt1-sprint-one; alloy_server_state_for wt1-sprint-one')"
[[ "$SERVER_SKIP" == "stopped" || "$SERVER_SKIP" == "stale" ]] && pass "did not restart previously-stopped server" || fail "server unexpectedly $SERVER_SKIP"

echo "== pause/resume --all =="
assert_ok "sprint-start slot 2" \
  env_cmd "$ROOT/alloy-sprint-start" sprint-two --provider claude --slot 2 --without-server --dry-run-open
assert_ok "pause --all" env_cmd "$ROOT/alloy-worker-pause" --all
grep -q 'ALLOY_WORKER_LIFECYCLE="paused"' "$RUNTIME/metadata/wt1-sprint-one.env" && pass "slot1 paused via --all" || fail "slot1 not paused"
grep -q 'ALLOY_WORKER_LIFECYCLE="paused"' "$RUNTIME/metadata/wt2-sprint-two.env" && pass "slot2 paused via --all" || fail "slot2 not paused"
assert_ok "resume --all" env_cmd "$ROOT/alloy-worker-resume" --all --no-provider
grep -q 'ALLOY_WORKER_LIFECYCLE="active"' "$RUNTIME/metadata/wt1-sprint-one.env" && pass "slot1 resumed via --all" || fail "slot1 not active"
grep -q 'ALLOY_WORKER_LIFECYCLE="active"' "$RUNTIME/metadata/wt2-sprint-two.env" && pass "slot2 resumed via --all" || fail "slot2 not active"

echo "== port ownership conflict =="
# Occupy fixture port 3913 without metadata
node -e "require('http').createServer((q,s)=>s.end('x')).listen(3913)" &
PORT_HOG=$!
sleep 0.3
assert_fail "reject start on conflicted port slot 3" \
  env_cmd "$ROOT/alloy-sprint-start" sprint-three --provider cursor --slot 3 --without-server --dry-run-open
kill "$PORT_HOG" 2>/dev/null || true
wait "$PORT_HOG" 2>/dev/null || true

echo "== stale PID doctor =="
echo "999999" >"$RUNTIME/pids/wt1-sprint-one.pid"
assert_ok "doctor detects stale PID" env_cmd "$ROOT/alloy-worker-doctor" 1
assert_contains "doctor reports stale" "stale server PID" /tmp/alloy-sprint-ops.out
assert_ok "doctor --recover clears stale" env_cmd "$ROOT/alloy-worker-doctor" 1 --recover
[[ ! -f "$RUNTIME/pids/wt1-sprint-one.pid" ]] && pass "stale PID recovered" || fail "stale PID remains"

echo "== server limit enforcement =="
# ALLOY_MAX_RUNNING_SERVERS=1 — start slot1, refuse slot2
assert_ok "start server slot1 for limit" env_cmd "$ROOT/alloy-dev-start" wt1-sprint-one
sleep 0.4
assert_fail "server limit blocks slot2" env_cmd "$ROOT/alloy-dev-start" wt2-sprint-two
# Accept either explicit server-limit message or preflight failure after slot1 holds the only slot.
if grep -qE 'server limit|already running|Refusing' /tmp/alloy-sprint-ops.err; then
  pass "limit message"
else
  fail "limit message (missing server limit wording)"
  sed -n '1,40p' /tmp/alloy-sprint-ops.err >&2 || true
fi
env_cmd "$ROOT/alloy-dev-stop" wt1-sprint-one || true

echo "== heavy-job limit =="
mkdir -p "$RUNTIME/locks/resources/heavy.lock"
cat >"$RUNTIME/locks/resources/heavy.lock/holder.env" <<EOF
ALLOY_RESOURCE_KIND="heavy"
ALLOY_RESOURCE_OWNER="other"
ALLOY_RESOURCE_PID="$$"
ALLOY_RESOURCE_STARTED="2026-01-01T00:00:00Z"
EOF
assert_fail "heavy limit blocks validate" env_cmd "$ROOT/alloy-validate" wt1-sprint-one typecheck
assert_contains "heavy limit message" "heavy-job limit" /tmp/alloy-sprint-ops.err
rm -rf "$RUNTIME/locks/resources/heavy.lock"

echo "== finish clean / dirty =="
assert_ok "finish clean slot 2" env_cmd "$ROOT/alloy-sprint-finish" 2
if [[ ! -f "$RUNTIME/metadata/wt2-sprint-two.env" ]]; then
  pass "slot 2 metadata freed"
else
  fail "metadata still active"
fi
[[ -d "$WTROOT/wt2-sprint-two" ]] && pass "worktree preserved after finish" || fail "worktree deleted"
[[ -f "$RUNTIME/finished/wt2-sprint-two.env" ]] && pass "metadata archived" || fail "archive missing"

# Dirty finish blocked
printf 'dirty\n' >"$WTROOT/wt1-sprint-one/DIRTY.txt"
assert_fail "finish blocked on dirty" env_cmd "$ROOT/alloy-sprint-finish" 1
assert_ok "finish with acknowledge" \
  env_cmd "$ROOT/alloy-sprint-finish" 1 --acknowledge-uncommitted
[[ ! -f "$RUNTIME/metadata/wt1-sprint-one.env" ]] && pass "slot 1 freed after ack" || fail "slot 1 still assigned"
[[ -f "$WTROOT/wt1-sprint-one/DIRTY.txt" ]] && pass "dirty file preserved on finish" || fail "dirty file lost"

if kill -0 "$UNRELATED_PID" 2>/dev/null; then
  pass "unrelated process still alive at end"
else
  fail "unrelated process died"
fi

echo
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
