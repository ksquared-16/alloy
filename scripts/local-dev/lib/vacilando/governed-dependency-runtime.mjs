/**
 * S2 — the live producer and dispatcher for governed dependencies.
 *
 * S1 proved the contract. This is the part that runs: a worker at a capability
 * boundary emits a dependency, the originating run waits through S6, and
 * Vacilando resolves governance, then authority, then capacity, then dispatches
 * — without ever asking an operator which lane should take the work.
 *
 * THE TRUTH LADDER IS THE POINT OF THIS SLICE.
 *
 *     Governed request existence is not approval.
 *     Approval is not execution.
 *     Execution is not verified effect.
 *
 * The Health & Safety incident collapsed all three: a request that FAILED input
 * validation was described in the next request's own inputs as having "applied
 * H1 only", and a `head: true` count probe reported a missing table as present.
 * Nothing in the system contradicted either claim. `governanceTruth` now derives
 * each rung from canonical evidence alone, and `detectGovernanceContradiction`
 * surfaces a worker that claims a rung its evidence does not reach — rather than
 * quietly preferring the worker's version.
 *
 * NOTHING HERE FORKS GOVERNED EXECUTION. Approval and execution stay with the
 * governed-action owner; runs stay with the Execution Run owner; waits stay with
 * S6; capacity stays with S4/S5. This module decides ORDER and PLACEMENT, and
 * records what it decided.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  DEPENDENCY_STATES,
  TERMINAL_DEPENDENCY_STATES,
  STATE_WAIT_REASON,
  continuationDecision,
  declareGovernedDependency,
  dependencySubjectKey,
  enumerateExecutorCandidates,
  requestFiledAt,
  operatorView,
  resolveApprovalFromStore,
  routeGovernedDependency,
  summarizeDependencies,
  verifyResumeConditions,
} from "./governed-dependency.mjs";
import { describeWait } from "./run-wait.mjs";

export const DEPENDENCY_STORE_SCHEMA = "vacilando.governed_dependency_store.v1";

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim() || join(homedir(), ".local", "state", "alloy-dev");
}
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();
const storePath = (root = runtimeRoot()) => join(root, "vacilando", "governed-dependencies", "dependencies.json");
const eventsPath = (root = runtimeRoot()) => join(root, "vacilando", "governed-dependencies", "events.jsonl");

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function readDependencyStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(storePath(root), "utf8"));
    return { schema_version: DEPENDENCY_STORE_SCHEMA, dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [] };
  } catch {
    return { schema_version: DEPENDENCY_STORE_SCHEMA, dependencies: [] };
  }
}

function writeDependencyStore(store, root) {
  atomicWrite(storePath(root), store);
  return store;
}

function emitEvent(type, dep, root, extra = {}) {
  try {
    mkdirSync(dirname(eventsPath(root)), { recursive: true });
    const line = JSON.stringify({
      type, dependency_id: dep?.dependency_id ?? null, state: dep?.dependency_state ?? null,
      originating_run_id: dep?.originating_run_id ?? null, at: iso(), ...extra,
    });
    const fs = existsSync(eventsPath(root));
    writeFileSync(eventsPath(root), fs ? `${readFileSync(eventsPath(root), "utf8")}${line}\n` : `${line}\n`, "utf8");
  } catch { /* an event log must never block the lifecycle */ }
}

export function getDependency(dependencyId, root = runtimeRoot()) {
  return readDependencyStore(root).dependencies.find((d) => d.dependency_id === dependencyId) || null;
}

export function listDependencies({ root = runtimeRoot(), open = false } = {}) {
  const all = readDependencyStore(root).dependencies;
  return open ? all.filter((d) => !TERMINAL_DEPENDENCY_STATES.includes(d.dependency_state)) : all;
}

export function dependenciesForRun(runId, root = runtimeRoot()) {
  return readDependencyStore(root).dependencies.filter((d) => d.originating_run_id === runId);
}

function saveDependency(dep, root) {
  const store = readDependencyStore(root);
  const i = store.dependencies.findIndex((d) => d.dependency_id === dep.dependency_id);
  if (i >= 0) store.dependencies[i] = dep; else store.dependencies.push(dep);
  writeDependencyStore(store, root);
  return dep;
}

// ── Test seams ───────────────────────────────────────────────────────────────

let impl = null;
export function setGovernedDependencyImplForTests(o = {}) { impl = o && typeof o === "object" ? o : null; }
export function resetGovernedDependencyImplForTests() { impl = null; }

