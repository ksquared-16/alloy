#!/usr/bin/env bash
# =============================================================================
# git-durability — a sprint is not finished until its work survives this machine.
#
# 880 commits across 79 branches existed only on this laptop, including five of
# six active slots. `alloy-sprint-finish` happily archived a slot whose branch
# had never been pushed, so "finished" meant "the metadata was tidied", not "the
# work is safe". A disk failure would have taken all of it.
#
# These gates are FAIL-CLOSED. A machine-only branch is never a finished sprint.
# shellcheck shell=bash
# =============================================================================

# Thresholds. Integration debt compounds silently, so it is surfaced at start —
# before implementation is layered on top of a stale base — not at finish.
ALLOY_BEHIND_WARN="${ALLOY_BEHIND_WARN:-50}"
ALLOY_BEHIND_BLOCK="${ALLOY_BEHIND_BLOCK:-100}"

alloy_git_base_ref() { printf '%s\n' "${ALLOY_BASE_REF:-origin/staging}"; }

# --- individual assertions -------------------------------------------------
# Each prints a KEY=value evidence line and returns non-zero on violation, so
# callers can aggregate and report every failure rather than only the first.

alloy_durability_clean_tree() {
  local path="$1" n
  n="$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  printf 'DURABILITY_DIRTY_FILES=%s\n' "$n"
  [[ "$n" == "0" ]]
}

alloy_durability_tracking_branch() {
  local path="$1" up
  up="$(git -C "$path" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  printf 'DURABILITY_UPSTREAM=%s\n' "${up:-none}"
  [[ -n "$up" ]]
}

# The core check: does the remote actually have this exact commit?
alloy_durability_head_pushed() {
  local path="$1" br local_sha remote_sha
  br="$(git -C "$path" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  local_sha="$(git -C "$path" rev-parse HEAD 2>/dev/null)"
  remote_sha="$(git -C "$path" ls-remote origin "$br" 2>/dev/null | cut -f1)"
  printf 'DURABILITY_BRANCH=%s\n' "$br"
  printf 'DURABILITY_LOCAL_HEAD=%s\n' "$local_sha"
  printf 'DURABILITY_REMOTE_HEAD=%s\n' "${remote_sha:-none}"
  local unpushed
  unpushed="$(git -C "$path" rev-list --count "origin/${br}..HEAD" 2>/dev/null || echo unknown)"
  printf 'DURABILITY_UNPUSHED_COMMITS=%s\n' "$unpushed"
  [[ -n "$remote_sha" && "$remote_sha" == "$local_sha" ]]
}

alloy_durability_integration_state() {
  local path="$1" base ahead behind mb
  base="$(alloy_git_base_ref)"
  ahead="$(git -C "$path" rev-list --count "${base}..HEAD" 2>/dev/null || echo 0)"
  behind="$(git -C "$path" rev-list --count "HEAD..${base}" 2>/dev/null || echo 0)"
  mb="$(git -C "$path" merge-base "$base" HEAD 2>/dev/null || echo unknown)"
  printf 'DURABILITY_BASE_REF=%s\n' "$base"
  printf 'DURABILITY_AHEAD=%s\n' "$ahead"
  printf 'DURABILITY_BEHIND=%s\n' "$behind"
  printf 'DURABILITY_MERGE_BASE=%s\n' "$mb"
  return 0
}

