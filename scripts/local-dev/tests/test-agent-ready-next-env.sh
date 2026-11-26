#!/usr/bin/env bash
# Focused tests: next-env.d.ts dirty-state handling in ready checks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"
# shellcheck source=../lib/agent.sh
source "$ROOT/lib/agent.sh"
# shellcheck source=../lib/verify.sh
source "$ROOT/lib/verify.sh"

TMP="$(mktemp -d /tmp/alloy-ready-ne.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

REPO="$TMP/repo"
git init "$REPO" >/dev/null
git -C "$REPO" config user.email "ready-ne@test.com"
git -C "$REPO" config user.name "Ready NE Test"
mkdir -p "$REPO/web"
printf '/// <reference types="next" />\n' >"$REPO/web/next-env.d.ts"
printf '# fixture\n' >"$REPO/README.md"
git -C "$REPO" add . && git -C "$REPO" commit -m "init" >/dev/null

export ALLOY_WEB_DIR="web"

[[ "$(alloy_worktree_dirty_classification "$REPO")" == "clean" ]] && pass "clean tree classified clean" || fail "clean"

printf 'import "./.next/dev/types/routes.d.ts";\n' >"$REPO/web/next-env.d.ts"
[[ "$(alloy_worktree_dirty_classification "$REPO")" == "next-env-only" ]] && pass "next-env-only classified" || fail "next-env-only"

printf '\nother\n' >>"$REPO/README.md"
[[ "$(alloy_worktree_dirty_classification "$REPO")" == "dirty" ]] && pass "other changes classified dirty" || fail "other dirty"

# Ready evaluate integration (git slice only — other checks may add issues).
git -C "$REPO" checkout -- README.md web/next-env.d.ts
export ALLOY_RUNTIME_ROOT="$TMP/runtime"
export ALLOY_LOCAL_DEV_ROOT="$ROOT"
mkdir -p "$TMP/runtime/metadata" "$TMP/runtime/pids" "$TMP/runtime/logs"
export ALLOY_SKIP_URL_CHECK=1
export ALLOY_SKIP_AUTH_LIVE_CHECK=1

cat >"$TMP/config" <<EOF
ALLOY_REPO="$REPO"
ALLOY_RUNTIME_ROOT="$TMP/runtime"
ALLOY_WORKTREE_ROOT="$TMP/worktrees"
ALLOY_CONFIG_DIR="$TMP/config"
ALLOY_WEB_DIR="web"
ALLOY_MAX_AGENTS="6"
ALLOY_FIRST_AGENT_PORT="3011"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="main"
EOF
export ALLOY_CONFIG_FILE="$TMP/config"
alloy_load_config
alloy_ensure_runtime_dirs

NAME="wt-ready-ne"
cat >"$TMP/runtime/metadata/${NAME}.env" <<EOF
ALLOY_WORKTREE_NAME="${NAME}"
ALLOY_WORKTREE_PATH="${REPO}"
ALLOY_WORKTREE_SLOT="1"
ALLOY_WORKTREE_BRANCH="main"
ALLOY_AGENT="cursor"
ALLOY_AGENT_STATUS="active"
ALLOY_AGENT_ROLE="Product implementation"
PORT="3011"
EOF

git -C "$REPO" checkout -b main >/dev/null 2>&1 || git -C "$REPO" checkout main >/dev/null 2>&1 || true

# Ready evaluate: git issue lines only (other prerequisites may add separate issues).
EVAL_CLEAN="$(alloy_agent_ready_evaluate "$NAME")"
echo "$EVAL_CLEAN" | grep -q 'ISSUE=git:.*worktree dirty' && fail "clean has dirty issue" || pass "clean tree has no dirty issue"

printf 'import "./.next/dev/types/routes.d.ts";\n' >"$REPO/web/next-env.d.ts"
EVAL_NE="$(alloy_agent_ready_evaluate "$NAME")"
echo "$EVAL_NE" | grep -q 'git restore web/next-env.d.ts' && pass "next-env remediation" || fail "next-env remediation missing ($EVAL_NE)"
echo "$EVAL_NE" | grep -q 'Next.js regenerated' && pass "next-env explains cause" || fail "next-env cause"

printf '\n# dirty other\n' >>"$REPO/README.md"
EVAL_DIRTY="$(alloy_agent_ready_evaluate "$NAME")"
echo "$EVAL_DIRTY" | awk -F= '/^ISSUE=/{print $2}' | grep -qx 'git: worktree dirty' && pass "generic dirty warning" || fail "generic dirty"
echo "$EVAL_DIRTY" | grep -q 'git restore web/next-env.d.ts' && fail "generic dirty must not show next-env-only remediation" || pass "no next-env-only remediation for other dirty"

echo
echo "Ready next-env results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
