/**
 * WHO PUBLISHES A LANE'S PORT TO THE TAILNET.
 *
 * THE DEFECT. `lane-app-url.mjs` reads `tailscale serve status`, and when a
 * lane's port is absent it reports `no_serve_mapping_for_port` — which the
 * Gateway renders, correctly, as "port not published to the tailnet". That
 * message is accurate and, until this module, unactionable: NOTHING IN THIS
 * REPOSITORY HAS EVER RUN `tailscale serve`. Every mapping on the host was
 * typed by hand at some point, so which lanes the Director can reach was
 * decided by whoever last remembered to type a command, not by which lanes
 * exist.
 *
 * MEASURED, on the execution host, with twelve managed slots configured:
 *
 *   published by hand : 3011, 3014, 3015, 3016, 3021   (slots 1, 4, 5, 6, 11)
 *   managed slot ports: 3011 … 3022                    (slots 1 … 12)
 *   consequence       : Financials (slot 2 / 3012) and Communications
 *                       (slot 3 / 3013) told the Director to go and sign in
 *                       and gave them no address to sign in at.
 *
 * A reader is not an owner. `readServeStatus()` could always SEE the gap; this
 * is the thing that closes it.
 *
 * WHAT IT WILL AND WILL NOT DO.
 *
 *  - TAILNET ONLY, NEVER FUNNEL. `serve` publishes on the tailnet, behind
 *    Tailscale's own identity. `funnel` publishes to the public internet. This
 *    module names `serve` and refuses to construct a funnel argument, because
 *    the difference between them is the difference between "the Director can
 *    reach the lane" and "everyone can".
 *  - LOOPBACK TARGETS ONLY. The proxy target is always `http://127.0.0.1:<port>`.
 *    A dev server binds loopback; publishing anything else would be publishing
 *    something this host does not own.
 *  - MANAGED SLOT PORTS ONLY. The port set comes from `managed-slots.mjs`, the
 *    declared owner of topology, and every candidate is checked back through
 *    `slotForPort` before it is published. A reserved control-plane port can
 *    therefore never be claimed: the Gateway is on 3030, the agent range stops
 *    at 3022, and the check is by construction rather than by arithmetic in a
 *    comment.
 *  - ADDITIVE ONLY. It publishes what is missing and never withdraws anything.
 *    The host's root mapping (`https://<host>/` → the Gateway on 3030) and any
 *    mapping an operator made for their own reasons are left exactly alone.
 *    Withdrawing a route is how a working lane goes dark, and nothing here is
 *    worth that risk.
 */
import { execFile } from "node:child_process";

import { readServeStatus, servedPorts } from "./lane-app-url.mjs";
import { managedSlots, portForSlot, slotForPort } from "./managed-slots.mjs";

export const TAILNET_SERVE_SCHEMA = "vacilando.tailnet_serve_reconcile.v1";

/** Where `tailscale` lives when launchd hands the process no useful PATH. */
export const TAILSCALE_CLI_CANDIDATES = Object.freeze([
  "tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
]);

export const SERVE_REFUSALS = Object.freeze({
  NOT_A_SLOT_PORT: "port_is_not_a_managed_slot_port",
  NO_CLI: "tailscale_cli_not_found",
});

/**
 * Every port a lane could be reached on, for the topology this host declares.
 *
 * Derived, never stored. A host that raises ALLOY_MAX_AGENTS gets the new ports
 * published on the next sweep without anyone editing a list.
 */
export function desiredServePorts(env = process.env) {
  return managedSlots(env).map((slot) => portForSlot(slot, env)).filter((p) => Number.isInteger(p));
}

/**
 * The gap: managed slot ports the Serve config does not currently publish.
 *
 * Ports already published are not re-published — `tailscale serve` is
 * idempotent, but a no-op that shells out is still a no-op that can fail, and a
 * quiet sweep is one that does nothing on a healthy host.
 */
