#!/usr/bin/env node
/**
 * `vac invariants` — run the Critical Invariants Pack against this checkout.
 *
 * THIS FILE IS A RUNNER, NOT AN AUTHORITY. It owns no invariant, defines no
 * rule and asserts nothing. It spawns the controls the manifest names, maps
 * their exit codes to outcomes, and prints the verdict. The manifest decides
 * what must hold; the domain owners decide whether it does.
 *
 * WHY A SEPARATE PROCESS PER PROOF. Each control is an independent authority and
 * several of them install their own runtime root, mutate `process.env` and reset
 * module-level caches. Importing them into one process would let them interfere
 * with each other and produce a result that is an artefact of ordering — which is
 * the one thing a safety pack must never be.
 *
 * Usage:
 *   vac-invariants.mjs [--candidate <sha>] [--level 2] [--json] [--baseline ID,ID]
 */
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runCriticalInvariants, INVARIANTS, LEVELS, OUTCOME, RUNNER, BUDGET, PACK_VERSION,
} from "./lib/vacilando/critical-invariants.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const asJson = argv.includes("--json");
const level = Number(arg("--level", LEVELS.READY_FOR_STAGING));
const baseline = (arg("--baseline", "") || "").split(",").map((s) => s.trim()).filter(Boolean);

/** The candidate this pack result is bound to. A result with none proves nothing about anything. */
function resolveCandidate() {
  const given = arg("--candidate");
  if (given) return given;
  try {
    return execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], {
      encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Run one proof.
 *
 * UNMEASURED IS RETURNED, NEVER THROWN PAST. A missing file, absent dependencies
 * or a runner that is not installed all mean the same thing — this invariant
 * could not truthfully be proven here — and the pack fails closed on it. The
 * temptation is to skip and report green; that would mean the pack covered half
 * the platform at exactly the boundary it exists to guard.
 */
function runProof(inv) {
  const isVitest = inv.proof.runner === RUNNER.VITEST;
  const cwd = isVitest ? join(REPO, "web") : REPO;
  const file = isVitest ? join(REPO, "web", inv.proof.target) : join(REPO, inv.proof.target);

  if (!existsSync(file)) {
    return { outcome: OUTCOME.UNMEASURED, detail: `proof not present: ${inv.proof.target}` };
  }
  if (isVitest && !existsSync(join(REPO, "web", "node_modules"))) {
    // A real and common case: a promotion worktree has no web dependencies. It
    // is reported precisely so the caller knows what to install, rather than
    // being quietly dropped from the pack.
    return { outcome: OUTCOME.UNMEASURED, detail: "web/node_modules absent; run from a provisioned worktree" };
  }

  const cmd = isVitest ? "npx" : process.execPath;
  const args = isVitest
    ? ["vitest", "run", inv.proof.target, "--reporter=dot"]
    : [file];
  const r = spawnSync(cmd, args, {
    cwd, encoding: "utf8", timeout: BUDGET.max_ms, maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (r.error || r.status === null) {
    return { outcome: OUTCOME.UNMEASURED, detail: `proof did not complete: ${r.error?.message || "timed out"}` };
  }
  if (r.status === 0) return { outcome: OUTCOME.PASS, detail: null };
  // The control's own last line is the most useful summary there is. The full
  // output deliberately does not travel: raw test stdout in an evidence record
  // is the unbounded log the knowledge model exists to prevent.
  const tail = String(r.stdout || r.stderr || "").trim().split("\n").filter(Boolean).slice(-1)[0] || "";
  return { outcome: OUTCOME.FAIL, detail: tail.slice(0, 200) };
}

const result = await runCriticalInvariants({
  candidate: resolveCandidate(),
  environment: `local checkout ${REPO}`,
  level,
  baseline,
  runProof,
});

if (asJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${PACK_VERSION}  level ${level}  candidate ${result.candidate?.slice(0, 9) || "unknown"}\n\n`);
  for (const r of result.results) {
    const mark = r.outcome === OUTCOME.PASS ? "ok  "
      : r.outcome === OUTCOME.FAIL ? (r.pre_existing ? "DEBT" : "FAIL") : "????";
    process.stdout.write(`${mark} ${r.id.padEnd(18)} ${String(r.ms ?? "").padStart(6)}ms  ${r.statement}\n`);
    if (r.detail) process.stdout.write(`     ${r.detail}\n`);
  }
  const c = result.counts;
  process.stdout.write(
    `\n${result.verdict}  passed ${c.passed}/${c.total}`
    + `  new failures ${c.failed_new}  pre-existing ${c.failed_pre_existing}  unmeasured ${c.unmeasured}`
    + `  ${result.elapsed_ms}ms${result.within_budget ? "" : "  OVER BUDGET"}\n`,
  );
  if (result.blocks_integration) {
    process.stdout.write("\nThis blocks READY_FOR_STAGING. There is no override for a failed critical invariant.\n");
  }
}

// A non-zero exit is the enforcement. 2 for a real failure, 3 for unmeasured —
// distinguished so a caller can tell "the platform is broken" from "this
// checkout cannot prove it".
process.exit(result.verdict === OUTCOME.PASS ? 0 : (result.counts.failed_new ? 2 : 3));
