#!/usr/bin/env bash
# Focused tests for alloy-worktree-adopt — registering an EXISTING worktree
# into the slot registry after a durable restore onto a new execution node.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
OUT=/tmp/alloy-worktree-adopt.out
ERR=/tmp/alloy-worktree-adopt.err

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >"$OUT" 2>"$ERR"; then pass "$msg"; else fail "$msg"; sed -n '1,20p' "$ERR" >&2; fi
}
assert_fail() {
  local msg="$1"; shift
  if "$@" >"$OUT" 2>"$ERR"; then fail "$msg (expected non-zero)"; else pass "$msg"; fi
}
assert_err_contains() {
  local msg="$1" needle="$2"
  if grep -qF -- "$needle" "$ERR" 2>/dev/null; then pass "$msg"; else fail "$msg (missing '$needle')"; sed -n '1,20p' "$ERR" >&2; fi
}
assert_file_contains() {
  local msg="$1" needle="$2" file="$3"
  if grep -qF -- "$needle" "$file" 2>/dev/null; then pass "$msg"; else fail "$msg (missing '$needle' in $file)"; fi
}

bash -n "$ROOT/alloy-worktree-adopt"
pass "bash -n alloy-worktree-adopt"

TMP="$(mktemp -d /tmp/alloy-worktree-adopt.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

CANON="$TMP/canon"
WTROOT="$TMP/worktrees"
RUNTIME="$TMP/runtime"
CONFIG_DIR="$TMP/config"
mkdir -p "$WTROOT" "$RUNTIME" "$CONFIG_DIR"

git init -q --bare "$TMP/origin.git"
git init -q "$CANON"
git -C "$CANON" remote add origin "$TMP/origin.git"
git -C "$CANON" config user.email "adopt-test@example.com"
git -C "$CANON" config user.name "Adopt Test"
git -C "$CANON" checkout -qb staging
mkdir -p "$CANON/web"
printf 'fixture\n' >"$CANON/README.md"
git -C "$CANON" add . >/dev/null
git -C "$CANON" commit -qm fixture
git -C "$CANON" push -q -u origin staging

cat >"$CONFIG_DIR/config" <<EOF
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$WTROOT"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_CONFIG_DIR="$CONFIG_DIR"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
ALLOY_WEB_DIR="web"
ALLOY_SLOT_5_DEFAULT_AGENT="claude"
ALLOY_SLOT_5_ROLE="Refactor / infrastructure"
EOF

adopt() {
  env ALLOY_CONFIG_FILE="$CONFIG_DIR/config" ALLOY_RUNTIME_ROOT="$RUNTIME" \
    ALLOY_TEST_FIXTURE=1 "$ROOT/alloy-worktree-adopt" "$@"
}

# A worktree that exists exactly as a migration reconstruction leaves it.
git -C "$CANON" worktree add -q -b agent/cursor/5-restored "$WTROOT/wt5-restored" staging

echo "== Adoption =="
assert_fail "refuses a path that does not exist" adopt 5 wt5-absent
assert_err_contains "says it adopts, never creates" "this command adopts, it never creates"

assert_ok "adopts an existing worktree" adopt 5 wt5-restored
META="$RUNTIME/metadata/wt5-restored.env"
assert_file_contains "records the slot" 'ALLOY_WORKTREE_SLOT="5"' "$META"
assert_file_contains "records the permanent slot port" 'PORT="3915"' "$META"
assert_file_contains "records the provider default for the slot" 'ALLOY_AGENT="claude"' "$META"
assert_file_contains "records the branch Git actually reports" 'ALLOY_WORKTREE_BRANCH="agent/cursor/5-restored"' "$META"

echo "== It creates no Git state =="
if [[ -z "$(git -C "$CANON" status --porcelain)" ]]; then
  pass "canonical checkout is untouched"
else
  fail "canonical checkout was modified"
