/**
 * Host Steward — Vacilando cleans up what Vacilando owns.
 *
 * THE OPERATOR IS NOT THE GARBAGE COLLECTOR. A host reached 90% swap, 0.11 GB
 * free and one core pinned by a test whose run had ended hours earlier, and the
 * only thing that noticed was a person reading a report. Every resource below
 * was structurally registered and therefore read as healthy.
 *
 * THE CORRECTION. A PID existing is not ownership. Ownership is a claim by a
 * NON-TERMINAL run, lane or lease. When the owning lifecycle ends, the resource
 * becomes residue, and residue is the steward's to reconcile.
 *
 * WHAT THIS MODULE IS. Pure classification and policy: observe -> attribute ->
 * classify -> plan. It performs no side effects, spawns nothing, and signals
 * nothing; the executor is separate and is the only place a signal is sent.
 * That split is what let the reconciliation executor be proven free of
 * destructive verbs, and it is repeated here deliberately.
 *
 * FAIL CLOSED. Anything that cannot be confidently attributed to Vacilando is
 * FOREIGN_UNKNOWN and is never actioned. Ambiguity surfaces; it does not act.
 */
import { createHash } from "node:crypto";

export const HOST_STEWARD_SCHEMA = "vacilando.host_steward.v1";
export const HOST_STEWARD_POLICY_VERSION = "host_steward_v1";

/**
 * Ownership classes.
 *
 * TERMINAL_RUN_RESIDUE is the class that did not exist before. Without it a
 * dev server whose run was ABANDONED six days ago is indistinguishable from one
 * serving live work, because both have a parent process and a registry row.
 */
export const OWNERSHIP = Object.freeze({
  LIVE: "live",
  TERMINAL_RUN_RESIDUE: "terminal_run_residue",
  UNOWNED_ALLOY_RESOURCE: "unowned_alloy_resource",
  FOREIGN_UNKNOWN: "foreign_unknown",
});

/** Run states that end a lifecycle. Anything else still owns its resources. */
export const TERMINAL_RUN_STATES = Object.freeze(["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"]);

/** Resource classes the steward may reconcile at all. */
export const RESOURCE_CLASSES = Object.freeze([
  "test_process", "build_process", "typecheck_process", "dev_server",
  "provider_seat", "port_registration", "toolkit_version",
]);

/**
 * Grace by terminal state, in milliseconds.
 *
 * ABANDONED gets none: abandonment already means nobody is coming back. FAILED
 * gets a short window so a retry can reuse a warm server. COMPLETE gets the
 * longest, because completing work is the case most likely to be followed
 * immediately by more work in the same worktree.
 */
export const TERMINAL_GRACE_MS = Object.freeze({
  COMPLETE: 12 * 60_000,
  FAILED: 5 * 60_000,
  ABANDONED: 0,
  CANCELLED: 0,
  ABSENT: 15 * 60_000,
});

/**
 * Actions the steward may take WITHOUT human approval, per resource class.
 * Everything not on this list is surfaced, never performed.
 */
export const AUTONOMOUS_ACTIONS = Object.freeze([
  "terminate_terminal_test_process",
  "stop_terminal_dev_server",
  "reclaim_idle_provider_seat",
  "repair_stale_port_registration",
  "prune_policy_eligible_toolkit",
  /*
   * V3 PHASE 4 — AN AUTHORITY CHANGE, RECORDED RATHER THAN SLIPPED IN.
   *
   * `retire_worktree` was operator-only here "whatever the evidence says". It
   * moved because Phase 4 asked that routine safe reclamation stop requiring a
   * Director, and because the evidence bar it now runs behind is not a
   * heuristic: every one of thirteen safety gates measured and passed, an
   * unmeasured gate blocking exactly as a failed one does, the executor
   * re-measuring and refusing on any drift from the bound fingerprint, removal
   * through `git worktree remove` WITHOUT --force so Git's own refusal is the
   * last gate, and the branch never deleted with the checkout.
   *
   * The basis for calling it safe at all is that a worktree is a checkout and
   * not the work: it is retired only where the commits are proven reachable
   * from the canonical remote, so recreating it is one `git worktree add`. The
   * moment durability is unproven, the gate fails and this list is irrelevant.
   *
   * The residue planner still has no `worktree` entry in ACTION_FOR_CLASS, so
   * this does not make process-residue classification a retirement authority.
   * Retirement is planned by the hygiene cycle from retirement-safety evidence,
   * which is the only evidence that ever justified it.
   */
  "retire_worktree",
  "reconcile_stale_worktree_registration",
  "reclaim_diagnostic_log",
]);

