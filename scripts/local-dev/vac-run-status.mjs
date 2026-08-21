#!/usr/bin/env node
/**
 * Worker-facing Execution Run status report.
 * Writes only legal run transitions. Does not expose arbitrary JSON mutation.
 *
 *   vac run-status <run_id> <state> [--reason "..."] [--summary "..."] [--resource <key>]
 */
import { resolve } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { reportRunState } from "./lib/vacilando/execution-run.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac run-status <run_id> <state> [--reason "..."] [--summary "..."] [--resource <key>] [--json '{...}']
States: executing | validating | waiting-resource | needs-input | recovering | complete | failed
`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);

const runId = args.shift();
const state = args.shift();
if (!runId || !state || runId.startsWith("-") || state.startsWith("-")) usage();

let reason = null;
let summary = null;
let resource = null;
let lane = null;
let resourceEvent = null;
let checkpointReady = false;
let json = null;
while (args.length) {
  const a = args.shift();
  if (a === "--reason") reason = args.shift() || "";
  else if (a.startsWith("--reason=")) reason = a.slice(9);
  else if (a === "--summary") summary = args.shift() || "";
  else if (a.startsWith("--summary=")) summary = a.slice(10);
  else if (a === "--resource") resource = args.shift() || "";
  else if (a.startsWith("--resource=")) resource = a.slice(11);
  else if (a === "--resource-event") resourceEvent = args.shift() || "";
  else if (a.startsWith("--resource-event=")) resourceEvent = a.slice(17);
  else if (a === "--lane") lane = args.shift() || "";
  else if (a.startsWith("--lane=")) lane = a.slice(7);
  else if (a === "--json") json = args.shift() || "";
  else if (a.startsWith("--json=")) json = a.slice(7);
  else if (a === "--checkpoint-ready") checkpointReady = true;
  else usage();
}

let payload = null;
if (json) {
  try { payload = JSON.parse(json); } catch {
    process.stderr.write("vac run-status: invalid JSON\n");
    process.exit(1);
  }
}

const out = reportRunState(runId, state, {
  reason,
  summary,
  resource,
  resource_event: resourceEvent,
  origin: "agent",
  cwd: resolve(process.cwd()),
  expectedLaneId: lane || null,
  checkpoint_ready: checkpointReady,
  checkpoint_summary: checkpointReady ? summary : null,
  payload,
});

if (!out.ok) {
  process.stderr.write(`vac run-status: ${out.error}${out.from ? ` (${out.from} → ${out.to})` : ""}\n`);
  process.exit(out.error === "illegal_transition" || out.error === "worktree_mismatch" || out.error === "lane_mismatch" ? 4 : 1);
}

const run = out.run;
process.stdout.write(`${run.run_id} ${run.lane_id} ${run.state}\n`);
