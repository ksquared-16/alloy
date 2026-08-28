#!/usr/bin/env node
/**
 * `vac worktree-retire` — governed worktree retirement.
 *
 * DEFAULT LISTS AND EXPLAINS. It removes nothing. `--apply <worktree>` still
 * removes nothing here: it FILES a governed action and prints its state. This
 * file is a request surface, not an authority — it imports no removal function
 * and contains no git mutation, and a control asserts that rather than trusting
 * this comment.
 *
 * There is deliberately NO --force. The whole subsystem exists because
 * "override the safety check" is the thing that must not be one flag away.
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { observeReconciliation } from "./lib/vacilando/reconciliation-observe.mjs";
import { observeRetirementCandidates } from "./lib/vacilando/worktree-retirement-observe.mjs";
import { groupRetirementCandidates } from "./lib/vacilando/worktree-retirement.mjs";
import { requestGovernedAction } from "./lib/vacilando/governed-action-request.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const applyIdx = argv.indexOf("--apply");
const apply = applyIdx > -1;
const positional = argv.filter((a) => !a.startsWith("--"));
const target = positional[0] || null;
const known = new Set(["--apply", "--json"]);
const unknown = argv.filter((a) => a.startsWith("--") && !known.has(a));
if (unknown.length) {
  // An unrecognised option must never fall through into a mutation path. There
  // is no --force to mistype into.
  process.stderr.write(`vac worktree-retire: unknown option ${unknown[0]}\nUsage: vac worktree-retire [<worktree> --apply] [--json]\n`);
  process.exit(2);
}
if (apply && !target) {
  process.stderr.write("vac worktree-retire: --apply requires a worktree name\n");
  process.exit(2);
}

const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const worktreeParent = join(homedir(), "Code", "alloy-worktrees");
const canonicalRoot = join(homedir(), "Alloy");
const requestingWorktree = process.env.ALLOY_WORKTREE || process.cwd();

function readProcesses() {
  try {
    return execFileSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 15000 })
      .split("\n").map((l) => { const m = l.trim().match(/^(\d+)\s+(.*)$/); return m ? { pid: Number(m[1]), command: m[2] } : null; })
      .filter(Boolean);
  } catch { return []; }
}
function readGitWorktrees() {
  for (const cwd of [canonicalRoot, process.cwd()]) {
    try {
      return execFileSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] })
        .split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.replace("worktree ", ""));
    } catch { /* try the next */ }
  }
  return null;
}

const processes = readProcesses();
const s7 = observeReconciliation({ root, processes, worktreeParent, gitWorktrees: readGitWorktrees() });
const evaluations = observeRetirementCandidates({
  root, s7Worktrees: s7.worktrees, processes, worktreeParent, requestingWorktree,
});
const groups = groupRetirementCandidates(evaluations);

if (json && !apply) {
  process.stdout.write(`${JSON.stringify({
    counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
    evaluations,
  }, null, 2)}\n`);
  process.exit(0);
}

if (!apply) {
  const line = (e) => `   ${e.path.padEnd(46)} ${String(e.durability).padEnd(32)} ${e.reason}\n`;
  process.stdout.write(`worktrees evaluated  ${evaluations.length}\n`);
  process.stdout.write(`director-safe        ${groups.director_safe.length}\n`);
  for (const e of groups.director_safe) process.stdout.write(line(e));
  process.stdout.write(`operator-required    ${groups.operator_required.length}\n`);
  for (const e of groups.operator_required) process.stdout.write(line(e));
  process.stdout.write(`blocked              ${groups.blocked.length}\n`);
  for (const e of groups.blocked) process.stdout.write(line(e));
  process.stdout.write(`protected            ${groups.protected.length}\n`);
  for (const e of groups.protected) process.stdout.write(line(e));
  process.stdout.write(`\nRead-only. Nothing was removed. Run 'vac worktree-retire <worktree> --apply' to FILE a governed request.\n`);
  process.exit(0);
}

const chosen = evaluations.find((e) => e.path === target);
if (!chosen) {
  process.stderr.write(`vac worktree-retire: ${target} is not a worktree this host classifies\n`);
  process.exit(1);
}
// The CLI refuses early on anything not deterministically safe. This is
// courtesy, not enforcement — the Director and the executor both decide again.
if (chosen.state !== "candidate") {
  process.stdout.write(`${target}: ${chosen.state} — ${chosen.reason}\n`);
  for (const g of chosen.gates.filter((x) => !x.passed)) {
    process.stdout.write(`   gate ${g.gate}: ${g.measured ? "FAILED" : "not measured"} ${JSON.stringify(g.evidence)}\n`);
  }
  process.stdout.write(`\nNo governed request filed.\n`);
  process.exit(1);
}

const out = requestGovernedAction({
  lane_id: process.env.VAC_LANE || process.env.ALLOY_LANE_ID || null,
  run_id: process.env.VAC_RUN || process.env.ALLOY_RUN_ID || null,
  action_key: "vacilando.retire_worktree",
  target: "staging",
  title: `Retire worktree ${target}`,
  purpose: `Remove the ${target} worktree through Git. Branch ${chosen.branch} is ${chosen.durability} and is RETAINED — this action never deletes a branch.`,
  reason_worker_cannot_execute: "Worktree removal changes Git and filesystem reality; a worker may not remove a worktree.",
  inputs: {
    repository: "repo_alloy",
    worktree: target,
    branch: chosen.branch,
    headSha: chosen.head_sha,
    safetyFingerprint: chosen.fingerprint,
    s7State: chosen.s7_state,
    runtimeRoot: root,
    worktreeParent,
    canonicalRoot,
    workTitle: "Worktree retirement",
  },
}, { processNow: true });

process.stdout.write(`governed request: ${out.ok ? "filed" : `refused (${out.error})`}\n`);
process.stdout.write(`state: ${out.request?.status || out.status || "unknown"}\n`);
process.exit(out.ok ? 0 : 1);
