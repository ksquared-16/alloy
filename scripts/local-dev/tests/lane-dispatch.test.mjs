/**
 * Governed cross-lane dispatch.
 *
 * "One lane may instruct another" would be lane impersonation and should be
 * refused on its merits. What these fixtures hold is the much smaller sentence
 * that is actually delegated: a mission the Director authorized for capacity
 * certification may place ONE bounded read-only task into a lane that is idle
 * and eligible, and nothing else.
 *
 * The negative controls matter more than the positive one here. A dispatch
 * capability that works is easy; one that cannot be widened by a caller is the
 * point.
 */
import test from "node:test";
import assert from "node:assert/strict";

const D = await import("../lib/vacilando/lane-dispatch.mjs");

const MISSION = "msn_8ed92716215ba2caed";
const TASK = `${D.CERTIFICATION_BANNER}

Perform substantive read-only analysis of your current subsystem for several
minutes. Inspect implementation, tests and architecture, and return findings.`;

const ok = (over = {}) => ({
  purpose: "capacity_provider_certification",
  target_lane_id: "lane_abc123",
  measurement_id: "cap_v2_cohort_1",
  source_mission_id: MISSION,
  source_lane_id: "lane_db3431e755a8",
  instruction: TASK,
  ...over,
});

test("a well-formed certification dispatch validates", () => {
  const out = D.validateLaneDispatchInputs(ok(), { authorizedMissionId: MISSION });
  assert.equal(out.ok, true);
  assert.equal(out.normalized.targetLaneId, "lane_abc123");
  assert.equal(out.normalized.dedupeKey, "lane_dispatch:cap_v2_cohort_1:lane_abc123");
});

/* ── negative controls ───────────────────────────────────────────────────── */

test("an instruction requesting mutation is refused", () => {
  for (const bad of [
    "commit your findings", "push the branch", "merge it into staging",
    "modify the config", "delete the stale files", "install the toolkit",
    "restart the gateway", "checkout another branch",
  ]) {
    const out = D.validateLaneDispatchInputs(
      ok({ instruction: `${D.CERTIFICATION_BANNER}\n\nAnalyse the subsystem, then ${bad}.` }),
      { authorizedMissionId: MISSION },
    );
    assert.equal(out.ok, false, `"${bad}" must be refused`);
    assert.equal(out.error, "instruction_requests_mutation");
  }
});

