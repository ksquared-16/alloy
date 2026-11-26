#!/usr/bin/env node
/**
 * `vac train` — what is waiting, when it leaves, and why it is not leaving now.
 *
 * A PROJECTION AND A PLANNER, NEVER A MERGE. This CLI composes nothing on its
 * own authority and cannot reach a remote: the train module it calls has no
 * shell and no network, and the one staging mutation a train performs is a
 * governed `repository.merge_pull_request` requested through the ordinary path.
 * `--plan` prints what a train WOULD contain.
 *
 * Usage:
 *   vac-train.mjs [--json]                 the queue, the next train, the last one
 *   vac-train.mjs --plan <sha>[,<sha>...]  order a candidate set and show the drop list
 *   vac-train.mjs --gates                  audit the promotion gate contract
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  orderTrainCandidates, formTrain, trainProjection, invariantEnvironmentReadiness,
  trainMigrationLedger, TRAIN_POLICY, TRAIN_SCHEMA,
} from "./lib/vacilando/promotion-train.mjs";
import { auditPromotionGates } from "./lib/vacilando/promotion-gate-contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };

/** Real git, bounded by the module's own verb allowlist on the way in. */
function gitImpl(args, { cwd = REPO } = {}) {
  try {
    const stdout = execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout || "", stderr: e.stderr || String(e.message || e) };
  }
}

if (argv.includes("--gates")) {
  const audit = auditPromotionGates();
  if (asJson) process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  else {
    process.stdout.write(`${audit.version}  gates ${audit.gates}\n\n`);
    for (const f of audit.findings) process.stdout.write(`DEFECT ${f.gate}: ${f.defect} — ${f.detail}\n`);
    process.stdout.write(audit.clean ? "every gate declares boundary, owner, freshness and explanation\n" : `\n${audit.findings.length} defect(s)\n`);
  }
  process.exit(audit.clean ? 0 : 2);
}

const planArg = arg("--plan");
if (planArg) {
  const shas = planArg.split(",").map((s) => s.trim()).filter(Boolean);
  const candidates = shas.map((sha) => ({ id: sha, sha, ready: true, certified_at: null }));
  const ordered = orderTrainCandidates(candidates, { gitImpl, cwd: REPO });
  const ledger = trainMigrationLedger({ candidates: ordered.ordered, gitImpl, cwd: REPO });
  const env = invariantEnvironmentReadiness({ worktreePath: REPO, existsImpl: existsSync });
  const out = { schema: TRAIN_SCHEMA, policy: TRAIN_POLICY, ordered: ordered.ordered.map((c) => c.sha), ...ordered, migrations: ledger, environment: env };
  if (asJson) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); process.exit(ordered.ok ? 0 : 2); }

  process.stdout.write(`train plan — ${shas.length} candidate(s) offered, ${ordered.ordered.length} would board\n\n`);
  for (const c of ordered.ordered) process.stdout.write(`  board    ${c.sha.slice(0, 9)}\n`);
  for (const d of ordered.dropped) process.stdout.write(`  drop     ${d.sha.slice(0, 9)}  ${d.reason} ${d.superseded_by?.slice(0, 9) || ""}\n`);
  for (const b of ordered.blocked) process.stdout.write(`  BLOCKED  ${b.sha.slice(0, 9)}  ${b.reason}: ${(b.missing || []).join(", ")}\n`);
  for (const c of ordered.conflicts) process.stdout.write(`  CONFLICT ${c.sha.slice(0, 9)} with ${c.conflicts_with}\n`);
  process.stdout.write(`\nmigrations\n`);
  process.stdout.write(`  promoted obligations   ${ledger.promoted_obligations.count} (must already be on the deployed primary)\n`);
  process.stdout.write(`  candidate additions    ${ledger.candidate_additions.migrations.length} ${ledger.candidate_additions.migrations.join(", ") || "(none)"}\n`);
  process.stdout.write(`  post-merge obligations ${ledger.post_merge_obligations.migrations.length} (due after landing)\n`);
  if (!env.ready) process.stdout.write(`\nenvironment: ${env.missing.join(", ")} absent — ${env.remedy}\n`);
  process.exit(ordered.ok ? 0 : 2);
}

// The default view. No queue store exists yet — READY_FOR_STAGING lives on the
// existing candidate records — so this reports the shape and the policy rather
// than inventing a store to read.
const projection = trainProjection({ queue: [], formation: formTrain({ queue: [] }) });
if (asJson) process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
else {
  process.stdout.write(`READY_FOR_STAGING: ${projection.ready_for_staging}\n`);
  process.stdout.write(`NEXT TRAIN:        ${projection.next_train || "no candidates waiting"}\n`);
  process.stdout.write(`CADENCE:           ${TRAIN_POLICY.cadence_ms / 60000}m, max wait ${TRAIN_POLICY.max_wait_ms / 60000}m, ceiling ${TRAIN_POLICY.max_candidates}\n`);
  process.stdout.write(`LAST TRAIN:        ${projection.last_train ? JSON.stringify(projection.last_train) : "none"}\n`);
}
