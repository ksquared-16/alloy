#!/usr/bin/env bash
# TM-6 Truthful Status — regression tests.
#
# Standard applied (the one the Product Office required of Configuration Health):
# a surface may state only what it read. These tests pin the three ways the
# toolkit previously stated things it had not read.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

TMP="$(mktemp -d /tmp/alloy-truthful-status.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

export ALLOY_RUNTIME_ROOT="$TMP/state"
export ALLOY_LOCAL_DEV_ROOT="$LOCAL_DEV"
mkdir -p "$ALLOY_RUNTIME_ROOT/metadata"

cat >"$TMP/config" <<EOF
ALLOY_REPO="$TMP/canon"
ALLOY_WORKTREE_ROOT="$TMP/worktrees"
ALLOY_RUNTIME_ROOT="$TMP/state"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
EOF
export ALLOY_CONFIG_FILE="$TMP/config"

# shellcheck source=../lib/common.sh
source "${LOCAL_DEV}/lib/common.sh"
alloy_load_config

META="$ALLOY_RUNTIME_ROOT/metadata"

# Slot 2: a sprint-start worktree — HAS the optional sprint fields.
cat >"$META/wt2-alpha.env" <<'EOF'
ALLOY_WORKTREE_NAME="wt2-alpha"
ALLOY_WORKTREE_SLOT="2"
ALLOY_WORKTREE_PATH="/tmp/nonexistent/wt2-alpha"
ALLOY_WORKTREE_BRANCH="agent/cursor/2-alpha"
ALLOY_AGENT="cursor"
PORT="3912"
ALLOY_SPRINT_NAME="alpha-sprint"
ALLOY_WORKER_LIFECYCLE="active"
ALLOY_SPRINT_OBJECTIVE="alpha objective"
EOF

# Slot 3: a worktree-create worktree — NO optional sprint fields at all.
# This is the real shape of wt3-runtime-continuity on the live machine.
cat >"$META/wt3-beta.env" <<'EOF'
ALLOY_WORKTREE_NAME="wt3-beta"
ALLOY_WORKTREE_SLOT="3"
ALLOY_WORKTREE_PATH="/tmp/nonexistent/wt3-beta"
ALLOY_WORKTREE_BRANCH="agent/claude/3-beta"
ALLOY_AGENT="claude"
PORT="3913"
EOF

# ── 1. The leak: loading slot 2 then slot 3 must not carry slot 2's fields ────
alloy_load_metadata "wt2-alpha"
alloy_load_metadata "wt3-beta"

if [[ -z "${ALLOY_SPRINT_NAME:-}" ]]; then
  pass "optional metadata does not leak between rows (ALLOY_SPRINT_NAME cleared)"
else
  fail "metadata leak: wt3-beta inherited ALLOY_SPRINT_NAME='${ALLOY_SPRINT_NAME}' from wt2-alpha"
fi

if [[ -z "${ALLOY_SPRINT_OBJECTIVE:-}" ]]; then
  pass "optional metadata does not leak between rows (ALLOY_SPRINT_OBJECTIVE cleared)"
else
  fail "metadata leak: wt3-beta inherited ALLOY_SPRINT_OBJECTIVE"
fi

if [[ -z "${ALLOY_WORKER_LIFECYCLE:-}" ]]; then
  pass "optional metadata does not leak between rows (ALLOY_WORKER_LIFECYCLE cleared)"
else
  fail "metadata leak: wt3-beta inherited ALLOY_WORKER_LIFECYCLE"
fi

# Mandatory fields must still load correctly for the row actually requested.
if [[ "${ALLOY_WORKTREE_NAME}" == "wt3-beta" && "${ALLOY_AGENT}" == "claude" ]]; then
  pass "mandatory metadata still loads for the requested row"
else
  fail "mandatory metadata wrong after reset: name=${ALLOY_WORKTREE_NAME} agent=${ALLOY_AGENT}"
fi

# Reverse order: the reset must work in both directions, not just one.
alloy_load_metadata "wt3-beta"
alloy_load_metadata "wt2-alpha"
if [[ "${ALLOY_SPRINT_NAME:-}" == "alpha-sprint" ]]; then
  pass "present optional fields still load (reset does not erase real values)"
else
  fail "reset erased a present field: ALLOY_SPRINT_NAME='${ALLOY_SPRINT_NAME:-}'"
fi

# ── 2. The writable leak: rewrite must not carry another slot's fields to disk ─
# shellcheck source=../lib/sprint-ops.sh
source "${LOCAL_DEV}/lib/sprint-ops.sh"

