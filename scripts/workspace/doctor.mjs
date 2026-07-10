#!/usr/bin/env node
/**
 * Workspace health doctor — read-only recommendations.
 * Usage: node scripts/workspace/doctor.mjs [--json]
 */
import {
  classifyProcess,
  etimeToMinutes,
  listProcesses,
  listWorktrees,
  listeningPorts,
  printJson,
  printSection,
  swapUsage,
  totalRamGb,
} from "./lib.mjs";

const json = process.argv.includes("--json");

function main() {
  const procs = listProcesses();
  const worktrees = listWorktrees();
  const swap = swapUsage();
  const ramGb = totalRamGb();

  const extHosts = procs.filter((p) => /extension-host/i.test(p.command));
  const tss = procs.filter((p) => /tsserver|typescript.*language/i.test(p.command));
  const tsc = procs.filter((p) => /\btsc\b/i.test(p.command));
  const stale = procs
    .map((p) => ({ ...p, meta: classifyProcess(p), ageMin: etimeToMinutes(p.etime) }))
    .filter(
      (p) =>
        p.meta.staleRisk === "high" ||
        (p.meta.kind === "cursor-sandbox" && p.ageMin >= 10) ||
        (p.meta.kind === "stale-search" && p.ageMin >= 5),
    );

  const mergedRemovable = worktrees.filter((w) => w.classification === "merged-removable");
  const openWindowsEstimate = extHosts.length;
  const nmCount = worktrees.filter((w) => w.hasNodeModules).length;

  /** @type {Array<{ severity: string, code: string, message: string }>} */
  const findings = [];

  if (swap && swap.usedPct >= 80) {
    findings.push({
      severity: "critical",
      code: "SWAP_PRESSURE",
      message: `Swap ${swap.usedPct}% used (${swap.usedMb} MB). Close dormant Cursor windows before starting typechecks.`,
    });
  }
  if (openWindowsEstimate >= 7) {
    findings.push({
      severity: "critical",
      code: "TOO_MANY_CURSOR_WINDOWS",
      message: `${openWindowsEstimate} extension hosts open. Target ≤5 for concurrent agents; ≤3 preferred.`,
    });
  } else if (openWindowsEstimate >= 5) {
    findings.push({
      severity: "warn",
      code: "HIGH_CURSOR_WINDOWS",
      message: `${openWindowsEstimate} extension hosts open. Memory pressure likely with active tsservers.`,
    });
  }
  if (tsc.length > 1) {
    findings.push({
      severity: "critical",
      code: "CONCURRENT_TSC",
      message: `${tsc.length} tsc processes running. Serialize typecheck to one at a time.`,
    });
  }
  if (tsc.length === 1) {
    findings.push({
      severity: "info",
      code: "TSC_ACTIVE",
      message: "One tsc process active. Avoid starting another until it completes.",
    });
  }
  if (stale.length > 0) {
    findings.push({
      severity: "warn",
      code: "STALE_AGENT_PROCESSES",
      message: `${stale.length} stale agent/search processes detected. Review with workspace:processes.`,
    });
  }
  if (mergedRemovable.length >= 3) {
    findings.push({
      severity: "warn",
      code: "MERGED_WORKTREES",
      message: `${mergedRemovable.length} merged clean worktrees can be pruned (worktree:prune-safe --dry-run).`,
    });
  }
  if (nmCount >= 10) {
    findings.push({
      severity: "warn",
      code: "NODE_MODULES_FANOUT",
      message: `${nmCount} worktrees have web/node_modules (~650MB each). Prune dormant copies.`,
    });
  }

  const ports = listeningPorts();
  if (ports.length > 2) {
    findings.push({
      severity: "warn",
      code: "MULTIPLE_DEV_SERVERS",
      message: `${ports.length} node/next listening ports. Prefer ≤2 concurrent dev servers.`,
    });
  }

  const healthy = findings.filter((f) => f.severity === "critical").length === 0;

  const report = {
    healthy,
    generatedAt: new Date().toISOString(),
    machine: { ramGb, swap },
    counts: {
      extensionHosts: extHosts.length,
      tsservers: tss.length,
      tsc: tsc.length,
      worktrees: worktrees.length,
      nodeModulesWorktrees: nmCount,
      mergedRemovable: mergedRemovable.length,
      staleProcesses: stale.length,
    },
    findings,
    recommendations: [
      "Keep ≤5 Cursor windows open; ≤3 preferred for heavy typecheck work.",
      "Serialize npm run typecheck / typecheck:tests — one machine-wide at a time.",
      "Use npm run workspace:status before launching expensive agent validation.",
      "Prune merged worktrees with worktree:prune-safe (dry-run first).",
      "Do not use raw npx tsc --noEmit (see docs/governance/typescript-performance.md).",
    ],
  };

  if (json) {
    printJson(report);
    return;
  }

  console.log(`Alloy workspace doctor — ${healthy ? "HEALTHY" : "NEEDS ATTENTION"}`);
  printSection("Machine");
  console.log(`RAM: ${ramGb ?? "?"} GB · Swap: ${swap ? `${swap.usedPct}% (${swap.usedMb} MB used)` : "unknown"}`);

  printSection("Counts");
  console.log(
    `extensionHosts=${extHosts.length} tsservers=${tss.length} tsc=${tsc.length} worktrees=${worktrees.length} node_modules=${nmCount} mergedRemovable=${mergedRemovable.length}`,
  );

  printSection("Findings");
  if (findings.length === 0) {
    console.log("No issues detected.");
  } else {
    for (const f of findings) {
      console.log(`[${f.severity.toUpperCase()}] ${f.code}: ${f.message}`);
    }
  }

  printSection("Recommendations");
  for (const r of report.recommendations) {
    console.log(`- ${r}`);
  }
}

main();
