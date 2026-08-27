/**
 * S7 reconciliation PLAN.
 *
 * Split from apply so a read-only caller — the CLI above all — can build and
 * print a plan without importing a single function capable of writing. The
 * request surface must be provably unable to apply, and the way to prove that
 * is for the apply verbs not to be reachable from it at all.
 */
import { createHash } from "node:crypto";
import { planCorrections } from "./resource-reconciliation.mjs";
import { normalizeVerdict } from "./reconciliation-observe.mjs";

export const RECONCILIATION_PLAN_SCHEMA = "vacilando.reconciliation_plan.v1";
export const RECONCILIATION_POLICY_VERSION = "routine_reconciliation_metadata_v1";

/**
 * The ONLY corrections this executor may apply. Every one writes Vacilando
 * metadata and nothing else. Adding a kind here without an apply implementation
 * that is metadata-only is the mistake this list exists to make visible.
 */
export const SAFE_CORRECTION_KINDS = Object.freeze([
  "clear_dead_pid_record",
  "adopt_observed_server",
  "adopt_unmanaged_worktree",
  "adopt_live_unregistered_worktree",
]);

/** Named so the exclusion is visible rather than implied by absence. */
export const WITHHELD_CORRECTION_KINDS = Object.freeze([
  "retire_worktree", "reassign_port", "any_correction",
]);

/**
 * Split planner output into what this executor may apply and what it may not.
 * Exported so the split is testable directly: today every planner action
 * happens to be allowlisted, so an inline filter would be a no-op no control
 * could see failing.
 */
export function applicableCorrections(actions = []) {
  return {
    corrections: actions.filter((a) => isSafeCorrection(a?.kind)),
    unsupported: actions.filter((a) => !isSafeCorrection(a?.kind)),
  };
}

export function isSafeCorrection(kind) {
  return SAFE_CORRECTION_KINDS.includes(String(kind || ""));
}


/* ── Plan identity ────────────────────────────────────────────────────────── */

/**
 * The fingerprint covers the correction set AND the safety-relevant observation
 * each correction rests on. If the world moves under an approved plan, the
 * fingerprint moves with it and the plan is stale — it can never act on a
 * process, port or worktree that changed after it was approved.
 */
export function planFingerprint({ corrections = [], observation = {} } = {}) {
  const safetyState = (observation.ports || []).map((p) => ({
    port: p.port, verdict: normalizeVerdict(p.verdict), alive: Boolean(p.alive),
    recorded_pid: p.recorded_pid ?? null, serving_pid: p.serving_pid ?? null,
    registered: p.registered ?? null,
  })).sort((a, b) => a.port - b.port);
  const wtState = (observation.worktrees || []).map((w) => ({
    path: w.path, state: w.state, managed: Boolean(w.managed), in_git: w.in_git_worktree_list ?? null,
  })).sort((a, b) => String(a.path).localeCompare(String(b.path)));
  const set = corrections.map((c) => ({
    kind: c.kind, port: c.port ?? null, path: c.path ?? null, worktree: c.worktree ?? null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256")
    .update(JSON.stringify({ set, safetyState, wtState }), "utf8")
    .digest("hex").slice(0, 32);
}

export function buildReconciliationPlan(observation, { nowMs = Date.now(), planId = null } = {}) {
  const normalized = {
    ...observation,
    ports: (observation.ports || []).map((p) => ({ ...p, verdict: normalizeVerdict(p.verdict) })),
  };
  const planned = planCorrections({ ports: normalized.ports, worktrees: normalized.worktrees || [] });
  // Only allowlisted kinds may ever be presented as applicable.
  const { corrections, unsupported } = applicableCorrections(planned.actions);
  return {
    schema_version: RECONCILIATION_PLAN_SCHEMA,
    plan_id: planId || `rplan_${createHash("sha256").update(String(nowMs) + JSON.stringify(corrections)).digest("hex").slice(0, 12)}`,
    policy_version: RECONCILIATION_POLICY_VERSION,
    generated_at: new Date(nowMs).toISOString(),
    corrections,
    withheld: planned.withheld,
    // An action the planner produced that this executor does not implement is
    // surfaced, never silently dropped into the applicable set.
    unsupported,
    observation: normalized,
    fingerprint: planFingerprint({ corrections, observation: normalized }),
  };
}

/** Is an approved plan still describing the world it was approved against? */
export function planIsCurrent(plan, freshObservation) {
  if (!plan || !freshObservation) return { current: false, reason: "missing_plan_or_observation" };
  const fresh = buildReconciliationPlan(freshObservation, { nowMs: 0, planId: plan.plan_id });
  if (fresh.fingerprint !== plan.fingerprint) {
    return { current: false, reason: "observed_state_changed", expected: plan.fingerprint, actual: fresh.fingerprint };
  }
  return { current: true, fresh };
}


