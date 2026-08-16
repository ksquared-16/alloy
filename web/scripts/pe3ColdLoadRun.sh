#!/usr/bin/env bash
# PE-3 cold-run driver. Restarts the prod server so each run is a genuinely fresh process,
# measures spawn -> port-listening (TCP only; no HTTP request, so route modules stay unloaded),
# then hands off to the browser harness which issues the FIRST http request of the process.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/Users/Kelly/.nvm/versions/node/v22.21.1/bin:$PATH"

MODE="${1:-cold}"; VARIANT="${2:-deeplink}"; LABEL="${3:-${MODE}-${VARIANT}}"

# Slot-pinned by env (was hardcoded to 3013 — see pe3ColdLoadHarness.mjs).
PE3_SLOT="${PE3_SLOT:-5}"
PE3_PORT="${PE3_PORT:-$((3010 + PE3_SLOT))}"
export PE3_SLOT PE3_PORT
LOG=/tmp/pe3/server-$LABEL.log
mkdir -p /tmp/pe3

if [ "$MODE" = "cold" ]; then
  lsof -ti tcp:"$PE3_PORT" | xargs kill -9 2>/dev/null
  for i in $(seq 1 40); do lsof -ti tcp:"$PE3_PORT" >/dev/null 2>&1 || break; sleep 0.25; done
  if lsof -ti tcp:"$PE3_PORT" >/dev/null 2>&1; then echo "FATAL: port $PE3_PORT still held"; exit 1; fi

  set -a; . ./.env.local.agent; . /Users/Kelly/Alloy/web/.env.local; set +a
  SPAWN_MS=$(node -e 'console.log(Date.now())')
  PORT="$PE3_PORT" ./node_modules/.bin/next start -p "$PE3_PORT" >"$LOG" 2>&1 &
  SRV=$!
  # wait for the port to ACCEPT (TCP only — issuing HTTP here would pre-warm the route)
  LISTEN_MS=""
  for i in $(seq 1 400); do
    if node -e 'const n=require("net");const s=n.connect(Number(process.env.PE3_PORT),"127.0.0.1");s.on("connect",()=>{s.destroy();process.exit(0)});s.on("error",()=>process.exit(1));' 2>/dev/null; then
      LISTEN_MS=$(node -e 'console.log(Date.now())'); break
    fi
    sleep 0.1
  done
  if [ -z "$LISTEN_MS" ]; then echo "FATAL: server never listened"; cat "$LOG"; exit 1; fi
  echo "{\"label\":\"$LABEL\",\"spawn_to_listen_ms\":$((LISTEN_MS-SPAWN_MS)),\"pid\":$SRV}" > /tmp/pe3/startup-$LABEL.json
  echo "server up: spawn->listen $((LISTEN_MS-SPAWN_MS))ms (pid $SRV)"
fi

# resource pressure snapshot
{ echo "--- vm_stat ---"; vm_stat | head -8; echo "--- load ---"; uptime; } > /tmp/pe3/pressure-$LABEL.txt 2>&1

node scripts/pe3ColdLoadHarness.mjs "$MODE" "$VARIANT" "$LABEL"
