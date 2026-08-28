/**
 * The awaiting_operator invariant.
 *
 * THE RULE. If Vacilando says work is blocked on a human decision, that decision
 * must be actionable in Vacilando. Three things must all be true, or the state
 * must not be represented as awaiting_operator at all:
 *
 *   1. a canonical decision record exists
 *   2. Vacilando can name what decision is required
 *   3. the operator can perform it from Vacilando
 *
 * AND THE INVERSE. Every actionable operator decision must trace back to a
 * blocked resource, run or standing governed action. An approval floating with
 * nothing behind it is as broken as a block with no approval — one strands the
 * operator, the other asks them to decide about nothing.
 *
 * WHY THIS EXISTS. Two live states violated it at once: a Trust Runtime provider
 * sat blocked on a native permission prompt with NO decision record anywhere,
 * and a report claimed a merge was awaiting the operator when its governed
 * action had already completed. Neither was visible as an actionable decision,
 * and one of them was not a real decision at all.
 */
export const OPERATOR_DECISION_SCHEMA = "vacilando.operator_decision_invariant.v1";

/** Governed-action statuses that genuinely await a person. */
export const PENDING_STATUSES = Object.freeze(["awaiting_operator", "requested"]);
/** Statuses that can never be awaiting anyone. */
export const TERMINAL_STATUSES = Object.freeze(["complete", "completed", "failed", "denied", "cancelled", "expired"]);

const norm = (v) => String(v ?? "").trim().toLowerCase();

/**
 * Reconcile what claims to need a human against what is actually decidable.
 *
 * `projected` is what the operator's global decision surface would render.
 * Passing it in rather than recomputing is deliberate: the defect class being
 * guarded is precisely a projection that disagrees with the store, and a check
 * that derives the projection itself could never see that.
 */
export function reconcileOperatorDecisions({
  governedActions = [],
  runs = [],
  projected = null,
  providerPromptBlocks = [],
} = {}) {
  const pending = governedActions.filter((a) => PENDING_STATUSES.includes(norm(a?.status)));
  const projectedIds = new Set((projected || []).map((p) => p?.request_id ?? p?.id).filter(Boolean));

  const violations = [];

  // 1. A pending decision the operator cannot see.
  for (const a of pending) {
    if (!projectedIds.has(a.request_id)) {
      violations.push({
        kind: "pending_decision_not_projected",
        request_id: a.request_id, action_key: a.action_key, lane_id: a.lane_id ?? null,
        detail: "a governed action awaits the operator but does not appear on the global decision surface",
      });
    }
  }

  // 2. A projected decision whose action is already terminal.
  for (const p of projected || []) {
    const id = p?.request_id ?? p?.id;
    const a = governedActions.find((x) => x.request_id === id);
    if (!a) {
      violations.push({ kind: "projected_decision_without_action", request_id: id ?? null,
        detail: "the decision surface offers a decision with no canonical governed action behind it" });
      continue;
    }
    if (TERMINAL_STATUSES.includes(norm(a.status))) {
      violations.push({ kind: "projected_decision_is_terminal", request_id: id, status: a.status,
        detail: "Approve/Deny is offered for an action that has already resolved" });
    }
  }

  // 3. A run claiming a human gate with no pending decision behind it.
  for (const r of runs) {
    if (!runClaimsHumanGate(r)) continue;
    const backing = pending.filter((a) => a.run_id === r.run_id || a.lane_id === r.lane_id);
    if (!backing.length) {
      violations.push({
        kind: "run_awaits_operator_without_decision",
        run_id: r.run_id, lane_id: r.lane_id ?? null, state: r.state,
        detail: "a run says it is waiting on the operator but no pending decision exists for it",
      });
    }
  }

  // 4. Conflicting decisions for one exact request.
  const byFingerprint = new Map();
  for (const a of pending) {
    const key = a.content_fingerprint || `${a.action_key}:${a.lane_id}`;
    byFingerprint.set(key, (byFingerprint.get(key) || 0) + 1);
  }
  for (const [key, n] of byFingerprint) {
    if (n > 1) violations.push({ kind: "conflicting_pending_decisions", fingerprint: key, count: n,
      detail: "more than one live decision exists for the same exact request" });
  }

  // 5. A provider blocked on a native prompt with nothing decidable in Vacilando.
  for (const b of providerPromptBlocks) {
    const backing = pending.filter((a) => a.lane_id === b.lane_id);
    if (!backing.length && b.needs_decision === true) {
      violations.push({
        kind: "provider_prompt_without_decision_record",
        lane_id: b.lane_id ?? null, session_id: b.session_id ?? null, prompt: b.prompt_text ?? null,
        detail: "a managed provider is blocked on its own prompt and Vacilando holds no decision record for it",
      });
    }
  }

  return {
    schema_version: OPERATOR_DECISION_SCHEMA,
    pending_count: pending.length,
    projected_count: (projected || []).length,
    violations,
    consistent: violations.length === 0,
  };
}

/** Run states that have ended. A finished run awaits nobody. */
export const TERMINAL_RUN_STATES = Object.freeze(["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"]);

/**
 * A run state that asserts a person is the blocker.
 *
 * TERMINAL RUNS ARE EXCLUDED FIRST. A completed run keeps the state_reason it
 * ended with, and several legitimately mention an operator — the reason
 * describes what happened, not what is still awaited. Reading those as live
 * human gates made this check report five violations against a perfectly
 * consistent host on its first live run.
 */
export function runClaimsHumanGate(run) {
  if (!run) return false;
  const state = String(run.state || "").toUpperCase();
  if (TERMINAL_RUN_STATES.includes(state)) return false;
  if (state === "NEEDS_INPUT") return true;
  const reason = norm(run.state_reason || run.resource_wait?.reason || "");
  return reason.includes("operator") || reason.includes("approval");
}

/**
 * A run whose governed action has resolved must not keep claiming a human gate.
 * Returned as a reconciliation instruction, never applied here — releasing a
 * run belongs to the canonical run-wait path, and hand-editing runs is how the
 * last generation of this bug survived.
 */
export function staleHumanGates({ governedActions = [], runs = [] } = {}) {
  const out = [];
  for (const r of runs) {
    if (!runClaimsHumanGate(r)) continue;
    const related = governedActions.filter((a) => a.run_id === r.run_id);
    if (!related.length) continue;
    if (related.every((a) => TERMINAL_STATUSES.includes(norm(a.status)))) {
      out.push({
        run_id: r.run_id, lane_id: r.lane_id ?? null,
        resolved_as: related.map((a) => ({ request_id: a.request_id, status: a.status })),
        instruction: "release_via_canonical_run_wait_reconciliation",
      });
    }
  }
  return out;
}
