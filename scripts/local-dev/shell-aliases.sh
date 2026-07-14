#!/usr/bin/env bash
# Optional shell helpers for Alloy Phase 2 local-dev.
#
# Install (once) in ~/.zshrc:
#   source "$HOME/bin/alloy-dev/shell-aliases.sh"
# or, from a checkout:
#   source /path/to/Alloy/scripts/local-dev/shell-aliases.sh
#
# Commands:
#   awt <slot>              cd into the managed worktree for that permanent slot
#   awt <worktree-name>     cd into a managed worktree by name
#   devup [--]              start owned server for current worktree (or awt target)
#   astatus                 alloy-agent-status
#   ahealth                 alloy-ai-health

# Resolve toolkit root for callers that sourced this file.
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  _ALLOY_ALIAS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  _ALLOY_ALIAS_ROOT="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  _ALLOY_ALIAS_ROOT="${HOME}/bin/alloy-dev"
fi

_alloy_alias_config() {
  if [[ -n "${ALLOY_CONFIG_FILE:-}" ]]; then
    printf '%s' "$ALLOY_CONFIG_FILE"
    return
  fi
  printf '%s' "${HOME}/.config/alloy-dev/config"
}

# awt 1  → cd slot 1 worktree
# awt wt3-queue-perf → cd that worktree
awt() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    echo "usage: awt <slot|worktree-name>" >&2
    return 2
  fi

  local path
  path="$(
    ALLOY_CONFIG_FILE="$(_alloy_alias_config)" \
      "$_ALLOY_ALIAS_ROOT/alloy-agent-status" "$target" 2>/dev/null \
      | awk -F': ' '/^  path:/{print $2; exit}'
  )"

  if [[ -z "$path" || ! -d "$path" ]]; then
    # Fallback: resolve via metadata helpers without printing full status noise.
    path="$(
      # shellcheck disable=SC1091
      source "$_ALLOY_ALIAS_ROOT/lib/common.sh"
      # shellcheck disable=SC1091
      source "$_ALLOY_ALIAS_ROOT/lib/agent.sh"
      alloy_load_config
      name="$(alloy_resolve_worktree_name "$target")"
      alloy_load_metadata "$name"
      printf '%s' "$ALLOY_WORKTREE_PATH"
    )"
  fi

  if [[ -z "$path" || ! -d "$path" ]]; then
    echo "error: could not resolve worktree for '$target'" >&2
    return 1
  fi

  cd "$path" || return 1
  echo "cwd → $path (slot/target: $target)"
}

# Start the owned Next server for the current managed worktree.
devup() {
  local cfg name meta path
  cfg="$(_alloy_alias_config)"

  # Prefer metadata whose path matches $PWD.
  name="$(
    # shellcheck disable=SC1091
    source "$_ALLOY_ALIAS_ROOT/lib/common.sh"
    alloy_load_config
    alloy_ensure_runtime_dirs
    pwd_now="$(pwd -P)"
    while IFS= read -r candidate; do
      [[ -n "$candidate" ]] || continue
      # shellcheck disable=SC1090
      source "$(alloy_metadata_path "$candidate")"
      meta_path="$(cd "${ALLOY_WORKTREE_PATH}" 2>/dev/null && pwd -P || true)"
      if [[ "$meta_path" == "$pwd_now" || "$pwd_now" == "$meta_path"/* ]]; then
        printf '%s' "$candidate"
        exit 0
      fi
    done < <(alloy_list_metadata_names)
    exit 1
  )" || true

  if [[ -z "${name:-}" ]]; then
    echo "error: current directory is not inside a managed Alloy worktree" >&2
    echo "hint: awt <slot> && devup" >&2
    return 1
  fi

  ALLOY_CONFIG_FILE="$cfg" "$_ALLOY_ALIAS_ROOT/alloy-dev-start" "$name"
}

astatus() {
  ALLOY_CONFIG_FILE="$(_alloy_alias_config)" "$_ALLOY_ALIAS_ROOT/alloy-agent-status" "$@"
}

ahealth() {
  ALLOY_CONFIG_FILE="$(_alloy_alias_config)" "$_ALLOY_ALIAS_ROOT/alloy-ai-health" "$@"
}
