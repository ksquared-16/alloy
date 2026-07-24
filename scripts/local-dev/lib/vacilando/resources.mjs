/**
 * Vacilando Runtime — machine & process resource reads (Slice 8).
 *
 * Authoritative OS reads only. Per-worker CPU/mem/elapsed/port come from the
 * dev-server PID (the one process we can confidently attribute to a slot, via
 * `alloy-ro dev-status`); disk from a bounded `du`; the overall machine picture
 * from node's `os` module. When no matching process can be confidently
 * identified (e.g. a slot with no running server, or the editor app whose PID
 * the toolkit does not track), resources are reported as `null` — never faked.
 *
 * Provider token/cost is NOT available (no headless usage source on staging);
 * it is reported as unavailable with the integration that would provide it.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { ro } from "./sources.mjs";

const WORKTREE_ROOT = join(os.homedir(), "Code", "alloy-worktrees");

function run(cmd, args, timeout = 4000) {
  return new Promise((res) => {
    execFile(cmd, args, { timeout, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => res({ ok: !err, out: stdout ?? "" }));
  });
}

/** ps stats for one live pid, or null if not running / unreadable. */
async function psStats(pid) {
  if (!pid || !/^\d+$/.test(String(pid))) return null;
  const r = await run("ps", ["-o", "pid=,pcpu=,pmem=,etime=,rss=,stat=", "-p", String(pid)]);
  if (!r.ok || !r.out.trim()) return null;
  const p = r.out.trim().split(/\s+/);
  if (p.length < 6) return null;
  return {
    pid: Number(p[0]),
    cpu_pct: Number(p[1]),
    mem_pct: Number(p[2]),
    elapsed: p[3],
    rss_mb: Math.round(Number(p[4]) / 1024),
    state: p[5],
  };
}

/**
 * macOS-authoritative memory. os.freemem() only counts truly-free pages and
 * grossly overstates "used" (it ignores inactive/purgeable/speculative memory
 * that is reclaimable without swap). We read vm_stat + sysctl instead:
 *   available = free + inactive + speculative + purgeable   (reclaimable)
 *   used      = active + wired + compressed                 (real footprint)
 * plus swap from vm.swapusage. Pressure matches `memory_pressure` reality.
 */
