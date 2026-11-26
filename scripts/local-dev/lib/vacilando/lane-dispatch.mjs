/**
 * GOVERNED CROSS-LANE DISPATCH — narrow by construction.
 *
 * The gap this closes: the Capacity lane can observe provider capacity, measure
 * the host, govern the ceiling and promote its own work, but it cannot create
 * the cohort it was told to measure. Measuring N simultaneously productive
 * providers requires N lanes doing real work in one overlap window, and no
 * registered action could put work into another lane.
 *
 * WHAT MAKES THIS APPROVABLE RATHER THAN ALARMING. "One lane may instruct
 * another" is lane impersonation and would be refused on its merits — it is
 * indistinguishable from arbitrary remote control. What is delegated here is
 * much smaller and can be said in one sentence: a mission the Director has
 * authorized for capacity certification may place ONE bounded, read-only
 * analysis task into a lane that is idle and eligible, and nothing else. Every
 * clause of that sentence is a guard below, and each is measured rather than
 * asserted by the caller.
 *
 * The delivery primitive is NOT reimplemented. It composes createQueuedRun,
 * which already refuses to displace an active run — the single most important
 * property, and one a second implementation would eventually get wrong.
 *
 * The instruction text is treated as untrusted input from the requester, not as
 * prose to pass through. It must carry the certification banner and must not
 * ask the target to change anything. A dispatch capability whose payload is
 * unconstrained is arbitrary remote control wearing a purpose field.
 */

/** The only purposes this action may serve. Not caller-extensible. */
export const DISPATCH_PURPOSES = Object.freeze(["capacity_provider_certification"]);

/** Every dispatched instruction must carry this, verbatim. */
export const CERTIFICATION_BANNER =
  "CAPACITY V2 PROVIDER CERTIFICATION — READ-ONLY. DO NOT MODIFY PRODUCT STATE.";

/**
 * Lanes excluded by name regardless of computed eligibility.
 *
 * Surfaces has an unrepaired branch-identity defect; dispatching into it would
 * be building a measurement on top of a known-broken lane, and the repair
 * belongs to its owning lane rather than to this experiment.
 */
export const EXCLUDED_LANE_NAMES = Object.freeze(["surfaces"]);

/**
 * Phrases that turn a read-only analysis task into a mutation.
 *
 * This is a denylist and denylists are not proofs, which is why it is the LAST
 * guard rather than the only one: the target also receives an explicit
 * read-only banner, and the action can only ever create a certification-origin
 * run. What this catches is the obvious case — an instruction that asks the
 * target to commit, push, promote, or take control of something else.
 */
const MUTATION_PATTERNS = [
  /\b(commit|checkpoint)\b/i,
  /\bpush\b/i,
  /\b(merge|promote|promotion)\b/i,
  /\bcheckout\b/i,
  /\b(branch|worktree)\s+(create|delete|remove|switch|change|repair)/i,
  /\b(delete|remove|rm)\s+\S/i,
  /\bwrite\s+(to\s+)?(the\s+)?(file|config)/i,
  /\bmodify\b/i,
  /\bedit\b/i,
  /\binstall\b/i,
  /\brestart\b/i,
  /\bgoverned-action\b/i,
  /\bdispatch\b/i,
  /\bset-provider-ceiling\b/i,
];

const norm = (v) => String(v ?? "").trim();
const lower = (v) => norm(v).toLowerCase();

/**
 * Is this instruction bounded, read-only certification work?
 *
 * Fail-closed: anything unrecognised is refused rather than passed through.
 */
export function validateDispatchInstruction(text) {
  const s = norm(text);
  if (!s) return { ok: false, error: "instruction_empty" };
  if (s.length > 4000) return { ok: false, error: "instruction_too_large" };
  if (!s.includes(CERTIFICATION_BANNER)) {
    return {
      ok: false,
      error: "missing_certification_banner",
      detail: "the target must be told, in the instruction itself, that this is read-only certification",
    };
  }
  // Strip the banner BEFORE scanning. It legitimately contains "DO NOT MODIFY",
  // and the first cut checked each match against the banner text instead —
  // which silently exempted the word "modify" everywhere in the instruction,
  // the single most important verb to catch. Remove the known-good text once,
  // then judge only what the requester actually added.
  const body = s.split(CERTIFICATION_BANNER).join(" ");
  for (const re of MUTATION_PATTERNS) {
    const m = body.match(re);
    if (m) {
      return {
        ok: false,
        error: "instruction_requests_mutation",
        detail: `instruction contains "${m[0]}", which asks the target to change something`,
      };
    }
  }
  return { ok: true, instruction: s };
}

