/**
 * Engineering Health runtime — Observe → Evaluate → Explain → Recommend → Execute(confirm).
 */
import { cachedCollect, recordDiskHistory } from "./cache.mjs";
import { collectDisk } from "./collectors/disk.mjs";
import { collectDocker } from "./collectors/docker.mjs";
import { collectNode } from "./collectors/node.mjs";
import { collectIdeCaches } from "./collectors/ide-caches.mjs";
import { collectGitRepos } from "./collectors/git-repos.mjs";
import { collectProcesses } from "./collectors/processes.mjs";
import { collectServices } from "./collectors/services.mjs";
import { collectLargeFiles } from "./collectors/large-files.mjs";
import { evaluateAll, scoreSubsystems } from "./evaluators.mjs";
import { buildRecommendations } from "./recommendations.mjs";
import { executeAction, listActions } from "./executors/actions.mjs";
import { formatDoctorReport } from "./presentation/doctor.mjs";

export { executeAction, listActions, formatDoctorReport };

/**
 * @param {{ refresh?: boolean, deep?: boolean, skip?: string[] }} opts
 */
export async function runEngineeringHealth(opts = {}) {
  const refresh = Boolean(opts.refresh);
  const deep = opts.deep !== false; // default deep for doctor
  const skip = new Set(opts.skip || []);

  const collect = async (key, fn, ttlMs) => {
    if (skip.has(key)) return { ok: true, collector: key, skipped: true };
    return cachedCollect(key, async () => fn(), { refresh, ttlMs });
  };

  const disk = await collect("disk", collectDisk, 30_000);
  if (disk?.volume) {
    recordDiskHistory({
      available_gb: disk.volume.available_gb,
      used_gb: disk.volume.used_gb,
      capacity_pct: disk.volume.capacity_pct,
      available_bytes: disk.volume.available_bytes,
      used_bytes: disk.volume.used_bytes,
    });
  }

  const quick = !deep;
  const [
    docker,
    node,
    ide_caches,
    processes,
    services,
  ] = await Promise.all([
    collect("docker", collectDocker, 120_000),
    collect("node", () => collectNode({ quick }), quick ? 60_000 : 180_000),
    collect("ide_caches", collectIdeCaches, 180_000),
    collect("processes", collectProcesses, 20_000),
    collect("services", collectServices, 60_000),
  ]);

  // Expensive — sequential / optional
  let git_repos = { ok: true, collector: "git_repos", skipped: true };
  let large_files = { ok: true, collector: "large_files", skipped: true };
  if (deep && !skip.has("git_repos")) {
    git_repos = await collect("git_repos", collectGitRepos, 300_000);
  }
  if (deep && !skip.has("large_files")) {
    large_files = await collect("large_files", collectLargeFiles, 600_000);
  }

  const snapshot = {
    disk,
    docker,
    node,
    ide_caches,
    git_repos,
    processes,
    services,
    large_files,
  };

  const findings = evaluateAll(snapshot);
  const score = scoreSubsystems(findings);
  const { recommendations, potential_recovery_gb } = buildRecommendations(findings);

  const cacheBits = Object.entries(snapshot)
    .map(([k, v]) => `${k}:${v?._cache || (v?.skipped ? "skip" : "?")}`)
    .join(" ");

  return {
    kind: "engineering_health_report",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    score,
    findings,
    recommendations,
    potential_recovery_gb,
    snapshot,
    cache_summary: cacheBits,
  };
}

export function reportToText(report) {
  return formatDoctorReport(report);
}
