/**
 * Evaluators — turn collector snapshots into findings with severity + why.
 */
import { readDiskHistory } from "./cache.mjs";

const GB = 1024 ** 3;

function finding(partial) {
  return {
    id: partial.id,
    subsystem: partial.subsystem,
    severity: partial.severity, // healthy | info | warning | critical
    status: partial.status || partial.severity,
    title: partial.title,
    reason: partial.reason,
    metrics: partial.metrics || {},
    evidence: partial.evidence || [],
  };
}

function diskThreshold(pct, freeGb) {
  if (freeGb != null && freeGb < 5) return "critical";
  if (pct >= 95 || (freeGb != null && freeGb < 10)) return "critical";
  if (pct >= 90 || (freeGb != null && freeGb < 20)) return "warning";
  if (pct >= 80 || (freeGb != null && freeGb < 40)) return "warning";
  if (pct >= 70) return "info";
  return "healthy";
}

/** Estimate days until full from history samples. */
export function estimateDaysToFull(history, current) {
  if (!history?.length || history.length < 2) return null;
  const samples = [...history]
    .map((h) => ({
      t: Date.parse(h.at),
      used: h.used_bytes ?? h.used_gb * GB,
      avail: h.available_bytes ?? h.available_gb * GB,
    }))
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.used))
    .sort((a, b) => a.t - b.t);
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dtDays = (last.t - first.t) / (86400 * 1000);
  if (dtDays < 0.05) return null;
  const growth = last.used - first.used;
  const gbPerDay = growth / GB / dtDays;
  if (gbPerDay <= 0.05) return { gb_per_day: Math.round(gbPerDay * 100) / 100, days_to_full: null, trend: "stable" };
  const avail = current?.available_bytes ?? last.avail;
  const days = avail / (gbPerDay * GB);
  return {
    gb_per_day: Math.round(gbPerDay * 100) / 100,
    days_to_full: Math.round(days * 10) / 10,
    trend: "growing",
  };
}

