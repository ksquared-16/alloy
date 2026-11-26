#!/usr/bin/env node
/**
 * Listening dev-server ports (node/next).
 * Usage: node scripts/workspace/ports.mjs [--json]
 */
import { listProcesses, listeningPorts, printJson, printRow, printSection } from "./lib.mjs";

const json = process.argv.includes("--json");

function inferWorktreeFromCommand(cmd) {
  const m =
    cmd.match(/\/\.cursor\/worktrees\/Alloy\/([^/]+)/) ||
    cmd.match(/\/\.worktrees\/([^/]+)/);
  return m ? m[1] : cmd.includes("/Users/Kelly/Alloy/") ? "main-or-worktree" : null;
}

function main() {
  const ports = listeningPorts();
  const procs = listProcesses().filter((p) => /next dev|next-server/i.test(p.command));

  const rows = ports.map((port) => {
    const proc = procs.find((p) => p.pid === port.pid) ?? procs.find((p) => p.ppid === port.pid);
    return {
      port: port.port,
      pid: port.pid,
      command: port.command,
      worktree: proc ? inferWorktreeFromCommand(proc.command) : null,
      rssMb: proc?.rssMb ?? null,
    };
  });

  if (json) {
    printJson({ ports: rows, count: rows.length });
    return;
  }

  console.log("Alloy dev-server ports (read-only)");
  printSection(`Listening node/next ports: ${rows.length}`);
  if (rows.length === 0) {
    console.log("none");
    return;
  }
  for (const row of rows) {
    printRow(row);
  }
}

main();