fi
if [[ "$(git -C "$WTROOT/wt5-restored" rev-parse --abbrev-ref HEAD)" == "agent/cursor/5-restored" ]]; then
  pass "adopted worktree stays on its branch"
else
  fail "adopted worktree branch changed"
fi

echo "== Fail closed =="
assert_fail "refuses to silently rewrite existing metadata" adopt 5 wt5-restored
assert_err_contains "names --force as the deliberate override" "--force to rewrite"
assert_ok "rewrites with --force" adopt 5 wt5-restored --force

git -C "$CANON" worktree add -q -b agent/cursor/6-other "$WTROOT/wt6-other" staging
assert_fail "refuses a slot already assigned to another worktree" adopt 5 wt6-other
assert_err_contains "names the occupying worktree" "already assigned to wt5-restored"

mkdir -p "$WTROOT/wt4-plain"
assert_fail "refuses a directory Git does not track as a worktree" adopt 4 wt4-plain
assert_err_contains "says it is not a registered worktree" "not a registered worktree"

git -C "$WTROOT/wt6-other" checkout -q --detach
assert_fail "refuses a detached HEAD" adopt 6 wt6-other
assert_err_contains "names the detached HEAD" "detached"

echo "== --no-slot: registration is identity, a slot is a resource =="
# THE DEFECT THIS COVERS. With every slot held, lane creation could not register
# a worktree at all, so a lane came into existence with a branch, a tmux session
# and a live agent that no instruction could reach. Running out of PORTS is not
# a reason to stop knowing whose worktree that is.
git -C "$CANON" worktree add -q -b agent/access-identity "$WTROOT/access-identity" staging
NOSLOT_META="$RUNTIME/metadata/access-identity.env"
assert_ok "adopts a worktree with no slot" adopt --no-slot access-identity
assert_file_contains "records the name" 'ALLOY_WORKTREE_NAME="access-identity"' "$NOSLOT_META"
assert_file_contains "records the path" "$WTROOT/access-identity" "$NOSLOT_META"
assert_file_contains "records the branch Git reports" 'ALLOY_WORKTREE_BRANCH="agent/access-identity"' "$NOSLOT_META"
assert_file_contains "is live, not archived" 'ALLOY_WORKER_LIFECYCLE="active"' "$NOSLOT_META"
assert_file_contains "says why it has no slot" 'ALLOY_WORKTREE_UNSLOTTED="1"' "$NOSLOT_META"
# ABSENT, not empty-and-present: every reader resolves a slot by comparing
# against a validated 1..N, and an empty value that is present is one bad
# comparison away from matching something.
if grep -q '^ALLOY_WORKTREE_SLOT=' "$NOSLOT_META"; then
  fail "no slot key is written at all"
else
  pass "no slot key is written at all"
fi
if grep -q '^PORT=' "$NOSLOT_META"; then
  fail "no port key is written at all"
else
  pass "no port key is written at all"
fi

echo "== --no-slot fails closed on the same things =="
assert_fail "still refuses to silently rewrite existing metadata" adopt --no-slot access-identity
assert_err_contains "still names --force" "--force to rewrite"
assert_fail "refuses --no-slot together with a slot argument" adopt --no-slot 4 access-identity
assert_err_contains "says why" "takes no slot argument"
mkdir -p "$WTROOT/not-a-worktree"
assert_fail "still refuses a directory Git does not track" adopt --no-slot not-a-worktree
assert_err_contains "still says it is not a registered worktree" "not a registered worktree"
git -C "$CANON" worktree add -q -b agent/detached-noslot "$WTROOT/detached-noslot" staging
git -C "$WTROOT/detached-noslot" checkout -q --detach
assert_fail "still refuses a detached HEAD" adopt --no-slot detached-noslot
assert_err_contains "still names the detached HEAD" "detached"

echo "== a slotless registration takes nobody's slot =="
assert_file_contains "the slotted registration is untouched" 'ALLOY_WORKTREE_SLOT="5"' "$META"

echo
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
