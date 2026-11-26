#!/usr/bin/env bash
# PERMANENT REGRESSION — result identity must encode WHAT QUESTION was answered.
#
# The bug this pins actually happened: a focused single-file `vac run test <path>` stored exit 0 under
# the same key as the FULL suite, and the next full-suite request reused it and reported ZERO failures.
# A partial pass answering for the whole suite is worse than no cache at all, because it looks green.
set -uo pipefail

LIB="${LIB:-$HOME/bin/alloy-dev/lib}"
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

export ALLOY_RUNTIME_DIR="$(mktemp -d)"
export ALLOY_VALIDATE_LOCK_DIR="$ALLOY_RUNTIME_DIR/lock"
mkdir -p "$ALLOY_VALIDATE_LOCK_DIR"
alloy_validate_results_dir() { printf '%s/results' "$ALLOY_RUNTIME_DIR"; }
# shellcheck source=../lib/validate-reuse.sh
source "$LIB/validate-reuse.sh"
# shellcheck source=../lib/validate-caps.sh
source "$LIB/validate-caps.sh"

WEB="${WEB:-/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-deeplink-compose/web}"
COMMIT="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

# Dirty-tree state is an INPUT to identity, so the test controls it instead of inheriting whatever the
# host worktree happens to be. Default clean; the dirty case is asserted explicitly below.
ALLOY_TEST_FAKE_DIRTY=0
alloy_validate_tree_dirty() { [[ "$ALLOY_TEST_FAKE_DIRTY" == "1" ]]; }

echo "== scope identity =="
full_scope="$(alloy_validate_scope_id)"
one_scope="$(alloy_validate_scope_id tests/a.test.ts)"
two_scope="$(alloy_validate_scope_id tests/a.test.ts tests/b.test.ts)"
[[ "$full_scope" == "full" ]] && ok "no args => scope 'full'" || bad "no args gave '$full_scope'"
[[ "$one_scope" != "full" ]] && ok "focused scope differs from full" || bad "focused scope collided with full"
[[ "$one_scope" != "two_scope" && "$one_scope" != "$two_scope" ]] && ok "distinct path sets give distinct scopes" || bad "path sets collided"
[[ "$(alloy_validate_scope_id tests/b.test.ts tests/a.test.ts)" == "$two_scope" ]] \
  && ok "scope is order-insensitive" || bad "scope depends on argument order"

echo "== THE REGRESSION: a focused result must not satisfy the full suite =="
# Store a PASSING focused result, exactly as the real bug did.
alloy_validate_reuse_store "$COMMIT" test "$WEB" 0 wt-x 3 "$one_scope" "npx vitest run --maxWorkers=2 tests/a.test.ts" test
focused_hit="$(alloy_validate_reuse_lookup "$COMMIT" test "$WEB" 0 "$one_scope" "npx vitest run --maxWorkers=2 tests/a.test.ts" || true)"
case "$focused_hit" in
  HIT*) ok "focused result is reusable under its OWN scope" ;;
  *) bad "focused result not reusable under its own scope ($focused_hit)" ;;
esac
full_hit="$(alloy_validate_reuse_lookup "$COMMIT" test "$WEB" 0 "full" "npx vitest run --maxWorkers=2" || true)"
case "$full_hit" in
  MISS*) ok "FULL suite does NOT reuse the focused result" ;;
  *) bad "REGRESSION: full suite reused a focused result ($full_hit)" ;;
esac

echo "== command sensitivity at identical scope =="
other_cmd_hit="$(alloy_validate_reuse_lookup "$COMMIT" test "$WEB" 0 "$one_scope" "npx vitest run --reporter=dot tests/a.test.ts" || true)"
case "$other_cmd_hit" in
  MISS*) ok "different normalized command => MISS" ;;
  *) bad "different command reused a result ($other_cmd_hit)" ;;
esac

