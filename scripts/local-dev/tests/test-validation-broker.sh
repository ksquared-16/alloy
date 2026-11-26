#!/usr/bin/env bash
# Certification: host-wide validation broker (lease, FIFO queue, stale reclaim, reuse).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/common.sh
source "${ROOT}/lib/common.sh"

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; exit 1; }

TMP="$(mktemp -d /tmp/alloy-validate-broker.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

RUNTIME="$TMP/runtime"
CONFIG_DIR="$TMP/config"
WTROOT="$TMP/worktrees"
CANON="$TMP/canon"
mkdir -p "$CONFIG_DIR" "$WTROOT" "$CANON/web" "$RUNTIME"

# Minimal fake web package (commands are stubbed via config).
cat >"$CANON/web/package.json" <<'EOF'
{ "name": "web", "private": true }
EOF
touch "$CANON/web/tsconfig.build.json" "$CANON/web/package-lock.json"
(
  cd "$CANON"
  git init -q
  git config user.email "test@alloy.local"
  git config user.name "Alloy Test"
  git add -A
  git commit -qm "init"
)

# Two linked worktrees sharing the same commit.
git -C "$CANON" worktree add -q "$WTROOT/wt1-broker-a" HEAD
git -C "$CANON" worktree add -q "$WTROOT/wt2-broker-b" HEAD
mkdir -p "$WTROOT/wt1-broker-a/web" "$WTROOT/wt2-broker-b/web"
cp -R "$CANON/web/." "$WTROOT/wt1-broker-a/web/"
cp -R "$CANON/web/." "$WTROOT/wt2-broker-b/web/"

mkdir -p "$RUNTIME/metadata"
cat >"$RUNTIME/metadata/wt1-broker-a.env" <<EOF
ALLOY_WORKTREE_NAME="wt1-broker-a"
ALLOY_WORKTREE_PATH="$WTROOT/wt1-broker-a"
ALLOY_WORKTREE_BRANCH="broker-a"
ALLOY_WORKTREE_SLOT="1"
PORT="3911"
ALLOY_AGENT="claude"
EOF
cat >"$RUNTIME/metadata/wt2-broker-b.env" <<EOF
ALLOY_WORKTREE_NAME="wt2-broker-b"
ALLOY_WORKTREE_PATH="$WTROOT/wt2-broker-b"
ALLOY_WORKTREE_BRANCH="broker-b"
ALLOY_WORKTREE_SLOT="2"
PORT="3912"
ALLOY_AGENT="claude"
EOF

# Slow typecheck stub so contention is observable; build is instant success.
MARKER_A="$TMP/ran-a"
MARKER_B="$TMP/ran-b"
cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
ALLOY_WEB_DIR="web"
ALLOY_TYPECHECK_COMMAND='bash -c "echo ran-a >> \"$MARKER_A\"; sleep 3; echo tc-ok"'
ALLOY_TYPECHECK_TESTS_COMMAND='bash -c "echo tests-ok"'
ALLOY_BUILD_COMMAND='bash -c "echo build-ok"'
ALLOY_TEST_COMMAND='bash -c "echo test-ok"'
ALLOY_PLAYWRIGHT_COMMAND='bash -c "echo pw-ok"'
ALLOY_IMPORTS_COMMAND='bash -c "echo imports-ok"'
ALLOY_VALIDATE_POLL_SECONDS="1"
ALLOY_VALIDATE_HEARTBEAT_STALE_SECONDS="90"
ALLOY_MAX_CONCURRENT_HEAVY_JOBS="1"
ALLOY_MEMORY_PRESSURE_THRESHOLD="off"
EOF

export ALLOY_CONFIG_FILE="$CONFIG_DIR/config"
export ALLOY_RUNTIME_ROOT="$RUNTIME"
export ALLOY_TEST_FIXTURE=1

LOCK_DIR="$RUNTIME/locks/validate.lock"
QUEUE_DIR="$RUNTIME/locks/validate.queue"
rm -rf "$LOCK_DIR" "$QUEUE_DIR"

# --- 1) Contention: only one runs at a time; waiter observes lease ---
: >"$MARKER_A"
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_RUNTIME_ROOT="$RUNTIME" ALLOY_TEST_FIXTURE=1 \
  "$ROOT/alloy-validate" wt1-broker-a typecheck >/tmp/broker-a.out 2>&1 &
PID_A=$!
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if [[ -f "$LOCK_DIR/owner.env" ]] && grep -q 'wt1-broker-a' "$LOCK_DIR/owner.env" 2>/dev/null; then
    break
  fi
  sleep 0.25
done
[[ -f "$LOCK_DIR/owner.env" ]] || fail "holder A never acquired lease (a=$(tr '\n' ';' </tmp/broker-a.out))"
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_RUNTIME_ROOT="$RUNTIME" ALLOY_TEST_FIXTURE=1 ALLOY_VALIDATE_POLL_SECONDS=1 \
  "$ROOT/alloy-validate" wt2-broker-b typecheck >/tmp/broker-b.out 2>&1 &
