#!/usr/bin/env bash
# TM-2 Canonical Root — alloy-root must classify $PWD honestly.
#
# Every other guard validates a path the toolkit minted. Nothing asked about the
# directory the agent is standing in, which is why a sprint ran for two sessions
# in a clone 1481 commits behind staging with no scripts/local-dev in it.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

TMP="$(mktemp -d /tmp/alloy-canonical-root.XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

mkdir -p "$TMP/canon" "$TMP/worktrees" "$TMP/retired" "$TMP/elsewhere" "$TMP/state"

init_repo() {
  git -C "$1" init -q
  git -C "$1" remote add origin "git@github.com:ksquared-16/alloy.git" 2>/dev/null || true
  printf 'x\n' >"$1/f.txt"
  git -C "$1" add -A
  git -C "$1" -c user.email=t@t -c user.name=t commit -q -m init
}
init_repo "$TMP/canon"
mkdir -p "$TMP/worktrees/wt1-demo"; init_repo "$TMP/worktrees/wt1-demo"
init_repo "$TMP/retired"
init_repo "$TMP/elsewhere"

cat >"$TMP/config" <<EOF
ALLOY_REPO="$TMP/canon"
ALLOY_WORKTREE_ROOT="$TMP/worktrees"
ALLOY_RUNTIME_ROOT="$TMP/state"
ALLOY_FIRST_AGENT_PORT="3911"
ALLOY_MAX_AGENTS="6"
ALLOY_RETIRED_ROOTS="$TMP/retired"
EOF
export ALLOY_CONFIG_FILE="$TMP/config"
export ALLOY_RETIRED_ROOTS="$TMP/retired"

root_class() { "${LOCAL_DEV}/alloy-root" "$1" --quiet 2>/dev/null; }
root_strict() { "${LOCAL_DEV}/alloy-root" "$1" --strict --quiet >/dev/null 2>&1; echo $?; }

# ── Classification ───────────────────────────────────────────────────────────
[[ "$(root_class "$TMP/canon")" == "canonical" ]] \
  && pass "canonical repo classifies canonical" \
  || fail "canonical repo classified '$(root_class "$TMP/canon")'"

[[ "$(root_class "$TMP/worktrees/wt1-demo")" == "managed-worktree" ]] \
  && pass "managed worktree classifies managed-worktree" \
  || fail "managed worktree classified '$(root_class "$TMP/worktrees/wt1-demo")'"

mkdir -p "$TMP/worktrees/wt1-demo/deep/nested"
[[ "$(root_class "$TMP/worktrees/wt1-demo/deep/nested")" == "managed-worktree" ]] \
  && pass "a subdirectory resolves to its worktree, not to 'unmanaged'" \
  || fail "subdirectory classified '$(root_class "$TMP/worktrees/wt1-demo/deep/nested")'"

[[ "$(root_class "$TMP/retired")" == "retired" ]] \
  && pass "a retired root classifies retired" \
  || fail "retired root classified '$(root_class "$TMP/retired")'"

[[ "$(root_class "$TMP/elsewhere")" == "unmanaged" ]] \
  && pass "an unrelated git repo classifies unmanaged" \
  || fail "unrelated repo classified '$(root_class "$TMP/elsewhere")'"

nogit="$TMP/nogit"; mkdir -p "$nogit"
[[ "$(root_class "$nogit")" == "outside" ]] \
  && pass "a non-repo directory classifies outside" \
  || fail "non-repo classified '$(root_class "$nogit")'"

# ── --strict gates only the unsanctioned ─────────────────────────────────────
[[ "$(root_strict "$TMP/canon")" == "0" ]] \
  && pass "--strict admits the canonical repo" \
  || fail "--strict rejected the canonical repo"

[[ "$(root_strict "$TMP/worktrees/wt1-demo")" == "0" ]] \
  && pass "--strict admits a managed worktree" \
  || fail "--strict rejected a managed worktree"

[[ "$(root_strict "$TMP/retired")" == "1" ]] \
  && pass "--strict refuses a retired root" \
  || fail "--strict did not refuse a retired root"

[[ "$(root_strict "$TMP/elsewhere")" == "1" ]] \
  && pass "--strict refuses an unmanaged root" \
  || fail "--strict did not refuse an unmanaged root"

# ── The retired root is named, not just rejected ─────────────────────────────
out="$("${LOCAL_DEV}/alloy-root" "$TMP/retired" 2>&1 || true)"
if [[ "$out" == *"retired"* && "$out" == *"agent-repo-boundaries"* ]]; then
  pass "a retired root cites the governance decision that retired it"
else
  fail "retired-root output does not cite governance: $out"
fi
if [[ "$out" == *"alloy-sprint-start"* ]]; then
  pass "a rejected root states the remedy"
else
  fail "rejected root gives no remedy"
fi

# ── Staleness: the check that identifies a wrong base ────────────────────────
# A clone can share a remote with the canonical repo and still be far behind it.
# Being the right repository is not being on the right base.
git -C "$TMP/retired" checkout -q -b stale-branch
out="$("${LOCAL_DEV}/alloy-root" "$TMP/retired" 2>&1 || true)"
if [[ "$out" == *"Ahead/Behind"* ]]; then
  pass "root report includes ahead/behind against the base"
else
  fail "root report omits ahead/behind"
fi
if [[ "$out" == *"Base:"* && "$out" == *"origin/staging"* ]]; then
  pass "root report names the base ref it measured against"
else
  fail "root report does not name its base ref"
fi
if [[ "$out" == *"does not contain scripts/local-dev"* ]]; then
  pass "root report flags a root that cannot be the toolkit source"
else
  fail "root report does not flag a missing scripts/local-dev"
fi

# ── Governance docs must agree with each other ───────────────────────────────
REPO_ROOT="$(cd "${LOCAL_DEV}/../.." && pwd)"
gov="$REPO_ROOT/docs/platform/governance/agent-repo-boundaries.md"
mdc="$REPO_ROOT/.cursor/rules/repo-boundry.mdc"
claude_md="$REPO_ROOT/CLAUDE.md"

if grep -qi "RETIRED as an engineering root" "$gov"; then
  pass "governance retires the Alloy-Claude engineering root"
else
  fail "governance does not retire Alloy-Claude"
fi
if ! grep -q "Claude / Cowork specialist workspace" "$gov"; then
  pass "governance no longer sanctions a specialist workspace clone"
else
  fail "governance still sanctions Alloy-Claude as a specialist workspace"
fi
if grep -qi "retired as an engineering root" "$mdc"; then
  pass "the Cursor rule agrees with governance"
else
  fail "the Cursor rule does not state the retirement"
fi
if grep -q "alloy-root" "$claude_md" && grep -q "Alloy-Claude" "$claude_md"; then
  pass "CLAUDE.md names the canonical root and the retired one"
else
  fail "CLAUDE.md does not carry root discipline"
fi

printf '\nCanonical root results: PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
