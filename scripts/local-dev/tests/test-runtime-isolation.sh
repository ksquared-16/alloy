#!/usr/bin/env bash
# Focused tests: runtime-root isolation and certification leak safety.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-iso-test.out 2>/tmp/alloy-iso-test.err; then pass "$msg"; else fail "$msg"; cat /tmp/alloy-iso-test.err >&2 || true; fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-iso-test.out 2>/tmp/alloy-iso-test.err; then fail "$msg (expected failure)"; else pass "$msg"; fi
}

TMP="$(mktemp -d /tmp/alloy-iso-fixture.XXXXXX)"
PROD_FAKE="$TMP/fake-prod"
CERT_RUNTIME="$TMP/alloy-engineering-cert.iso/runtime"
ORIGIN="$TMP/origin.git"
CANON="$TMP/canon"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

mkdir -p "$PROD_FAKE/metadata" "$CERT_RUNTIME/metadata" "$CERT_RUNTIME/pids" "$CERT_RUNTIME/logs" "$CERT_RUNTIME/locks"

# --- unit: resolve paths honor ALLOY_RUNTIME_ROOT ---
# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"
export ALLOY_RUNTIME_ROOT="$CERT_RUNTIME"
alloy_resolve_runtime_paths "$CERT_RUNTIME"
[[ "$ALLOY_METADATA_DIR" == "$CERT_RUNTIME/metadata" ]] && pass "resolve metadata under fixture" || fail "resolve metadata"
[[ "$ALLOY_PIDS_DIR" == "$CERT_RUNTIME/pids" ]] && pass "resolve pids under fixture" || fail "resolve pids"

export ALLOY_RUNTIME_ROOT="$PROD_FAKE"
alloy_load_config 2>/dev/null || true
# Force after load — explicit export must win via resolve
alloy_resolve_runtime_paths "$PROD_FAKE"
[[ "$ALLOY_RUNTIME_ROOT" == "$PROD_FAKE" ]] && pass "explicit root preserved" || fail "explicit root"

# --- load_config preserves explicit export over example ---
mkdir -p "$TMP/config"
cat >"$TMP/config/config" <<CFG
ALLOY_REPO="$TMP/canon-placeholder"
ALLOY_WORKTREE_ROOT="$TMP/wt"
ALLOY_RUNTIME_ROOT="$CERT_RUNTIME"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_FIRST_AGENT_PORT="3911"
CFG
# Create minimal fake repo so load doesn't die later
mkdir -p "$CANON/docs"
git -C "$CANON" init -q
git -C "$CANON" config user.email t@t.com
git -C "$CANON" config user.name T
echo x >"$CANON/docs/README.md"
git -C "$CANON" add -A && git -C "$CANON" commit -q -m i
git -C "$CANON" branch -M staging
git clone -q "$CANON" "$ORIGIN" --bare
git -C "$CANON" remote add origin "$ORIGIN"
git -C "$CANON" push -q -u origin staging

cat >"$TMP/config/config" <<CFG
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$TMP/wt"
ALLOY_RUNTIME_ROOT="$CERT_RUNTIME"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_FIRST_AGENT_PORT="3911"
CFG

export ALLOY_CONFIG_FILE="$TMP/config/config"
export ALLOY_RUNTIME_ROOT="$CERT_RUNTIME"
export ALLOY_TEST_FIXTURE=1
export ALLOY_FIRST_AGENT_PORT=3911
alloy_load_config
[[ "$ALLOY_RUNTIME_ROOT" == "$CERT_RUNTIME" ]] && pass "load_config keeps fixture root" || fail "load_config root=$ALLOY_RUNTIME_ROOT"
[[ "$ALLOY_METADATA_DIR" == "$CERT_RUNTIME/metadata" ]] && pass "load_config metadata is fixture" || fail "load_config metadata"

# Nested env propagation
NESTED="$(env ALLOY_CONFIG_FILE="$TMP/config/config" ALLOY_RUNTIME_ROOT="$CERT_RUNTIME" ALLOY_TEST_FIXTURE=1 \
  bash -c 'source "'"$ROOT"'/lib/common.sh"; alloy_load_config; printf %s "$ALLOY_METADATA_DIR"')"
[[ "$NESTED" == "$CERT_RUNTIME/metadata" ]] && pass "nested load_config retains fixture metadata" || fail "nested metadata=$NESTED"

# --- fixture_bind refuses production root ---
# shellcheck source=../lib/engineering.sh
source "$ROOT/lib/engineering.sh"
assert_fail "fixture bind refuses production runtime" \
  bash -c '
    ROOT="$1"; TMP="$2"
    source "$ROOT/lib/common.sh"
    source "$ROOT/lib/engineering.sh"
    export ALLOY_ENGINEERING_CERTIFY=1
    export ALLOY_RUNTIME_ROOT="$(alloy_default_runtime_root)"
    alloy_resolve_runtime_paths "$ALLOY_RUNTIME_ROOT"
    alloy_engineering_certify_fixture_bind fake-key "$TMP"
  ' _ "$ROOT" "$TMP"

