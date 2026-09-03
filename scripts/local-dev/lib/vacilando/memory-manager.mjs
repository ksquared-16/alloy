/**
 * Vacilando — Memory Manager.
 *
 * Vacilando's server itself is tiny (~50 MB); the memory Vacilando can actually
 * reclaim is idle *worker dev servers* left running on slots that aren't doing
 * work. This module measures that (full process-tree RSS, since a Next dev
 * server's weight is in a child `next-server` process, not the tracked parent)
 * and classifies each running dev server:
 *
 *   - reclaimable (idle): the slot's agent is idle/paused/blocked/waiting — the
 *     dev server is pure waste; safe to stop automatically under pressure.
 *   - in-use (active):    the slot is running/in review — surfaced for a ONE-CLICK
 *     manual reclaim, never stopped automatically (never disturb active work).
 *
 * External hogs (Chrome, a VM, editor apps) are out of Vacilando's domain and
 * are reported honestly, not silently "managed".
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOY_RO = join(HERE, "..", "..", "alloy-ro"); // scripts/local-dev/alloy-ro (absolute; no PATH drift)
const IDLE_STATUSES = new Set(["idle", "paused", "blocked", "waiting", "queued"]);

const run = (bin, args, timeout = 6000) =>
  new Promise((res) => {
    execFile(bin, args, { timeout, maxBuffer: 4 << 20 }, (e, so) => res(e ? "" : so || ""));
  });

/**
 * sysctl lives in /usr/sbin, which is not on every PATH this code runs under.
 *
 * A BARE NAME MADE THE PRESSURE READ SILENTLY BLIND. execFile("sysctl", …)
 * returns "" when the binary cannot be resolved, and "" parses to level null —
 * reported as "unknown" and treated as not-thrashing. So on any caller whose
 * PATH lacks /usr/sbin, this module reports a calm host no matter what the
 * kernel actually says, and auto-reclaim can never fire. MEASURED: bare sysctl
 * does not resolve in a lane shell here, while /usr/sbin/sysctl -n
 * kern.memorystatus_vm_pressure_level returns 1 immediately.
 *
 * The same failure shape was already fixed for lsof in read-core: a probe that
 * cannot run must not be indistinguishable from a probe that found nothing.
 */
const SYSCTL_CANDIDATES = ["/usr/sbin/sysctl", "/sbin/sysctl", "sysctl"];
async function sysctl(name, timeout = 3000) {
  for (const bin of SYSCTL_CANDIDATES) {
    const out = await run(bin, ["-n", name], timeout);
    if (String(out).trim()) return out;
  }
  return "";
}

/**
 * Running worker dev servers, read straight from alloy-ro dev-status (the fast,
 * reliable source) rather than the resources cache, which can return empty under
 * memory pressure. Returns [{slot, port, pid}] for servers that are running.
 */
export async function runningDevServers() {
  const out = await run(ALLOY_RO, ["dev-status", "--json"], 20000);
  let rows = [];
  try { const j = JSON.parse(out); rows = Array.isArray(j) ? j : (j.servers || j.dev || []); } catch { return []; }
  return rows
    .filter((r) => r && (r.server === "running") && (r.server_pid || r.pid))
    .map((r) => ({ slot: r.slot, port: r.port || null, pid: Number(r.server_pid || r.pid) }));
}

/** One `ps` sweep → {nodes: pid→{ppid,rssKb}, children: ppid→[pid]}. */
async function processTree() {
  const out = await run("ps", ["-axo", "pid=,ppid=,rss="]);
  const nodes = new Map(), children = new Map();
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
    if (!m) continue;
    const pid = +m[1], ppid = +m[2], rss = +m[3];
    nodes.set(pid, { ppid, rss });
    (children.get(ppid) || children.set(ppid, []).get(ppid)).push(pid);
  }
  return { nodes, children };
}

/** Sum RSS (KB) of a pid and all its descendants — captures the heavy next-server child. */
function subtreeRssKb(root, tree) {
  let total = 0; const stack = [root], seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue; seen.add(pid);
    const n = tree.nodes.get(pid); if (n) total += n.rss;
    for (const c of tree.children.get(pid) || []) stack.push(c);
  }
  return total;
}

/**
 * Classify every running worker dev server. Returns per-server rows + rollups.
 * Pure measurement — takes no action.
 */
export async function computeReclaim(snapshot) {
  const [tree, devs] = await Promise.all([processTree(), runningDevServers()]);
  const sprints = snapshot?.sprints || [];
  const servers = [];
  for (const d of devs) {
    const sp = sprints.find((s) => s.slot === d.slot);
    const status = sp?.status || "unknown";
    const rss_mb = Math.round(subtreeRssKb(d.pid, tree) / 1024);
    const reclaimable = IDLE_STATUSES.has(status); // safe to auto-stop (agent not working)
    servers.push({
      slot: d.slot, port: d.port, pid: d.pid, rss_mb, status, reclaimable,
      title: sp?.title || `slot ${d.slot}`,
      note: reclaimable ? "idle — safe to reclaim" : "on an active slot — reclaim manually if unused",
    });
  }
  servers.sort((a, b) => b.rss_mb - a.rss_mb);
  const idle = servers.filter((s) => s.reclaimable);
  return {
    servers,
    reclaimable_mb: idle.reduce((a, s) => a + s.rss_mb, 0), // auto-reclaimable (idle)
    idle_count: idle.length,
    heavy_active: servers.filter((s) => !s.reclaimable && s.rss_mb >= 300), // big servers on active slots (manual)
    total_server_mb: servers.reduce((a, s) => a + s.rss_mb, 0),
  };
}

/**
 * Is the host genuinely thrashing (worth auto-reclaiming)? Reads the kernel
 * pressure level + swap DIRECTLY (the resources cache's pressure read is flaky
 * under load). Gate on real kernel pressure — NOT lingering swap, which macOS
 * keeps allocated long after pressure normalizes — so auto-reclaim never
 * over-fires once the machine has recovered.
 */
export async function memoryPressure(policy) {
  const [lvlRaw, swapRaw] = await Promise.all([
    sysctl("kern.memorystatus_vm_pressure_level"),
    sysctl("vm.swapusage"),
  ]);
  const level = Number(String(lvlRaw).trim()) || null; // 1 normal / 2 warn / 4 critical
  const tm = String(swapRaw).match(/total = ([\d.]+)M/), um = String(swapRaw).match(/used = ([\d.]+)M/);
  const swapPct = tm && um && +tm[1] ? (+um[1]) / (+tm[1]) : 0;
  const thrashing = level === 4 || (level === 2 && swapPct >= (policy?.swap_pct ?? 0.85));
  // `readable` says whether the kernel actually answered. Without it a blind
  // probe and a calm host are the same object, and every consumer downstream
  // has to guess which one it is holding.
  return {
    thrashing, level,
    level_label: level === 4 ? "critical" : level === 2 ? "warn" : level === 1 ? "normal" : "unknown",
    swap_pct: Math.round(swapPct * 100),
    readable: level != null,
  };
}
