#!/usr/bin/env bash
# Install Alloy local-dev Phase 1 command wrappers.
# No sudo, no cleanup, no git changes. Never overwrites existing config.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

COMMANDS=(
  alloy-worktree-create
  alloy-worktree-sync
  alloy-worktree-remove
  alloy-dev-start
  alloy-dev-stop
  alloy-dev-status
  alloy-validate
  alloy-health
  alloy-audit
  alloy-clean
)

main() {
  alloy_load_config

  local bin_dir="${ALLOY_BIN_DIR:-$HOME/bin/alloy-dev}"
  local config_dir="${ALLOY_CONFIG_DIR:-$HOME/.config/alloy-dev}"
  local config_file="${config_dir}/config"
  local example="${SCRIPT_DIR}/alloy-config.example"

  mkdir -p "$bin_dir" "$config_dir" \
    "${ALLOY_RUNTIME_ROOT}/metadata" \
    "${ALLOY_RUNTIME_ROOT}/pids" \
    "${ALLOY_RUNTIME_ROOT}/logs" \
    "${ALLOY_RUNTIME_ROOT}/locks"

  chmod +x "${SCRIPT_DIR}/install.sh" "${SCRIPT_DIR}/lib/"*.sh
  local cmd
  for cmd in "${COMMANDS[@]}"; do
    chmod +x "${SCRIPT_DIR}/${cmd}"
    ln -sfn "${SCRIPT_DIR}/${cmd}" "${bin_dir}/${cmd}"
  done

  if [[ -f "$config_file" ]]; then
    echo "Preserved existing config: $config_file"
  else
    cp "$example" "$config_file"
    echo "Created config from example: $config_file"
    echo "Edit ALLOY_REPO to point at your canonical checkout before creating worktrees."
  fi

  echo
  echo "Installed command symlinks in: $bin_dir"
  echo "Source scripts remain in:      $SCRIPT_DIR"
  echo "Re-run this installer after pulling toolkit updates."
  echo

  local path_line="export PATH=\"${bin_dir}:\$PATH\""
  if [[ ":$PATH:" == *":${bin_dir}:"* ]]; then
    echo "PATH already includes ${bin_dir}"
  else
    echo "PATH does not yet include ${bin_dir}."
    echo "Proposed shell line (not applied automatically):"
    echo
    echo "  ${path_line}"
    echo
    echo "Add it to ~/.zshrc yourself if desired."
  fi

  echo
  echo "Next:"
  echo "  1) Edit ${config_file} (set ALLOY_REPO)"
  echo "  2) alloy-audit"
  echo "  3) alloy-health"
}

main "$@"
