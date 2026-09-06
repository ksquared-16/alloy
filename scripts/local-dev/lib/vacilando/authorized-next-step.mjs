/**
 * "WHAT, IF ANYTHING, IS THIS LANE AUTHORIZED TO DO NEXT?"
 *
 * The one contract the scheduler was missing. Phase 5 could rank work, explain
 * why nothing ran, and refuse safely — but every candidate resolved UNKNOWN,
 * because nothing answered this question.
 *
 * TWO RULES SHAPE EVERYTHING HERE.
 *
 * AUTHORIZATION IS DERIVED, NEVER INFERRED. Every AUTHORIZED verdict names the
 * durable evidence it came from, drawn from a closed provenance list. A step
 * that "sounds authorized" is UNKNOWN. An empty provenance is UNKNOWN. This is
 * the difference between a machine-checkable claim and a plausible sentence.
 *
 * A CHECKPOINT IS EVIDENCE OF WHAT WAS TRUE THEN. It is re-measured against
 * live truth at the moment of asking, exactly as the worktree retirement
 * fingerprint and the toolkit prune plan are. A stale assertion is downgraded to
 * UNKNOWN and says why — it never authorizes, and it is never quietly refreshed
 * into looking current. Vacilando has now twice shipped a defect whose whole
 * shape was a measurement taken once and trusted forever; this does not add a
 * third.
 *
 * THIS DISPATCHES NOTHING. It answers a question. `work-scheduler` decides
 * whether the answer runs, and `execution-admission` starts anything. One
 * planner, one dispatcher, and this is neither.
 */
import {
  AUTHORIZATION_PROVENANCE,
  AUTHORIZATION_STATES,
  DEPENDENCY_STATES,
  checkpointFreshness,
} from "./lane-memory.mjs";

export const NEXT_STEP_SCHEMA = "vacilando.authorized_next_step.v1";

export { AUTHORIZATION_STATES, DEPENDENCY_STATES };

/**
 * Facts that invalidate a checkpointed next step.
 *
 * Each is a specific way the world can move under a stored assertion. They are
 * named individually so a downgrade can say WHICH one fired — "stale" with no
 * reason is the unauditable answer this avoids.
 */
export const REVALIDATION_CHECKS = Object.freeze([
  "checkpoint_fresh",
  "run_state_unchanged",
  "promoted_lineage_current",
  "dependencies_still_ready",
  "blocking_findings_unchanged",
  "mission_not_complete",
]);

const unknown = (reason, extra = {}) => ({
  schema_version: NEXT_STEP_SCHEMA,
  authorization: "UNKNOWN",
  dependency_state: "UNKNOWN",
  deterministic: false,
  mission_remaining: null,
  reason,
  ...extra,
});

/**
 * Revalidate a stored next step against live truth.
 *
 * Every check returns true, false or null. NULL IS NOT A PASS — an unmeasurable
 * check invalidates, because "we could not tell" and "nothing changed" are
 * different facts and only one of them is safe to act on.
 */
export function revalidate(record, live = {}, { now = Date.now() } = {}) {
  const results = {};
  const fresh = checkpointFreshness(record, { now });
  results.checkpoint_fresh = fresh.fresh;

  // The run the checkpoint described is still the run we are talking about.
  results.run_state_unchanged = live.run_state === undefined
    ? null
    : (record.next_step?.evidence?.run_state == null || record.next_step.evidence.run_state === live.run_state);

  // A next step reasoned from a staging sha is void once staging moves — the
  // exact failure that made a governed install request fail compare-and-set.
  const assumed = record.next_step?.evidence?.staging_sha ?? null;
  results.promoted_lineage_current = assumed == null
    ? true
    : (live.staging_sha === undefined ? null : String(assumed) === String(live.staging_sha));

  const deps = record.dependencies || [];
  if (!deps.length) results.dependencies_still_ready = true;
  else if (live.dependency_states === undefined) results.dependencies_still_ready = null;
  else {
    results.dependencies_still_ready = deps.every((d) => {
      const now2 = live.dependency_states?.[d.id];
      return now2 === undefined ? false : now2 === d.state;
    });
  }

  const blocking = (record.blockers || []).filter((b) => b.finding_ref);
  if (!blocking.length) results.blocking_findings_unchanged = true;
  else if (live.finding_statuses === undefined) results.blocking_findings_unchanged = null;
  else {
    results.blocking_findings_unchanged = blocking.every((b) => live.finding_statuses?.[b.finding_ref] !== undefined);
  }

  results.mission_not_complete = record.mission?.complete === true ? false : true;

  const failed = REVALIDATION_CHECKS.filter((k) => results[k] === false);
  const unmeasured = REVALIDATION_CHECKS.filter((k) => results[k] == null);
  return {
    valid: failed.length === 0 && unmeasured.length === 0,
    results,
    failed,
    unmeasured,
    freshness: fresh,
  };
}

