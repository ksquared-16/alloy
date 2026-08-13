/**
 * Vacilando Runtime — machine & process resource reads (Slice 8).
 *
 * Authoritative OS reads only. Per-worker CPU/mem/elapsed/port come from the
 * dev-server PID (via the Node workspace snapshot / batched listen table).
 *
 * Worktree `du -sk` is NOT on the high-frequency resources/status path. Disk
 * sizes are filled from a slow cache (15 min TTL) when available; otherwise
 * `disk_mb` is null with an honest note. Explicit refresh uses collectWorktreeDiskSizes.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { collectRaw, DISK_SIZE_TTL_MS, noteDuExecution } from "./sources.mjs";

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
  const pl = await run("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], 2000);
  const level = pl.ok ? Number(pl.out.trim()) : null;
  return {
    pressure_level: level,
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

const diskCache = { at: 0, byWorktree: new Map(), inflight: null, last_error: null, last_trigger: null, last_paths: [] };

async function diskMbOnce(path) {
  if (!path || !existsSync(path)) return null;
  noteDuExecution();
  // Bound depth cost: still recursive du, but only on the slow path.
  const r = await run("du", ["-sk", path], 12000);
  if (!r.ok) return null;
  const kb = Number((r.out.trim().split(/\s+/)[0]) || 0);
  return kb ? Math.round(kb / 1024) : null;
}

/**
 * Expensive worktree-size scan — explicit / slow TTL only.
 * Concurrent callers share one compute; never invoked from collectResources.
 * Failures degrade to last-good / empty sizes — never throw into status paths.
 */
export async function collectWorktreeDiskSizes({ force = false, worktrees = null, trigger = "explicit" } = {}) {
  const now = Date.now();
  if (!force && diskCache.byWorktree.size && now - diskCache.at < DISK_SIZE_TTL_MS) {
    return { at: diskCache.at, sizes: Object.fromEntries(diskCache.byWorktree), cached: true, trigger: diskCache.last_trigger };
  }
  if (diskCache.inflight) return diskCache.inflight;

  diskCache.inflight = (async () => {
    diskCache.last_trigger = trigger;
    diskCache.last_error = null;
    diskCache.last_paths = [];
    try {
      const raw = await collectRaw();
      const names = worktrees || (raw.agents.agents || []).map((a) => a.worktree).filter(Boolean);
      // Sequential — do not fan out one du per worktree in parallel.
      for (const name of names) {
        const path = join(WORKTREE_ROOT, name);
        diskCache.last_paths.push(path);
        try {
          const mb = await diskMbOnce(path);
          if (mb != null) diskCache.byWorktree.set(name, mb);
        } catch (e) {
          diskCache.last_error = String(e.message || e);
        }
      }
      diskCache.at = Date.now();
      return { at: diskCache.at, sizes: Object.fromEntries(diskCache.byWorktree), cached: false, trigger };
    } catch (e) {
      diskCache.last_error = String(e.message || e);
      // Degrade: keep prior sizes if any; never throw into timers / HTTP.
      return {
        at: diskCache.at || Date.now(),
        sizes: Object.fromEntries(diskCache.byWorktree),
        cached: Boolean(diskCache.byWorktree.size),
        error: diskCache.last_error,
        trigger,
      };
    } finally {
      diskCache.inflight = null;
    }
  })();
  return diskCache.inflight;
}

export function peekWorktreeDiskCache() {
  return {
    age_ms: diskCache.at ? Date.now() - diskCache.at : null,
    ttl_ms: DISK_SIZE_TTL_MS,
    sizes: Object.fromEntries(diskCache.byWorktree),
    last_trigger: diskCache.last_trigger,
    last_error: diskCache.last_error,
    last_paths: [...diskCache.last_paths],
    inflight: Boolean(diskCache.inflight),
  };
}

export async function collectResources() {
  // Reuse the board's singleflight workspace snapshot (no alloy-ro, no du).
  const raw = await collectRaw();
  const servers = Array.isArray(raw.servers) && raw.servers.length
    ? raw.servers
    : (raw.agents.agents || []).map((a) => ({
      worktree: a.worktree,
      slot: Number(a.slot) || null,
      port: a.port || null,
      server: a.server,
      server_pid: "",
    }));

  const diskPeek = peekWorktreeDiskCache();

  const workers = await Promise.all(servers.map(async (s) => {
    const running = s.server === "running" && s.server_pid;
    const proc = running ? await psStats(s.server_pid) : null;
    const disk = diskPeek.sizes[s.worktree];
    return {
      slot: s.slot,
      worktree: s.worktree,
      server: s.server,
      port: s.port || null,
      server_process: proc,
      provider_process: null,
      provider_process_note: "editor app PID is not tracked by the toolkit",
      disk_mb: disk != null ? disk : null,
      disk_note: disk != null ? null : "worktree size is measured on a 15-minute cadence (not on status poll)",
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
  const loadPct = Math.round((load[1] / cpuCount) * 100);
  const occupied = servers.length;
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
    disk_policy: { hot_path_du: false, ttl_ms: DISK_SIZE_TTL_MS, cache_age_ms: diskPeek.age_ms },
  };
}
