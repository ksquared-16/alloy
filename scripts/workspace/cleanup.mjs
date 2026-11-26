#!/usr/bin/env node
/**
 * Workspace cleanup suggestions (dry-run by default).
 * Usage: node scripts/workspace/cleanup.mjs [--json] [--apply] [--execute]
 *
 * Never kills or deletes without --apply --execute.
 * --execute refuses dirty/main/active-cursor/unknown-ownership targets.
 * Does not expose environment variables or secrets.
 */
import {
  classifyProcess,
  etimeToMinutes,
  evaluateProcessKillBlockers,
  evaluateWorktreeExecuteBlockers,
  listProcesses,
  listWorktrees,
  openCursorWorktreeLabels,
  printJson,
  printRow,
  printSection,
} from "./lib.mjs";

const json = process.argv.includes("--json");
const apply = process.argv.includes("--apply");
const execute = process.argv.includes("--execute");

function staleProcesses(procs) {
  return procs
    .map((p) => ({ ...p, meta: classifyProcess(p), ageMin: etimeToMinutes(p.etime) }))
    .filter((p) => {
      if (p.meta.kind === "stale-search" && p.ageMin >= 5) return true;
      if (p.meta.kind === "tsc" && p.ageMin >= 60) return true;
      if (p.meta.kind === "cursor-sandbox" && p.ageMin >= 30) return true;
      return false;
    });
}

function main() {
  const procs = listProcesses();
  const worktrees = listWorktrees();
  const openCursor = openCursorWorktreeLabels();
  const stale = staleProcesses(procs);
  const pruneCandidates = worktrees.filter((w) => w.pruneSafe);

  const actions = [
    ...stale.map((p) => {
      const blockers = evaluateProcessKillBlockers(p.meta, p.ageMin);
      return {
        type: "kill-process",
        target: String(p.pid),
        reason: `${p.meta.kind} age=${Math.round(p.ageMin)}min`,
        command: `kill ${p.pid}`,
        executeAllowed: blockers.length === 0,
        executeBlockers: blockers,
      };
    }),
    ...pruneCandidates.map((w) => {
      const blockers = evaluateWorktreeExecuteBlockers(w, openCursor);
      return {
        type: "remove-worktree",
        target: w.path,
        reason: `merged+clean (${w.branch})`,
        command: `git worktree remove "${w.path}"`,
        executeAllowed: blockers.length === 0,
        executeBlockers: blockers,
      };
    }),
  ];

  const payload = {
    mode: execute ? "execute" : apply ? "apply-print" : "dry-run",
    actionCount: actions.length,
    executeAllowedCount: actions.filter((a) => a.executeAllowed).length,
    actions,
  };

  if (execute) {
    const blocked = actions.filter((a) => !a.executeAllowed);
    if (blocked.length > 0) {
      const message = {
        error: "execute-refused",
        blockedCount: blocked.length,
        blocked: blocked.map((a) => ({
          type: a.type,
          target: a.target,
          reasons: a.executeBlockers,
        })),
      };
      if (json) {
        printJson(message);
        process.exit(1);
      }
      console.error("Refusing workspace:cleanup --execute — blocked actions:");
      for (const a of blocked) {
        console.error(`- ${a.type} ${a.target}: ${a.executeBlockers.join(", ")}`);
      }
      process.exit(1);
    }
    console.error("No executable actions passed safety checks, or execution is not implemented.");
    console.error("This command remains suggestion-only; run printed commands manually after review.");
    process.exit(1);
  }

  if (json) {
    printJson(payload);
    return;
  }

  console.log(`Alloy workspace cleanup (${payload.mode})`);
  printSection(`Suggested actions: ${actions.length}`);
  if (actions.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  for (const a of actions) {
    printRow({
      type: a.type,
      target: a.target,
      reason: a.reason,
      executeAllowed: a.executeAllowed,
    });
    if (a.executeBlockers.length > 0) {
      console.log(`  blockers: ${a.executeBlockers.join(", ")}`);
    }
    console.log(`  ${a.command}`);
  }

  if (!apply) {
    console.log("\nDry-run only. Pass --apply to print commands.");
    console.log("--apply --execute refuses dirty/main/active-cursor/unknown targets (no auto-run).");
  }
}

main();