alloy_durability_no_owned_processes() {
  local name="$1" pid_file provider_file n=0
  pid_file="$(alloy_pid_path "$name" 2>/dev/null || echo)"
  provider_file="$(alloy_provider_pid_path "$name" 2>/dev/null || echo)"
  local f pid
  for f in "$pid_file" "$provider_file"; do
    [[ -n "$f" && -f "$f" ]] || continue
    pid="$(tr -d '[:space:]' <"$f" 2>/dev/null)"
    [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && n=$((n + 1))
  done
  printf 'DURABILITY_OWNED_PROCESSES=%s\n' "$n"
  [[ "$n" == "0" ]]
}

alloy_durability_stack_lease_released() {
  local name="$1" cmd lease
  if ! cmd="$(alloy_stack_cmd 2>/dev/null)"; then
    printf 'DURABILITY_STACK_LEASE=unknown(alloy-stack missing)\n'
    return 0
  fi
  lease="${ALLOY_STACK_STATE_DIR:-$HOME/.local/state/alloy/stack}/leases/${name}.lease"
  if [[ -f "$lease" ]]; then
    printf 'DURABILITY_STACK_LEASE=held\n'
    return 1
  fi
  printf 'DURABILITY_STACK_LEASE=released\n'
  return 0
}

# The toolkit must never resolve through a worker worktree — deleting a slot
# would otherwise break every alloy-* command on the machine.
alloy_durability_toolkit_not_in_worktree() {
  local link="${ALLOY_TOOLKIT_LINK:-$HOME/bin/alloy-dev}"
  local wt_root="${ALLOY_WORKTREE_ROOT:-$HOME/Code/alloy-worktrees}"
  # Normalise BOTH sides before comparing. readlink -f resolves /var to
  # /private/var on macOS, so an unresolved worktree root would never match a
  # resolved target and the check would silently pass.
  wt_root="$(readlink -f "$wt_root" 2>/dev/null || printf '%s' "$wt_root")"
  local target
  target="$(readlink -f "$link" 2>/dev/null || echo "")"
  printf 'DURABILITY_TOOLKIT_TARGET=%s\n' "${target:-none}"
  if [[ -z "$target" ]]; then
    printf 'DURABILITY_TOOLKIT=missing\n'; return 1
  fi
  if [[ "$target" == "$wt_root"/* || "$target" == *"/.claude/worktrees/"* ]]; then
    printf 'DURABILITY_TOOLKIT=RESOLVES_THROUGH_WORKTREE\n'; return 1
  fi
  # Any command inside it escaping counts too.
  local f t
  for f in "$link"/*; do
    [[ -L "$f" ]] || continue
    t="$(readlink -f "$f" 2>/dev/null || echo "")"
    if [[ "$t" == "$wt_root"/* || "$t" == *"/.claude/worktrees/"* ]]; then
      printf 'DURABILITY_TOOLKIT=COMMAND_ESCAPES:%s\n' "$(basename "$f")"; return 1
    fi
  done
  printf 'DURABILITY_TOOLKIT=durable\n'
  return 0
}

# --- composite gates -------------------------------------------------------

# FINISH gate. Fails closed; a machine-only branch is never a finished sprint.
alloy_assert_sprint_finishable() {
  local name="$1" path="$2"
  local -a failures=()
  local out

  out="$(alloy_durability_clean_tree "$path")" || failures+=("uncommitted changes in the working tree")
  printf '%s\n' "$out"
  out="$(alloy_durability_tracking_branch "$path")" || failures+=("branch has no upstream tracking branch")
  printf '%s\n' "$out"
  out="$(alloy_durability_head_pushed "$path")" || failures+=("HEAD is not on origin — commits exist only on this machine")
  printf '%s\n' "$out"
  alloy_durability_integration_state "$path"
  out="$(alloy_durability_no_owned_processes "$name")" || failures+=("managed processes are still running")
  printf '%s\n' "$out"
  out="$(alloy_durability_stack_lease_released "$name")" || failures+=("Docker stack lease is still held")
  printf '%s\n' "$out"
  out="$(alloy_durability_toolkit_not_in_worktree)" || failures+=("toolkit resolves through a worker worktree")
  printf '%s\n' "$out"

  if [[ ${#failures[@]} -eq 0 ]]; then
    printf 'DURABILITY_VERDICT=pass\n'
    return 0
  fi

  printf 'DURABILITY_VERDICT=fail\n'
  {
    printf '\nSprint finish BLOCKED — the work is not durable yet:\n\n'
    local f
    for f in "${failures[@]}"; do printf '  ✗ %s\n' "$f"; done
    printf '\nA branch that exists only on this machine is not a finished sprint.\n'
    printf 'Remediate:\n'
    printf '  git -C %s status            # commit anything outstanding\n' "$path"
    printf '  git -C %s push -u origin %s\n' "$path" "$(git -C "$path" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    printf '  alloy-stack release %s\n' "$name"
    printf '  alloy-toolkit install origin/staging   # if the toolkit check failed\n'
  } >&2
  return 1
}

# START gate. Integration debt is surfaced before new work is layered on a
# stale base, because that is when it is still cheap to reconcile.
alloy_assert_integration_debt_acceptable() {
  local path="$1" name="${2:-}"
  local base behind
  base="$(alloy_git_base_ref)"
  behind="$(git -C "$path" rev-list --count "HEAD..${base}" 2>/dev/null || echo 0)"
  printf 'INTEGRATION_BEHIND=%s\n' "$behind"
  printf 'INTEGRATION_BASE=%s\n' "$base"

  if (( behind >= ALLOY_BEHIND_BLOCK )); then
    local decision="${ALLOY_RUNTIME_ROOT}/reconciliation/${name}.decision"
    if [[ -n "$name" && -f "$decision" ]]; then
      printf 'INTEGRATION_STATE=blocked-but-reconciliation-recorded\n'
      alloy_warn "${behind} commits behind ${base} — proceeding on the recorded decision: ${decision}"
      return 0
    fi
    printf 'INTEGRATION_STATE=blocked\n'
    {
      printf '\nSprint execution BLOCKED — %s commits behind %s.\n\n' "$behind" "$base"
      printf 'Past %s commits, new implementation on this base is likely to be\n' "$ALLOY_BEHIND_BLOCK"
      printf 'rework: the surfaces it targets may already have moved.\n\n'
      printf 'Record an explicit reconciliation decision to proceed:\n'
      printf '  mkdir -p %s/reconciliation\n' "${ALLOY_RUNTIME_ROOT}"
      printf '  $EDITOR %s/reconciliation/%s.decision\n' "${ALLOY_RUNTIME_ROOT}" "${name:-<worktree>}"
      printf '\nThe file should state: rebase, cherry-pick slices, or accept the drift, and why.\n'
    } >&2
    return 1
  fi

  if (( behind >= ALLOY_BEHIND_WARN )); then
    printf 'INTEGRATION_STATE=warn\n'
    alloy_warn "${behind} commits behind ${base} — reconcile before substantial new implementation"
    return 0
  fi

  printf 'INTEGRATION_STATE=ok\n'
  return 0
}
