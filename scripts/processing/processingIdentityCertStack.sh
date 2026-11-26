#!/usr/bin/env bash
# Isolated Supabase stack for Processing Identity local certification.
# Does NOT use ports 54321/54322 (reserved for unrelated local stacks).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROJECT_ID="alloy-processing-identity-cert"
declare -A PORTS=(
  [shadow]=55320
  [api]=55321
  [db]=55322
  [studio]=55323
  [inbucket]=55324
  [smtp]=55325
  [pop3]=55326
  [analytics]=55327
  [pooler]=55329
  [edge_inspector]=55432
)

cmd="${1:-status}"

check_ports() {
  local busy=0
  for name in "${!PORTS[@]}"; do
    local p="${PORTS[$name]}"
    if lsof -i ":$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "BUSY  $name=$p"
      busy=1
    else
      echo "FREE  $name=$p"
    fi
  done
  # Ensure we never touch the default stack ports
  for p in 54321 54322; do
    if lsof -i ":$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "NOTE  default stack listening on $p (left untouched)"
    fi
  done
  return "$busy"
}

case "$cmd" in
  ports)
    check_ports || true
    ;;
  start)
    cat >&2 <<'SUPERSEDED'
⛔ SUPERSEDED: this would start a SECOND Supabase stack (8-11 more containers).

That pattern put Docker at 35 containers across 4 stacks, and this stack's data
volume outlived everyone using it. Sessions now share one stack:

  alloy-stack use        # join the shared 'alloy-cert' stack
  alloy-stack status     # who else is using it
  alloy-stack release    # at sprint end

The shared stack already replays every migration and carries the synthetic
tenant, which is what this script was reaching for.

See docs/platform/governance/local-docker-containment.md
SUPERSEDED
    exit 1
    ;;
  reset)
    echo "Resetting isolated cert database (full migration replay)..."
    supabase db reset --no-seed
    ;;
  stop)
    echo "Stopping isolated cert stack..."
    supabase stop --project-id "$PROJECT_ID" || supabase stop
    ;;
  status)
    supabase status || true
    ;;
  *)
    echo "Usage: $0 {ports|start|reset|stop|status}"
    exit 1
    ;;
esac