/** Actions that always require the operator, whatever the evidence says. */
export const OPERATOR_ONLY_ACTIONS = Object.freeze([
  "terminate_active_run_process",
  "terminate_foreign_process",
  "stop_docker_or_supabase",
  "terminate_interactive_agent",
  // Deleting a branch remains operator-only and is deliberately NOT implied by
  // retiring the worktree that checked it out. Two decisions, two blast radii.
  "delete_branch",
  "delete_outside_retention_policy",
  "change_security_control",
]);

const norm = (v) => String(v ?? "").trim().toUpperCase();

/** True when a run state ends the lifecycle. Absent/unknown is NOT terminal — it is unknown. */
export function isTerminalRunState(state) {
  return TERMINAL_RUN_STATES.includes(norm(state));
}

/**
 * Attribute one observed resource to an ownership class.
 *
 * `owningRuns` is every run that references the resource. A single non-terminal
 * run anywhere in that set makes the resource LIVE — the steward never weighs
 * "mostly terminal".
 */
export function attributeResource({
  resourceClass = null,
  alloyOwned = null,
  owningRuns = null,
  activeLeases = null,
  nowMs = Date.now(),
  lastTerminalAt = null,
} = {}) {
  // Fail closed: we must be able to say this is ours before we say anything else.
  if (alloyOwned !== true) {
    return { ownership: OWNERSHIP.FOREIGN_UNKNOWN, reason: "not confidently attributable to Alloy/Vacilando" };
  }
  if (!RESOURCE_CLASSES.includes(String(resourceClass))) {
    return { ownership: OWNERSHIP.FOREIGN_UNKNOWN, reason: `resource class ${resourceClass} is not stewarded` };
  }
  // An active lease outranks run state: certification and QA hold servers alive
  // on purpose, and their runs are not the claim.
  if (Array.isArray(activeLeases) && activeLeases.length) {
    return { ownership: OWNERSHIP.LIVE, reason: `held by ${activeLeases.length} active lease(s)`, leases: activeLeases };
  }
  if (owningRuns == null) {
    // We could not read the run store at all. Unknown ownership is not absent
    // ownership, and this is exactly where a permissive default would kill live work.
    return { ownership: OWNERSHIP.FOREIGN_UNKNOWN, reason: "run ownership could not be determined" };
  }
  const live = owningRuns.filter((r) => !isTerminalRunState(r?.state));
  if (live.length) {
    return { ownership: OWNERSHIP.LIVE, reason: `owned by ${live.length} non-terminal run(s)`, runs: live };
  }
  if (!owningRuns.length) {
    return {
      ownership: OWNERSHIP.UNOWNED_ALLOY_RESOURCE,
      reason: "an Alloy resource with no resolvable owning run",
      terminal_at: lastTerminalAt ?? null,
    };
  }
  const newestTerminal = owningRuns
    .map((r) => ({ state: norm(r?.state), at: Date.parse(r?.updated_at || r?.completed_at || "") || null }))
    .sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  return {
    ownership: OWNERSHIP.TERMINAL_RUN_RESIDUE,
    reason: `every owning run is terminal (newest ${newestTerminal.state})`,
    terminal_state: newestTerminal.state,
    terminal_at: newestTerminal.at ?? lastTerminalAt ?? null,
  };
}

/** Milliseconds of grace this resource still has before it may be reconciled. */
export function graceRemainingMs(attribution, { nowMs = Date.now(), grace = TERMINAL_GRACE_MS } = {}) {
  if (attribution.ownership === OWNERSHIP.UNOWNED_ALLOY_RESOURCE) {
    const at = attribution.terminal_at;
    if (at == null) return 0; // no owner and no timestamp: nothing will ever start its clock
    return Math.max(0, (at + grace.ABSENT) - nowMs);
  }
  if (attribution.ownership !== OWNERSHIP.TERMINAL_RUN_RESIDUE) return Infinity;
  const window = grace[attribution.terminal_state] ?? grace.ABSENT;
  const at = attribution.terminal_at;
  // A terminal run with no timestamp cannot prove its grace has expired.
  if (at == null) return window > 0 ? Infinity : 0;
  return Math.max(0, (at + window) - nowMs);
}

/**
 * Decide what, if anything, the steward may do about one resource.
 *
 * Returns an action or a refusal, and ALWAYS the evidence. A refusal that does
 * not say why is indistinguishable from a resource nobody looked at.
 */
