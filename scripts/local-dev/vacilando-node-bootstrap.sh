#!/usr/bin/env bash
# Vacilando execution-node bootstrap (Mac mini / fresh host).
#
# Makes this machine an eligible Vacilando execution node. Does not schedule
# remote work, install Cursor, or extract Vacilando from Alloy.
#
# Secrets are placed on the host, never copied into source control or lanes.
set -euo pipefail

HOME_DIR="${HOME:?}"
REPO="${ALLOY_REPO:-$HOME/Alloy}"
WT_ROOT="${ALLOY_WORKTREE_ROOT:-$HOME/Code/alloy-worktrees}"
RUNTIME_ROOT="${ALLOY_RUNTIME_ROOT:-$HOME/.local/state/alloy-dev}"
GATEWAY_ROOT="${VACILANDO_GATEWAY_ROOT:-$RUNTIME_ROOT/gateway}"
CONFIG_DIR="${ALLOY_CONFIG_DIR:-$HOME/.config/alloy-dev}"
NODE_NAME="${VACILANDO_NODE_NAME:-$(scutil --get ComputerName 2>/dev/null || hostname | sed 's/\.local$//')}"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

log "== Vacilando node bootstrap =="
log "repo          $REPO"
log "worktrees     $WT_ROOT"
log "runtime       $RUNTIME_ROOT"
log "gateway       $GATEWAY_ROOT"
log "node name     $NODE_NAME"

need git
need node
need npm
need tmux
command -v brew >/dev/null 2>&1 || log "WARN: Homebrew not on PATH (install from https://brew.sh if packages are missing)"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ required (found $(node -v))"
fi
log "node          $(node -v)"
log "git           $(git --version)"
log "tmux          $(tmux -V)"

if [ ! -d "$REPO/.git" ]; then
  fail "ALLOY_REPO is not a git checkout: $REPO"
fi
if [ ! -d "$REPO/scripts/local-dev" ]; then
  fail "Alloy toolkit missing under $REPO/scripts/local-dev"
fi

mkdir -p "$WT_ROOT" "$RUNTIME_ROOT" "$GATEWAY_ROOT/vacilando" "$CONFIG_DIR" "$HOME/Library/LaunchAgents" "$HOME/.local/bin"

if [ ! -f "$CONFIG_DIR/config" ]; then
  sed -e "s#^ALLOY_REPO=.*#ALLOY_REPO=\"$REPO\"#" \
      -e "s#^ALLOY_WORKTREE_ROOT=.*#ALLOY_WORKTREE_ROOT=\"$WT_ROOT\"#" \
      -e "s#^ALLOY_RUNTIME_ROOT=.*#ALLOY_RUNTIME_ROOT=\"$RUNTIME_ROOT\"#" \
      "$HERE/alloy-config.example" > "$CONFIG_DIR/config"
  log "wrote $CONFIG_DIR/config"
else
  log "kept existing $CONFIG_DIR/config"
fi

if [ ! -d "$REPO/web/node_modules" ]; then
  log "Installing canonical web dependencies (worktree-local later; this is the repo checkout)..."
  (cd "$REPO/web" && npm install)
fi

log "Installing Alloy local-dev toolkit from $REPO..."
bash "$REPO/scripts/local-dev/install.sh"

if command -v docker >/dev/null 2>&1; then
  log "docker        $(docker --version)"
else
  log "WARN: Docker not installed — required only when this node runs the shared Alloy stack"
fi

if command -v tailscale >/dev/null 2>&1 || [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
  log "tailscale     present"
else
  log "WARN: Tailscale not installed — Gateway remote bind and HTTPS Serve need it"
fi

if command -v claude >/dev/null 2>&1; then
  log "claude        present"
else
  log "WARN: Claude Code CLI not on PATH — install before binding a Claude lane"
fi

if command -v gh >/dev/null 2>&1; then
  log "gh            $(gh --version | head -1)"
else
  log "WARN: GitHub CLI not installed — needed for trusted-host GitHub actions"
fi

export ALLOY_RUNTIME_ROOT="$GATEWAY_ROOT"
export VACILANDO_GATEWAY_ROOT="$GATEWAY_ROOT"
export VACILANDO_NODE_NAME="$NODE_NAME"
export VACILANDO_DURABLE_LANES="${VACILANDO_DURABLE_LANES:-1}"

log "Ensuring execution node identity..."
node "$HERE/alloy-vacilando" node --name "$NODE_NAME"

log "Ensuring Vacilando specialist lane (does not bind a worktree)..."
node "$HERE/alloy-vacilando" ensure-lane vacilando

if [ "${VACILANDO_INSTALL_GATEWAY:-1}" = "1" ]; then
  # The Gateway must come from the VERSIONED TOOLKIT INSTALLATION, not from
  # "$REPO/scripts/local-dev". The canonical WORKING TREE is not guaranteed to
  # be current: on the MacBook it sat 512 commits behind origin/staging and did
  # not contain the Gateway host at all, so installing from it would either
  # fail outright or pin launchd to stale code. alloy-toolkit reads the git
  # object store, so it is correct even when the working tree is behind.
  TOOLKIT_CURRENT="${ALLOY_TOOLKIT_ROOT:-$HOME/.local/share/alloy/toolkit}/current"

  if command -v alloy-toolkit >/dev/null 2>&1; then
    log "Installing canonical toolkit from ${ALLOY_TOOLKIT_REF:-origin/staging}..."
    ALLOY_REPO="$REPO" alloy-toolkit install "${ALLOY_TOOLKIT_REF:-origin/staging}"
  else
    log "WARN: alloy-toolkit not on PATH — cannot refresh the canonical toolkit installation"
  fi

  GATEWAY_INSTALLER="$TOOLKIT_CURRENT/install-vacilando-gateway.sh"
  [ -f "$GATEWAY_INSTALLER" ] || fail "Gateway installer missing at $GATEWAY_INSTALLER — run: alloy-toolkit install origin/staging"

  case "$(cd "$(dirname "$GATEWAY_INSTALLER")" && pwd -P)" in
    *"/alloy-worktrees/"*)
      fail "refusing to install the Gateway from a sprint worktree: $GATEWAY_INSTALLER" ;;
  esac

  log "Installing Gateway launchd from $GATEWAY_INSTALLER ..."
  VACILANDO_NODE_NAME="$NODE_NAME" NODE_BIN="${NODE_BIN:-$(command -v node)}" \
    bash "$GATEWAY_INSTALLER"
fi

log ""
log "Bootstrap complete. Next (operator, not this script):"
log "  1. Place secrets: $REPO/web/.env.local and Gateway api-token (created on first start)"
log "  2. Do NOT copy trusted-secrets from another machine into git"
log "  3. Restore durable Vacilando state if migrating:"
log "       alloy-vacilando restore --from <backup> --to $GATEWAY_ROOT"
log "  4. Rebind specialist lanes to worktrees on THIS node"
log "  5. alloy-stack use   # join the shared local Docker stack; never supabase start"
log "  6. Verify: curl -sS http://127.0.0.1:3020/api/node"
log ""
log "Trusted-host GitHub/database actions remain bound to ALLOY_REPO=$REPO"