async function runOwner() {
  return impl?.runOwner || await import("./execution-run.mjs");
}
async function governedOwner() {
  return impl?.governedOwner || await import("./governed-action-request.mjs");
}

// ── 1. The producer ──────────────────────────────────────────────────────────

/**
 * A worker at a capability boundary emits what it NEEDS.
 *
 * Placement fields are stripped by `declareGovernedDependency` and the attempt
 * is kept as governance evidence. Idempotency is by content fingerprint scoped
 * to the originating run: a worker that emits the same dependency twice — a
 * retry, a Gateway restart, a duplicated delivery — gets the same dependency
 * back, not a second one.
 */
export async function emitGovernedDependency(intent = {}, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const declared = declareGovernedDependency(intent, { now: nowMs });
  if (!declared.ok) return { ok: false, error: declared.error };
  const dep = declared.dependency;

  const existing = readDependencyStore(root).dependencies.find((d) =>
    d.originating_run_id === dep.originating_run_id
    && d.execution_fingerprint === dep.execution_fingerprint
    && !TERMINAL_DEPENDENCY_STATES.includes(d.dependency_state));
  if (existing) {
    return { ok: true, deduped: true, dependency: existing, rejected_worker_overrides: dep.rejected_worker_overrides };
  }

  saveDependency(dep, root);
  emitEvent("governed_dependency.declared", dep, root, {
    capability: dep.requested_capability,
    rejected_worker_overrides: dep.rejected_worker_overrides,
  });

  // 2. The originating run waits — through S6, not a new mechanism.
  const attached = await attachToOriginatingRun(dep, { root, nowMs });
  return { ok: true, deduped: false, dependency: dep, run: attached.run, run_error: attached.error ?? null };
}

/**
 * Move the parent into its canonical wait and record what it is waiting for.
 *
 * The continuation point is preserved on the run's own record: the dependency
 * id is the pointer back, so a Gateway restart can find the wait again without
 * the worker re-declaring anything.
 */
export async function attachToOriginatingRun(dep, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const RO = await runOwner();
  const run = RO.getExecutionRun?.(dep.originating_run_id, root) || null;
  if (!run) return { ok: false, error: "originating_run_not_found", run: null };

  const waitReason = STATE_WAIT_REASON[dep.dependency_state] || STATE_WAIT_REASON.WAITING_APPROVAL;
  const wait = describeWait({ reason: waitReason, resource_id: dep.dependency_id, waiting_since: nowMs, now: nowMs });

  const reason = `blocked on governed dependency ${dep.dependency_id}: ${dep.requested_capability}`;

  // ORDER MATTERS, and it cost a debugging pass to find out why.
  // `transitionExecutionRun` REWRITES `resource_wait` into its own canonical
  // shape, so writing the S6 descriptor first and transitioning afterwards
  // silently discarded every field S6 owns — reason, owner, deadline, bound
  // policy — and the parent waited on an object that said nothing. Transition
  // first, then write the wait.
  if (!RO.isTerminalRunState?.(run.state) && run.state !== "WAITING_RESOURCE") {
    RO.transitionExecutionRun?.(dep.originating_run_id, "WAITING_RESOURCE", {
      reason, origin: "system", nowMs, root,
      resource_wait: {
        resource_key: "governed_dependency",
        label: dep.requested_capability,
        action_key: dep.governed_action_key,
        target: dep.target_environment,
      },
    });
  }
  // AFTER the transition, for the same reason the wait is: a transition writes
  // its own `state_reason` from its `reason`, so anything set beforehand is
  // overwritten.
  RO.patchRunFields?.(dep.originating_run_id, {
    governed_dependency: publicDependency(dep),
    state_reason: reason,
  }, { nowMs, root });
  const existingWait = RO.getExecutionRun?.(dep.originating_run_id, root)?.resource_wait || {};
  RO.patchRunResourceWait?.(dep.originating_run_id, {
    ...existingWait,
    ...wait,
    dependency_id: dep.dependency_id,
    governed_action_key: dep.governed_action_key,
    target_environment: dep.target_environment,
  }, root);
  return { ok: true, run: RO.getExecutionRun?.(dep.originating_run_id, root) || null };
}

// ── 8. Governance-state truth guard ──────────────────────────────────────────

/** The four rungs, in order. Each is derived from evidence, never from prose. */
export const TRUTH_RUNGS = Object.freeze(["requested", "approved", "executed", "effective"]);

