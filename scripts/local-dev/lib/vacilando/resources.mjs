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
  const freeMem = os.freemem();
  const memUsedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
  const load1 = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const occupied = servers.length;
  const pressure = memUsedPct >= 88 || load1 > cpuCount * 1.5 ? "high" : memUsedPct >= 75 ? "elevated" : "ok";
  const recommendedAvailable = pressure === "high" ? 0 : Math.max(0, 6 - occupied);

  return {
    workers,
    overall: {
      load_1m: Math.round(load1 * 100) / 100,
      cpu_count: cpuCount,
      cpu_load_pct: Math.min(100, Math.round((load1 / cpuCount) * 100)),
      mem_total_mb: Math.round(totalMem / 1048576),
      mem_free_mb: Math.round(freeMem / 1048576),
      mem_used_pct: memUsedPct,
      running_servers: servers.filter((s) => s.server === "running").length,
      slots: { total: 6, occupied, recommended_available: recommendedAvailable, pressure },
      warning: pressure === "high" ? "High machine pressure — avoid starting new workers." : pressure === "elevated" ? "Elevated memory use." : null,
    },
    provider_cost: { available: false, note: "No provider token/cost source on staging. Needs headless `claude -p` usage JSON (stranded Director capability)." },
  };
}
