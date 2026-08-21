#!/usr/bin/env bash
# Install or update the Vacilando Gateway launchd agent.
# Dual bind: 127.0.0.1 + currently discovered Tailscale IPv4. Never 0.0.0.0.
# Uses $HOME — no MacBook hostname. Does not touch Electron on :3021.
#
# Install from the canonical Alloy checkout (ALLOY_REPO), not a sprint worktree.
# WorkingDirectory is this toolkit copy — that is the Gateway code host, not a
# Development Lane identity.
set -euo pipefail

HOME_DIR="${HOME:?}"
LABEL="com.alloy.vacilando-gateway"
PLIST="${HOME_DIR}/Library/LaunchAgents/${LABEL}.plist"
BIN_DIR="${HOME_DIR}/.local/bin"
WRAPPER="${BIN_DIR}/alloy-vacilando-gateway"
RUNTIME_ROOT="${VACILANDO_GATEWAY_ROOT:-${HOME_DIR}/.local/state/alloy-dev/gateway}"
LOG_DIR="${RUNTIME_ROOT}/logs"
HERE="$(cd "$(dirname "$0")" && pwd)"
HOST_JS="${HERE}/lib/vacilando-gateway-host.mjs"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
PORT="${VACILANDO_PORT:-3020}"

# ---------------------------------------------------------------------------
# Shared-host mutation guard. Two lanes each ran this installer and silently
# undid one another: one installed from the canonical toolkit, the other
# rewrote the plist back to a sprint worktree minutes later. Rewriting the
# plist and re-bootstrapping launchd is shared HOST state, so it is serialized
# by the ordinary resource governor (`gateway_host_mutation`, capacity 1).
#
# Fails closed: if another Execution Run holds it, this refuses rather than
# overwriting. An unowned host still installs normally, so operating the
# machine by hand is unaffected. VACILANDO_SKIP_HOST_MUTATION_GUARD=1 is an
# explicit operator override, never a default.
# ---------------------------------------------------------------------------
GUARD_JS="${HERE}/lib/vacilando/gateway-host-mutation.mjs"
if [ "${VACILANDO_SKIP_HOST_MUTATION_GUARD:-0}" != "1" ] && [ -f "$GUARD_JS" ]; then
  if ! "$NODE_BIN" "$GUARD_JS" check ${VACILANDO_RUN_ID:+--run "$VACILANDO_RUN_ID"}; then
    echo "install-vacilando-gateway: refusing to mutate shared Gateway host state." >&2
    echo "  Another Execution Run holds gateway_host_mutation. Wait for release." >&2
    exit 3
  fi
fi

mkdir -p "$BIN_DIR" "$LOG_DIR" "${HOME_DIR}/Library/LaunchAgents"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
exec "${NODE_BIN}" "${HOST_JS}" "\$@"
EOF
chmod 755 "$WRAPPER"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>${HERE}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${HOST_JS}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>${HOME_DIR}</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/Applications/Tailscale.app/Contents/MacOS:/usr/bin:/bin</string>
    <key>ALLOY_RUNTIME_ROOT</key><string>${RUNTIME_ROOT}</string>
    <key>VACILANDO_GATEWAY_REMOTE</key><string>1</string>
    <key>VACILANDO_REQUIRE_API_AUTH</key><string>1</string>
    <key>VACILANDO_BIND</key><string>127.0.0.1</string>
    <key>VACILANDO_PORT</key><string>${PORT}</string>
    <key>VACILANDO_NODE_NAME</key><string>${VACILANDO_NODE_NAME:-}</string>
  </dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/gateway.out.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/gateway.err.log</string>
  <key>ThrottleInterval</key><integer>10</integer>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed ${PLIST}"
echo "runtime ${RUNTIME_ROOT}"
echo "token file ${RUNTIME_ROOT}/vacilando/api-token (created on first start)"
echo "loopback http://127.0.0.1:${PORT}"
echo "remote  http://\$(tailscale ip -4):${PORT}  (auth required; dual-bind, not Serve)"