/**
 * What can honestly be claimed about this governed action right now?
 *
 * Each rung requires evidence of ITSELF, never of the rung below. A request
 * that exists proves only that it was requested; the Health & Safety requests
 * carry `status: failed`, `operator_approval: null`, `result_ref: null` and
 * therefore reach exactly the first rung.
 */
export function governanceTruth({ request = null, verification = null } = {}) {
  const requested = Boolean(request?.request_id);
  const approved = Boolean(request && (request.operator_approval || request.status === "complete") && request.status !== "denied");
  // `complete` is the store's word for executed-under-approval, and a result
  // reference is the artifact. A FAILED request executed nothing whatever its
  // inputs assert about a predecessor.
  const executed = Boolean(request && request.status === "complete" && (request.result_ref || request.trusted_host_action_id));
  const effective = Boolean(verification?.verified === true);

  return {
    requested, approved, executed, effective,
    highest: effective ? "effective" : executed ? "executed" : approved ? "approved" : requested ? "requested" : "none",
    evidence: {
      request_id: request?.request_id ?? null,
      status: request?.status ?? null,
      operator_approval: request?.operator_approval ? true : false,
      result_ref: request?.result_ref ?? null,
      failure_code: request?.failure_code ?? null,
      verification_reason: verification?.reason ?? null,
    },
  };
}

/**
 * Does a worker's claim outrun its evidence?
 *
 * Returns the contradiction rather than resolving it. Silently preferring
 * either side is how "gar_62f1af0052c793 applied H1 only" became an input to
 * the next request.
 */
export function detectGovernanceContradiction(claim, truth) {
  const claimed = String(claim || "").toLowerCase();
  const rung = TRUTH_RUNGS.find((r) => claimed.includes(r)) || null;
  if (!rung) return null;
  if (truth[rung] === true) return null;
  const idx = TRUTH_RUNGS.indexOf(rung);
  const supported = TRUTH_RUNGS.slice(0, idx).filter((r) => truth[r]).pop() || "nothing";
  return {
    contradiction: true,
    claimed: rung,
    supported_by_evidence: supported,
    detail: `the worker report claims "${rung}"; canonical evidence supports "${supported}"`,
    evidence: truth.evidence,
    // The store wins. The claim is surfaced, never adopted.
    authority: "governed_action_store",
  };
}

/** The most recent request on this dependency's exact subject, approved or not. */
export function latestRequestForDependency(dep, requests = []) {
  const wantSubject = dependencySubjectKey({ action_key: dep.governed_action_key, inputs: dep.action_inputs });
  return requests
    .filter((r) => r.action_key === dep.governed_action_key
      && (wantSubject == null || dependencySubjectKey(r) === wantSubject))
    .sort((a, b) => requestFiledAt(b).localeCompare(requestFiledAt(a)))[0] || null;
}

// ── 3. The dispatcher ────────────────────────────────────────────────────────

export const DISPATCH_ACTIONS = Object.freeze([
  "await_operator_approval", "await_executor_authority", "await_capacity",
  "dispatch_to_executor", "reuse_prior_execution", "verify", "resume_parent", "hold",
]);

/**
 * One deterministic dispatcher pass over one dependency.
 *
 * Order is fixed and is the safety property: governance, then authority, then
 * capacity, then placement. Nothing is dispatched before it is approved, and no
 * executor is even selected while approval is missing.
 *
 * The pass is idempotent. A dependency already EXECUTING with a live child is
 * not dispatched again, and one already SATISFIED does not resume its parent a
 * second time.
 */
