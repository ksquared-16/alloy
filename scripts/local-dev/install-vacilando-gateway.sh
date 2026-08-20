#!/usr/bin/env bash
# Install or update the Vacilando Gateway launchd agent.
# Dual bind: 127.0.0.1 + currently discovered Tailscale IPv4. Never 0.0.0.0.
# Uses $HOME — no MacBook hostname. Does not touch Electron on :3021.
set -euo pipefail

HOME_DIR="${HOME:?}"
LABEL="com.alloy.vacilando-gateway"
PLIST="${HOME_DIR}/Library/LaunchAgents/${LABEL}.plist"
BIN_DIR="${HOME_DIR}/.local/bin"
WRAPPER="${BIN_DIR}/alloy-vacilando-gateway"
RUNTIME_ROOT="${HOME_DIR}/.local/state/alloy-dev/gateway"
LOG_DIR="${RUNTIME_ROOT}/logs"
HERE="$(cd "$(dirname "$0")" && pwd)"
HOST_JS="${HERE}/lib/vacilando-gateway-host.mjs"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
PORT="${VACILANDO_PORT:-3020}"

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