echo "== outcome gate: only real executions become results =="
for outcome in config cancelled unknown; do
  scope="scope-$outcome"
  alloy_validate_reuse_store "$COMMIT" test "$WEB" 1 wt-x 3 "$scope" "some command" "$outcome"
  got="$(alloy_validate_reuse_lookup "$COMMIT" test "$WEB" 0 "$scope" "some command" || true)"
  case "$got" in
    MISS*) ok "outcome '$outcome' not cached" ;;
    *) bad "outcome '$outcome' WAS cached ($got)" ;;
  esac
done
alloy_validate_reuse_store "$COMMIT" test "$WEB" 1 wt-x 3 "scope-real" "some command" test
got="$(alloy_validate_reuse_lookup "$COMMIT" test "$WEB" 0 "scope-real" "some command" || true)"
case "$got" in
  HIT*1*) ok "a real test failure IS cached, with its exit code" ;;
  *) bad "real test failure not cached correctly ($got)" ;;
esac

echo "== cross-kind implication stays full-scope only =="
alloy_validate_reuse_store "$COMMIT" build "$WEB" 0 wt-x 3 "full" "npm run build" ok
tc_full="$(alloy_validate_reuse_lookup "$COMMIT" typecheck "$WEB" 0 "full" "" || true)"
case "$tc_full" in
  HIT*build*) ok "full build implies full typecheck" ;;
  *) bad "full build did not imply typecheck ($tc_full)" ;;
esac
tc_scoped="$(alloy_validate_reuse_lookup "$COMMIT" typecheck "$WEB" 0 "$one_scope" "" || true)"
case "$tc_scoped" in
  MISS*) ok "build does NOT imply a SCOPED typecheck" ;;
  *) bad "build implied a scoped typecheck ($tc_scoped)" ;;
esac

echo "== tool version participates in identity =="
fp_a="$(alloy_validate_fingerprint "$WEB" test full)"
case "$fp_a" in
  *_4.*|*_none*) ok "fingerprint carries the tool version ($fp_a)" ;;
  *) bad "fingerprint lacks a tool version ($fp_a)" ;;
esac

echo "== a dirty worktree neither reuses nor stores =="
# The commit SHA identifies COMMITTED code. This exact hole returned a stale FAILING build for source
# that had already been repaired but not committed.
ALLOY_TEST_FAKE_DIRTY=1
dirty_lookup="$(alloy_validate_reuse_lookup "$COMMIT" test "$WEB" 0 "$one_scope" "npx vitest run --maxWorkers=2 tests/a.test.ts" || true)"
case "$dirty_lookup" in
  MISS*) ok "dirty tree => no reuse" ;;
  *) bad "dirty tree reused a result ($dirty_lookup)" ;;
esac
alloy_validate_reuse_store "$COMMIT" test "$WEB" 0 wt-x 3 "scope-dirty" "cmd-dirty" ok
ALLOY_TEST_FAKE_DIRTY=0
after_dirty="$(alloy_validate_reuse_lookup "$COMMIT" test "$WEB" 0 "scope-dirty" "cmd-dirty" || true)"
case "$after_dirty" in
  MISS*) ok "a result produced on a dirty tree was not stored" ;;
  *) bad "dirty-tree result WAS stored ($after_dirty)" ;;
esac

echo "== classification includes infrastructure cancellation =="
tmp="$(mktemp)"; printf 'whatever\n' > "$tmp"
[[ "$(alloy_classify_exec_failure "$tmp" 143)" == "cancelled" ]] && ok "SIGTERM exit => cancelled" || bad "143 misclassified"
[[ "$(alloy_classify_exec_failure "$tmp" 130)" == "cancelled" ]] && ok "SIGINT exit => cancelled" || bad "130 misclassified"
rm -f "$tmp"

rm -rf "$ALLOY_RUNTIME_DIR"
echo
echo "PASS=$pass FAIL=$fail"
[[ "$fail" -eq 0 ]]
