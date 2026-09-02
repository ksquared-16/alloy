/**
 * THE DIRECTOR IS NOT SITTING AT THE MACHINE THAT RUNS THE APP.
 *
 * THE DEFECT. Execution lives on the Mac mini; the Director drives Vacilando
 * from a MacBook over Tailscale. A lane's app was only ever described by its
 * slot port, so anything that wanted to offer an "Open App" link had to build
 * one itself — and the obvious construction, `http://localhost:3014`, means the
 * MACBOOK when it is clicked on the MacBook. Nothing is listening there. The
 * link is not broken in a way that says so; it just fails to connect, which
 * reads as "the lane is down".
 *
 * MEASURED. The lanes API returns no port and no URL for any lane, so there was
 * no server-derived answer at all. Meanwhile the app was reachable from the
 * MacBook the entire time: dev servers bind *:PORT, and
 * http://100.71.206.63:3014/ answered 200 in 0.17s. There was never a missing
 * tunnel. What was missing was anyone telling the Director the right address.
 *
 * WHY NOT THE RAW TAILNET IP. It works, and it is still the wrong contract. A
 * bare `http://100.71.206.63:3014` is plain HTTP on an IP literal, which breaks
 * Secure cookies, breaks SameSite=None, and cannot appear in a Supabase or
 * OAuth redirect allowlist. The human sign-in ceremony has to happen on this
 * origin, so the origin has to be one an identity provider will accept.
 *
 * WHY NOT A PATH UNDER THE GATEWAY. `/lane/<id>/app` would require the Next dev
 * server to be built with a matching basePath. It is not, so every absolute
 * asset path — /_next/static/... — would resolve at the Gateway root and 404.
 * Path-based routing is only correct for apps that know they are mounted, and
 * these do not.
 *
 * SO: per-port HTTPS on the tailnet hostname Tailscale Serve already provides.
 * Verified end to end before this module was written:
 *
 *   https://vacilandos-mac-mini.tail2aa1af.ts.net:3016/  -> 200, valid cert
 *   /_next/static/chunks/...css                          -> 200
 *   /_next/static/chunks/...hmr-client_ts...js           -> 200
 *
 * Absolute asset paths keep working because the app is still mounted at the
 * root; HMR's WebSocket connects back to the same origin; the certificate is
 * real, so cookies behave; and the hostname is stable across restarts and
 * independent of the mini's IP.
 *
 * ONE OWNER. Every consumer asks here. A second construction anywhere is how the
 * localhost link appeared in the first place.
 */

/** Ports are the shell's rule: ALLOY_FIRST_AGENT_PORT + slot - 1. */
export const DEFAULT_FIRST_AGENT_PORT = 3011;

export const APP_URL_SCHEMA = "vacilando.lane_app_url.v1";

/** Why a lane has no Director-facing URL. Each is actionable, none is "down". */
export const NO_URL_REASONS = Object.freeze({
  NO_SLOT: "lane_has_no_slot",
  NO_ORIGIN: "no_director_facing_origin",
  NOT_SERVED: "no_serve_mapping_for_port",
});

const trim = (v) => String(v == null ? "" : v).trim();

/**
 * The hostname the Director's browser can reach this host by.
 *
 * Derived from the Tailscale Serve configuration that already exists rather
 * than from a new setting: whatever hostname Serve is publishing is by
 * definition one the tailnet can resolve and holds a certificate for.
 */
export function directorFacingHost({ serveStatus = null, env = process.env } = {}) {
  const explicit = trim(env.VACILANDO_DIRECTOR_HOST);
  if (explicit) return explicit;
  const text = trim(serveStatus);
  if (!text) return null;
  // Serve prints "https://<host>[:port] (tailnet only)" lines.
  const m = text.match(/https:\/\/([a-z0-9][a-z0-9.-]*\.ts\.net)/i);
  return m ? m[1] : null;
}

