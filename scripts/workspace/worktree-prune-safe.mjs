#!/usr/bin/env node
/**
 * Safe worktree prune suggestions (dry-run by default).
 * Usage: node scripts/workspace/worktree-prune-safe.mjs [--json] [--apply] [--execute]
 *
 * --execute refuses dirty, main, active Cursor, and unknown-ownership worktrees.
 */
import {
  evaluateWorktreeExecuteBlockers,
  listWorktrees,
  openCursorWorktreeLabels,
  printJson,
  printRow,
  printSection,
} from "./lib.mjs";

const json = process.argv.includes("--json");
const apply = process.argv.includes("--apply");
const execute = process.argv.includes("--execute");

function main() {
  const worktrees = listWorktrees();
  const openCursor = openCursorWorktreeLabels();
  const candidates = worktrees.filter((wt) => wt.pruneSafe);

  const rows = candidates.map((wt) => {
    const blockers = evaluateWorktreeExecuteBlockers(wt, openCursor);
    return {
      path: wt.path,
      label: wt.label,
      branch: wt.branch,
      head: wt.head,
      command: `git worktree remove "${wt.path}"`,
      executeAllowed: blockers.length === 0,
      executeBlockers: blockers,
    };
  });

  const payload = {
    mode: execute ? "execute" : apply ? "apply-print" : "dry-run",
    candidateCount: rows.length,
    executeAllowedCount: rows.filter((r) => r.executeAllowed).length,
    candidates: rows,
  };

  if (execute) {
    const blocked = rows.filter((r) => !r.executeAllowed);
    if (blocked.length > 0) {
      const message = {
        error: "execute-refused",
        blockedCount: blocked.length,
        blocked: blocked.map((r) => ({
          path: r.path,
          label: r.label,
          reasons: r.executeBlockers,
        })),
      };
      if (json) {
        printJson(message);
        process.exit(1);
      }
      console.error("Refusing worktree:prune-safe --execute — blocked worktrees:");
      for (const r of blocked) {
        console.error(`- ${r.label} (${r.path}): ${r.executeBlockers.join(", ")}`);
      }
      process.exit(1);
    }
    console.error("No executable worktrees passed safety checks, or execution is not implemented.");
    console.error("Run printed git worktree remove commands manually after review.");
    process.exit(1);
  }

  if (json) {
    printJson(payload);
    return;
  }

  console.log(`Worktree prune-safe (${payload.mode})`);
  printSection(`Candidates: ${rows.length}`);
  if (rows.length === 0) {
    console.log("No prune-safe worktrees (requires merged-into-staging + clean).");
    return;
  }

  for (const c of rows) {
    printRow({
      label: c.path.split("/").pop(),
      branch: c.branch,
      head: c.head,
      executeAllowed: c.executeAllowed,
    });
    if (c.executeBlockers.length > 0) {
      console.log(`  blockers: ${c.executeBlockers.join(", ")}`);
    }
    console.log(`  ${c.command}`);
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to print removal commands.");
    console.log("--apply --execute refuses dirty/main/active-cursor/unknown targets (no auto-run).");
  }
}

main();
