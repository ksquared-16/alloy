#!/usr/bin/env node
/**
 * Worker-facing Agent Session handoff / orientation / governed-action report.
 * Gateway-owned executable — do not rely on PATH `vac`.
 *
 *   node vac-session-report.mjs handoff --run <id> --lane <lane> --json '{...}'
 *   node vac-session-report.mjs oriented --run <id> --lane <lane> --json '{...}'
 *   node vac-session-report.mjs governed-action --run <id> --lane <lane> --json '{...}'
 */
import { resolve } from "node:path";
import { acceptHandoffReport, acceptOrientationReport } from "./lib/vacilando/agent-session-lifecycle.mjs";
import { requestGovernedAction } from "./lib/vacilando/governed-action-request.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac-session-report handoff|oriented|governed-action --run <run_id> --lane <lane_id> --json '{...}'
`);
  process.exit(code);
}

const args = process.argv.slice(2);
const kind = args.shift();
if (!kind || kind === "-h" || kind === "--help") usage(kind ? 0 : 2);
if (kind !== "handoff" && kind !== "oriented" && kind !== "governed-action") usage();

let runId = null;
let lane = null;
let json = null;
while (args.length) {
  const a = args.shift();
  if (a === "--run") runId = args.shift() || "";
  else if (a.startsWith("--run=")) runId = a.slice(6);
  else if (a === "--lane") lane = args.shift() || "";
  else if (a.startsWith("--lane=")) lane = a.slice(7);
  else if (a === "--json") json = args.shift() || "";
  else if (a.startsWith("--json=")) json = a.slice(7);
  else usage();
}
if (!runId || !lane) usage();

let payload = {};
if (json) {
  try { payload = JSON.parse(json); } catch {
    process.stderr.write("vac-session-report: invalid JSON\n");
    process.exit(1);
  }
}

if (kind === "governed-action") {
  const out = requestGovernedAction({
    ...payload,
    run_id: payload.run_id || payload.runId || runId,
    lane_id: payload.lane_id || payload.laneId || lane,
    mission_id: payload.mission_id || payload.missionId,
  }, { processNow: false });
  if (!out.ok) {
    process.stderr.write(`vac-session-report: ${out.error}\n`);
    process.exit(1);
  }
  process.stdout.write(`governed-action ${out.request.status} ${out.request.request_id} ${runId} ${lane}\n`);
  process.exit(0);
}

const cwd = resolve(process.cwd());
const out = kind === "handoff"
  ? acceptHandoffReport({ laneId: lane, runId, handoff: payload, cwd })
  : acceptOrientationReport({ laneId: lane, runId, orientation: payload, cwd });

if (!out.ok) {
  process.stderr.write(`vac-session-report: ${out.error}\n`);
  process.exit(out.error === "orientation_mismatch" || out.error === "stale_handoff" ? 4 : 1);
}
process.stdout.write(`${kind} ok ${runId} ${lane}\n`);
