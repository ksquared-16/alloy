/**
 * Vacilando — one composed view of the running server fleet.
 *
 * WHY THIS IS NOT A REGISTRY. Every fact below is already owned somewhere:
 * dev-server-ownership knows which process holds a port and which worktree it
 * belongs to; the lifecycle audit knows what an operator last asked for; the
 * memory manager knows the subtree working set; the supervisor knows recovery
 * state. What did not exist was a place that asks all of them the same question
 * at the same moment, so capacity policy had to guess or go without.
 *
 * This composes. It stores nothing, decides nothing, and takes no action. If a
 * fact disagrees with its owner, the owner is right and this is stale — which
 * is the whole reason it holds no state of its own.
 *
 * Cost follows AGE and USE, not existence: a fresh server measures 390-440 MB
 * and one that has compiled real routes for an hour reaches several GB. That is
 * why RSS is reported per server with its age beside it, rather than reduced to
 * a count that would make eight cheap servers look like eight expensive ones.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { managedSlots, portForSlot } from "./managed-slots.mjs";
import { observeMember } from "./dev-server-ownership.mjs";

export const FLEET_OBSERVATION_SCHEMA = "vacilando.server_fleet_observation.v1";

const RUNTIME_ROOT = () =>
  process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local/state/alloy-dev/gateway");

/** pid -> {ppid, rssKb}, plus ppid -> [pid]. One sweep, like the memory manager's. */
function processTree() {
  const nodes = new Map(); const children = new Map();
  let out = "";
  try {
    out = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,etime="], {
      encoding: "utf8", timeout: 8000, maxBuffer: 8 << 20,
    });
  } catch { return { nodes, children }; }
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/);
    if (!m) continue;
    const pid = +m[1], ppid = +m[2];
    nodes.set(pid, { ppid, rssKb: +m[3], etime: m[4] });
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  return { nodes, children };
}

/**
 * A server's cost is its whole tree. The listener is a thin parent; the
 * next-server child and its compile workers hold the working set, so charging
 * only the listener would report a 3 GB server as 40 MB.
 */
function subtreeRssMb(root, tree) {
  let kb = 0; const stack = [root]; const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const n = tree.nodes.get(pid);
    if (n) kb += n.rssKb;
    for (const c of tree.children.get(pid) || []) stack.push(c);
  }
  return Math.round(kb / 1024);
}

/** What an operator last asked for, read from the lifecycle audit that owns it. */
function desiredStateFor(name, root) {
  if (existsSync(join(root, "pause-state", `${name}.env`))) return "PAUSED";
  const auditPath = join(root, "dev-server-lifecycle.jsonl");
  if (!existsSync(auditPath)) return "UNKNOWN";
  let last = null;
  let text = "";
  try { text = readFileSync(auditPath, "utf8"); } catch { return "UNKNOWN"; }
  for (const line of text.split("\n")) {
    if (!line.includes(`"worktree":"${name}"`)) continue;
    if (line.includes('"action":"start"')) last = "RUNNING";
    else if (line.includes('"action":"stop"')) last = "STOPPED";
  }
  return last ?? "UNKNOWN";
}

/** Recovery state, from the same audit the supervisor writes. */
function recoveryStateFor(name, root) {
  const auditPath = join(root, "dev-server-lifecycle.jsonl");
  if (!existsSync(auditPath)) return null;
  let text = "";
  try { text = readFileSync(auditPath, "utf8"); } catch { return null; }
  let state = null;
  for (const line of text.split("\n")) {
    if (!line.includes(`"worktree":"${name}"`)) continue;
    if (line.includes('"action":"restart_exhausted"')) state = "RESTART_EXHAUSTED";
    else if (line.includes('"action":"supervise_restart"')) state = "RECOVERED";
    else if (line.includes('"action":"start"') || line.includes('"action":"stop"')) state = null;
  }
  return state;
}