export function portForSlot(slot, env = process.env) {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1) return null;
  const first = Number(env.ALLOY_FIRST_AGENT_PORT) || DEFAULT_FIRST_AGENT_PORT;
  return first + n - 1;
}

/** Which lane ports Serve is currently publishing. */
export function servedPorts(serveStatus = "") {
  const ports = new Set();
  for (const m of String(serveStatus || "").matchAll(/https:\/\/[a-z0-9][a-z0-9.-]*\.ts\.net:(\d+)/gi)) {
    ports.add(Number(m[1]));
  }
  return ports;
}

/**
 * Is the Director's browser somewhere other than this host?
 *
 * When execution and the operator are on the same machine, localhost is
 * correct and this whole concern is moot. It is only remote execution that
 * makes a localhost URL a lie.
 */
export function isRemoteExecutionHost({ env = process.env } = {}) {
  // FAILS CLOSED, deliberately. An earlier cut of this derived remoteness from
  // "can I discover a Serve hostname", which meant that if Serve were down or
  // unreadable every lane would quietly publish a localhost URL again — the
  // exact defect, reappearing precisely when the routing is broken and the
  // operator is least able to tell. Remote is the default; only an explicit
  // statement that the operator is on this machine makes localhost correct.
  return trim(env.VACILANDO_LOCAL_OPERATOR) !== "1";
}

/**
 * The Director-facing app URL for one lane, or an explicit reason there is none.
 *
 * Never returns a localhost URL while the execution host is remote. A link that
 * silently points at the operator's own machine is worse than no link: it
 * produces a connection failure the operator reads as a broken lane.
 */
export function laneAppUrl(lane, { serveStatus = null, env = process.env } = {}) {
  const slot = lane?.binding?.slot ?? lane?.slot ?? null;
  const port = portForSlot(slot, env);
  const remote = isRemoteExecutionHost({ env });

  if (port == null) {
    return { url: null, reason: NO_URL_REASONS.NO_SLOT, port: null, remote };
  }
  if (!remote) {
    // Same machine: localhost is the truth, not a fallback.
    return { url: `http://localhost:${port}`, reason: null, port, remote: false, origin: "localhost" };
  }
  const host = directorFacingHost({ serveStatus, env });
  if (!host) {
    return { url: null, reason: NO_URL_REASONS.NO_ORIGIN, port, remote };
  }
  const served = servedPorts(serveStatus);
  if (served.size && !served.has(port)) {
    // The route does not exist yet. Say that, rather than emitting a URL that
    // will fail to connect — "not routed" and "app is down" are different
    // problems and the operator needs to tell them apart.
    return { url: null, reason: NO_URL_REASONS.NOT_SERVED, port, remote, host };
  }
  return {
    url: `https://${host}:${port}`,
    reason: null,
    port,
    remote: true,
    host,
    origin: "tailscale-serve",
  };
}

/**
 * The guard. No active lane may publish a localhost URL to a remote Director.
 *
 * This is the fleet-level assertion the mission asks for: it is not enough that
 * the derivation is correct today, because the defect was a second construction
 * appearing somewhere else.
 */
export function auditFleetAppUrls(lanes = [], { serveStatus = null, env = process.env } = {}) {
  const remote = isRemoteExecutionHost({ env });
  const rows = [];
  for (const lane of lanes) {
    const out = laneAppUrl(lane, { serveStatus, env });
    rows.push({
      lane_id: lane?.lane_id ?? null,
      name: lane?.name ?? null,
      slot: lane?.binding?.slot ?? lane?.slot ?? null,
      port: out.port,
      app_url: out.url,
      reason: out.reason,
    });
  }
  const violations = remote
    ? rows.filter((r) => r.app_url && /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(r.app_url))
    : [];
  return {
    schema_version: APP_URL_SCHEMA,
    remote_execution_host: remote,
    lanes: rows,
    violations,
    ok: violations.length === 0,
  };
}