export function missingServePorts({ serveStatus = "", env = process.env } = {}) {
  const have = servedPorts(serveStatus);
  return desiredServePorts(env).filter((p) => !have.has(p));
}

/**
 * The command for one port. Separate from running it so the arguments are
 * testable without a tailnet, and so "what would this do" can be shown to an
 * operator before it does it.
 */
export function serveCommandArgs(port) {
  const n = Number(port);
  return ["serve", "--bg", `--https=${n}`, `http://127.0.0.1:${n}`];
}

function runTailscale(args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let index = 0;
    const attempt = () => {
      if (index >= TAILSCALE_CLI_CANDIDATES.length) {
        resolve({ ok: false, error: SERVE_REFUSALS.NO_CLI });
        return;
      }
      const bin = TAILSCALE_CLI_CANDIDATES[index++];
      execFile(bin, args, { timeout: timeoutMs, encoding: "utf8" }, (err, stdout, stderr) => {
        // ENOENT means "not at this path"; anything else is a real failure of a
        // CLI that does exist, and retrying another path would hide it.
        if (err && err.code === "ENOENT") { attempt(); return; }
        resolve({
          ok: !err,
          bin,
          stdout: String(stdout || "").slice(0, 500),
          stderr: String(stderr || "").slice(0, 500),
          error: err ? String(err.message || err).slice(0, 300) : null,
        });
      });
    };
    attempt();
  });
}

/**
 * Publish every managed slot port the tailnet is missing.
 *
 * Returns a report rather than throwing: this runs on a timer inside the
 * Gateway, and a host without Tailscale installed is a host where lanes are
 * reached some other way — not a reason to take the control plane down.
 */
export async function reconcileTailnetServe({
  serveStatus = null,
  env = process.env,
  dryRun = false,
  run = runTailscale,
  readStatus = readServeStatus,
} = {}) {
  const status = serveStatus == null ? readStatus() : serveStatus;
  const missing = missingServePorts({ serveStatus: status, env });
  const published = [];
  const refused = [];
  const failed = [];

  for (const port of missing) {
    // THE GUARD, AND IT IS NOT DECORATIVE. `desiredServePorts` already derives
    // from the managed range, so this can only fire if that derivation is ever
    // changed to trust something else. It is cheap, and the thing it prevents
    // is publishing the control plane's own port to the tailnet.
    if (slotForPort(port, env) == null) {
      refused.push({ port, error: SERVE_REFUSALS.NOT_A_SLOT_PORT });
      continue;
    }
    if (dryRun) { published.push({ port, args: serveCommandArgs(port), dry_run: true }); continue; }
    const out = await run(serveCommandArgs(port));
    if (out.ok) published.push({ port, slot: slotForPort(port, env) });
    else failed.push({ port, error: out.error || "unknown", stderr: out.stderr || null });
  }

  return {
    schema_version: TAILNET_SERVE_SCHEMA,
    checked: desiredServePorts(env).length,
    already_published: desiredServePorts(env).length - missing.length,
    published,
    refused,
    failed,
    dry_run: Boolean(dryRun),
    ok: failed.length === 0 && refused.length === 0,
  };
}

/**
 * The fleet-level assertion: no managed slot is unreachable to a remote
 * Director because nobody published its port.
 *
 * Reported rather than enforced at read time — the Gateway shows this, and the
 * reconciler above is what acts on it.
 */
export function auditTailnetServe({ serveStatus = null, env = process.env, readStatus = readServeStatus } = {}) {
  const status = serveStatus == null ? readStatus() : serveStatus;
  const missing = missingServePorts({ serveStatus: status, env });
  return {
    schema_version: TAILNET_SERVE_SCHEMA,
    tailscale_configured: Boolean(String(status || "").trim()),
    desired: desiredServePorts(env),
    missing,
    missing_slots: missing.map((p) => slotForPort(p, env)).filter((s) => s != null),
    ok: missing.length === 0,
  };
}