/**
 * Observe every managed slot at once.
 *
 * `reclaimable` is deliberately conservative and is only ever a RECOMMENDATION:
 * a lane whose operator asked for a running server is never marked reclaimable
 * merely for being large, because "big" is what a server that has done real
 * work looks like. Arbitration decides; this only reports.
 */
export function observeServerFleet({
  root = RUNTIME_ROOT(),
  worktreesRoot = join(homedir(), "Code", "alloy-worktrees"),
  largeServerMb = 3000,
} = {}) {
  const tree = processTree();
  const rows = [];
  for (const slot of managedSlots()) {
    const port = portForSlot(slot);
    if (!port) continue;
    // Resolve the worktree registered to this slot from the metadata the
    // registry owns, rather than inferring it from whatever holds the port.
    const name = registeredWorktreeForSlot(join(root, "metadata"), slot);
    const member = observeMember({ port, worktree: name, worktreesRoot });
    const pid = member?.pid ?? null;
    const rssMb = pid ? subtreeRssMb(pid, tree) : 0;
    const age = pid ? (tree.nodes.get(pid)?.etime ?? null) : null;
    const desired = name ? desiredStateFor(name, root) : "UNKNOWN";
    const observed = pid ? "RUNNING" : "DOWN";
    const large = rssMb >= largeServerMb;
    rows.push({
      lane_worktree: name, slot, port, pid,
      rss_mb: rssMb, age,
      desired_state: desired,
      observed_state: observed,
      ownership_state: member?.state ?? "unknown",
      recovery_state: name ? recoveryStateFor(name, root) : null,
      large,
      // RECYCLING IS NOT "STOP THE BIG ONE".
      //
      // A recycle stops and restarts a server a lane still WANTS, to reclaim a
      // working set it has grown but is not currently using. So the candidate is
      // large AND desired-RUNNING AND idle — not large-and-not-wanted, which is
      // a different thing entirely (that one is simply stopped).
      //
      // The first cut said `desired !== "RUNNING"`, which made a server eligible
      // precisely because nobody could say whether it was wanted: slot 4, 3.8 GB
      // and 23 hours old with desired UNKNOWN because it predates the lifecycle
      // audit, was marked eligible. Recycling on absent evidence is the opposite
      // of the rule. Idleness is not yet observable here, so nothing is eligible
      // and the missing evidence is named instead of assumed.
      recycle_eligible: false,
      recycle_blocked_reason: !pid ? "not running"
        : !large ? "working set is not material"
        : desired !== "RUNNING" ? `desired state is ${desired}; stop it rather than recycle it`
        : "no idleness signal yet — active-run and connection observation is not implemented",
      // Running while the operator asked for it to be stopped. That is a
      // reconcile, not a capacity decision.
      reclaimable: Boolean(pid && desired === "STOPPED"),
    });
  }
  const running = rows.filter((r) => r.observed_state === "RUNNING");
  return {
    schema_version: FLEET_OBSERVATION_SCHEMA,
    observed_at: new Date().toISOString(),
    servers: rows,
    rollup: {
      running: running.length,
      total_rss_mb: running.reduce((a, r) => a + r.rss_mb, 0),
      large: running.filter((r) => r.large).length,
      recycle_eligible: rows.filter((r) => r.recycle_eligible).length,
      restart_exhausted: rows.filter((r) => r.recovery_state === "RESTART_EXHAUSTED").length,
    },
  };
}

/** The worktree the registry assigned to a slot. Never inferred from the port. */
function registeredWorktreeForSlot(metaDir, slot) {
  let names = [];
  try {
    names = readdirSync(metaDir).filter((f) => f.endsWith(".env"));
  } catch { return null; }
  for (const f of names) {
    let txt = "";
    try { txt = readFileSync(join(metaDir, f), "utf8"); } catch { continue; }
    const m = txt.match(/^ALLOY_WORKTREE_SLOT="?(\d+)"?/m);
    if (m && Number(m[1]) === slot) return f.replace(/\.env$/, "");
  }
  return null;
}
