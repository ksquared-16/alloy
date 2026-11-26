#!/usr/bin/env node
/**
 * Read-only Alloy workspace status summary.
 * Usage: node scripts/workspace/status.mjs [--json]
 */
import {
  classifyProcess,
  etimeToMinutes,
  listProcesses,
  listWorktrees,
  listeningPorts,
  platformSummary,
  printJson,
  printRow,
  printSection,
  repoRoot,
  sanitizeCommandDisplay,
  swapUsage,
  totalRamGb,
} from "./lib.mjs";

const json = process.argv.includes("--json");

function extensionHosts(procs) {
  return procs.filter((p) => /extension-host/i.test(p.command));
}

function fileWatchers(procs) {
  return procs.filter((p) => /fileWatcher/i.test(p.command));
}

function tsservers(procs) {
  return procs.filter((p) => /tsserver|typescript.*language/i.test(p.command));
}

function devServers(procs) {
  return procs.filter((p) => /next dev|next-server/i.test(p.command));
}

function staleCandidates(procs) {
  return procs
    .map((p) => ({ ...p, meta: classifyProcess(p), ageMin: etimeToMinutes(p.etime) }))
    .filter((p) => {
      if (p.meta.staleRisk === "high") return true;
      if (p.meta.kind === "cursor-sandbox" && p.ageMin >= 10) return true;
      if (p.meta.kind === "stale-search" && p.ageMin >= 5) return true;
      return false;
    });
}

function main() {
  const procs = listProcesses();
  const worktrees = listWorktrees();
  const ports = listeningPorts();
  const swap = swapUsage();
  const ramGb = totalRamGb();

  const extHosts = extensionHosts(procs);
  const watchers = fileWatchers(procs);
  const tss = tsservers(procs);
  const devs = devServers(procs);
  const stale = staleCandidates(procs);

  const extRssMb = Math.round(extHosts.reduce((s, p) => s + p.rssMb, 0));
  const watcherRssMb = Math.round(watchers.reduce((s, p) => s + p.rssMb, 0));

  const summary = {
    generatedAt: new Date().toISOString(),
    repoRoot: repoRoot(),
    platform: platformSummary(),
    memory: {
      ramGb,
      swap,
    },
    cursor: {
      extensionHostCount: extHosts.length,
      extensionHostRssMb: extRssMb,
      fileWatcherCount: watchers.length,
      fileWatcherRssMb: watcherRssMb,
      tsserverCount: tss.length,
    },
    node: {
      devServerCount: devs.length,
      listeningPorts: ports,
    },
    worktrees: {
      count: worktrees.length,
      withNodeModules: worktrees.filter((w) => w.hasNodeModules).length,
      mergedRemovable: worktrees.filter((w) => w.classification === "merged-removable").length,
      activeImplementation: worktrees.filter((w) => w.classification === "active-implementation").length,
    },
    staleProcessCandidates: stale.map((p) => ({
      pid: p.pid,
      ppid: p.ppid,
      kind: p.meta.kind,
      rssMb: p.rssMb,
      ageMin: Math.round(p.ageMin),
      command: sanitizeCommandDisplay(p.command),
    })),
  };

  if (json) {
    printJson(summary);
    return;
  }

  console.log("Alloy workspace status (read-only)");
  printSection("Machine");
  printRow({ ramGb, swapUsedPct: swap?.usedPct, swapUsedMb: swap?.usedMb, platform: platformSummary() });

  printSection("Cursor");
  printRow({
    extensionHosts: extHosts.length,
    extensionHostRssMb: extRssMb,
    fileWatchers: watchers.length,
    fileWatcherRssMb: watcherRssMb,
    tsservers: tss.length,
  });

  printSection("Dev processes");
  printRow({ nextDev: devs.length, listeningPorts: ports.length });
  for (const port of ports) {
    printRow({ pid: port.pid, command: port.command, port: port.port });
  }

  printSection("Worktrees");
  printRow({
    total: worktrees.length,
    withNodeModules: summary.worktrees.withNodeModules,
    mergedRemovable: summary.worktrees.mergedRemovable,
    activeImplementation: summary.worktrees.activeImplementation,
  });

  if (stale.length > 0) {
    printSection("Stale process candidates (do not kill automatically)");
    for (const p of stale) {
      printRow({
        pid: p.pid,
        kind: p.meta.kind,
        ageMin: Math.round(p.ageMin),
        rssMb: p.rssMb,
      });
    }
  } else {
    printSection("Stale process candidates");
    console.log("none detected");
  }
}

main();
