/**
 * ONE PLACE TO ASK WHAT THE PROVIDER DIMENSION IS ACTUALLY DOING.
 *
 * The provider-capacity experiment kept stalling on a mundane thing: reading
 * the truth required hand-written scripts that imported half the control plane,
 * and those reads are indistinguishable — to a tool boundary, to a reviewer, to
 * a future operator — from code that could change something. So the observation
 * ended up as privileged as the mutation it was trying to justify.
 *
 * This is the read surface those scripts should have been calling. It imports
 * the canonical owners and asks them; it holds no thresholds, keeps no state,
 * and writes nothing anywhere. Everything it reports already exists somewhere
 * else — the value is that one call returns a coherent snapshot instead of six
 * ad-hoc reads that can disagree with each other by the time they finish.
 *
 * It is deliberately useful beyond the experiment. "Why is this lane waiting"
 * is an ordinary operator question, and it should not require writing a script.
 */
import { execFileSync } from "node:child_process";
import os from "node:os";

export const PROVIDER_OBSERVE_SCHEMA = "vacilando.capacity_provider_observe.v1";

function sh(cmd, args, timeout = 15_000) {
  try { return String(execFileSync(cmd, args, { encoding: "utf8", timeout })); }
  catch { return null; }
}

const sysctl = (name) => {
  const out = sh("/usr/sbin/sysctl", ["-n", name]);
  return out == null ? null : out.trim();
};

/** Provider processes with their own subtree cost, attributed through tmux. */
function providerProcesses() {
  const ps = sh("/bin/ps", ["-ax", "-o", "pid=,ppid=,rss=,%cpu=,etime=,command="]);
  if (!ps) return { readable: false, processes: [] };
  const panes = new Map();
  const t = sh("/opt/homebrew/bin/tmux", ["list-panes", "-a", "-F", "#{pane_pid}\t#{session_name}"])
    ?? sh("tmux", ["list-panes", "-a", "-F", "#{pane_pid}\t#{session_name}"]);
  for (const line of String(t || "").split("\n")) {
    const [pid, session] = line.split("\t");
    if (pid && session) panes.set(Number(pid), session);
  }
  const processes = [];
  for (const line of ps.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const command = line.slice(line.indexOf(parts[5]));
    if (!/\/claude(\s|$)/.test(command) && !command.startsWith("/opt/homebrew/bin/claude")) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    processes.push({
      pid,
      rss_mb: Math.round(Number(parts[2]) / 1024),
      cpu_pct: Number(parts[3]),
      age: parts[4],
      // A provider whose pane cannot be found is reported as unattributed
      // rather than dropped. An invisible process is the one worth seeing.
      session: panes.get(pid) ?? panes.get(ppid) ?? null,
    });
  }
  return { readable: true, processes };
}

/**
 * A coherent snapshot of the provider dimension.
 *
 * Every number is attributed to the owner that produced it, because the useful
 * question during the experiment was never "what is the ceiling" — it was
 * "which of the several things calling itself the ceiling do I believe".
 */