async function macMemory(totalBytes) {
  const vm = await run("vm_stat", [], 3000);
  if (!vm.ok) return null;
  const pageSize = Number((vm.out.match(/page size of (\d+) bytes/) || [])[1] || 16384);
  const pg = (label) => { const m = vm.out.match(new RegExp(`${label}:\\s+(\\d+)`)); return m ? Number(m[1]) * pageSize : 0; };
  const free = pg("Pages free"), inactive = pg("Pages inactive"), speculative = pg("Pages speculative"),
    active = pg("Pages active"), wired = pg("Pages wired down"), purgeable = pg("Pages purgeable"),
    compressed = pg("Pages occupied by compressor");
  const available = free + inactive + speculative + purgeable;
  const used = Math.max(0, totalBytes - available);
  let swap = { used_mb: null, total_mb: null };
  const sw = await run("sysctl", ["-n", "vm.swapusage"], 2000);
  if (sw.ok) {
    const t = sw.out.match(/total = ([\d.]+)M/), u = sw.out.match(/used = ([\d.]+)M/);
    swap = { total_mb: t ? Math.round(Number(t[1])) : null, used_mb: u ? Math.round(Number(u[1])) : null };
  }
  // Kernel's authoritative pressure level: 1=normal, 2=warn, 4=critical.
  const pl = await run("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], 2000);
  const level = pl.ok ? Number(pl.out.trim()) : null;
  return {
    pressure_level: level, // 1|2|4|null
    pressure: level === 4 ? "high" : level === 2 ? "elevated" : level === 1 ? "ok" : null,
    total_mb: Math.round(totalBytes / 1048576),
    available_mb: Math.round(available / 1048576),
    used_mb: Math.round(used / 1048576),
    used_pct: Math.round((used / totalBytes) * 100),
    active_mb: Math.round(active / 1048576),
    wired_mb: Math.round(wired / 1048576),
    compressed_mb: Math.round(compressed / 1048576),
    swap,
  };
}

/** Bounded disk usage (KB→MB) for a worktree; null if it can't be measured fast. */
async function diskMb(path) {
  if (!path || !existsSync(path)) return null;
  const r = await run("du", ["-sk", path], 2500);
  if (!r.ok) return null;
  const kb = Number((r.out.trim().split(/\s+/)[0]) || 0);
  return kb ? Math.round(kb / 1024) : null;
}

export async function collectResources() {
  // dev-status is fast (no git) and gives worktree/slot/port/server/server_pid.
  const dev = await ro("dev-status");
  const servers = dev.ok && Array.isArray(dev.data.servers) ? dev.data.servers : [];

  const workers = await Promise.all(servers.map(async (s) => {
    const path = join(WORKTREE_ROOT, s.worktree);
    const running = s.server === "running" && s.server_pid;
    const [proc, disk] = await Promise.all([
      running ? psStats(s.server_pid) : Promise.resolve(null),
      diskMb(path),
    ]);
    return {
      slot: s.slot,
      worktree: s.worktree,
      server: s.server,
      port: s.port || null,
      // The dev-server process is the only one we can confidently attribute.
      server_process: proc, // {pid, cpu_pct, mem_pct, elapsed, rss_mb, state} | null
      // The editor/provider app PID is not tracked by the toolkit → honest null.
      provider_process: null,
      provider_process_note: "editor app PID is not tracked by the toolkit",
      disk_mb: disk,
    };
  }));

  const totalMem = os.totalmem();
  const mem = (await macMemory(totalMem)) || {
    total_mb: Math.round(totalMem / 1048576), available_mb: Math.round(os.freemem() / 1048576),
    used_mb: Math.round((totalMem - os.freemem()) / 1048576), used_pct: Math.round(((totalMem - os.freemem()) / totalMem) * 100),
    active_mb: null, wired_mb: null, compressed_mb: null, swap: { used_mb: null, total_mb: null },
  };
  const load = os.loadavg();
  const cpuCount = os.cpus().length;
  const loadPct = Math.round((load[1] / cpuCount) * 100); // 5-min load is steadier than 1-min
  const occupied = servers.length;
  // Pressure comes from the KERNEL's authoritative level (kern.memorystatus_vm_
  // pressure_level: 1 normal / 2 warn / 4 critical). Fall back to a load/used
  // heuristic only if the kernel value is unavailable. Reclaimable memory is not
  // "used", so this reflects real macOS pressure, not os.freemem()'s overstatement.
  const pressure = mem.pressure || (mem.used_pct >= 90 || loadPct >= 200 ? "high" : mem.used_pct >= 80 || loadPct >= 130 ? "elevated" : "ok");
  const recommendedAvailable = pressure === "high" ? 0 : pressure === "elevated" ? Math.min(1, Math.max(0, 6 - occupied)) : Math.max(0, 6 - occupied);

  return {
    workers,
    overall: {
      load_1m: Math.round(load[0] * 100) / 100,
      load_5m: Math.round(load[1] * 100) / 100,
      cpu_count: cpuCount,
      cpu_load_pct: Math.min(100, loadPct),
      mem_total_mb: mem.total_mb,
      mem_available_mb: mem.available_mb,
      mem_used_mb: mem.used_mb,
      mem_used_pct: mem.used_pct,
      mem_active_mb: mem.active_mb,
      mem_wired_mb: mem.wired_mb,
      mem_compressed_mb: mem.compressed_mb,
      swap: mem.swap,
      mem_pressure_level: mem.pressure_level ?? null,
      mem_source: "vm_stat + kern.memorystatus_vm_pressure_level (macOS-authoritative)",
      running_servers: servers.filter((s) => s.server === "running").length,
      slots: { total: 6, occupied, recommended_available: recommendedAvailable, pressure },
      warning: pressure === "high" ? "High machine pressure — do not start new workers; consider pausing an idle one." : pressure === "elevated" ? "Elevated pressure — start at most one lightweight worker." : null,
    },
    provider_cost: { available: false, note: "Aggregated per Director round-trip (see /api/usage). Cursor reports tokens; Claude reports cost when authenticated." },
  };
}