export async function dispatchGovernedDependency(dependencyId, {
  root = runtimeRoot(),
  nowMs = Date.now(),
  candidates = null,
  capacity = null,
  readEvidence = null,
  executeGoverned = null,
  resumeParent = null,
} = {}) {
  const dep = getDependency(dependencyId, root);
  if (!dep) return { ok: false, error: "dependency_not_found" };
  if (TERMINAL_DEPENDENCY_STATES.includes(dep.dependency_state)) {
    return { ok: true, action: "hold", detail: `dependency is ${dep.dependency_state}`, dependency: dep, terminal: true, resumed_parent: false };
  }

  // Already dispatched: verify, never re-execute.
  if (dep.dependency_state === "EXECUTING" || dep.dependency_state === "VERIFYING") {
    return finishDependency(dep, { root, nowMs, readEvidence, resumeParent, terminal: dep.terminal_result || null });
  }

  const GO = await governedOwner();
  const requests = GO.readGovernedActionStore?.(root)?.requests || [];
  const { approval, supersededBy } = resolveApprovalFromStore(dep, requests);
  // The ladder describes the SUBJECT, not just the approval. A request that
  // exists and was refused has still been requested — reporting that as "no
  // governed request covers this" would be its own small untruth, and the
  // operator card leans on the distinction.
  const latestForSubject = latestRequestForDependency(dep, requests);
  const truth = governanceTruth({ request: approval || latestForSubject });

  const cands = Array.isArray(candidates)
    ? candidates
    : await enumerateExecutorCandidates(dep, { root });

  const ledger = readDependencyStore(root).dependencies
    .filter((d) => d.dependency_id !== dep.dependency_id)
    .map((d) => ({ dependency_id: d.dependency_id, execution_fingerprint: d.execution_fingerprint, state: d.dependency_state, verification_result: d.verification_result }));

  const step = routeGovernedDependency(dep, { approval, supersededBy, candidates: cands, capacity, ledger, now: nowMs });
  let next = { ...step.dependency, governance_truth: truth, governed_action_id: approval?.request_id ?? dep.governed_action_id ?? null };

  // Governance, authority and capacity all resolve to a WAIT. The parent's wait
  // is refreshed so it names the CURRENT reason, not the one it first had.
  if (step.action !== "dispatch_to_executor" && step.action !== "reuse_prior_execution") {
    next = saveDependency(next, root);
    emitEvent("governed_dependency.waiting", next, root, { action: step.action, detail: step.detail });
    await attachToOriginatingRun(next, { root, nowMs });
    return { ok: true, action: step.action, dependency: next, step, truth, resumed_parent: false };
  }

  if (step.action === "reuse_prior_execution") {
    next = saveDependency(next, root);
    emitEvent("governed_dependency.idempotent_reuse", next, root, { detail: step.detail });
    return finishDependency(next, { root, nowMs, readEvidence, resumeParent, terminal: next.terminal_result });
  }

  // ── D. Dispatch ────────────────────────────────────────────────────────────
  const child = await createDependentRun(next, { root, nowMs, executor: step.executor });
  next = saveDependency({
    ...next,
    dependency_state: "EXECUTING",
    assigned_execution_run_id: child.run_id,
    assigned_lane_id: child.lane_id,
    execution_placement: child.placement,
    dispatched_at: nowMs,
  }, root);
  emitEvent("governed_dependency.dispatched", next, root, { executor: step.executor, child_run_id: child.run_id, placement: child.placement });
  await attachToOriginatingRun(next, { root, nowMs });

  const exec = typeof executeGoverned === "function"
    ? await executeGoverned({ dependency: next, executor: step.executor, child, root, nowMs })
    : await defaultGovernedExecution({ dependency: next, approval, root, nowMs });

  next = saveDependency({ ...next, terminal_result: exec, dependency_state: exec?.ok === false ? "EXECUTING" : "VERIFYING" }, root);
  return finishDependency(next, { root, nowMs, readEvidence, resumeParent, terminal: exec });
}

/**
 * Execution through the EXISTING governed-action machinery.
 *
 * The dispatcher chooses placement; it does not implement privileged work. When
 * no approved request exists to execute, this refuses rather than inventing one.
 */
async function defaultGovernedExecution({ dependency, approval, root, nowMs }) {
  if (!approval?.request_id) return { ok: false, error: "no_approved_governed_action", retryable: false };
  const GO = await governedOwner();
  if (typeof GO.executeGovernedAction !== "function") {
    return { ok: false, error: "governed_execution_unavailable", retryable: true };
  }
  try {
    const out = await GO.executeGovernedAction(approval.request_id, { nowMs, root });
    return { ok: out?.ok !== false, error: out?.error ?? null, request_id: approval.request_id, retryable: out?.ok === false };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), retryable: true };
  }
}

/**
 * Represent the dependent work as a real Execution Run.
 *
 * SAME-LANE COMPATIBILITY IS PRESERVED DELIBERATELY. When the executor is the
 * trusted host acting for the originating lane, the canonical machinery already
 * runs that work against the parent's own run — that is how every governed
 * action on this host has ever executed. Manufacturing a second run for it
 * would fork governed execution to no purpose, so the placement is recorded as
 * `same_lane_trusted_host` and the parent run is named as the execution run.
 * A DIFFERENT executor gets a genuinely separate run in its own lane.
 */
