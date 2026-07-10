#!/usr/bin/env node
/**
 * Development process inventory.
 * Usage: node scripts/workspace/processes.mjs [--json] [--kind=cursor|node|tsc|all]
 */
import {
  classifyProcess,
  etimeToMinutes,
  listProcesses,
  printJson,
  printRow,
  printSection,
  sanitizeCommandDisplay,
} from "./lib.mjs";

const json = process.argv.includes("--json");
const kindArg = process.argv.find((a) => a.startsWith("--kind="));
const kindFilter = kindArg ? kindArg.split("=")[1] : "all";

const CURSOR_KINDS = new Set([
  "cursor-extension-host",
  "cursor-file-watcher",
  "cursor-sandbox",
  "tsserver",
]);
const NODE_KINDS = new Set(["next-dev", "tsc", "vitest", "playwright", "node-other", "stale-search"]);

/** @param {string} cmd */
function inferWorktree(cmd) {
  const match =
    cmd.match(/\/\.cursor\/worktrees\/Alloy\/([^/]+)/) ||
    cmd.match(/\/\.worktrees\/([^/]+)/) ||
    cmd.match(/\/Users\/Kelly\/Alloy\//);
  if (!match) return null;
  if (match[1]) return match[1];
  return "main";
}

function main() {
  const procs = listProcesses()
    .map((p) => {
      const meta = classifyProcess(p);
      return {
        pid: p.pid,
        ppid: p.ppid,
        rssMb: p.rssMb,
        etime: p.etime,
        ageMin: Math.round(etimeToMinutes(p.etime)),
        kind: meta.kind,
        label: meta.label,
        staleRisk: meta.staleRisk,
        worktree: inferWorktree(p.command),
        command: sanitizeCommandDisplay(p.command),
      };
    })
    .filter((p) => {
      if (kindFilter === "cursor") return CURSOR_KINDS.has(p.kind);
      if (kindFilter === "node") return NODE_KINDS.has(p.kind);
      if (kindFilter === "tsc") return p.kind === "tsc";
      return CURSOR_KINDS.has(p.kind) || NODE_KINDS.has(p.kind);
    })
    .sort((a, b) => b.rssMb - a.rssMb);

  if (json) {
    printJson({ processes: procs, count: procs.length, filter: kindFilter });
    return;
  }

  console.log(`Alloy development processes (filter=${kindFilter})`);
  printSection(`Count: ${procs.length}`);
  for (const p of procs) {
    printRow({
      pid: p.pid,
      kind: p.kind,
      rssMb: p.rssMb,
      ageMin: p.ageMin,
      stale: p.staleRisk,
      worktree: p.worktree,
    });
  }
}

main();
