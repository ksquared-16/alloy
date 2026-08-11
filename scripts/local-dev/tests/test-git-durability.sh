#!/usr/bin/env bash
# =============================================================================
# test-git-durability — gates for the "finished sprint that never left the
# machine" failure. Every positive assertion is paired with a NEGATIVE CONTROL
# that plants the fault and proves the gate fires, so a green run cannot be
# vacuous.
#
# Uses throwaway local repos with a bare "origin"; touches no real worktree.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0

# Minimal stubs for the toolkit helpers the library calls.
alloy_warn() { printf 'warn: %s\n' "$*" >&2; }
alloy_pid_path() { printf '%s/%s.pid\n' "${STUB_PIDS:-/nonexistent}" "$1"; }
alloy_provider_pid_path() { printf '%s/%s.provider.pid\n' "${STUB_PIDS:-/nonexistent}" "$1"; }
alloy_stack_cmd() { [[ -n "${STUB_STACK_CMD:-}" ]] && printf '%s\n' "$STUB_STACK_CMD" || return 1; }
ALLOY_RUNTIME_ROOT="$(mktemp -d)"

# shellcheck source=../lib/git-durability.sh
source "${SCRIPT_DIR}/lib/git-durability.sh"

t() { # t <desc> <expected pass|fail> <command...>
  local desc="$1" want="$2"; shift 2
  local got
  if "$@" >/dev/null 2>&1; then got=pass; else got=fail; fi
  if [[ "$got" == "$want" ]]; then
    PASS=$((PASS+1)); printf '  ✓ %s\n' "$desc"
  else
    FAIL=$((FAIL+1)); printf '  ✗ %s (got=%s want=%s)\n' "$desc" "$got" "$want"
  fi
}

mkrepo() { # mkrepo -> echoes path to a repo with an origin and one pushed commit
  local root; root="$(mktemp -d)"
  git init -q --bare "${root}/origin.git"
  git clone -q "${root}/origin.git" "${root}/work" 2>/dev/null
  git -C "${root}/work" config user.email t@t.invalid
  git -C "${root}/work" config user.name Test
  echo one > "${root}/work/f.txt"
  git -C "${root}/work" add -A && git -C "${root}/work" commit -qm "c1"
  git -C "${root}/work" branch -M main
  git -C "${root}/work" push -q -u origin main 2>/dev/null
  printf '%s\n' "${root}/work"
}

echo "git durability gates"
echo "===================="

# ---------------------------------------------------------------- clean tree
echo "clean tree"
R="$(mkrepo)"
t "clean tree passes"                       pass alloy_durability_clean_tree "$R"
echo dirty > "$R/untracked.txt"
t "NEGATIVE: untracked file fails"          fail alloy_durability_clean_tree "$R"
rm -f "$R/untracked.txt"
echo mutated > "$R/f.txt"
t "NEGATIVE: modified file fails"           fail alloy_durability_clean_tree "$R"
git -C "$R" checkout -q -- f.txt

# ---------------------------------------------------------------- upstream
echo "tracking branch"
t "branch with upstream passes"             pass alloy_durability_tracking_branch "$R"
git -C "$R" checkout -q -b orphan-branch
t "NEGATIVE: branch without upstream fails" fail alloy_durability_tracking_branch "$R"
git -C "$R" checkout -q main

# ---------------------------------------------------------------- pushed HEAD
echo "HEAD pushed to origin"
t "pushed HEAD passes"                      pass alloy_durability_head_pushed "$R"
echo two >> "$R/f.txt"
git -C "$R" commit -qam "local-only commit"
t "NEGATIVE: local-only commit fails"       fail alloy_durability_head_pushed "$R"
UNPUSHED="$(alloy_durability_head_pushed "$R" | sed -n 's/^DURABILITY_UNPUSHED_COMMITS=//p')"
[[ "$UNPUSHED" == "1" ]] && { PASS=$((PASS+1)); echo "  ✓ reports exactly 1 unpushed commit"; } \
                         || { FAIL=$((FAIL+1)); echo "  ✗ unpushed count wrong: $UNPUSHED"; }
git -C "$R" push -q origin main
t "passes again once pushed"                pass alloy_durability_head_pushed "$R"

# ---------------------------------------------------------------- containment
echo "HEAD contained in base"
# Simulate origin/staging as the base: tip of main is the base, feature is merged.
export ALLOY_BASE_REF=origin/main
t "pushed main is contained in origin/main" pass alloy_durability_head_contained_in_base "$R"
git -C "$R" checkout -q -b feature-not-merged
echo ahead >> "$R/f.txt"
git -C "$R" commit -qam "not on base"
t "NEGATIVE: unmerged feature fails containment" fail alloy_durability_head_contained_in_base "$R"
# Merge into main on origin → containment passes even without pushing the feature branch
git -C "$R" checkout -q main
git -C "$R" merge -q --no-ff feature-not-merged -m "merge feature"
git -C "$R" push -q origin main
git -C "$R" checkout -q feature-not-merged
t "feature contained after merge to base"   pass alloy_durability_head_contained_in_base "$R"
# Finishable via containment without tracking the feature branch on origin
git -C "$R" branch --unset-upstream 2>/dev/null || true
# Stub the rest of finishable deps
export ALLOY_TOOLKIT_LINK="$(mktemp -d)/alloy-dev"
mkdir -p "$ALLOY_TOOLKIT_LINK"
ln -sf /bin/true "$ALLOY_TOOLKIT_LINK/alloy-true"
# toolkit check needs a durable link not under worktree root — point at tmp
# shellcheck disable=SC2034
t "finishable via containment without remote feature branch" pass alloy_assert_sprint_finishable wt-contain "$R" || true
# The toolkit-not-in-worktree check may fail in the test sandbox; containment itself is the gate under test.
git -C "$R" checkout -q main
unset ALLOY_BASE_REF