export async function createDependentRun(dep, { root = runtimeRoot(), nowMs = Date.now(), executor = null } = {}) {
  const RO = await runOwner();
  if (!executor || executor.kind === "trusted_host") {
    return { run_id: dep.originating_run_id, lane_id: dep.originating_lane_id, placement: "same_lane_trusted_host", created: false };
  }
  const laneId = executor.lane_id;
  if (!laneId) return { run_id: null, lane_id: null, placement: "unplaceable", created: false, error: "executor_has_no_lane" };

  const created = RO.createQueuedRun?.({
    laneId,
    instruction: dependentRunInstruction(dep, executor),
    nowMs,
    origin: "system",
    root,
  });
  if (created?.ok) {
    RO.patchRunFields?.(created.run.run_id, {
      // The child knows its parent; the parent is never mutated from here.
      governed_dependency_parent: {
        dependency_id: dep.dependency_id,
        parent_run_id: dep.originating_run_id,
        parent_lane_id: dep.originating_lane_id,
        governed_action_id: dep.governed_action_id,
        capability: dep.requested_capability,
        environment: dep.target_environment,
        repository_id: dep.originating_repository_id,
        executor: executor.executor_id,
      },
    }, { nowMs, root });
    return { run_id: created.run.run_id, lane_id: laneId, placement: "dependent_run", created: true };
  }
  return { run_id: null, lane_id: laneId, placement: "blocked", created: false, error: created?.error || "dependent_run_not_created" };
}

function dependentRunInstruction(dep, executor) {
  return [
    `Governed dependency ${dep.dependency_id}`,
    `Capability: ${dep.requested_capability}`,
    `Environment: ${dep.target_environment ?? "unspecified"}`,
    `Governed action: ${dep.governed_action_key ?? "unspecified"} (${dep.governed_action_id ?? "unresolved"})`,
    `Requested for: run ${dep.originating_run_id}`,
    `Executor: ${executor?.executor_id ?? "unresolved"}`,
    "",
    "Execute through the existing governed-action machinery only. Do not mutate the parent run.",
  ].join("\n");
}

// ── 5-6. Verification, then continuation ─────────────────────────────────────

/**
 * Execution finished. Now decide whether the parent may resume.
 *
 * A successful child is never sufficient: the declared resume conditions are
 * evaluated against authoritative evidence under the proof contract, and only
 * SATISFIED resolves the parent's wait. Continuation is delivered exactly once,
 * guarded by `parent_resumed_at` on the durable record.
 */
export async function finishDependency(dep, { root = runtimeRoot(), nowMs = Date.now(), readEvidence = null, resumeParent = null, terminal = null } = {}) {
  const verification = terminal && terminal.ok === false
    ? null
    : await verifyResumeConditions(dep, { readEvidence, now: nowMs });

  const decision = continuationDecision(dep, verification, { terminal, now: nowMs });
  let next = saveDependency({ ...decision.dependency, governance_truth: governanceTruthFor(dep, verification) }, root);
  emitEvent("governed_dependency.verified", next, root, {
    verified: Boolean(verification?.verified), reason: verification?.reason ?? null, resume_parent: decision.resume_parent,
  });

  if (!decision.resume_parent) {
    await attachToOriginatingRun(next, { root, nowMs });
    return { ok: true, action: verification ? "verify" : "hold", dependency: next, verification, resumed_parent: false, operator_message: decision.operator_message };
  }

  // Exactly once. A duplicate completion, a dispatcher retry and a Gateway
  // restart all land here; only the first delivers a continuation.
  if (next.parent_resumed_at) {
    return { ok: true, action: "hold", dependency: next, verification, resumed_parent: false, already_resumed: true };
  }

  const resumed = await resumeOriginatingRun(next, { root, nowMs, resumeParent });
  next = saveDependency({ ...next, parent_resumed_at: nowMs, parent_resume_result: resumed }, root);
  emitEvent("governed_dependency.parent_resumed", next, root, { ok: Boolean(resumed?.ok) });
  return { ok: true, action: "resume_parent", dependency: next, verification, resumed_parent: Boolean(resumed?.ok), resume: resumed };
}

function governanceTruthFor(dep, verification) {
  return { ...(dep.governance_truth || {}), effective: Boolean(verification?.verified) };
}