export function evaluateAll(snapshot) {
  const findings = [];
  const disk = snapshot.disk?.volume;
  if (disk) {
    const sev = diskThreshold(disk.capacity_pct, disk.available_gb);
    const prediction = estimateDaysToFull(readDiskHistory(), disk);
    findings.push(finding({
      id: "disk.utilization",
      subsystem: "disk",
      severity: sev,
      title: sev === "healthy" ? "Disk healthy" : `Disk ${disk.capacity_pct}% full`,
      reason: sev === "healthy"
        ? `${disk.available_gb} GB free of ${disk.total_gb} GB.`
        : `Only ${disk.available_gb} GB free (${disk.capacity_pct}% used). Escalating thresholds: 70/80/90/95%.`,
      metrics: {
        capacity_pct: disk.capacity_pct,
        available_gb: disk.available_gb,
        used_gb: disk.used_gb,
        total_gb: disk.total_gb,
        prediction,
      },
    }));
  }

  const docker = snapshot.docker;
  if (docker?.available) {
    const reclaimGb = docker.reclaimable_gb || 0;
    const sev = reclaimGb >= 40 ? "critical" : reclaimGb >= 10 ? "warning" : reclaimGb >= 3 ? "info" : "healthy";
    findings.push(finding({
      id: "docker.reclaimable",
      subsystem: "docker",
      severity: sev,
      title: sev === "healthy" ? "Docker healthy" : `Docker ${reclaimGb} GB reclaimable`,
      reason: sev === "healthy"
        ? "No significant unused Docker data."
        : `${reclaimGb} GB reclaimable across images/containers/volumes/build cache.`,
      metrics: {
        reclaimable_gb: reclaimGb,
        reclaimable_bytes: docker.reclaimable_bytes,
        system_df: docker.system_df,
        allocated_raw_gb: docker.raw_disk?.allocated_gb,
      },
    }));
  } else if (docker && docker.available === false) {
    findings.push(finding({
      id: "docker.unavailable",
      subsystem: "docker",
      severity: "warning",
      title: "Docker unavailable",
      reason: docker.error || "Docker daemon not reachable.",
    }));
  }

  const node = snapshot.node;
  if (node) {
    const npmGb = node.npm_cache?.gb || 0;
    if (npmGb >= 2) {
      findings.push(finding({
        id: "node.npm_cache",
        subsystem: "node",
        severity: npmGb >= 8 ? "warning" : "info",
        title: `npm cache ${npmGb} GB`,
        reason: `npm cache at ${node.npm_cache.path} is ${npmGb} GB.`,
        metrics: { gb: npmGb, path: node.npm_cache.path },
      }));
    }
    const pnpmGb = node.pnpm_cache?.gb || 0;
    if (pnpmGb >= 2) {
      findings.push(finding({
        id: "node.pnpm_cache",
        subsystem: "node",
        severity: pnpmGb >= 8 ? "warning" : "info",
        title: `pnpm store ${pnpmGb} GB`,
        reason: `pnpm cache/store is ${pnpmGb} GB.`,
        metrics: { gb: pnpmGb, path: node.pnpm_cache.path },
      }));
    }
    const wtGb = node.worktree_node_modules?.gb || 0;
    const wtCount = node.worktree_node_modules?.count || 0;
    if (wtGb >= 8 || wtCount >= 8) {
      findings.push(finding({
        id: "node.worktree_node_modules",
        subsystem: "node",
        severity: wtGb >= 40 ? "critical" : wtGb >= 20 ? "warning" : "info",
        title: `Worktree node_modules ${wtGb} GB across ${wtCount} trees`,
        reason: "Each managed worktree keeps its own node_modules; merged/idle trees accumulate regenerable weight.",
        metrics: {
          gb: wtGb,
          count: wtCount,
          samples: node.worktree_node_modules?.samples?.slice(0, 5),
        },
      }));
    } else {
      findings.push(finding({
        id: "node.healthy",
        subsystem: "node",
        severity: "healthy",
        title: "Node caches healthy",
        reason: "npm/pnpm/worktree package weight within normal bounds.",
      }));
    }
  }

  const ide = snapshot.ide_caches;
  if (ide) {
    for (const o of ide.orphans || []) {
      const gb = Math.round(((o.bytes || 0) / GB) * 10) / 10;
      findings.push(finding({
        id: `ide.orphan.${o.kind}`,
        subsystem: "caches",
        severity: gb >= 5 ? "critical" : "warning",
        title: `Orphan IDE backup ${gb} GB`,
        reason: o.reason || `Large orphaned backup at ${o.path}`,
        metrics: { gb, path: o.path, kind: o.kind, mtime: o.mtime },
        evidence: [o.path],
      }));
    }
    const cursorGb = ide.cursor?.total_gb || 0;
    if (cursorGb >= 10) {
      findings.push(finding({
        id: "ide.cursor_size",
        subsystem: "caches",
        severity: cursorGb >= 20 ? "warning" : "info",
        title: `Cursor data ${cursorGb} GB`,
        reason: "Cursor Application Support + ~/.cursor are large (includes state DB and extensions).",
        metrics: { gb: cursorGb, cached_data_bytes: ide.cursor?.cached_data_bytes },
      }));
    }
    const claudeGb = ide.claude?.total_gb || 0;
    if (claudeGb >= 8) {
      findings.push(finding({
        id: "ide.claude_size",
        subsystem: "caches",
        severity: "info",
        title: `Claude data ${claudeGb} GB`,
        reason: "Claude Application Support / VM bundles are large.",
        metrics: { gb: claudeGb, vm_bundle_bytes: ide.claude?.vm_bundle_bytes },
      }));
    }
    if (!(ide.orphans || []).length && cursorGb < 10 && claudeGb < 8) {
      findings.push(finding({
        id: "caches.healthy",
        subsystem: "caches",
        severity: "healthy",
        title: "Caches healthy",
        reason: "No orphaned IDE backups; Cursor/Claude sizes within bounds.",
      }));
    }
  }

  const git = snapshot.git_repos;
  if (git?.worktree_gc) {
    const gb = Math.round(((git.worktree_gc.reclaimable_bytes || 0) / GB) * 10) / 10;
    if (gb >= 2) {
      findings.push(finding({
        id: "git.worktree_gc",
        subsystem: "git",
        severity: gb >= 20 ? "critical" : gb >= 8 ? "warning" : "info",
        title: `Worktree GC can reclaim ~${gb} GB`,
        reason: `${git.worktree_gc.reclaimable_worktrees} merged/clean worktrees have regenerable node_modules/.next.`,
        metrics: {
          reclaimable_gb: gb,
          reclaimable_worktrees: git.worktree_gc.reclaimable_worktrees,
          kept: git.worktree_gc.kept,
        },
      }));
    } else {
      findings.push(finding({
        id: "git.healthy",
        subsystem: "git",
        severity: "healthy",
        title: "Git/worktrees healthy",
        reason: "No large reclaimable worktree artifact set detected.",
      }));
    }
  }

  const procs = snapshot.processes;
  if (procs?.ok) {
    const hog = (procs.top_rss || [])[0];
    const sev = procs.zombie_count > 0 ? "warning" : "healthy";
    findings.push(finding({
      id: "processes.pressure",
      subsystem: "processes",
      severity: sev,
      title: sev === "healthy" ? "Processes healthy" : `${procs.zombie_count} zombie process(es)`,
      reason: hog
        ? `Top RSS: ${hog.comm} (~${Math.round((hog.rss_kb || 0) / 1024)} MB).`
        : "No process sample.",
      metrics: { top: (procs.top_rss || []).slice(0, 3), zombie_count: procs.zombie_count },
    }));
  }

  const svc = snapshot.services;
  if (svc) {
    const dockerOk = svc.docker?.available;
    findings.push(finding({
      id: "services.runtime",
      subsystem: "services",
      severity: dockerOk && svc.toolkit?.alloy_dev_installed ? "healthy" : "warning",
      title: dockerOk ? "Services healthy" : "Service gaps",
      reason: [
        dockerOk ? "Docker up" : "Docker down",
        svc.toolkit?.alloy_dev_installed ? "toolkit installed" : "toolkit missing",
        `Supabase containers: ${svc.supabase?.running_containers ?? 0}`,
      ].join("; "),
      metrics: svc,
    }));
  }

  // Large files that look like today's CursorBackupLocal class
  for (const f of snapshot.large_files?.files || []) {
    if (/CursorBackupLocal|BackupLocal/i.test(f.path) && (f.allocated_bytes || 0) > GB) {
      // may duplicate orphan finding — only add if ide didn't catch
      if (!findings.some((x) => x.id.startsWith("ide.orphan"))) {
        findings.push(finding({
          id: "large_files.cursor_backup",
          subsystem: "caches",
          severity: "critical",
          title: "CursorBackupLocal consuming disk",
          reason: `Large backup DB at ${f.path} (${f.gb} GB allocated).`,
          metrics: f,
          evidence: [f.path],
        }));
      }
    }
  }

  return findings;
}

const SEV_SCORE = { healthy: 100, info: 88, warning: 62, critical: 25 };

export function scoreSubsystems(findings) {
  const by = {};
  for (const f of findings) {
    const s = f.subsystem || "other";
    if (!by[s]) by[s] = [];
    by[s].push(f);
  }
  const subsystems = {};
  for (const [name, list] of Object.entries(by)) {
    const worst = list.reduce((a, b) =>
      (SEV_SCORE[b.severity] ?? 50) < (SEV_SCORE[a.severity] ?? 50) ? b : a);
    const scores = list.map((f) => SEV_SCORE[f.severity] ?? 70);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    subsystems[name] = {
      status: worst.severity,
      score: avg,
      label: worst.title,
      findings: list.map((f) => f.id),
    };
  }
  const values = Object.values(subsystems).map((s) => s.score);
  const overall = values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : 100;
  return { overall, subsystems };
}
