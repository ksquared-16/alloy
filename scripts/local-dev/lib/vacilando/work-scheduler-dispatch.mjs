/**
 * BOUNDED AUTONOMOUS DISPATCH — the last mile, through the existing chain only.
 *
 * The planner selects, this starts, and neither invents authority. Everything
 * here runs through the canonical path:
 *
 *   createQueuedRun            (execution-run owns run identity)
 *   createAdmissionRequest     (execution-admission owns admission)
 *   evaluateAdmissionQueue     (which starts or reuses the provider)
 *
 * There is no second dispatcher, no direct provider spawn, and no bypass around
 * admission. A control asserts this file never calls startLaneAgentSession
 * itself: the moment a scheduler can start a provider directly, admission stops
 * being the place capacity is decided.
 *
 * THE PLAN IS EVIDENCE, NOT PERMISSION. Every gate is re-derived here from live
 * truth immediately before acting, exactly as the worktree retirement executor
 * and the toolkit prune do. A candidate that was eligible when the plan was
 * built and is not eligible now is refused, having done nothing.
 *
 * NEVER INTERRUPT A PROVIDER MID-TURN. An occupying run means the lane is
 * already doing something, and "already doing something" is never a reason to
 * start a second thing in it. That check is first because it is the one whose
 * failure would be destructive rather than merely wasteful.
 */
import { createQueuedRun, occupyingRunForLane, activeRunForLane } from "./execution-run.mjs";
import { createAdmissionRequest, admissionForLane, admissionOwnsLiveWork } from "./execution-admission.mjs";
import { authorizedNextStep } from "./authorized-next-step.mjs";
import { getLaneMemory } from "./lane-memory.mjs";
import { dispatchKey } from "./work-scheduler.mjs";

export const DISPATCH_SCHEMA = "vacilando.work_scheduler_dispatch.v1";

/** Every reason a dispatch is refused. Named so a refusal can be read, not guessed. */
export const DISPATCH_REFUSALS = Object.freeze([
  "not_enabled",
  "lane_occupied",
  "admission_open",
  "not_authorized",
  "dependencies_not_ready",
  "not_deterministic",
  "no_next_action",
  "mission_not_remaining",
  "no_instruction",
  "run_not_created",
  "admission_not_created",
  "not_verified",
]);

/**
 * Autonomous dispatch is OFF unless explicitly enabled.
 *
 * An environment flag rather than a code constant, so enabling it is an
 * operational decision that can be reversed without a promotion — and so this
 * module cannot enable itself.
 */
export function dispatchEnabled(env = process.env) {
  return String(env.VACILANDO_AUTONOMOUS_DISPATCH || "").trim() === "1";
}

const refuse = (reason, extra = {}) => ({ ok: false, dispatched: false, refusal: reason, ...extra });

/**
 * The instruction a dispatched run carries.
 *
 * Built from the lane's own recorded objective and next action — never
 * generated prose about what the model thinks should happen. If memory cannot
 * supply both, there is nothing to say and the dispatch is refused.
 */
export function instructionFor(record, contract) {
  const objective = record?.mission?.objective;
  const action = contract?.action_class;
  if (!objective || !action) return null;
  const lines = [
    `Continue the authorized work on this lane.`,
    ``,
    `Objective: ${objective}`,
    `Next authorized action: ${action}${contract.action_description ? ` — ${contract.action_description}` : ""}`,
    `Authorization provenance: ${(contract.provenance || []).join(", ")}`,
  ];
  const exclusions = record?.mission?.exclusions || [];
  if (exclusions.length) lines.push(`Explicitly out of scope: ${exclusions.join(", ")}`);
  lines.push(``, `This step was scheduled automatically from durable lane memory. Stop at the mission boundary above.`);
  return lines.join("\n");
}

/**
 * Dispatch one candidate. Re-derives everything; trusts nothing it was handed.
 */
export async function dispatchCandidate({
  laneId,
  root,
  nowMs = Date.now(),
  enabled = null,
  liveTruth = {},
  admit = null,
} = {}) {
  if (!root) return refuse("not_enabled", { detail: "missing runtime root" });
  if (!(enabled ?? dispatchEnabled())) return refuse("not_enabled");

  // 1. Never interrupt. First, because its failure is the destructive one.
  const occupying = occupyingRunForLane(laneId, root);
  if (occupying) return refuse("lane_occupied", { run_id: occupying.run_id, state: occupying.state });

  // 2. Idempotency: one open admission per lane means this work is already
  //    in flight, and a second run would be the duplicate dispatch §6 forbids.
  //    An admission only means "in flight" while the run it names is live. It
  //    is never closed when that run reaches a terminal state, so the record
  //    outlives the work — measured at 44 ACTIVE admissions across this estate,
  //    every one naming a COMPLETE, ABANDONED or missing run. Testing presence
  //    rather than liveness made every lane that had ever run permanently
  //    undispatchable.
  const open = admissionForLane(laneId, root);
  if (open && admissionOwnsLiveWork(open, root)) {
    return refuse("admission_open", { admission_id: open.admission_id, state: open.state, run_id: open.run_id });
  }

  // 3. Re-derive authority from live truth. The plan does not carry it.
  const record = getLaneMemory(laneId, root);
  const contract = authorizedNextStep({
    record,
    live: { lane_id: laneId, run_state: activeRunForLane(laneId, root)?.state ?? null, ...liveTruth },
    now: nowMs,
  });
  if (contract.mission_remaining === false) return refuse("mission_not_remaining", { contract });
  if (!contract.action_class) return refuse("no_next_action", { contract });
  if (contract.authorization !== "AUTHORIZED") return refuse("not_authorized", { authorization: contract.authorization, contract });
  if (contract.dependency_state !== "READY") return refuse("dependencies_not_ready", { dependency_state: contract.dependency_state, contract });
  if (contract.deterministic !== true) return refuse("not_deterministic", { contract });

  const instruction = instructionFor(record, contract);
  if (!instruction) return refuse("no_instruction");

  // 4. Canonical run identity.
  const created = createQueuedRun({ laneId, instruction, origin: "scheduler", nowMs, root });
  if (!created.ok) return refuse("run_not_created", { error: created.error });

  // 5. Canonical admission. The queue — not this module — starts or reuses the provider.
  const admission = createAdmissionRequest({ laneId, runId: created.run.run_id, nowMs, root });
  if (!admission.ok) return refuse("admission_not_created", { error: admission.error, run_id: created.run.run_id });

  // 6. Hand to the existing queue evaluator, injected so a test never has to
  //    stand up a provider to prove the wiring.
  let admitted = null;
  if (admit) admitted = await admit({ laneId, runId: created.run.run_id });
  else {
    const { evaluateAdmissionQueue } = await import("./execution-admission.mjs");
    admitted = await evaluateAdmissionQueue({ root, nowMs });
  }

  // 7. Verify by RE-READING, never by trusting the return value.
  const run = activeRunForLane(laneId, root);
  const verified = Boolean(run && run.run_id === created.run.run_id);
  return {
    ok: verified,
    dispatched: verified,
    refusal: verified ? null : "not_verified",
    lane_id: laneId,
    run_id: created.run.run_id,
    dispatch_key: dispatchKey({ lane_id: laneId, next_action: { kind: contract.action_class } }),
    action_class: contract.action_class,
    provenance: contract.provenance,
    admission_id: admission.request?.admission_id ?? admission.admission_id ?? null,
    admitted,
    run_state: run?.state ?? null,
  };
}
