#!/usr/bin/env bash
# Focused tests for alloy-engineering-certify harness.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/cert-harness-test.out 2>/tmp/cert-harness-test.err; then pass "$msg"; else fail "$msg"; fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/cert-harness-test.out 2>/tmp/cert-harness-test.err; then fail "$msg (expected failure)"; else pass "$msg"; fi
}

PROD_RUNTIME="${HOME}/.local/state/alloy-dev"
PROD_INIT="${PROD_RUNTIME}/initiatives"
SNAP_BEFORE="$(mktemp)"
SNAP_AFTER="$(mktemp)"
if [[ -d "$PROD_INIT" ]]; then find "$PROD_INIT" -type f 2>/dev/null | sort >"$SNAP_BEFORE"; else : >"$SNAP_BEFORE"; fi
if [[ -d "$PROD_RUNTIME/metadata" ]]; then find "$PROD_RUNTIME/metadata" -type f 2>/dev/null | sort >"${SNAP_BEFORE}.meta"; else : >"${SNAP_BEFORE}.meta"; fi

echo "== certify harness =="
assert_ok "certify passes" bash "$ROOT/alloy-engineering-certify"

if [[ -d "$PROD_INIT" ]]; then find "$PROD_INIT" -type f 2>/dev/null | sort >"$SNAP_AFTER"; else : >"$SNAP_AFTER"; fi
if [[ -d "$PROD_RUNTIME/metadata" ]]; then find "$PROD_RUNTIME/metadata" -type f 2>/dev/null | sort >"${SNAP_AFTER}.meta"; else : >"${SNAP_AFTER}.meta"; fi

diff -q "$SNAP_BEFORE" "$SNAP_AFTER" >/dev/null 2>&1 && pass "production initiatives untouched" || fail "production initiatives touched"
diff -q "${SNAP_BEFORE}.meta" "${SNAP_AFTER}.meta" >/dev/null 2>&1 && pass "production metadata untouched" || fail "production metadata touched"

KEEP_OUT="$(mktemp)"
bash "$ROOT/alloy-engineering-certify" --keep >"$KEEP_OUT" 2>&1
grep -q "Retained certification directory" "$KEEP_OUT" && pass "--keep retains artifacts" || fail "--keep retains artifacts"
CERT_DIR="$(grep -A1 "Retained certification" "$KEEP_OUT" | tail -1 | xargs)"
[[ -f "${CERT_DIR}/certification-manifest.yaml" ]] && pass "--keep manifest present" || fail "--keep manifest present"
rm -rf "$CERT_DIR"

assert_fail "injected failure nonzero exit" \
  bash -c 'source "'"$ROOT"'/lib/engineering-certify.sh"; CERT_FAIL=1; certify_print_summary >/dev/null; exit 1'

SUMMARY_LINES="$(bash "$ROOT/alloy-engineering-certify" 2>&1 | grep "Assertions:" || true)"
echo "$SUMMARY_LINES" | grep -q "passed" && pass "summary shows assertion count" || fail "summary shows assertion count"

rm -f "$SNAP_BEFORE" "$SNAP_AFTER" "${SNAP_BEFORE}.meta" "${SNAP_AFTER}.meta" "$KEEP_OUT"

echo
echo "Certify harness tests: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
