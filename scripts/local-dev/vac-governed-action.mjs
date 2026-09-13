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
import { fileGovernedActionWithQaSlotPreflight } from "./lib/vacilando/qa-slot-preflight.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac governed-action --run <run_id> --lane <lane_id> --json '{...}'
       vac governed-action --list             what this host can be asked to do
       vac governed-action --contract <key>   the input contract for one action
       vac governed-action --status <gar_id>  authoritative state of one request

A lane discovers what it may propose with --list, then proposes with --json.
After filing, read state with --status. Never infer it from side effects.
`);
  process.exit(code);
}

/*
 * WHAT A WORKER IS TOLD AFTER FILING, AND WHY IT IS TOLD AT ALL.
 *
 * Filing used to print one line: `governed-action requested <id>`. Everything
 * after that happened on the trusted host, asynchronously, and a worker had no
 * way to learn the outcome except by watching for side effects.
 *
 * MEASURED, Documentation/API Thread 5: three `database.apply_migration`
 * requests. Each reached a TERMINAL state — 279s, 73s and 176s after filing —
 * and none of those outcomes ever reached the worker. Seeing no database
 * change, it concluded the request was malformed, went looking for the accepted
 * `environment` values, found a neighbouring Director-authority constant, and
 * filed `development_certification`. That one failed `environment_not_allowed`.
 * A third correct-looking request failed the same way as the first.
 *
 * None of the three was ever awaiting approval. All three FAILED validation on
 * the trusted host, minutes later, silently. The worker was not wrong to be
 * confused: nothing it could see distinguished "still working" from "already
 * dead".
 *
 * So every state now says what it is, whether the worker must do anything, and
 * how to look again. The single most important line is the one telling a worker
 * NOT to refile, because refiling is what turned one stuck migration into three.
 */
const STATE_GUIDANCE = Object.freeze({
  requested: {
    label: "Requested — queued for validation and authorization on the trusted host",
    worker: "No worker action is required. Do NOT refile this request.",
    next: "Validation runs on the trusted host; this becomes complete or failed.",
  },
  awaiting_director: {
    label: "Awaiting Director authorization",
    worker: "No worker action is required. Do NOT refile this request.",
    next: "The Director decides; the run may continue with work that does not depend on it.",
  },
  awaiting_operator: {
    label: "Awaiting operator approval",
    worker: "No worker action is required. Do NOT refile this request.",
    next: "A person must approve this. Do not poll aggressively — it cannot progress until they act.",
  },
  awaiting_checks: {
    label: "Waiting for CI checks to report",
    worker: "No worker action is required. Do NOT refile this request.",
    next: "Resumes automatically once the checks are reported.",
  },
  executing: {
    label: "Executing on the trusted host",
    worker: "No worker action is required. Do NOT refile this request.",
    next: "This becomes complete or failed.",
  },
  complete: {
    label: "Succeeded",
    worker: "Read the result and continue.",
    next: null,
  },
  failed: {
    label: "Failed — terminal",
    worker: "Correct the request before filing again. Refiling an identical request fails identically.",
    next: null,
  },
});

/** The contract for one action, read from the registry the executor uses. */
async function contractFor(actionKey) {
  const { listRegisteredActions } = await import("./lib/vacilando/trusted-host-action-registry.mjs");
  return listRegisteredActions().find((a) => a.actionType === actionKey) || null;
}

function printContract(c) {
  if (!c) return;
  process.stdout.write(`\nContract for ${c.actionType}\n`);
  process.stdout.write(`  required inputs : ${(c.requiredInputs || []).join(", ") || "(none)"}\n`);
  for (const [field, values] of Object.entries(c.acceptedValues || {})) {
    process.stdout.write(`  ${field} must be one of: ${values.join(" | ")}\n`);
  }
  process.stdout.write(`  risk            : ${c.riskClass}\n`);
  process.stdout.write("  inputs are nested under \"inputs\" in the --json payload\n");
}

/** Report the authoritative state of one request. Never inferred, always read. */
async function reportStatus(id) {
  const { listGovernedActions } = await import("./lib/vacilando/governed-action-request.mjs");
  const rec = listGovernedActions({}).find((r) => r.request_id === id);
  if (!rec) {
    process.stderr.write(`vac governed-action: no such request ${id}\n`);
    process.exit(1);
  }
  const g = STATE_GUIDANCE[rec.status] || { label: rec.status, worker: "", next: null };
  process.stdout.write(`\nGoverned action ${rec.request_id}\n`);
  process.stdout.write(`  action : ${rec.action_key}\n`);
  process.stdout.write(`  status : ${rec.status} — ${g.label}\n`);
  process.stdout.write(`  filed  : ${rec.created_at}\n`);
  process.stdout.write(`  updated: ${rec.updated_at}\n`);
  if (rec.failure_reason || rec.failure_code) {
    process.stdout.write(`  failure: ${rec.failure_code || "failed"}\n`);
    if (rec.failure_reason) process.stdout.write(`  reason : ${rec.failure_reason}\n`);
    // A refusal that names a contract must show that contract, or the worker
    // goes looking for it somewhere else and finds the wrong one.
    printContract(await contractFor(rec.action_key));
  }
  if (g.worker) process.stdout.write(`\n${g.worker}\n`);
  if (g.next) process.stdout.write(`${g.next}\n`);
  process.exit(rec.status === "failed" ? 1 : 0);
}

/**
 * What a lane may actually propose.
 *
 * DISCOVERY IS PART OF THE CONTRACT. A lane that cannot find out which actions
 * exist has to guess an action key, and a wrong guess comes back as
 * `unsupported_action_key` — indistinguishable from "the host refused me". The
 * catalog is read from the same registry the executor uses, so it can never
 * drift from what is really available.
 */
async function listActions() {
  const { listRegisteredActions } = await import("./lib/vacilando/trusted-host-action-registry.mjs");
  const rows = listRegisteredActions().map((d) => ({
    action_key: d.actionType,
    title: d.title,
    risk: d.riskClass,
    capability: d.requiredCapability,
    required_inputs: d.requiredInputs || [],
    // CAUGHT ON THE PROMOTED RUNTIME, NOT IN A TEST. The registry publishes
    // accepted values, `--contract` printed them, and this projection quietly
    // dropped them again — leaving the PRIMARY discovery surface still hiding
    // the one enum the Thread 5 worker went looking for. A projection that
    // re-lists fields is a place where a contract silently loses one.
    ...(d.acceptedValues ? { accepted_values: d.acceptedValues } : {}),
  }));
  process.stdout.write(`${JSON.stringify({ ok: true, actions: rows }, null, 2)}\n`);
  process.exit(0);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === "-h" || args[0] === "--help") usage(args.length ? 0 : 2);
if (args[0] === "--list" || args[0] === "list") await listActions();
if (args[0] === "--contract") {
  const key = args[1];
  if (!key) usage();
  const c = await contractFor(key);
  if (!c) {
    process.stderr.write(`vac governed-action: unknown action ${key}\n`);
    process.exit(1);
  }
  printContract(c);
  process.exit(0);
}
if (args[0] === "--status") {
  if (!args[1]) usage();
  await reportStatus(args[1]);
}

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

/*
 * Filed through the infrastructure preflight, not through `requestGovernedAction`
 * directly. For the managed QA actions the lane must hold a Development Slot
 * before the request can ever execute, and acquiring one safely is scheduling
 * rather than a decision — so it happens here, in front of the filing, instead
 * of becoming an operator card asking approval for something impossible. Every
 * other action passes straight through: the preflight is a no-op by action key.
 */
const out = await fileGovernedActionWithQaSlotPreflight({
  ...payload,
  run_id: payload.run_id || payload.runId || runId,
  lane_id: payload.lane_id || payload.laneId || lane,
  mission_id: payload.mission_id || payload.missionId,
  __authority: authority,
}, { processNow: false });

if (!out.ok) {
  const detail = out.detail ? ` — ${out.detail}` : "";
  process.stderr.write(`vac governed-action: ${out.error}${detail}\n`);
  // An immediate refusal is the best moment to show the contract: the worker is
  // holding the payload that was wrong.
  const c = await contractFor(payload.action_key || payload.actionType);
  if (c) printContract(c);
  process.exit(out.error === "missing_mission_binding" ? 4 : 1);
}

const st = out.request.status;
const g = STATE_GUIDANCE[st] || { label: st, worker: "", next: null };
// The machine-readable line stays FIRST and unchanged: existing callers and
// tests parse it, and a nicer report is not worth breaking them.
process.stdout.write(`governed-action ${st} ${out.request.request_id} ${runId} ${lane}\n`);
process.stdout.write(`\nGoverned action filed\n  ${out.request.request_id}\n\n`);
process.stdout.write(`Status: ${g.label}\n`);
if (g.next) process.stdout.write(`${g.next}\n`);
if (g.worker) process.stdout.write(`\n${g.worker}\n`);
process.stdout.write(`\nCheck state:  vac governed-action --status ${out.request.request_id}\n`);
