/**
 * Dual-bind helper: loopback is the primary socket; remote mode adds a second
 * listener on the *current* Tailscale IPv4. Never binds 0.0.0.0. Never caches
 * an old CGNAT address. Retries EADDRNOTAVAIL — Tailscale's utun address is
 * often not bindable at the instant `tailscale ip -4` first returns it.
 */
import { execFileSync } from "node:child_process";
import { createServer as defaultCreateServer } from "node:http";

import { assertPrivateBindHost, isTailscaleIPv4 } from "./vacilando-api-auth.mjs";

export const TAILSCALE_CLI_CANDIDATES = Object.freeze([
  "tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
]);

export function detectTailscaleIPv4({ execFileSync: exec = execFileSync } = {}) {
  for (const bin of TAILSCALE_CLI_CANDIDATES) {
    try {
      const ip = String(exec(bin, ["ip", "-4"], { encoding: "utf8", timeout: 2500 }) || "").trim();
      if (isTailscaleIPv4(ip)) return ip;
    } catch { /* CLI missing, not logged in, or PATH-less launchd */ }
  }
  return null;
}

export function tailscaleRetryDelayMs(attempt = 0) {
  const steps = [250, 500, 1000, 2000, 5000, 10000, 15000];
  const i = Math.max(0, Number(attempt) || 0);
  return steps[Math.min(i, steps.length - 1)];
}

export function shouldRetryTailscaleBind(err) {
  const code = err?.code || "";
  const msg = String(err?.message || err || "");
  return code === "EADDRNOTAVAIL"
    || code === "EHOSTUNREACH"
    || code === "ENETUNREACH"
    || /EADDRNOTAVAIL|address not available/i.test(msg);
}

/**
 * Bind a second HTTP server on the live Tailscale IPv4. Dispatches into the
 * already-listening loopback server's request handlers. Safe no-op until the
 * interface exists. Caller must close() on shutdown so timers do not leak.
 */
export function attachTailscaleListener({
  server,
  port,
  createHttpServer = defaultCreateServer,
  detect = detectTailscaleIPv4,
  delayMs = tailscaleRetryDelayMs,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  log = (s) => process.stderr.write(s),
  logOut = (s) => process.stdout.write(s),
} = {}) {
  if (!server || !port) {
    return { close() {}, get host() { return null; } };
  }
  let extra = null;
  let timer = null;
  let stopped = false;
  let attempt = 0;
  let boundHost = null;

  const dispatch = (req, res) => {
    for (const fn of server.listeners("request")) fn(req, res);
  };

  const arm = () => {
    if (stopped || extra || timer) return;
    timer = setTimer(() => {
      timer = null;
      tryBind();
    }, delayMs(attempt++));
  };

  const tryBind = () => {
    if (stopped || extra) return;
    const ip = detect();
    if (!ip) {
      arm();
      return;
    }
    const check = assertPrivateBindHost(ip);
    if (!check.ok || !isTailscaleIPv4(check.host)) {
      log(`tailscale bind skipped: ${check.message || check.error || "refused"}\n`);
      return;
    }
    extra = createHttpServer(dispatch);
    extra.once("error", (e) => {
      extra = null;
      boundHost = null;
      log(`tailscale bind skipped: ${e.message}\n`);
      if (!stopped && shouldRetryTailscaleBind(e)) arm();
    });
    extra.listen(port, check.host, () => {
      boundHost = check.host;
      attempt = 0;
      logOut(`Vacilando Tailscale → http://${check.host}:${port}  (auth required, tailnet only)\n`);
    });
  };

  tryBind();

  return {
    close() {
      stopped = true;
      if (timer) clearTimer(timer);
      timer = null;
      try { extra?.close(); } catch { /* */ }
      extra = null;
      boundHost = null;
    },
    get host() { return boundHost; },
  };
}