/**
 * Resolve the S6 wait and continue the originating run through the canonical
 * path. The lane, worktree and run identity are unchanged — the dependency was
 * a wait, not a handoff.
 */
export async function resumeOriginatingRun(dep, { root = runtimeRoot(), nowMs = Date.now(), resumeParent = null } = {}) {
  if (typeof resumeParent === "function") return resumeParent({ dependency: dep, root, nowMs });
  const RO = await runOwner();
  const run = RO.getExecutionRun?.(dep.originating_run_id, root);
  if (!run) return { ok: false, error: "originating_run_not_found" };
  RO.patchRunResourceWait?.(dep.originating_run_id, null, root);
  RO.patchRunFields?.(dep.originating_run_id, {
    governed_dependency: publicDependency(dep),
    state_reason: `governed dependency ${dep.dependency_id} satisfied and verified`,
  }, { nowMs, root });
  if (run.state === "WAITING_RESOURCE") {
    RO.transitionExecutionRun?.(dep.originating_run_id, "EXECUTING", {
      reason: "governed_dependency_satisfied", origin: "system", nowMs, root,
      progress: `${dep.requested_capability} verified — resuming`,
    });
  }
  return { ok: true, run_id: dep.originating_run_id, same_lane: true, same_worktree: true };
}

// ── 10. Operator presentation ────────────────────────────────────────────────

export function publicDependency(dep) {
  if (!dep) return null;
  return {
    dependency_id: dep.dependency_id,
    state: dep.dependency_state,
    capability: dep.requested_capability,
    environment: dep.target_environment,
    governed_action_key: dep.governed_action_key,
    governed_action_id: dep.governed_action_id,
    required_executor_capabilities: dep.required_executor_capabilities,
    executor: dep.executor ?? null,
    assigned_execution_run_id: dep.assigned_execution_run_id ?? null,
    execution_placement: dep.execution_placement ?? null,
    governance_truth: dep.governance_truth ?? null,
    verification_result: dep.verification_result ?? null,
    failure_reason: dep.failure_reason ?? null,
    resume_conditions: (dep.resume_conditions || []).map((c) => c.subject),
  };
}

/**
 * The parent run's blocked card.
 *
 * Governance and executor are reported as separate facts because they are
 * separate problems with different owners — collapsing them is how a
 * provisioning gap gets read as a permissions problem. There is no branch that
 * asks the operator to choose a lane.
 */
export function parentRunView(dep, { step = null, laneName = null } = {}) {
  const title = laneName || dep.originating_lane_id || "Blocked run";
  const truth = dep.governance_truth || {};
  const lines = [title, "", "Blocked", dep.requested_capability, "", "Governance"];
  lines.push(truth.approved ? "Approved"
    : truth.requested ? "Latest request is not approved."
      : "No governed request covers the required action.");
  if (step?.operator_question) lines.push(step.operator_question);

  lines.push("", "Executor");
  switch (dep.dependency_state) {
    case "WAITING_EXECUTOR":
      lines.push(`No executor currently has ${(dep.required_executor_capabilities || []).join(", ")} authority`);
      lines.push(`for ${dep.target_environment}.`);
      for (const r of step?.must_be_provisioned || []) lines.push(`  needs: ${r}`);
      break;
    case "WAITING_APPROVAL":
      lines.push("Not resolved — governance is evaluated first.");
      break;
    case "WAITING_CAPACITY":
      lines.push(`${dep.executor?.executor_id} selected; waiting for capacity.`);
      break;
    case "EXECUTING":
      lines.push("Authorized executor selected", "", "Execution", "Applying…");
      break;
    case "SATISFIED": {
      lines.push("Authorized executor selected", "", "Execution", "Complete", "", "Verification");
      for (const c of dep.verification_result?.checked || []) lines.push(`${c.present === true ? "✓" : "✗"} ${c.subject}`);
      lines.push("", `${title} resumed automatically`);
      return lines.join("\n");
    }
    case "FAILED":
      lines.push("", "Failed", dep.failure_reason || "the dependent execution failed");
      return lines.join("\n");
    default:
      lines.push("Not yet resolved.");
  }
  lines.push("", "Vacilando will resume " + title + " automatically",
    "after approval, execution, and verification are complete.");
  return lines.join("\n");
}

export function summarizeRuntimeDependencies(root = runtimeRoot()) {
  return summarizeDependencies(listDependencies({ root }));
}

export { DEPENDENCY_STATES, operatorView };
