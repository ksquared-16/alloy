/**
 * Process pressure — memory hogs, zombie-ish defunct.
 */
import { execFileSync } from "node:child_process";

export function collectProcesses() {
  let top = [];
  try {
    const out = execFileSync("ps", ["-axo", "pid,ppid,pcpu,pmem,rss,state,comm"], {
      encoding: "utf8",
      timeout: 5000,
    });
    const lines = out.trim().split("\n").slice(1);
    const rows = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[0]);
      const pmem = Number(parts[3]);
      const rssKb = Number(parts[4]);
      const state = parts[5];
      const comm = parts.slice(6).join(" ");
      return { pid, pmem, rss_kb: rssKb, state, comm };
    }).filter((r) => Number.isFinite(r.rss_kb));
    top = [...rows].sort((a, b) => b.rss_kb - a.rss_kb).slice(0, 10);
    const zombies = rows.filter((r) => /^Z/i.test(r.state) || /defunct/i.test(r.comm));
    return {
      ok: true,
      collector: "processes",
      top_rss: top,
      zombie_count: zombies.length,
      zombies: zombies.slice(0, 5),
    };
  } catch (e) {
    return { ok: false, collector: "processes", error: String(e.message || e) };
  }
}
