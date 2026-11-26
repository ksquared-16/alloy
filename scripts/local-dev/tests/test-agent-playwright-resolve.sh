#!/usr/bin/env bash
# Focused tests: worktree-aware @playwright/test resolution for Phase 3 helpers.
# Uses disposable fake packages — no real browser.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-pw.out 2>/tmp/alloy-pw.err; then
    pass "$msg"
  else
    fail "$msg"
    sed -n '1,40p' /tmp/alloy-pw.err >&2 || true
  fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-pw.out 2>/tmp/alloy-pw.err; then
    fail "$msg (expected non-zero)"
  else
    pass "$msg"
  fi
}

install_fake_playwright() {
  local web_dir="$1"
  local marker_id="$2"
  mkdir -p "${web_dir}/node_modules/@playwright/test"
  if [[ ! -f "${web_dir}/package.json" ]]; then
    printf '{"name":"fixture-web","private":true}\n' >"${web_dir}/package.json"
  fi
  cat >"${web_dir}/node_modules/@playwright/test/package.json" <<'EOF'
{"name":"@playwright/test","version":"0.0.0-fixture","main":"index.js"}
EOF
  cat >"${web_dir}/node_modules/@playwright/test/index.js" <<EOF
const fs = require("fs");
const path = require("path");
const marker = process.env.ALLOY_PW_MARKER;
if (marker) {
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, "${marker_id}");
}
const page = {
  url: () => "http://127.0.0.1:3011/workspace",
  goto: async () => {},
  waitForTimeout: async () => {},
  screenshot: async () => {},
  on: () => {},
};
const context = {
  newPage: async () => page,
  pages: () => [page],
  storageState: async () => {},
  close: async () => {},
  browser: () => ({ process: () => ({ pid: process.pid }) }),
};
module.exports = {
  chromium: {
    launch: async () => ({
      newContext: async () => context,
      close: async () => {},
    }),
    launchPersistentContext: async () => context,
  },
};
EOF
}

TMP="$(mktemp -d /tmp/alloy-pw.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

WT_A="$TMP/worktrees/wt1-alpha"
WT_B="$TMP/worktrees/wt2-beta"
CANON="$TMP/canon"
mkdir -p "$WT_A/web" "$WT_B/web" "$CANON/web" "$TMP/runtime"

# Sibling / canonical / toolkit must NOT be used when resolving for WT_A
install_fake_playwright "$WT_A/web" "from-wt-a"
install_fake_playwright "$WT_B/web" "from-wt-b"
install_fake_playwright "$CANON/web" "from-canon"
# Poison toolkit ancestry: a node_modules next to lib would be wrong if static import worked
mkdir -p "$ROOT/node_modules/@playwright/test"
cat >"$ROOT/node_modules/@playwright/test/package.json" <<'EOF'
{"name":"@playwright/test","version":"0.0.0-poison","main":"index.js"}
EOF
cat >"$ROOT/node_modules/@playwright/test/index.js" <<'EOF'
module.exports = { chromium: { launch: async () => { throw new Error("toolkit-poison"); } } };
EOF
trap 'rm -rf "$ROOT/node_modules"; cleanup' EXIT

HELPER="$ROOT/lib/playwright-from-web.mjs"

# Resolve from WT_A
RESOLVED_A="$(node "$HELPER" --resolve --web-dir "$WT_A/web")"
echo "$RESOLVED_A" | grep -q "$WT_A/web/node_modules/@playwright/test" && pass "resolves from worktree A web/node_modules" || fail "A resolve ($RESOLVED_A)"
echo "$RESOLVED_A" | grep -q "$ROOT/node_modules" && fail "resolved toolkit poison" || pass "does not resolve from toolkit ancestry"
echo "$RESOLVED_A" | grep -q "$CANON" && fail "resolved canonical" || pass "does not resolve from canonical"
echo "$RESOLVED_A" | grep -q "$WT_B" && fail "resolved sibling B" || pass "does not resolve from sibling worktree"

RESOLVED_B="$(node "$HELPER" --resolve --web-dir "$WT_B/web")"
echo "$RESOLVED_B" | grep -q "$WT_B/web/node_modules/@playwright/test" && pass "resolves from worktree B web/node_modules" || fail "B resolve"

# Missing dependency fails with exact remediation
WT_MISS="$TMP/worktrees/wt3-miss/web"
mkdir -p "$WT_MISS"
printf '{"name":"miss","private":true}\n' >"$WT_MISS/package.json"
assert_fail "missing playwright fails preflight" \
  node "$HELPER" --preflight --web-dir "$WT_MISS"
grep -q "cd ${WT_MISS} && npm install" /tmp/alloy-pw.err && pass "remediation exact (cd web && npm install)" || fail "remediation text ($(cat /tmp/alloy-pw.err))"