/**
 * The contract the scheduler consumes.
 *
 * Ordered so the most decisive answer wins: a completed mission is not a
 * dependency problem, and a prohibited action is not an unknown one.
 */
export function authorizedNextStep({ record = null, live = {}, now = Date.now() } = {}) {
  if (!record) return unknown("no lane memory exists for this lane", { lane_id: live.lane_id ?? null });
  const laneId = record.lane_id;
  const base = { lane_id: laneId, source: "lane_memory", checkpoint_at: record.updated_at ?? null };

  if (record.mission?.complete === true) {
    return {
      schema_version: NEXT_STEP_SCHEMA, ...base,
      authorization: "PROHIBITED", dependency_state: "READY", deterministic: false,
      mission_remaining: false, action_class: null,
      reason: "the mission is complete; there is no next step to authorize",
    };
  }

  const step = record.next_step;
  if (!step || !step.action_class) {
    return unknown("lane memory records no next action", { ...base, mission_remaining: record.mission?.complete === false ? true : null });
  }

  // Revalidate BEFORE reading the stored verdict. A stale record's own
  // "AUTHORIZED" is exactly the claim under suspicion.
  const check = revalidate(record, live, { now });
  if (!check.valid) {
    const why = check.failed.length
      ? `checkpoint no longer matches live truth: ${check.failed.join(", ")}`
      : `could not revalidate: ${check.unmeasured.join(", ")}`;
    return unknown(why, {
      ...base,
      action_class: step.action_class,
      stale: true,
      revalidation: check,
      mission_remaining: true,
    });
  }

  const provenance = (step.authorization_provenance || record.authorization?.provenance || [])
    .filter((p) => AUTHORIZATION_PROVENANCE.includes(p));
  if (!provenance.length) {
    return unknown("no durable authorization provenance backs this step", {
      ...base, action_class: step.action_class, mission_remaining: true,
    });
  }

  // An explicitly prohibited class is prohibited whatever the step claims.
  const prohibited = record.authorization?.prohibited_classes || [];
  if (prohibited.includes(step.action_class)) {
    return {
      schema_version: NEXT_STEP_SCHEMA, ...base,
      authorization: "PROHIBITED", dependency_state: "UNKNOWN", deterministic: false,
      mission_remaining: true, action_class: step.action_class,
      reason: `${step.action_class} is explicitly excluded by the lane's scope`,
      provenance,
    };
  }

  const authorizedClasses = record.authorization?.authorized_classes || [];
  const declared = AUTHORIZATION_STATES.includes(step.authorization) ? step.authorization : "UNKNOWN";
  // The stored verdict may only ever be NARROWED by the scope, never widened.
  const authorization = declared === "AUTHORIZED" && !authorizedClasses.includes(step.action_class)
    ? "UNKNOWN"
    : declared;

  const dependencyState = dependencyVerdict(record.dependencies || []);
  const deterministic = step.deterministic === true;

  return {
    schema_version: NEXT_STEP_SCHEMA, ...base,
    action_class: step.action_class,
    action_description: step.description ?? null,
    authorization,
    provenance,
    dependency_state: dependencyState,
    deterministic,
    mission_remaining: true,
    evidence: step.evidence ?? null,
    revalidation: check,
    blocker: (record.blockers || [])[0] ?? null,
    reason: authorization === "AUTHORIZED"
      ? (dependencyState === "READY" ? "authorized, dependencies ready" : `authorized, dependencies ${dependencyState}`)
      : (authorization === "UNKNOWN"
        ? "the step is not inside the lane's authorized classes"
        : "this step needs a decision only the Director can make"),
  };
}

function dependencyVerdict(deps) {
  if (!deps.length) return "READY";
  if (deps.some((d) => d.state === "FAILED")) return "FAILED";
  if (deps.some((d) => d.state === "UNKNOWN")) return "UNKNOWN";
  if (deps.some((d) => d.state === "WAITING")) return "WAITING";
  return "READY";
}

/**
 * Translate the contract into the scheduler's candidate fields.
 *
 * Deliberately conservative: only AUTHORIZED + READY + deterministic produces a
 * candidate the planner may consider. Everything else arrives as a measured
 * refusal with a wait reason, never as an absence.
 */
export function candidateFieldsFor(contract) {
  const c = contract || {};
  const authorized = c.authorization === "AUTHORIZED";
  return {
    authorized: c.authorization === "UNKNOWN" ? null : authorized,
    dependenciesReady: c.dependency_state === "UNKNOWN" ? null : c.dependency_state === "READY",
    directorJudgmentRequired: c.authorization === "UNKNOWN" ? null : c.authorization === "REQUIRES_DIRECTOR",
    nextAction: c.action_class
      ? {
        kind: c.action_class,
        deterministic: c.deterministic === true,
        within_policy: authorized,
        bounded: true,
        description: c.action_description ?? null,
      }
      : null,
    missionRemaining: c.mission_remaining,
  };
}
