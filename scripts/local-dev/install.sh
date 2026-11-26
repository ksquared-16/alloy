#!/usr/bin/env bash
# Install Alloy local-dev toolkit (Phase 1 + Phase 2 + Phase 3 + Phase 4) as one directory symlink.
# No sudo, no PATH mutation, never overwrites existing config.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

COMMANDS=(
  alloy-worktree-create
  alloy-worktree-adopt
  alloy-worktree-sync
  alloy-worktree-remove
  alloy-worktree-prune-merged
  alloy-dev-start
  alloy-dev-stop
  alloy-dev-status
  alloy-validate
  vac
  vac-run
  alloy-health
  alloy-audit
  alloy-clean
  alloy-agent-create
  alloy-agent-open
  alloy-agent-status
  alloy-agent-close
  alloy-agent-instructions
  alloy-ai-health
  alloy-agent-prepare
  alloy-agent-login
  alloy-agent-ready
  alloy-agent-verify
  alloy-agent-browser-stop
  alloy-agent-context
  alloy-agent-evidence
  alloy-engineering-help
  alloy-initiative-create
  alloy-initiative-import
  alloy-initiative-status
  alloy-initiative-audit
  alloy-initiative-plan
  alloy-initiative-approve
  alloy-initiative-start
  alloy-worker-package
  alloy-worker-open
  alloy-worker-status
  alloy-worker-report
  alloy-sprint-start
  alloy-worker-pause
  alloy-worker-resume
  alloy-worker-doctor
  alloy-docker-doctor
  alloy-engineering-doctor
  alloy-db-reset
  alloy-sprint-finish
  alloy-initiative-review
  alloy-initiative-remediate
  alloy-initiative-package
  alloy-initiative-close
  alloy-engineering-certify
  alloy-product-help
  alloy-product-create
  alloy-product-import
  alloy-product-status
  alloy-product-audit
  alloy-product-contract
  alloy-product-decisions
  alloy-product-decide
  alloy-product-approve
  alloy-product-package
  alloy-product-handoff
  alloy-product-close
  alloy-engineering-certify
  alloy-product-help
  alloy-product-create
  alloy-product-import
  alloy-product-status
  alloy-product-audit
  alloy-product-contract
  alloy-product-decisions
  alloy-product-decide
  alloy-product-approve
  alloy-product-package
  alloy-product-handoff
  alloy-product-close
  alloy-product-certify
  alloy-runtime-paths
  alloy-cert-leak-report
  alloy-cert-leak-clean
  alloy-ro
  alloy-runtime-register
)

alloy_looks_like_toolkit_install() {
  local path="$1"
  local cmd hits=0
  for cmd in "${COMMANDS[@]}"; do
    if [[ -e "${path}/${cmd}" || -L "${path}/${cmd}" ]]; then
      hits=$((hits + 1))
    fi
  done
  # Legacy incomplete install had per-command symlinks without lib/.
  # A current install is a directory symlink (or its resolved tree) with lib + commands.
  if [[ -e "${path}/lib/common.sh" || -L "${path}/lib/common.sh" ]]; then
    [[ "$hits" -ge 3 ]]
    return
  fi
  [[ "$hits" -ge 5 ]]
}

alloy_prepare_install_path() {
  local install_path="$1"
  local source_dir="$2"

  if [[ -L "$install_path" ]]; then
    local current
    current="$(readlink "$install_path" || true)"
    if [[ "$current" == "$source_dir" ]]; then
      return 0
    fi
    # Stale or prior symlink — replace only this path.
    rm -f "$install_path"
    return 0
  fi

  if [[ -d "$install_path" ]]; then
    if alloy_looks_like_toolkit_install "$install_path"; then
      # Incomplete per-command install directory from the original installer.
      rm -rf "$install_path"
      return 0
    fi
    cat >&2 <<EOF
error: refusing to replace '${install_path}'.

It is a real directory that does not look like an Alloy local-dev toolkit install
(expected alloy-* commands and/or lib/common.sh).

Move or rename that directory, then re-run install.sh.
EOF
    exit 1
  fi

  if [[ -e "$install_path" ]]; then
    alloy_die "refusing to replace unexpected non-directory path: ${install_path}"
  fi
}

main() {
  alloy_load_config

  local install_path="${ALLOY_BIN_DIR:-$HOME/bin/alloy-dev}"
  local parent_dir
  parent_dir="$(dirname "$install_path")"
  local config_dir="${ALLOY_CONFIG_DIR:-$HOME/.config/alloy-dev}"
  local config_file="${config_dir}/config"
  local example="${SCRIPT_DIR}/alloy-config.example"

  mkdir -p "$parent_dir" "$config_dir" \
    "${ALLOY_RUNTIME_ROOT}/metadata" \
    "${ALLOY_RUNTIME_ROOT}/pids" \
    "${ALLOY_RUNTIME_ROOT}/logs" \
    "${ALLOY_RUNTIME_ROOT}/locks"

  chmod +x "${SCRIPT_DIR}/install.sh" "${SCRIPT_DIR}/shell-aliases.sh" \
    "${SCRIPT_DIR}/lib/"*.sh "${SCRIPT_DIR}/tests/"*.sh 2>/dev/null || true
  local cmd
  for cmd in "${COMMANDS[@]}"; do
    chmod +x "${SCRIPT_DIR}/${cmd}"
  done

  alloy_prepare_install_path "$install_path" "$SCRIPT_DIR"
  ln -sfn "$SCRIPT_DIR" "$install_path"

  if [[ ! -e "${install_path}/lib/common.sh" || ! -e "${install_path}/lib/lock.sh" || ! -e "${install_path}/alloy-config.example" ]]; then
    alloy_die "installation incomplete: support files not resolvable under ${install_path}"
  fi

  if [[ -f "$config_file" ]]; then
    echo "Preserved existing config: $config_file"
  else
    cp "$example" "$config_file"
    echo "Created config from example: $config_file"
    echo "Edit ALLOY_REPO to point at your canonical checkout before creating worktrees."
  fi

  echo
  echo "Installed toolkit:"
  echo "${install_path} -> ${SCRIPT_DIR}"
  echo
  echo "Re-run this installer after switching toolkits or pulling updates."
  echo

  local path_line="export PATH=\"${install_path}:\$PATH\""
  if [[ ":$PATH:" == *":${install_path}:"* ]]; then
    echo "PATH already includes ${install_path}"
  else
    echo "PATH does not yet include ${install_path}."
    echo "Proposed shell line (not applied automatically):"
    echo
    echo "  ${path_line}"
    echo
    echo "Add it to ~/.zshrc yourself if desired."
  fi

  echo
  echo "Optional shell shortcuts:"
  echo "  source ${install_path}/shell-aliases.sh"
  echo "  # then: awt 1   /   devup   /   astatus   /   ahealth"
  echo
  echo "Next:"
  echo "  1) Edit ${config_file} (set ALLOY_REPO)"
  echo "  2) alloy-audit"
  echo "  3) alloy-health"
  echo "  4) alloy-agent-create <initiative>"
}

main "$@"