test("an instruction without the read-only banner is refused", () => {
  const out = D.validateLaneDispatchInputs(
    ok({ instruction: "Please analyse your subsystem and report findings." }),
    { authorizedMissionId: MISSION },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_certification_banner");
});

test("dispatch from an unauthorized mission is refused", () => {
  const out = D.validateLaneDispatchInputs(
    ok({ source_mission_id: "msn_someone_else" }), { authorizedMissionId: MISSION },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "mission_not_authorized_for_dispatch");
});

test("a purpose outside the allowlist is refused", () => {
  for (const p of ["general", "debug", "capacity_provider_certification_v2", ""]) {
    const out = D.validateLaneDispatchInputs(ok({ purpose: p }), { authorizedMissionId: MISSION });
    assert.equal(out.ok, false, `purpose "${p}" must be refused`);
    assert.equal(out.error, "unsupported_purpose");
  }
});

test("a dispatch belonging to no measurement is refused", () => {
  const out = D.validateLaneDispatchInputs(ok({ measurement_id: "" }), { authorizedMissionId: MISSION });
  assert.equal(out.ok, false);
  assert.equal(out.error, "measurement_id_required");
});

test("self-dispatch is refused", () => {
  const out = D.validateLaneDispatchInputs(
    ok({ target_lane_id: "lane_db3431e755a8" }), { authorizedMissionId: MISSION },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "self_dispatch");
});

/* ── eligibility ─────────────────────────────────────────────────────────── */

test("a CLOSED lane is never eligible", () => {
  const a = D.assessTargetLane({ lane_id: "lane_x", status: "CLOSED", name: "capacity cert ten" });
  assert.equal(a.eligible, false);
  assert.ok(a.reasons.includes("lane_closed"));
});

test("a busy lane is never eligible — its own work is the thing being measured", () => {
  const a = D.assessTargetLane(
    { lane_id: "lane_x", status: "ACTIVE", name: "Payments" },
    { activeRun: { state: "EXECUTING" } },
  );
  assert.equal(a.eligible, false);
  assert.ok(a.reasons.some((r) => r.startsWith("lane_busy")));
});

test("a lane whose run has settled is eligible again", () => {
  for (const state of ["COMPLETE", "FAILED", "ABANDONED"]) {
    const a = D.assessTargetLane(
      { lane_id: "lane_x", status: "ACTIVE", name: "Payments" }, { activeRun: { state } },
    );
    assert.equal(a.eligible, true, `${state} should not block dispatch`);
  }
});

test("Surfaces stays excluded until its branch identity is repaired", () => {
  const a = D.assessTargetLane({ lane_id: "lane_s", status: "ACTIVE", name: "Surfaces" });
  assert.equal(a.eligible, false);
  assert.ok(a.reasons.includes("lane_excluded_pending_repair"));
});

test("branch mismatch is refused", () => {
  const a = D.assessTargetLane(
    { lane_id: "lane_x", status: "ACTIVE", name: "Backend", branch: "agent/other" },
    { expectedBranch: "agent/expected" },
  );
  assert.equal(a.eligible, false);
  assert.ok(a.reasons.includes("branch_mismatch"));
});

/* ── fanout ──────────────────────────────────────────────────────────────── */

test("the coordinator never counts an undispatched lane toward the cohort", () => {
  const candidates = [
    { lane_id: "lane_1", status: "ACTIVE", name: "Payments" },
    { lane_id: "lane_2", status: "ACTIVE", name: "Surfaces" },
    { lane_id: "lane_3", status: "CLOSED", name: "capacity cert ten" },
    { lane_id: "lane_4", status: "ACTIVE", name: "Backend" },
  ];
  const plan = D.planCohortDispatch({
    candidates, target: 8,
    activeRunFor: (id) => (id === "lane_4" ? { state: "EXECUTING" } : null),
  });
  assert.deepEqual(plan.eligible.map((e) => e.lane_id), ["lane_1"]);
  assert.equal(plan.cohort_size, 1);
  assert.equal(plan.short_by, 7, "a short cohort is a real result, not something to loosen eligibility over");
  assert.equal(plan.excluded.length, 3);
  for (const x of plan.excluded) assert.ok(x.reasons.length, `${x.lane_id} must say why it was excluded`);
});

test("the banner's own DO NOT MODIFY does not exempt 'modify' elsewhere", () => {
  // The first cut checked each match against the banner text, which contains
  // "DO NOT MODIFY" — silently exempting the single most important verb.
  const out = D.validateLaneDispatchInputs(
    { purpose: "capacity_provider_certification", target_lane_id: "lane_abc123",
      measurement_id: "m1", source_mission_id: MISSION, source_lane_id: "lane_db3431e755a8",
      instruction: `${D.CERTIFICATION_BANNER}\n\nThen modify the config.` },
    { authorizedMissionId: MISSION },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "instruction_requests_mutation");
  // ...while the banner alone, with only read-only work, still passes.
  const good = D.validateDispatchInstruction(`${D.CERTIFICATION_BANNER}\n\nInspect and report.`);
  assert.equal(good.ok, true);
});

/* ── evidence: written with the gates, not after them ────────────────────── */

const DA = await import("../lib/vacilando/director-authority.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const laneOf = (over = {}) => (id) => ({ lane_id: id, status: "ACTIVE", name: "Payments", ...over });

test("the action is registered and discoverable", () => {
  const row = REG.listRegisteredActions().find((r) => r.actionType === "lane.dispatch_measurement_instruction");
  assert.ok(row, "a lane that cannot discover the action cannot request it");
  assert.deepEqual(row.requiredInputs,
    ["purpose", "target_lane_id", "measurement_id", "source_mission_id", "instruction"]);
});

test("every gate the policy names is filled by the collector", () => {
  const policy = DA.DELEGATED_POLICIES_V1.find((p) => p.policy_id === "bounded_capacity_cohort_dispatch_v1");
  assert.ok(policy, "the policy must exist");
  const ev = D.measureLaneDispatchGates(ok(), {
    missionId: MISSION, authorizedMissionId: MISSION,
    lookupLane: laneOf(), activeRunFor: () => null,
  });
  const decision = DA.evaluateDirectorAuthority({
    request: { action_key: "lane.dispatch_measurement_instruction", target: "development_certification" },
    evidence: { ...ev, governance_exception_active: false, operator_hold: false },
  });
  assert.equal(decision.decision, "director_approved",
    `unmeasured: ${JSON.stringify(decision.unmeasured_gates || decision.failed_gates || [])}`);
  for (const gate of policy.gates) {
    assert.notEqual(decision.deterministic_evidence[gate], null, `${gate} was not measured`);
  }
});

test("each refusal reaches the policy as a denial, not an approval", () => {
  const base = { governance_exception_active: false, operator_hold: false };
  const cases = {
    "a busy target": { lookupLane: laneOf(), activeRunFor: () => ({ state: "EXECUTING" }) },
    "a closed target": { lookupLane: laneOf({ status: "CLOSED" }), activeRunFor: () => null },
    "the excluded lane": { lookupLane: laneOf({ name: "Surfaces" }), activeRunFor: () => null },
  };
  for (const [label, opts] of Object.entries(cases)) {
    const ev = D.measureLaneDispatchGates(ok(), { missionId: MISSION, authorizedMissionId: MISSION, ...opts });
    const d = DA.evaluateDirectorAuthority({
      request: { action_key: "lane.dispatch_measurement_instruction", target: "development_certification" },
      evidence: { ...ev, ...base },
    });
    assert.notEqual(d.decision, "director_approved", `${label} must not auto-approve`);
  }
});

test("unknown lane state is UNMEASURED, never eligible", () => {
  const ev = D.measureLaneDispatchGates(ok(), { missionId: MISSION });
  assert.equal(ev.dispatch_target_eligible, null);
  assert.equal(ev.dispatch_target_not_busy, null);
});

test("the executor composes createQueuedRun and forces certification origin", () => {
  let seen = null;
  const out = D.executeLaneDispatch(
    { targetLaneId: "lane_abc123", instruction: TASK, measurementId: "m1",
      purpose: "capacity_provider_certification", sourceMission: MISSION, sourceLane: "lane_db3431e755a8" },
    { createRun: (args) => { seen = args; return { ok: true, run: { run_id: "erun_new" } }; } },
  );
  assert.equal(out.ok, true);
  assert.equal(out.run_id, "erun_new");
  assert.equal(seen.origin, "certification", "the caller must not choose how the run is classified");
  assert.equal(out.mutated_target_state, false);
});

test("a busy target surfaces the healthy refusal rather than a generic failure", () => {
  const out = D.executeLaneDispatch(
    { targetLaneId: "lane_abc123", instruction: TASK, measurementId: "m1",
      purpose: "capacity_provider_certification", sourceMission: MISSION },
    { createRun: () => ({ ok: false, error: "current_run_active", run: { run_id: "erun_busy" } }) },
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "current_run_active");
});

test("the collector is CALLED, not merely written", async () => {
  // This action nearly shipped with six permanently unmeasured gates: the
  // collector existed and its unit test invoked it directly, which cannot tell
  // "written" from "wired". The collection PATH is what a real request uses.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/vacilando/director-evidence.mjs", import.meta.url), "utf8");
  assert.match(src, /measureLaneDispatchGates/, "director-evidence must import the collector");
  assert.match(src, /rec\?\.action_key === "lane\.dispatch_measurement_instruction"/,
    "director-evidence must dispatch to it for this action key");
  // And it must supply the lane lookups, or target eligibility stays null forever.
  assert.match(src, /lookupLane:/);
  assert.match(src, /activeRunFor:/);
});

test("two dispatches to DIFFERENT lanes are different actions", async () => {
  /*
   * Found live: fanning out to a second lane returned the FIRST request's id,
   * reported ok, and queued nothing for the second target. The identity
   * resolver had no case for this action, so every dispatch produced an empty
   * identity and dedupeKey collapsed to mission|lane|action_key|target for all
   * of them. A cohort would have counted lanes that never received work.
   */
  const { resolveActionAuthorizationIdentity } = await import("../lib/vacilando/action-authorization-identity.mjs");
  const idFor = (laneId, measurement = "m1") => resolveActionAuthorizationIdentity({
    actionType: "lane.dispatch_measurement_instruction",
    scope: MISSION,
    target: "development_certification",
    inputs: { target_lane_id: laneId, measurement_id: measurement },
  });

  const a = idFor("lane_aaa111");
  const b = idFor("lane_bbb222");
  assert.ok(a.subjectKey, "a dispatch must have a non-empty identity or every one dedupes together");
  assert.notEqual(a.subjectKey, b.subjectKey, "different target lanes are different actions");
  assert.equal(a.targetRef, "lane_aaa111");

  // Same lane, same measurement: genuinely the same action, and should dedupe.
  assert.equal(idFor("lane_aaa111").subjectKey, a.subjectKey);
  // Same lane, different measurement: a new experiment, so a new action.
  assert.notEqual(idFor("lane_aaa111", "m2").subjectKey, a.subjectKey);
});
