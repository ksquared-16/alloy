#!/usr/bin/env node
/**
 * Worker-facing governed-action report through canonical `vac`.
 *
 *   vac governed-action --run <id> --lane <lane> --json '{...}'
 *
 * Mission id is inherited from the durable lane binding when omitted.
 * Does not create a parallel request system.
 */
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { requestGovernedAction } from "./lib/vacilando/governed-action-request.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac governed-action --run <run_id> --lane <lane_id> --json '{...}'
`);
  process.exit(code);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);

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
    process.stderr.write("vac governed-action: invalid JSON\n");
    process.exit(1);
  }
}

// Resolve who can vouch for this action BEFORE asking. A lane with no Mission
// is not automatically ungoverned: its repository's profile may carry governed
// promotion, in which case the Director gets a proposal to approve instead of
// this CLI dead-ending on `missing_mission_binding`.
const { resolveGovernedAuthority } = await import("./lib/vacilando/governed-repository-authority.mjs");
const authority = await resolveGovernedAuthority(
  payload.lane_id || payload.laneId || lane,
);

const out = requestGovernedAction({
  ...payload,
  run_id: payload.run_id || payload.runId || runId,
  lane_id: payload.lane_id || payload.laneId || lane,
  mission_id: payload.mission_id || payload.missionId,
  __authority: authority,
}, { processNow: false });

if (!out.ok) {
  const detail = out.detail ? ` — ${out.detail}` : "";
  process.stderr.write(`vac governed-action: ${out.error}${detail}\n`);
  process.exit(out.error === "missing_mission_binding" ? 4 : 1);
}

process.stdout.write(`governed-action ${out.request.status} ${out.request.request_id} ${runId} ${lane}\n`);
