#!/usr/bin/env bash
# Focused fixtures: alloy-ai-health process-count formatting + Playwright classification.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_true() {
  local msg="$1"; shift
  if "$@"; then pass "$msg"; else fail "$msg"; fi
}

assert_false() {
  local msg="$1"; shift
  if "$@"; then fail "$msg"; else pass "$msg"; fi
}

assert_eq() {
  local want="$1" got="$2" msg="$3"
  if [[ "$want" == "$got" ]]; then pass "$msg"; else fail "$msg (want='$want' got='$got')"; fi
}

# shellcheck source=../lib/common.sh
source "${ROOT}/lib/common.sh"
# shellcheck source=../lib/agent.sh
source "${ROOT}/lib/agent.sh"

echo "== bash -n (AI-health surfaces) =="
for f in \
  "$ROOT/lib/common.sh" \
  "$ROOT/lib/agent.sh" \
  "$ROOT/alloy-ai-health" \
  "$ROOT/tests/test-ai-health.sh"
do
  bash -n "$f"
  pass "bash -n $(basename "$f")"
done

echo "== Playwright test-runner classification =="

assert_true "count playwright test argv" \
  alloy_command_is_playwright_test_runner \
  "npx playwright test --workers=1"

assert_true "count playwright test path runner with test arg" \
  alloy_command_is_playwright_test_runner \
  "node /repo/web/node_modules/@playwright/test/cli.js test --workers=1"

assert_true "count playwright/cli.js with test arg" \
  alloy_command_is_playwright_test_runner \
  "node /repo/web/node_modules/playwright/cli.js test tests/foo.spec.ts"

assert_false "ignore azureedge hostname" \
  alloy_command_is_playwright_test_runner \
  "curl https://playwright.azureedge.net/builds/index.json"

assert_false "ignore cursor sandbox policy JSON" \
  alloy_command_is_playwright_test_runner \
  'Cursor.app/Contents/Resources/helpers/cursorsandbox --policy-json {"networkAllowlist":["playwright.azureedge.net"]}'

assert_false "ignore bare package path without test arg" \
  alloy_command_is_playwright_test_runner \
  "node /repo/web/node_modules/@playwright/test/cli.js --version"

assert_false "ignore headless browser helper" \
  alloy_command_is_playwright_test_runner \
  "/Users/x/Library/Caches/ms-playwright/chromium/chrome-headless-shell --type=renderer"

assert_false "ignore inspection alloy-ai-health" \
  alloy_command_is_playwright_test_runner \
  "bash /repo/scripts/local-dev/alloy-ai-health"

assert_false "ignore grep inspector" \
  alloy_command_is_playwright_test_runner \
  "grep playwright /tmp/ps-out.txt"

# Keep Phase 1 validator wired to the shared classifier.
assert_true "validator reuses playwright runner true" \
  alloy_command_is_active_validator \
  "npx playwright test --workers=1"

assert_false "validator ignores playwright hostname" \
  alloy_command_is_active_validator \
  "curl https://playwright.azureedge.net/builds/index.json"

echo "== Process-count helpers (pipefail-safe zeros) =="

# Under set -o pipefail, a previous bug appended a second "0" via `|| echo 0`
# when grep found no matches. Count helpers must emit exactly one integer token.
ZERO="$(alloy_count_matching_processes 'this-pattern-should-match-no-alloy-process-zzzz')"
assert_eq "0" "$ZERO" "matching counter returns single zero token"
[[ "$ZERO" == *$'\n'* ]] && fail "matching counter has embedded newline" || pass "matching counter has no embedded newline"

PZERO="$(alloy_count_playwright_test_runners)"
[[ "$PZERO" =~ ^[0-9]+$ ]] && pass "playwright counter is integer" || fail "playwright counter not integer"
[[ "$PZERO" == *$'\n'* ]] && fail "playwright counter has embedded newline" || pass "playwright counter has no embedded newline"

echo "== alloy-ai-health Process counts section formatting =="

TMP="$(mktemp -d /tmp/alloy-ai-health-test.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

cat >"$TMP/config" <<EOF
ALLOY_REPO="$TMP"
ALLOY_WORKTREE_ROOT="$TMP/worktrees"
ALLOY_RUNTIME_ROOT="$TMP/runtime"
ALLOY_CONFIG_DIR="$TMP"
ALLOY_BIN_DIR="$TMP/bin"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
ALLOY_CANONICAL_PORT="3000"
ALLOY_FIRST_AGENT_PORT="3011"
ALLOY_MAX_AGENTS="6"
EOF
mkdir -p "$TMP/runtime" "$TMP/worktrees" "$TMP/bin"

set +e
OUT="$(
  env ALLOY_CONFIG_FILE="$TMP/config" \
    "$ROOT/alloy-ai-health" 2>"$TMP/ai-health.err"
)"
RC=$?
set -e

# Command should remain usable even when ALLOY_REPO is a non-git fixture dir.
if [[ "$RC" -eq 0 ]] || grep -Eq 'Process counts|Alloy AI health' <<<"$OUT"; then
  pass "alloy-ai-health produced process counts output"
else
  fail "alloy-ai-health failed to produce output"
  sed -n '1,40p' "$TMP/ai-health.err" >&2 || true
fi

# Extract Process counts section body (until next == section).
COUNTS="$(
  printf '%s\n' "$OUT" | awk '
    /^== Process counts ==$/ {grab=1; next}
    grab && /^== / {exit}
    grab {print}
  '
)"

[[ -n "$COUNTS" ]] && pass "process counts section present" || fail "process counts section missing"

STANDALONE=0
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  if [[ "$line" =~ ^[[:space:]]*[0-9]+[[:space:]]*$ ]]; then
    STANDALONE=$((STANDALONE + 1))
    echo "standalone numeric line: [$line]" >&2
  fi
done <<<"$COUNTS"

[[ "$STANDALONE" -eq 0 ]] && pass "no standalone numeric lines in process counts" \
  || fail "found $STANDALONE standalone numeric line(s) in process counts"

# Each known family must appear once as an aligned label+count row.
for label in "Cursor" "Cursor Helper" "Claude" "ChatGPT app" "node" "tsc / typescript" "vitest" "next" "playwright"; do
  rows="$(printf '%s\n' "$COUNTS" | grep -c -E "^  ${label}[[:space:]]+[0-9]+$" || true)"
  # grep -c prints 0 on no match; with pipefail elsewhere we already handled.
  rows="$(printf '%s' "$rows" | tr -d '[:space:]')"
  if [[ "$rows" == "1" ]]; then
    pass "one aligned row for ${label}"
  else
    fail "expected one aligned row for ${label} (got '${rows}')"
    printf '%s\n' "$COUNTS" >&2
  fi
done

# Zero counts must still appear on the label row (not omitted).
if printf '%s\n' "$COUNTS" | grep -Eq '^  (tsc / typescript|vitest|next|playwright)[[:space:]]+0$'; then
  pass "zero counts preserved on label rows when idle"
else
  # On a busy machine some may be non-zero; still require each row ends with an integer.
  if printf '%s\n' "$COUNTS" | grep -Eq '^  vitest[[:space:]]+[0-9]+$'; then
    pass "vitest row has inline integer count"
  else
    fail "vitest row missing inline integer count"
  fi
fi

echo
echo "AI-health focused results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
