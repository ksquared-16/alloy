/**
 * Disk collector — utilization, free space, volume pressure.
 */
import { execFileSync } from "node:child_process";
import os from "node:os";

function parseDf() {
  const out = execFileSync("df", ["-k", "/System/Volumes/Data"], {
    encoding: "utf8",
    timeout: 5000,
  });
  const line = out.trim().split("\n")[1] || "";
  const cols = line.split(/\s+/);
  // Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted
  const totalKb = Number(cols[1]);
  const usedKb = Number(cols[2]);
  const availKb = Number(cols[3]);
  const capStr = String(cols[4] || "").replace("%", "");
  const capacityPct = Number(capStr);
  return {
    mount: cols[cols.length - 1] || "/System/Volumes/Data",
    total_bytes: totalKb * 1024,
    used_bytes: usedKb * 1024,
    available_bytes: availKb * 1024,
    capacity_pct: Number.isFinite(capacityPct) ? capacityPct : null,
    available_gb: Math.round((availKb / 1024 / 1024) * 10) / 10,
    used_gb: Math.round((usedKb / 1024 / 1024) * 10) / 10,
    total_gb: Math.round((totalKb / 1024 / 1024) * 10) / 10,
  };
}

export function collectDisk() {
  try {
    const vol = parseDf();
    return {
      ok: true,
      collector: "disk",
      hostname: os.hostname(),
      volume: vol,
    };
  } catch (e) {
    return { ok: false, collector: "disk", error: String(e.message || e) };
  }
}