alloy_load_metadata "wt2-alpha"   # puts ALLOY_SPRINT_NAME=alpha-sprint in scope
alloy_rewrite_metadata_preserving_sprint "$META/wt3-beta.env" \
  'ALLOY_WORKTREE_NAME="wt3-beta"' \
  'ALLOY_WORKTREE_SLOT="3"' \
  'ALLOY_WORKTREE_PATH="/tmp/nonexistent/wt3-beta"' \
  'ALLOY_WORKTREE_BRANCH="agent/claude/3-beta"' \
  'ALLOY_AGENT="claude"' \
  'PORT="3913"'

if grep -q 'ALLOY_SPRINT_NAME' "$META/wt3-beta.env"; then
  fail "metadata corruption: wt2's sprint name was written into wt3's metadata file"
else
  pass "rewrite does not write another slot's optional fields to disk"
fi

# ── 3. Base ref honesty ──────────────────────────────────────────────────────
status="$(alloy_base_ref_status)"
if [[ "$status" == *"origin/staging"* ]]; then
  pass "base ref status names the base ref"
else
  fail "base ref status does not name the base: $status"
fi
if [[ "$status" == *"never fetched"* || "$status" == *"fetched"* ]]; then
  pass "base ref status states staleness (never asserts a bare count)"
else
  fail "base ref status omits staleness: $status"
fi

# ── 4. Canonical repo: a linked worktree is not the canonical checkout ────────
mkdir -p "$TMP/canon"
git -C "$TMP/canon" init -q 2>/dev/null
git -C "$TMP/canon" remote add origin "https://github.com/ksquared-16/alloy.git" 2>/dev/null

# Simulate a linked worktree: .git as a FILE, not a directory.
mkdir -p "$TMP/fake-worktree"
printf 'gitdir: %s/.git/worktrees/x\n' "$TMP/canon" >"$TMP/fake-worktree/.git"

out="$(ALLOY_REPO="$TMP/fake-worktree" alloy_verify_canonical_repo 2>&1)" && rc=0 || rc=1
if [[ "$rc" -ne 0 && "$out" == *"linked git worktree"* ]]; then
  pass "canonical repo refuses a linked worktree"
else
  fail "canonical repo accepted a linked worktree (rc=$rc): $out"
fi

# A real clone with the expected remote passes.
out="$(ALLOY_REPO="$TMP/canon" alloy_verify_canonical_repo 2>&1)" && rc=0 || rc=1
if [[ "$rc" -eq 0 ]]; then
  pass "canonical repo accepts a real checkout"
else
  fail "canonical repo rejected a real checkout: $out"
fi

# Remote identity is exact when configured, and normalizes scp vs https form.
out="$(ALLOY_REPO="$TMP/canon" \
  ALLOY_REPO_EXPECTED_REMOTE="git@github.com:ksquared-16/alloy.git" \
  alloy_verify_canonical_repo 2>&1)" && rc=0 || rc=1
if [[ "$rc" -eq 0 ]]; then
  pass "expected-remote check normalizes scp-style and https forms"
else
  fail "normalization failed for equivalent remote forms: $out"
fi

out="$(ALLOY_REPO="$TMP/canon" \
  ALLOY_REPO_EXPECTED_REMOTE="git@github.com:someone-else/other.git" \
  alloy_verify_canonical_repo 2>&1)" && rc=0 || rc=1
if [[ "$rc" -ne 0 && "$out" == *"remote mismatch"* ]]; then
  pass "expected-remote check refuses a different repository"
else
  fail "expected-remote check did not refuse a different repository (rc=$rc): $out"
fi

# ── 5. Readiness must survive an empty issues array (bash 3.2, set -u) ────────
# The regression: `for x in "${arr[@]}"` aborts on an EMPTY array under set -u,
# so the ready check failed exactly when the slot was ready.
if /bin/bash -c 'set -euo pipefail; a=(); for x in ${a[@]+"${a[@]}"}; do echo "$x"; done; exit 0' >/dev/null 2>&1; then
  pass "empty-array expansion idiom is bash 3.2 safe under set -u"
else
  fail "empty-array expansion idiom still aborts under set -u"
fi

if grep -q 'for issue in ${issues\[@\]+"${issues\[@\]}"}' "${LOCAL_DEV}/lib/verify.sh"; then
  pass "ready evaluate uses the bash 3.2 safe expansion"
else
  fail "ready evaluate still uses an unguarded \${issues[@]} expansion"
fi

printf '\nTruthful status results: PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