/**
 * Can this lane safely receive a certification task right now?
 *
 * Returns { eligible, reasons } — reasons are always populated on refusal so a
 * cohort report can say why a lane was left out rather than silently shrinking.
 */
export function assessTargetLane(lane, { activeRun = null, expectedBranch = null } = {}) {
  const reasons = [];
  if (!lane) return { eligible: false, reasons: ["lane_not_found"] };

  const status = String(lane.status || "").toUpperCase();
  if (status === "CLOSED") reasons.push("lane_closed");
  if (status && !["ACTIVE", "OPEN", "IDLE", "PARKED"].includes(status) && status !== "CLOSED") {
    reasons.push(`lane_status_${status.toLowerCase()}`);
  }
  if (EXCLUDED_LANE_NAMES.includes(lower(lane.name))) {
    reasons.push("lane_excluded_pending_repair");
  }
  // An active run is the target's own work. Displacing it would corrupt the
  // very thing being measured, and createQueuedRun refuses it anyway — this
  // makes the refusal legible instead of a late error.
  if (activeRun && !["COMPLETE", "FAILED", "ABANDONED"].includes(String(activeRun.state || ""))) {
    reasons.push(`lane_busy_${String(activeRun.state).toLowerCase()}`);
  }
  if (expectedBranch && lane.branch && norm(lane.branch) !== norm(expectedBranch)) {
    reasons.push("branch_mismatch");
  }
  if (lane.integrity_defect) reasons.push("lane_integrity_defect");

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Validate a governed dispatch request.
 *
 * `sourceMissionId` is checked against the mission the Director authorized for
 * this experiment. Authority to dispatch is a property of the MISSION, not of
 * whoever happens to be calling.
 */
export function validateLaneDispatchInputs(inputs = {}, { authorizedMissionId = null } = {}) {
  const purpose = lower(inputs.purpose);
  if (!DISPATCH_PURPOSES.includes(purpose)) {
    return { ok: false, error: "unsupported_purpose", detail: `purpose must be one of ${DISPATCH_PURPOSES.join(", ")}` };
  }
  const targetLaneId = norm(inputs.target_lane_id ?? inputs.targetLaneId);
  if (!/^lane_[a-z0-9]+$/i.test(targetLaneId)) {
    return { ok: false, error: "invalid_target_lane_id" };
  }
  const measurementId = norm(inputs.measurement_id ?? inputs.measurementId);
  if (!measurementId) {
    return { ok: false, error: "measurement_id_required", detail: "a dispatch that belongs to no measurement cannot be audited or expired" };
  }
  const sourceMission = norm(inputs.source_mission_id ?? inputs.sourceMissionId);
  if (!sourceMission) return { ok: false, error: "source_mission_required" };
  if (authorizedMissionId && sourceMission !== authorizedMissionId) {
    return {
      ok: false,
      error: "mission_not_authorized_for_dispatch",
      detail: "cross-lane dispatch is authorized for the capacity mission only",
    };
  }
  const sourceLane = norm(inputs.source_lane_id ?? inputs.sourceLaneId);
  if (sourceLane && sourceLane === targetLaneId) {
    return { ok: false, error: "self_dispatch", detail: "a lane does not need this action to instruct itself" };
  }

  const instr = validateDispatchInstruction(inputs.instruction);
  if (!instr.ok) return instr;

  return {
    ok: true,
    normalized: {
      purpose,
      targetLaneId,
      measurementId,
      sourceMission,
      sourceLane: sourceLane || null,
      instruction: instr.instruction,
      dedupeKey: `lane_dispatch:${measurementId}:${targetLaneId}`,
    },
  };
}

/**
 * Plan a fanout across candidate lanes.
 *
 * A COORDINATOR, NOT A SECOND AUTHORITY. It decides nothing about permission;
 * it classifies candidates and leaves each actual delivery to the governed
 * single-lane action. An ineligible lane is reported with its reasons and is
 * never counted toward the cohort — a measurement whose denominator quietly
 * includes lanes that never received work is not a measurement.
 */
export function planCohortDispatch({
  candidates = [],
  activeRunFor = () => null,
  target = 8,
} = {}) {
  const eligible = [];
  const excluded = [];
  for (const lane of candidates) {
    const laneId = lane.lane_id || lane.id;
    const assessment = assessTargetLane(lane, { activeRun: activeRunFor(laneId) });
    if (assessment.eligible) eligible.push({ lane_id: laneId, name: lane.name || null });
    else excluded.push({ lane_id: laneId, name: lane.name || null, reasons: assessment.reasons });
  }
  return {
    target,
    eligible,
    excluded,
    cohort_size: eligible.length,
    // Stated rather than inferred: a short cohort is a real result, not a bug
    // to work around by loosening eligibility or inventing lanes.
    short_by: Math.max(0, target - eligible.length),
  };
}

/**
 * Deliver one bounded certification task into a target lane.
 *
 * Composes createQueuedRun rather than writing to the run store directly. That
 * primitive already refuses to displace an active run, which is the property
 * that keeps this from disturbing the work being measured — and a second
 * implementation of run creation would eventually disagree with it.
 *
 * origin is forced to "certification". The caller does not get to choose how
 * the resulting run is classified, because that classification is what tells
 * every other subsystem this is measurement traffic rather than real work.
 */
export function executeLaneDispatch(normalized, { createRun = null, nowMs = Date.now() } = {}) {
  if (!normalized?.targetLaneId || !normalized?.instruction) {
    return { ok: false, error: "invalid_normalized_dispatch" };
  }
  const create = createRun;
  if (typeof create !== "function") {
    return { ok: false, error: "run_creator_unavailable" };
  }
  const out = create({
    laneId: normalized.targetLaneId,
    instruction: normalized.instruction,
    origin: "certification",
    nowMs,
  });
  if (!out?.ok) {
    // current_run_active is the expected, healthy refusal: the lane is busy and
    // must not be displaced. Surface it as-is rather than as a generic failure.
    return { ok: false, error: out?.error || "dispatch_failed", detail: out?.run ? "target lane has an active run" : null };
  }
  return {
    ok: true,
    target_lane_id: normalized.targetLaneId,
    run_id: out.run?.run_id || out.run_id || null,
    measurement_id: normalized.measurementId,
    purpose: normalized.purpose,
    source_mission_id: normalized.sourceMission,
    source_lane_id: normalized.sourceLane,
    origin: "certification",
    mutated_target_state: false,
  };
}

/**
 * Measure the dispatch gates.
 *
 * Written at the same time as the gates rather than after them. Three separate
 * subsystems in this codebase shipped a policy naming gates that nothing
 * collected — merge, the provider ceiling, and toolkit convergence — and each
 * time the symptom was an escalation that read like caution and was really an
 * absent function call. This is that function, present from the start.
 *
 * Every field is measured from lane state or from the instruction text. None is
 * taken from what the requester claims about itself.
 */
export function measureLaneDispatchGates(inputs = {}, {
  missionId = null,
  authorizedMissionId = null,
  lookupLane = null,
  activeRunFor = null,
} = {}) {
  const ev = {};
  const purpose = lower(inputs.purpose);
  ev.dispatch_purpose_allowlisted = DISPATCH_PURPOSES.includes(purpose);

  const source = norm(inputs.source_mission_id ?? inputs.sourceMissionId);
  // Authority belongs to the mission the request is filed under, not to a
  // mission id the caller typed into its own inputs. When the governed record
  // carries a mission, that is the one on trial.
  const effective = missionId || source;
  ev.dispatch_mission_authorized = authorizedMissionId
    ? effective === authorizedMissionId
    : Boolean(effective) && (!source || !missionId || source === missionId);

  ev.dispatch_bound_to_measurement = Boolean(norm(inputs.measurement_id ?? inputs.measurementId));

  const instr = validateDispatchInstruction(inputs.instruction);
  ev.dispatch_instruction_read_only = instr.ok;
  if (!instr.ok) ev.dispatch_instruction_refusal = instr.error;

  const targetId = norm(inputs.target_lane_id ?? inputs.targetLaneId);
  if (!targetId || typeof lookupLane !== "function") {
    // Unmeasured, not false: without lane state we cannot say the target is
    // eligible, and an unmeasured gate escalates rather than passing.
    ev.dispatch_target_eligible = null;
    ev.dispatch_target_not_busy = null;
    return ev;
  }
  const lane = lookupLane(targetId);
  const active = typeof activeRunFor === "function" ? activeRunFor(targetId) : null;
  const assessment = assessTargetLane(lane, { activeRun: active });
  ev.dispatch_target_eligible = assessment.eligible;
  ev.dispatch_target_exclusion_reasons = assessment.reasons;
  ev.dispatch_target_not_busy = active
    ? ["COMPLETE", "FAILED", "ABANDONED"].includes(String(active.state || ""))
    : true;
  return ev;
}
