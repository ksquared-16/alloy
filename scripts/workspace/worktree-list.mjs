#!/usr/bin/env node
/**
 * Worktree inventory with merged/stale classification.
 * Usage: node scripts/workspace/worktree-list.mjs [--json] [--size]
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { listWorktrees, printJson, printRow, printSection } from "./lib.mjs";

const json = process.argv.includes("--json");
const withSize = process.argv.includes("--size");

/** @param {string} dir */
function duSh(dir) {
  try {
    return execFileSync("du", ["-sh", dir], { encoding: "utf8" }).trim().split(/\s+/)[0];
  } catch {
    return null;
  }
}

function main() {
  let worktrees = listWorktrees();

  if (withSize) {
    worktrees = worktrees.map((wt) => {
      const nm = path.join(/** @type {string} */ (wt.path), "web", "node_modules");
      return {
        ...wt,
        nodeModulesSize: wt.hasNodeModules ? duSh(nm) : null,
      };
    });
  }

  if (json) {
    printJson({ worktrees, count: worktrees.length });
    return;
  }

  console.log("Alloy worktree inventory (read-only)");
  printSection(`Total: ${worktrees.length}`);
  for (const wt of worktrees) {
    printRow({
      label: wt.label,
      branch: wt.branch,
      head: wt.head,
      class: wt.classification,
      dirty: wt.dirtyCount,
      behind: wt.behindStaging,
      ahead: wt.aheadStaging,
      merged: wt.mergedIntoStaging,
      node_modules: wt.hasNodeModules ? wt.nodeModulesSize ?? "yes" : "no",
      pruneSafe: wt.pruneSafe,
    });
  }
}

main();