export async function observeProviderCapacity({ root = undefined } = {}) {
  const out = {
    schema_version: PROVIDER_OBSERVE_SCHEMA,
    observed_at: new Date().toISOString(),
    mutates: false,
    ceilings: {},
    execution: {},
    residency: {},
    host: {},
    queue: {},
    notes: [],
  };

  try {
    const P = await import("./capacity-policy.mjs");
    const cap = P.hostCapability({ os, sysctl, memory: { total_gb: os.totalmem() / 1e9 } });
    const axis = P.computeCapacityPolicy(cap).axes.provider_capacity;
    out.ceilings.derived = axis.ceiling;
    out.ceilings.derived_by_cores = axis.by_cores;
    out.ceilings.derived_by_memory = axis.by_memory;
    out.ceilings.derived_bounded_by = axis.bounded_by;
    out.host.cores = cap.physical_cores ?? cap.cores ?? null;
    out.host.memory_total_gb = cap.memory_total_gb ?? null;
  } catch (e) { out.notes.push(`capacity-policy unreadable: ${e.message}`); }

  try {
    const PC = await import("./provider-capacity.mjs");
    out.ceilings.configured = PC.configuredProviderCeiling();
  } catch (e) { out.notes.push(`provider-capacity unreadable: ${e.message}`); }

  try {
    const A = await import("./alloy-dev-adapter.mjs");
    const c = await A.assessSessionStartCapacity({ ...(root ? { root } : {}) });
    out.ceilings.enforced = c.max_providers ?? null;
    out.execution.active = c.active_providers ?? null;
    out.execution.available = c.available === true;
    out.execution.blockers = c.blockers ?? [];
    out.execution.degraded = c.degraded === true;
    out.execution.lanes = (c.occupying || []).map((o) => ({
      lane_id: o.lane_id ?? null,
      worktree: o.cwd ? String(o.cwd).split("/").pop() : null,
    }));
  } catch (e) { out.notes.push(`admission unreadable: ${e.message}`); }

  // THE DISAGREEMENT CHECK. Three owners can each answer "the ceiling"; the
  // experiment existed because they did not agree, so the snapshot says so
  // outright rather than leaving a reader to compare three fields.
  const { configured, enforced, derived } = out.ceilings;
  out.ceilings.owners_agree = configured != null && enforced != null && configured === enforced;
  out.ceilings.derived_exceeds_enforced = derived != null && enforced != null && derived > enforced
    ? derived
    : null;

  const procs = providerProcesses();
  out.residency.readable = procs.readable;
  out.residency.count = procs.processes.length;
  out.residency.total_rss_mb = procs.processes.reduce((a, p) => a + p.rss_mb, 0);
  out.residency.total_cpu_pct = Number(procs.processes.reduce((a, p) => a + p.cpu_pct, 0).toFixed(1));
  out.residency.unattributed = procs.processes.filter((p) => !p.session).length;
  out.residency.processes = procs.processes;
  // Residency is not occupancy, and reporting them adjacently is the point:
  // more resident providers than executing ones is normal and cheap.
  out.residency.exceeds_execution = out.execution.active != null
    && procs.processes.length > out.execution.active;

  const load = sysctl("vm.loadavg");
  out.host.load = load ? load.replace(/[{}]/g, "").trim().split(/\s+/).map(Number) : null;
  const pressure = sysctl("kern.memorystatus_vm_pressure_level");
  out.host.pressure_level = pressure == null ? null : Number(pressure);
  out.host.pressure_readable = pressure != null;
  const swap = sysctl("vm.swapusage");
  out.host.swap = swap ? swap.replace(/\s+/g, " ").trim() : null;
  const health = sh("/usr/bin/curl", ["-s", "-o", "/dev/null", "-m", "20", "-w", "%{http_code} %{time_total}",
    "http://127.0.0.1:3030/api/health"]);
  if (health) {
    const [code, secs] = health.trim().split(/\s+/);
    out.host.gateway_http = Number(code);
    out.host.gateway_latency_s = Number(secs);
  }

  try {
    const D = await import("./capacity-demand.mjs");
    out.queue.provider_waiting = D.queuedDemand({ dimension: D.DEMAND_DIMENSIONS.PROVIDER, ...(root ? { root } : {}) }).length;
    out.queue.server_waiting = D.queuedDemand({ dimension: D.DEMAND_DIMENSIONS.SERVER, ...(root ? { root } : {}) }).length;
  } catch { out.queue.provider_waiting = null; out.queue.server_waiting = null; }

  return out;
}

/** Human-readable rendering. Same facts, no extra opinion. */
export function renderProviderObservation(o) {
  const L = [];
  const c = o.ceilings;
  L.push(`ceilings   configured=${c.configured ?? "?"} enforced=${c.enforced ?? "?"} derived=${c.derived ?? "?"}`
    + ` (by_cores ${c.derived_by_cores ?? "?"}, by_memory ${c.derived_by_memory ?? "?"}, bound ${c.derived_bounded_by ?? "?"})`);
  if (!c.owners_agree) L.push(`  WARNING: configured and enforced disagree`);
  if (c.derived_exceeds_enforced) L.push(`  note: the host derives ${c.derived_exceeds_enforced}, above the enforced ceiling`);
  L.push(`execution  active=${o.execution.active ?? "?"} available=${o.execution.available}`
    + ` blockers=${JSON.stringify(o.execution.blockers ?? [])}`);
  for (const l of o.execution.lanes ?? []) L.push(`             ${l.worktree ?? l.lane_id}`);
  L.push(`residency  ${o.residency.count} processes, ${o.residency.total_rss_mb} MB, ${o.residency.total_cpu_pct}% CPU`
    + `, unattributed=${o.residency.unattributed}`);
  L.push(`host       load=${(o.host.load ?? []).join(" ")} pressure=${o.host.pressure_level ?? "unknown"}`
    + ` gateway=${o.host.gateway_http ?? "?"} @ ${o.host.gateway_latency_s ?? "?"}s`);
  L.push(`           swap ${o.host.swap ?? "unknown"}`);
  L.push(`queue      provider_waiting=${o.queue.provider_waiting ?? "?"} server_waiting=${o.queue.server_waiting ?? "?"}`);
  for (const n of o.notes) L.push(`note       ${n}`);
  return L.join("\n");
}
