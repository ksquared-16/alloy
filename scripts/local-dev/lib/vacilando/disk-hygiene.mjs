/**
 * Vacilando — Disk Hygiene (Engineering Operations Center maintenance primitive).
 *
 * Every managed worktree carries its own node_modules (~700 MB) + .next (~600 MB);
 * across dozens of worktrees this silently grows to 30–50 GB and eventually fails
 * builds with ENOSPC. This is low-level operational toil Vacilando absorbs so the
 * operator manages WORK, not disk.
 *
 * The reclaim MECHANISM is the on-disk `~/bin/alloy-worktree-gc` (safe by design:
 * reclaims regenerable artifacts only from worktrees that are MERGED into
 * origin/staging AND clean; skips the canonical repo, the current checkout, and
 * any worktree running a server; never touches git history/source/uncommitted
 * work). This module is the Vacilando integration: a read-only SIGNAL for the
 * dashboard and a governed RECLAIM runner — mirroring memory-manager.mjs, one
 * resource over.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const GC = join(os.homedir(), "bin", "alloy-worktree-gc");

/** Volume free space in whole GB (df), or null if unavailable. */
export function freeDiskGb() {
  try {
    const out = execFileSync("df", ["-g", "/"], { encoding: "utf8", timeout: 4000 });
    const line = (out.trim().split("\n")[1] || "").split(/\s+/);
    const avail = Number(line[3]);
    return Number.isFinite(avail) ? avail : null;
  } catch { return null; }
}

/** Parse the gc script's human output into structured fields. */
function parseGc(text) {
  const s = String(text || "");
  const num = (re) => { const m = s.match(re); return m ? Number(m[1]) : null; };
  const mbMatch = s.match(/~\s*\d+\s*GB\s*\((\d+)\s*MB\)/i);
  const reclaim_mb = mbMatch ? Number(mbMatch[1]) : (num(/~\s*(\d+)\s*GB/i) != null ? num(/~\s*(\d+)\s*GB/i) * 1024 : null);
  const kept_reasons = {};
  for (const m of s.matchAll(/^\s*keep\s+\S+\s+\((.+?)\)\s*$/gim)) {
    const r = m[1].toLowerCase();
    const key = r.includes("unmerged") ? "unmerged"
      : (r.includes("uncommitted") || r.includes("dirty")) ? "dirty"
      : r.includes("server") ? "live_server"
      : r.includes("current") ? "current"
      : r.includes("canonical") ? "canonical" : "other";
    kept_reasons[key] = (kept_reasons[key] || 0) + 1;
  }
  return {
    reclaimed: num(/worktrees reclaimed:\s*(\d+)/i),
    kept: num(/kept:\s*(\d+)/i),
    reclaim_mb,
    free_gb: num(/free after:\s*(\d+)\s*GB/i) ?? num(/free before:\s*(\d+)\s*GB/i),
    kept_reasons,
  };
}

function buildDiskSignalFromText(text, available) {
  const p = parseGc(text);
  const free_gb = p.free_gb ?? freeDiskGb();
  const worktrees = (p.reclaimed || 0) + (p.kept || 0) || null;
  return {
    available,
    free_gb,
    worktrees,
    reclaimable: p.reclaimed,
    reclaimable_mb: p.reclaim_mb,
    kept: p.kept,
    kept_reasons: p.kept_reasons,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Async disk signal — preferred path. Never blocks the event loop on the GC dry-run.
 * The dry-run can take tens of seconds under load; calling it via execFileSync before
 * listen starved Vacilando bind (~30s createVacilandoServer).
 */
export function diskSignalAsync() {
  return new Promise((resolve) => {
    const available = existsSync(GC);
    if (!available) return resolve(buildDiskSignalFromText("", false));
    const child = execFile(GC, [], { timeout: 30000, maxBuffer: 1 << 22 }, (err, stdout, stderr) => {
      const text = String(stdout || "") + String(err ? (stderr || "") : "");
      resolve(buildDiskSignalFromText(text, true));
    });
    // Do not keep the Vacilando process (or tests) alive solely for a GC dry-run.
    child.unref?.();
  });
}

/**
 * Sync disk signal — ONLY for non-boot call sites that already tolerate blocking.
 * Prefer diskSignalAsync. Do not call from createVacilandoServer / listen path.
 */
export function diskSignal() {
  let text = "";
  const available = existsSync(GC);
  if (available) {
    try { text = execFileSync(GC, [], { encoding: "utf8", timeout: 30000, maxBuffer: 1 << 22 }); }
    catch (e) { text = String(e.stdout || "") + String(e.stderr || ""); }
  }
  return buildDiskSignalFromText(text, available);
}

/**
 * Governed RECLAIM: run `alloy-worktree-gc --force`. Destructive to REGENERABLE
 * artifacts only (node_modules/.next), restored by `npm install` on revisit —
 * never source, history, or uncommitted work. Long-ish; call async.
 */
export function runGc({ minFreeGb } = {}) {
  return new Promise((resolveP) => {
    if (!existsSync(GC)) return resolveP({ ok: false, error: "alloy-worktree-gc not found on this host" });
    const args = ["--force", ...(minFreeGb ? ["--min-free-gb", String(minFreeGb)] : [])];
    execFile(GC, args, { timeout: 10 * 60 * 1000, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      const p = parseGc(String(stdout || "") + String(stderr || ""));
      if (err) return resolveP({ ok: false, error: String(stderr || err.message || "gc failed").slice(0, 300), ...p });
      resolveP({ ok: true, ...p, at: new Date().toISOString() });
    });
  });
}