# ---------------------------------------------------------------- processes
echo "owned processes"
STUB_PIDS="$(mktemp -d)"
t "no pid files passes"                     pass alloy_durability_no_owned_processes wt-x
sleep 300 & LIVE=$!
echo "$LIVE" > "${STUB_PIDS}/wt-x.pid"
t "NEGATIVE: live managed process fails"    fail alloy_durability_no_owned_processes wt-x
kill "$LIVE" 2>/dev/null; wait "$LIVE" 2>/dev/null
t "dead pid is not counted as owned"        pass alloy_durability_no_owned_processes wt-x

# ---------------------------------------------------------------- stack lease
echo "docker stack lease"
export ALLOY_STACK_STATE_DIR="$(mktemp -d)"; mkdir -p "$ALLOY_STACK_STATE_DIR/leases"
STUB_STACK_CMD="/bin/echo"
t "no lease held passes"                    pass alloy_durability_stack_lease_released wt-y
echo "HOLDER=wt-y" > "${ALLOY_STACK_STATE_DIR}/leases/wt-y.lease"
t "NEGATIVE: held lease fails"              fail alloy_durability_stack_lease_released wt-y
rm -f "${ALLOY_STACK_STATE_DIR}/leases/wt-y.lease"

# ---------------------------------------------------------------- toolkit
echo "toolkit ownership"
FAKE_WT_ROOT="$(mktemp -d)"; FAKE_DURABLE="$(mktemp -d)"
mkdir -p "${FAKE_WT_ROOT}/wt9/scripts/local-dev"
export ALLOY_WORKTREE_ROOT="$FAKE_WT_ROOT"
export ALLOY_TOOLKIT_LINK="$(mktemp -d)/alloy-dev"
ln -sfn "$FAKE_DURABLE" "$ALLOY_TOOLKIT_LINK"
t "durable toolkit passes"                  pass alloy_durability_toolkit_not_in_worktree
ln -sfn "${FAKE_WT_ROOT}/wt9/scripts/local-dev" "$ALLOY_TOOLKIT_LINK"
t "NEGATIVE: toolkit inside a worktree fails" fail alloy_durability_toolkit_not_in_worktree
ln -sfn "$FAKE_DURABLE" "$ALLOY_TOOLKIT_LINK"
touch "${FAKE_WT_ROOT}/wt9/scripts/local-dev/alloy-thing"
ln -sf "${FAKE_WT_ROOT}/wt9/scripts/local-dev/alloy-thing" "${FAKE_DURABLE}/alloy-thing"
t "NEGATIVE: single command escaping fails" fail alloy_durability_toolkit_not_in_worktree
rm -f "${FAKE_DURABLE}/alloy-thing"

# ---------------------------------------------------------------- debt gates
echo "integration debt thresholds"
D="$(mkrepo)"
git -C "$D" checkout -q -b feature
for i in $(seq 1 3); do echo "s$i" >> "$D/f.txt"; git -C "$D" commit -qam "s$i"; done
git -C "$D" checkout -q main
for i in $(seq 1 60); do echo "m$i" > "$D/m$i.txt"; git -C "$D" add -A; git -C "$D" commit -qm "m$i"; done
git -C "$D" push -q origin main
git -C "$D" checkout -q feature
export ALLOY_BASE_REF="origin/main"
t "60 behind: warns but does not block"     pass alloy_assert_integration_debt_acceptable "$D" wt-debt
STATE="$(alloy_assert_integration_debt_acceptable "$D" wt-debt | sed -n 's/^INTEGRATION_STATE=//p')"
[[ "$STATE" == "warn" ]] && { PASS=$((PASS+1)); echo "  ✓ classified as warn at 60 behind"; } \
                         || { FAIL=$((FAIL+1)); echo "  ✗ expected warn, got $STATE"; }
git -C "$D" checkout -q main
for i in $(seq 61 110); do echo "m$i" > "$D/m$i.txt"; git -C "$D" add -A; git -C "$D" commit -qm "m$i"; done
git -C "$D" push -q origin main
git -C "$D" checkout -q feature
t "NEGATIVE: 110 behind blocks"             fail alloy_assert_integration_debt_acceptable "$D" wt-debt
mkdir -p "${ALLOY_RUNTIME_ROOT}/reconciliation"
echo "decision: cherry-pick slices" > "${ALLOY_RUNTIME_ROOT}/reconciliation/wt-debt.decision"
t "recorded reconciliation decision unblocks" pass alloy_assert_integration_debt_acceptable "$D" wt-debt

echo
echo "passed=$PASS failed=$FAIL"
[[ "$FAIL" -eq 0 ]]