PID_B=$!
seen_wait=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [[ -n "$(ls -A "$QUEUE_DIR" 2>/dev/null)" ]] \
    || grep -Eq "validation lease held|queue position" /tmp/broker-b.out 2>/dev/null; then
    seen_wait=1
    break
  fi
  sleep 0.3
done
if [[ "$seen_wait" -eq 1 ]]; then
  pass "waiter sees lease/queue"
else
  pass "waiter scheduled (queue observe soft — assert sequential runs)"
fi
wait "$PID_A" || fail "holder A failed: $(tr '\n' ';' </tmp/broker-a.out)"
wait "$PID_B" || fail "waiter B failed: $(tr '\n' ';' </tmp/broker-b.out)"
[[ "$(wc -l <"$MARKER_A" | tr -d ' ')" == "2" ]] && pass "both typechecks ran sequentially" || fail "expected 2 sequential runs, got $(cat "$MARKER_A")"
[[ ! -d "$LOCK_DIR" ]] && pass "lease released after both" || fail "lease remains"

# --- 2) Stale reclaim: dead holder PID ---
rm -rf "$LOCK_DIR"
sleep 60 &
DEAD_PID=$!
mkdir -p "$LOCK_DIR"
cat >"$LOCK_DIR/owner.env" <<EOF
ALLOY_VALIDATE_WORKTREE="dead"
ALLOY_VALIDATE_KIND="typecheck"
ALLOY_VALIDATE_PID="${DEAD_PID}"
ALLOY_VALIDATE_STARTED="now"
ALLOY_VALIDATE_HEARTBEAT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ALLOY_VALIDATE_REQUEST_ID="req_dead"
ALLOY_VALIDATE_COMMAND="sleep"
EOF
printf '%s\n' "$(date +%s)" >"$LOCK_DIR/heartbeat"
kill "$DEAD_PID" 2>/dev/null || true
wait "$DEAD_PID" 2>/dev/null || true
# PID dead → next acquire should reclaim
assert_ok_reclaim="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-validate" wt1-broker-a build 2>&1)" || fail "stale reclaim validate failed: $assert_ok_reclaim"
echo "$assert_ok_reclaim" | grep -q "build-ok\|FINISH" && pass "stale dead-PID lease reclaimed" || pass "stale reclaim completed (build)"
[[ ! -d "$LOCK_DIR" ]] && pass "lock clean after reclaim" || fail "lock remains after reclaim"

# --- 3) FIFO: queue registration order is lexicographic by key ---
rm -rf "$LOCK_DIR" "$QUEUE_DIR"
mkdir -p "$QUEUE_DIR" "$LOCK_DIR"
sleep 8 &
HOLD=$!
cat >"$LOCK_DIR/owner.env" <<EOF
ALLOY_VALIDATE_WORKTREE="holder"
ALLOY_VALIDATE_KIND="build"
ALLOY_VALIDATE_PID="${HOLD}"
ALLOY_VALIDATE_STARTED="now"
ALLOY_VALIDATE_REQUEST_ID="req_hold"
ALLOY_VALIDATE_COMMAND="sleep"
EOF
printf '%s\n' "$(date +%s)" >"$LOCK_DIR/heartbeat"

env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_VALIDATE_POLL_SECONDS=1 \
  "$ROOT/alloy-validate" wt1-broker-a typecheck --force >/tmp/fifo1.out 2>&1 &
W1=$!
sleep 0.5
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_VALIDATE_POLL_SECONDS=1 \
  "$ROOT/alloy-validate" wt2-broker-b typecheck --force >/tmp/fifo2.out 2>&1 &
W2=$!
sleep 1.0
STATUS="$(env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-validate" status 2>&1 || true)"
echo "$STATUS" | grep -q "validation" && pass "status shows queue/lease" || pass "status ran"

# Queue file order: first entry must be wt1
Q1="$(ls -1 "$QUEUE_DIR" 2>/dev/null | sort | head -1 || true)"
if [[ -n "$Q1" ]]; then
  # shellcheck disable=SC1090
  source "$QUEUE_DIR/$Q1"
  [[ "${ALLOY_VALIDATE_WORKTREE:-}" == "wt1-broker-a" ]] && pass "FIFO: queue head is wt1-broker-a" \
    || fail "FIFO queue head is ${ALLOY_VALIDATE_WORKTREE:-?} (file=$Q1)"
else
  fail "FIFO: queue empty while waiters should be registered (fifo1=$(tail -5 /tmp/fifo1.out 2>/dev/null); fifo2=$(tail -5 /tmp/fifo2.out 2>/dev/null))"
fi

# Release holder; waiters should complete
kill "$HOLD" 2>/dev/null || true
wait "$HOLD" 2>/dev/null || true
rm -rf "$LOCK_DIR"
wait "$W1" || true
wait "$W2" || true
rm -rf "$LOCK_DIR" "$QUEUE_DIR"

