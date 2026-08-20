#!/usr/bin/env node
/**
 * Vacilando Gateway host — loopback server with isolated runtime root + API auth.
 *
 * Electron on :3021 keeps the default ALLOY_RUNTIME_ROOT. This process uses
 * $HOME/.local/state/alloy-dev/gateway so ownership files cannot collide.
 * Loopback plus current Tailscale IPv4 (discovered at bind time, retried).
 * Never bind 0.0.0.0. Never hardcode a CGNAT address.
 *
 * Exit 78 from the server child is a Director capability refresh: respawn
 * the server only. Missions, lanes, Claude sessions, and governed requests
 * stay on disk.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "vacilando-server.mjs");
const HOME = process.env.HOME || homedir();
const runtimeRoot = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(HOME, ".local", "state", "alloy-dev", "gateway");
const port = process.env.VACILANDO_PORT?.trim() || "3020";
const DIRECTOR_REFRESH_EXIT = 78;

const env = {
  ...process.env,
  ALLOY_RUNTIME_ROOT: runtimeRoot,
  VACILANDO_GATEWAY_REMOTE: "1",
  VACILANDO_REQUIRE_API_AUTH: "1",
  VACILANDO_BIND: "127.0.0.1",
  VACILANDO_PORT: port,
  VACILANDO_GATEWAY_HOST: "1",
};
delete env.VACILANDO_COOKIE_SECURE;

let child = null;
let shuttingDown = false;

function spawnServer() {
  child = spawn(process.execPath, [SERVER, "--port", port], {
    env,
    stdio: "inherit",
    cwd: join(HERE, ".."),
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      if (signal) {
        try { process.kill(process.pid, signal); } catch { /* */ }
      }
      process.exit(code ?? 0);
      return;
    }
    if (code === DIRECTOR_REFRESH_EXIT) {
      spawnServer();
      return;
    }
    if (signal) {
      try { process.kill(process.pid, signal); } catch { /* */ }
    }
    process.exit(code ?? 1);
  });
}

spawnServer();
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    shuttingDown = true;
    try { child?.kill(sig); } catch { /* */ }
  });
}