# --- leak report selects only cert leaks ---
PROD_META="$PROD_FAKE/metadata"
# Override default root for report by temporarily shadowing HOME? Better: call helpers directly.
cat >"$PROD_META/cert-engineering-v1-cert-slot1.env" <<EOF
ALLOY_WORKTREE_NAME="cert-engineering-v1-cert-slot1"
ALLOY_WORKTREE_SLOT="1"
ALLOY_WORKTREE_PATH="/tmp/alloy-engineering-cert.fake/fixture-repo"
PORT="3911"
ALLOY_CERT_FIXTURE="1"
EOF
cat >"$PROD_META/wt3-queue-perf.env" <<EOF
ALLOY_WORKTREE_NAME="wt3-queue-perf"
ALLOY_WORKTREE_SLOT="3"
ALLOY_WORKTREE_PATH="/Users/Kelly/Code/alloy-worktrees/wt3-queue-perf"
PORT="3013"
EOF

# Test candidate helper via sourced logic from report script
is_cand() {
  local path="$1"
  local name wt_path cert_flag
  name="$(basename "$path" .env)"
  wt_path="$(grep -E '^ALLOY_WORKTREE_PATH=' "$path" | head -1 | sed 's/^ALLOY_WORKTREE_PATH=//;s/^"//;s/"$//')"
  case "$wt_path" in
    /Users/Kelly/Code/alloy-worktrees/*) return 1 ;;
  esac
  cert_flag="$(grep -E '^ALLOY_CERT_FIXTURE=' "$path" | head -1 || true)"
  [[ "$name" == cert-* && "$wt_path" == /tmp/alloy-*-cert* ]] && return 0
  [[ "$cert_flag" == *1* && "$wt_path" == /tmp/alloy-*-cert* ]] && return 0
  return 1
}

is_cand "$PROD_META/cert-engineering-v1-cert-slot1.env" && pass "leak selector accepts cert fixture" || fail "leak selector accept"
is_cand "$PROD_META/wt3-queue-perf.env" && fail "leak selector refused real agent" || pass "leak selector refuses real agent"

# Cleanup requires confirmation (non-TTY fails)
assert_fail "cleanup without confirm refused" \
  env HOME="$TMP/home-empty" "$ROOT/alloy-cert-leak-clean"
mkdir -p "$TMP/home-empty/.local/state/alloy-dev/metadata"
cat >"$TMP/home-empty/.local/state/alloy-dev/metadata/cert-engineering-v1-cert-slot1.env" <<EOF
ALLOY_WORKTREE_NAME="cert-engineering-v1-cert-slot1"
ALLOY_WORKTREE_SLOT="1"
ALLOY_WORKTREE_PATH="/tmp/alloy-engineering-cert.fake/fixture-repo"
PORT="3911"
ALLOY_CERT_FIXTURE="1"
EOF
assert_fail "cleanup --confirm without TTY refused" \
  env HOME="$TMP/home-empty" "$ROOT/alloy-cert-leak-clean" --confirm </dev/null
# Real agent under fake home must not be selected
cat >"$TMP/home-empty/.local/state/alloy-dev/metadata/wt3-queue-perf.env" <<EOF
ALLOY_WORKTREE_NAME="wt3-queue-perf"
ALLOY_WORKTREE_SLOT="3"
ALLOY_WORKTREE_PATH="/Users/Kelly/Code/alloy-worktrees/wt3-queue-perf"
PORT="3013"
EOF
REPORT_FAKE="$(env HOME="$TMP/home-empty" "$ROOT/alloy-cert-leak-report" 2>&1 || true)"
echo "$REPORT_FAKE" | grep -q 'cert-engineering-v1-cert-slot1' && pass "report lists leaked cert metadata" || fail "report missing leak"
echo "$REPORT_FAKE" | grep -q 'wt3-queue-perf' && fail "report included real agent" || pass "report excludes real agent"

# Runtime paths report
assert_ok "runtime paths diagnostic" \
  env ALLOY_CONFIG_FILE="$TMP/config/config" ALLOY_RUNTIME_ROOT="$CERT_RUNTIME" \
  "$ROOT/alloy-runtime-paths"
grep -q "ALLOY_RUNTIME_ROOT=$CERT_RUNTIME" /tmp/alloy-iso-test.out && pass "paths report shows fixture root" || fail "paths report root"

# Port fixture independence: refuse_occupied on real 3013 must not run during fixture slot assign
# (fixture uses 3911+; creating metadata for slot 3 uses 3913)
export ALLOY_RUNTIME_ROOT="$CERT_RUNTIME"
export ALLOY_FIRST_AGENT_PORT=3911
alloy_load_config
port="$(alloy_slot_to_port 3)"
[[ "$port" == "3913" ]] && pass "fixture slot 3 maps to 3913" || fail "slot port=$port"

echo
echo "Isolation tests: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