# Missing package.json
WT_NOPKG="$TMP/worktrees/wt4-nopkg/web"
mkdir -p "$WT_NOPKG"
assert_fail "missing package.json fails" \
  node "$HELPER" --preflight --web-dir "$WT_NOPKG"
grep -q "npm install" /tmp/alloy-pw.err && pass "package.json missing remediation" || fail "pkg remediation"

# Helpers load the worktree-local package (marker file)
MARKER="$TMP/marker.txt"
rm -f "$MARKER"
export ALLOY_PW_MARKER="$MARKER"

# login-capture: will try to launch fake browser and wait — use a short path by
# pointing at a server that redirects... Actually fake chromium returns /workspace
# immediately so login loop should succeed quickly.
STORAGE="$TMP/storage-a.json"
PROFILE="$TMP/profile-a"
mkdir -p "$PROFILE"
assert_ok "login helper reaches worktree Playwright" \
  env ALLOY_PW_MARKER="$MARKER" \
  node "$ROOT/lib/agent-login-capture.mjs" \
    --web-dir "$WT_A/web" \
    --base-url "http://127.0.0.1:3011" \
    --login-route "/login" \
    --check-route "/workspace" \
    --profile-dir "$PROFILE" \
    --storage-out "$STORAGE" \
    --pid-out "$TMP/pid-a.txt" \
    --timeout "5000"
[[ -f "$MARKER" ]] && [[ "$(cat "$MARKER")" == "from-wt-a" ]] && pass "login used worktree A package" || fail "login marker ($(cat "$MARKER" 2>/dev/null || echo missing))"

rm -f "$MARKER"
assert_ok "auth-check helper reaches worktree Playwright" \
  env ALLOY_PW_MARKER="$MARKER" \
  node "$ROOT/lib/agent-auth-check.mjs" \
    --web-dir "$WT_A/web" \
    --storage "$STORAGE" \
    --url "http://127.0.0.1:3011/workspace"
[[ "$(cat "$MARKER" 2>/dev/null || echo missing)" == "from-wt-a" ]] && pass "auth-check used worktree A package" || fail "auth-check marker"

rm -f "$MARKER"
EVIDENCE="$TMP/evidence"
assert_ok "verify helper reaches worktree Playwright" \
  env ALLOY_PW_MARKER="$MARKER" \
  node "$ROOT/lib/agent-verify.mjs" \
    --web-dir "$WT_A/web" \
    --base-url "http://127.0.0.1:3011" \
    --storage "$STORAGE" \
    --evidence "$EVIDENCE" \
    -- \
    authenticated-home
[[ "$(cat "$MARKER" 2>/dev/null || echo missing)" == "from-wt-a" ]] && pass "verify used worktree A package" || fail "verify marker"

# Failed launch leaves no owned browser PID — bash wrapper path via alloy_require
# shellcheck source=../lib/common.sh
source "$ROOT/lib/common.sh"
# shellcheck source=../lib/verify.sh
source "$ROOT/lib/verify.sh"
export ALLOY_LOCAL_DEV_ROOT="$ROOT"
export ALLOY_RUNTIME_ROOT="$TMP/runtime"
alloy_load_config 2>/dev/null || true
ALLOY_RUNTIME_ROOT="$TMP/runtime"
ALLOY_LOCAL_DEV_ROOT="$ROOT"
mkdir -p "$TMP/runtime/browser-pids"

# Direct preflight failure must not create PID
PID_BEFORE="$(ls "$TMP/runtime/browser-pids" 2>/dev/null | wc -l | tr -d ' ')"
assert_fail "bash preflight fails without playwright" \
  bash -c "source '$ROOT/lib/common.sh'; source '$ROOT/lib/verify.sh'; ALLOY_LOCAL_DEV_ROOT='$ROOT'; alloy_require_worktree_playwright '$TMP/worktrees/wt3-miss'"
PID_AFTER="$(ls "$TMP/runtime/browser-pids" 2>/dev/null | wc -l | tr -d ' ')"
[[ "$PID_BEFORE" == "$PID_AFTER" ]] && pass "failed preflight left no browser PID" || fail "browser PID created on failure"

# Prove sibling package is selected when targeting B
rm -f "$MARKER"
assert_ok "login against B uses B package" \
  env ALLOY_PW_MARKER="$MARKER" \
  node "$ROOT/lib/agent-login-capture.mjs" \
    --web-dir "$WT_B/web" \
    --base-url "http://127.0.0.1:3012" \
    --profile-dir "$TMP/profile-b" \
    --storage-out "$TMP/storage-b.json" \
    --timeout "5000"
[[ "$(cat "$MARKER")" == "from-wt-b" ]] && pass "slot B isolated from A package" || fail "B isolation"

echo
echo "Playwright resolution results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