export function planResourceAction(resource = {}, { nowMs = Date.now(), grace = TERMINAL_GRACE_MS } = {}) {
  const attribution = attributeResource({ ...resource, nowMs });
  const base = {
    id: resource.id ?? null,
    resource_class: resource.resourceClass ?? null,
    ownership: attribution.ownership,
    reason: attribution.reason,
    evidence: {
      pid: resource.pid ?? null,
      pgid: resource.pgid ?? null,
      command: resource.command ?? null,
      owning_runs: (resource.owningRuns || []).map((r) => ({ run_id: r?.run_id ?? null, state: r?.state ?? null })),
      cpu_percent: resource.cpuPercent ?? null,
      cpu_seconds: resource.cpuSeconds ?? null,
      footprint_bytes: resource.footprintBytes ?? null,
      last_progress_at: resource.lastProgressAt ?? null,
    },
  };

  if (attribution.ownership === OWNERSHIP.LIVE) {
    return { ...base, action: null, decision: "preserve", detail: "a live owner still claims this resource" };
  }
  if (attribution.ownership === OWNERSHIP.FOREIGN_UNKNOWN) {
    return { ...base, action: null, decision: "surface", detail: "ownership is not certain; the steward fails closed" };
  }

  const remaining = graceRemainingMs(attribution, { nowMs, grace });
  if (remaining === Infinity) {
    return { ...base, action: null, decision: "surface", detail: "terminal, but grace cannot be proven expired" };
  }
  if (remaining > 0) {
    return { ...base, action: null, decision: "wait", detail: `grace expires in ${Math.ceil(remaining / 1000)}s`, grace_remaining_ms: remaining };
  }

  const action = ACTION_FOR_CLASS[String(resource.resourceClass)] ?? null;
  if (!action) {
    return { ...base, action: null, decision: "surface", detail: `no autonomous action defined for ${resource.resourceClass}` };
  }
  // A heartbeat still ticking means the thing is working, whatever its run says.
  if (resource.lastProgressAt != null && resource.progressGraceMs != null
    && (nowMs - Number(resource.lastProgressAt)) < Number(resource.progressGraceMs)) {
    return { ...base, action: null, decision: "wait", detail: "progress heartbeat is still fresh" };
  }
  return { ...base, action, decision: "reconcile", detail: attribution.reason };
}

const ACTION_FOR_CLASS = Object.freeze({
  test_process: "terminate_terminal_test_process",
  build_process: "terminate_terminal_test_process",
  typecheck_process: "terminate_terminal_test_process",
  dev_server: "stop_terminal_dev_server",
  provider_seat: "reclaim_idle_provider_seat",
  port_registration: "repair_stale_port_registration",
  toolkit_version: "prune_policy_eligible_toolkit",
});

/** Build the whole cycle plan. Deterministic and order-stable. */
export function buildStewardPlan(resources = [], { nowMs = Date.now(), grace = TERMINAL_GRACE_MS } = {}) {
  const decisions = resources.map((r) => planResourceAction(r, { nowMs, grace }));
  const reconcile = decisions.filter((d) => d.decision === "reconcile");
  // Nothing that requires the operator may ever reach the autonomous set.
  for (const d of reconcile) {
    if (!AUTONOMOUS_ACTIONS.includes(d.action)) {
      d.decision = "surface";
      d.detail = `${d.action} is not an autonomous action`;
      d.action = null;
    }
  }
  const autonomous = decisions.filter((d) => d.decision === "reconcile");
  return {
    schema_version: HOST_STEWARD_SCHEMA,
    policy_version: HOST_STEWARD_POLICY_VERSION,
    generated_at: new Date(nowMs).toISOString(),
    autonomous,
    waiting: decisions.filter((d) => d.decision === "wait"),
    preserved: decisions.filter((d) => d.decision === "preserve"),
    surfaced: decisions.filter((d) => d.decision === "surface"),
    fingerprint: stewardFingerprint(decisions),
  };
}

/** Binds a plan to the evidence that produced it, exactly as S7 binds corrections. */
export function stewardFingerprint(decisions = []) {
  const shape = decisions.map((d) => ({
    id: d.id, cls: d.resource_class, own: d.ownership, act: d.action ?? null, dec: d.decision,
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return createHash("sha256").update(JSON.stringify({ schema: HOST_STEWARD_SCHEMA, shape })).digest("hex").slice(0, 32);
}
