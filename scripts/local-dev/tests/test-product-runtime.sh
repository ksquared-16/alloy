#!/usr/bin/env bash
# Focused tests for Alloy Product Runtime V1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_ok() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-product-test.out 2>/tmp/alloy-product-test.err; then pass "$msg"; else fail "$msg"; fi
}

assert_fail() {
  local msg="$1"; shift
  if "$@" >/tmp/alloy-product-test.out 2>/tmp/alloy-product-test.err; then fail "$msg (expected failure)"; else pass "$msg"; fi
}

TMP="$(mktemp -d /tmp/alloy-product-fixture.XXXXXX)"
ORIGIN="$TMP/origin.git"
CANON="$TMP/canon"
RUNTIME="$TMP/runtime"
INITIATIVES="$RUNTIME/initiatives"
CONFIG="$TMP/config"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

setup() {
  mkdir -p "$CANON/docs/platform/governance" "$INITIATIVES" "$RUNTIME/locks"
  git -C "$CANON" init -q
  git -C "$CANON" config user.email "test@example.com"
  git -C "$CANON" config user.name "Test"
  echo "# Alloy" >"$CANON/docs/README.md"
  echo "# Doctrine" >"$CANON/docs/platform/governance/design-and-operational-doctrine.md"
  git -C "$CANON" add -A && git -C "$CANON" commit -q -m init
  git -C "$CANON" branch -M staging
  git clone -q "$CANON" "$ORIGIN" --bare
  git -C "$CANON" remote add origin "$ORIGIN"
  git -C "$CANON" push -q -u origin staging
  cat >"$CONFIG" <<CFG
ALLOY_REPO="$CANON"
ALLOY_WORKTREE_ROOT="$TMP/worktrees"
ALLOY_RUNTIME_ROOT="$RUNTIME"
ALLOY_BASE_REMOTE="origin"
ALLOY_BASE_BRANCH="staging"
CFG
}

env_cmd() {
  env ALLOY_CONFIG_FILE="$CONFIG" ALLOY_INITIATIVE_ROOT="$INITIATIVES" "$@"
}

sample_brief() {
  cat <<'YAML'
product:
  key: test-product
  title: Test Product
  summary: Test product runtime intake

problem:
  current_state: before
  pain_points:
    - pain

users:
  primary:
    - operator
  secondary: []

jobs_to_be_done:
  - job

operator_outcomes:
  - outcome

business_outcomes:
  - business

product_direction:
  - direction without vague words

scope:
  in_scope:
    - intake test
  out_of_scope:
    - production code

acceptance:
  - passes tests

human_approval:
  required_gates:
    - product_contract_approval

visual_basis:
  type: pattern_reference
YAML
}

setup
BRIEF="$TMP/brief.yaml"
sample_brief >"$BRIEF"

assert_ok "node syntax product-io" node --check "$ROOT/lib/product-io.mjs"
assert_ok "node syntax product-artifacts" node --check "$ROOT/lib/product-artifacts.mjs"

assert_ok "product create" env_cmd "$ROOT/alloy-product-create" test-product --from "$BRIEF"
assert_fail "duplicate rejected" env_cmd "$ROOT/alloy-product-create" test-product --from "$BRIEF"
assert_ok "product audit" env_cmd "$ROOT/alloy-product-audit" test-product
assert_ok "product contract" env_cmd "$ROOT/alloy-product-contract" test-product
assert_ok "product approve" env_cmd "$ROOT/alloy-product-approve" test-product --approver Test
assert_ok "product package" env_cmd "$ROOT/alloy-product-package" test-product
assert_ok "product handoff" env_cmd "$ROOT/alloy-product-handoff" test-product

HASH="$(node -e "console.log(require('${INITIATIVES}/test-product/state.json').product_contract_hash||'')")"
assert_ok "engineering has product hash" test -n "$HASH"

assert_ok "illegal transition fails" bash -c '! node "$ROOT/lib/product-io.mjs" validate-transition draft approved'

echo
echo "Product runtime tests: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