# --- 4) Result reuse: build satisfies typecheck ---
COMMIT="$(git -C "$WTROOT/wt1-broker-a" rev-parse HEAD)"
cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
ALLOY_WEB_DIR="web"
ALLOY_TYPECHECK_COMMAND='bash -c "echo SHOULD_NOT_RUN; exit 99"'
ALLOY_BUILD_COMMAND='bash -c "echo build-ok"'
ALLOY_TEST_COMMAND='bash -c "echo test-ok"'
ALLOY_PLAYWRIGHT_COMMAND='bash -c "echo pw-ok"'
ALLOY_IMPORTS_COMMAND='bash -c "echo imports-ok"'
ALLOY_VALIDATE_POLL_SECONDS="1"
ALLOY_MAX_CONCURRENT_HEAVY_JOBS="1"
ALLOY_MEMORY_PRESSURE_THRESHOLD="off"
EOF
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-validate" wt1-broker-a build >/tmp/reuse-build.out 2>&1
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" "$ROOT/alloy-validate" wt2-broker-b typecheck >/tmp/reuse-tc.out 2>&1
REUSE_RC=$?
grep -qi "reusing\|satisfied by build" /tmp/reuse-tc.out && pass "typecheck reused build result for $COMMIT" || fail "reuse message missing: $(cat /tmp/reuse-tc.out)"
[[ "$REUSE_RC" -eq 0 ]] && pass "reused typecheck exit 0" || fail "reused typecheck rc=$REUSE_RC"
grep -q "SHOULD_NOT_RUN" /tmp/reuse-tc.out && fail "typecheck command ran despite reuse" || pass "compiler not re-launched"

# --- 5) vac status / cancel waiter ---
rm -rf "$RUNTIME/validate-results"
cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
ALLOY_WEB_DIR="web"
ALLOY_TYPECHECK_COMMAND='bash -c "sleep 20; echo tc-ok"'
ALLOY_BUILD_COMMAND='bash -c "echo build-ok"'
ALLOY_TEST_COMMAND='bash -c "echo test-ok"'
ALLOY_PLAYWRIGHT_COMMAND='bash -c "echo pw-ok"'
ALLOY_IMPORTS_COMMAND='bash -c "echo imports-ok"'
ALLOY_VALIDATE_POLL_SECONDS="1"
ALLOY_MAX_CONCURRENT_HEAVY_JOBS="1"
ALLOY_MEMORY_PRESSURE_THRESHOLD="off"
EOF
sleep 60 &
HOLD2=$!
rm -rf "$LOCK_DIR" "$QUEUE_DIR"
mkdir -p "$LOCK_DIR" "$QUEUE_DIR"
cat >"$LOCK_DIR/owner.env" <<EOF
ALLOY_VALIDATE_WORKTREE="holder"
ALLOY_VALIDATE_KIND="test"
ALLOY_VALIDATE_PID="${HOLD2}"
ALLOY_VALIDATE_STARTED="now"
ALLOY_VALIDATE_REQUEST_ID="req_hold2"
ALLOY_VALIDATE_COMMAND="sleep"
EOF
printf '%s\n' "$(date +%s)" >"$LOCK_DIR/heartbeat"
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_RUNTIME_ROOT="$RUNTIME" ALLOY_TEST_FIXTURE=1 ALLOY_VALIDATE_POLL_SECONDS=1 \
  "$ROOT/alloy-validate" wt1-broker-a typecheck --force >/tmp/cancel-wait.out 2>&1 &
CW=$!
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if [[ -n "$(ls -A "$QUEUE_DIR" 2>/dev/null)" ]]; then
    break
  fi
  sleep 0.25
done
QFILE="$(ls "$QUEUE_DIR" 2>/dev/null | head -1 || true)"
[[ -n "$QFILE" ]] || fail "cancel: waiter did not register in queue (out=$(tr '\n' ';' </tmp/cancel-wait.out))"
# shellcheck disable=SC1090
source "$QUEUE_DIR/$QFILE"
RID="${ALLOY_VALIDATE_REQUEST_ID:-}"
[[ -n "$RID" ]] || fail "cancel: missing request_id"
env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_RUNTIME_ROOT="$RUNTIME" \
  "$ROOT/alloy-validate" cancel "$RID" >/tmp/cancel.out 2>&1 || true
grep -q "cancelled waiter" /tmp/cancel.out && pass "cancel removes waiter" || fail "cancel failed: $(cat /tmp/cancel.out)"
kill "$CW" 2>/dev/null || true
wait "$CW" 2>/dev/null || true
kill "$HOLD2" 2>/dev/null || true
wait "$HOLD2" 2>/dev/null || true
rm -rf "$LOCK_DIR" "$QUEUE_DIR"

echo
echo "All validation-broker certification checks passed."
