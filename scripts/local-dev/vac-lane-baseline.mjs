#!/usr/bin/env node
/**
 * `vac lane-baseline` — which canonical instruction has each lane resolved, and
 * does it still satisfy the bootstrap contract?
 *
 * READ-ONLY BY DEFAULT. `--revalidate` is the only mutating mode, and it does
 * not decide anything itself: it calls `revalidateLaneBootstrap`, which measures
 * each lane with the same resolver the health check uses and writes only what
 * the lane earned. This file owns no rule, computes no hash and holds no store.
 *
 * WHY IT EXISTS. DevOps 8 shipped the baseline hash, the drift detector and the
 * readers, and no writer — so every lane read UNRECORDED for ever, which looks
 * exactly like "we have never checked". The writer now lives in the lane
 * record's own owner; this is the surface that lets an operator run it and see
 * what it did.
 *
 * Usage:
 *   vac-lane-baseline.mjs [--json]        report every active lane, write nothing
 *   vac-lane-baseline.mjs --revalidate    measure and stamp what qualifies
 *   vac-lane-baseline.mjs --revalidate --lane <lane_id>
 */
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { listDurableLanes } from "./lib/vacilando/development-lane.mjs";
import { detectInstructionDrift } from "./lib/vacilando/agent-configuration.mjs";
import {
  REVALIDATION, resolveLaneBootstrap, revalidateFleetBootstrap, revalidateLaneBootstrap,
} from "./lib/vacilando/lane-bootstrap.mjs";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const revalidate = argv.includes("--revalidate");
const laneArg = argv.indexOf("--lane") > -1 ? argv[argv.indexOf("--lane") + 1] : null;
const known = new Set(["--json", "--revalidate", "--lane", laneArg].filter(Boolean));
const unknown = argv.filter((a) => a.startsWith("--") && !known.has(a));
if (unknown.length) {
  process.stderr.write(`vac lane-baseline: unknown option ${unknown[0]}\n`);
  process.exit(2);
}

/**
 * THE CURRENT BASELINE IS WHATEVER THE LANES READ, and it is only "the" baseline
 * when they all read the same thing. Reporting one lane's hash as the fleet's
 * would hide the very disagreement this command exists to surface, so a split
 * fleet is reported as split rather than resolved to a majority.
 */
function currentBaseline(rows) {
  const seen = new Map();
  for (const r of rows) {
    const v = r.current_baseline;
    if (!v) continue;
    seen.set(v, (seen.get(v) || 0) + 1);
  }
  if (seen.size === 1) return { version: [...seen.keys()][0], agreed: true, variants: 1 };
  return { version: null, agreed: false, variants: seen.size, counts: Object.fromEntries(seen) };
}

const lanes = listDurableLanes();
const targets = laneArg ? lanes.filter((l) => l.lane_id === laneArg) : lanes;
if (laneArg && !targets.length) {
  process.stderr.write(`vac lane-baseline: no active lane ${laneArg}\n`);
  process.exit(1);
}

let rows;
let written = { baselines: 0, bootstraps: 0 };
if (revalidate) {
  if (laneArg) {
    rows = [revalidateLaneBootstrap(laneArg)];
  } else {
    const out = revalidateFleetBootstrap();
    rows = out.rows;
    written = { baselines: out.baselines_written, bootstraps: out.bootstraps_stamped };
  }
  if (!laneArg) { /* counts already collected */ } else {
    written = {
      baselines: rows.filter((r) => r.instruction_baseline?.written).length,
      bootstraps: rows.filter((r) => r.bootstrap?.written).length,
    };
  }
} else {
  rows = targets.map((l) => {
    const r = resolveLaneBootstrap(l.lane_id);
    return {
      ok: r.ok,
      state: r.ok && r.unresolved.length === 0 ? REVALIDATION.SATISFIED : REVALIDATION.UNRESOLVED,
      lane_id: l.lane_id,
      contract_version: r.contract_version,
      observed_contract_version: r.observed_contract_version,
      current_baseline: r.baseline?.instruction_pack?.baseline_version ?? null,
      unresolved: r.unresolved,
      instruction_baseline: { written: false, state: "READ_ONLY" },
      bootstrap: { written: false, state: "READ_ONLY" },
    };
  });
}

// Re-read after any write so the drift table reflects what is now stored, not
// what was stored when this command started.
const after = listDurableLanes();
const baseline = currentBaseline(rows);
const drift = detectInstructionDrift({ lanes: after, currentVersion: baseline.version });
const nameOf = new Map(after.map((l) => [l.lane_id, l.name || l.lane_id]));

if (asJson) {
  process.stdout.write(`${JSON.stringify({ mode: revalidate ? "revalidate" : "read_only", baseline, written, drift, rows }, null, 2)}\n`);
} else {
  process.stdout.write(
    `lane baseline — ${rows.length} lane(s), ${revalidate ? "revalidating" : "read-only"}\n`
    + `current baseline  ${baseline.agreed ? baseline.version : `SPLIT across ${baseline.variants} variants`}\n\n`,
  );
  for (const r of rows) {
    const b = r.instruction_baseline || {};
    const s = r.bootstrap || {};
    process.stdout.write(
      `  ${String(r.state).padEnd(11)} ${String(nameOf.get(r.lane_id) || r.lane_id).padEnd(22)}`
      + ` baseline ${String(b.state || "-").padEnd(10)} bootstrap ${String(s.state || "-").padEnd(9)}`
      + `${r.unresolved?.length ? ` unresolved: ${r.unresolved.join(", ")}` : ""}\n`,
    );
  }
  const by = Object.entries(drift.by_state).map(([k, v]) => `${k} ${v}`).join("  ");
  process.stdout.write(`\ndrift  ${by || "none"}\n`);
  if (revalidate) {
    process.stdout.write(`wrote  ${written.baselines} baseline pointer(s), ${written.bootstraps} bootstrap stamp(s)\n`);
  }
}
