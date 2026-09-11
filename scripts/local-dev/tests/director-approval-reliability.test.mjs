#!/usr/bin/env node
/**
 * Director governance and approval-interaction reliability.
 *
 * Two properties, and they are deliberately certified in one file because the
 * defects behind them were the same defect wearing two costumes.
 *
 *   1. AN ACTION DECLARES WHERE IT RUNS. `target` is read by
 *      director-authority as the POLICY ENVIRONMENT. When it was defaulted to
 *      the deployed database identifier for every action that did not set one,
 *      tier A and tier B actions with complete, enabled delegated policies
 *      escalated to the operator anyway — before their policy could be matched
 *      — and the operator approved every single one.
 *
 *   2. ONE CLICK IS ONE APPROVAL. A second decision on a request that already
 *      carries one must converge on the state that exists rather than mint a
 *      second single-use grant and execute again.
 *
 * The structural test below is the one that matters most: it fails for ANY
 * future action whose default target is outside the environments its own policy
 * covers, which is what would have caught this the day it was introduced rather
 * than 23 days and 975 approvals later.
 *
 * Isolated runtime only. Does not attach to live Claude or the deployed tenant.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = mkdtempSync(join(tmpdir(), "vac-approval-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const Q15 = "docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json";

const {
  requestGovernedAction,
  approveGovernedAction,
  defaultTargetForAction,
  getGovernedAction,
  saveGovernedActionRecord,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
} = await import("../lib/vacilando/governed-action-request.mjs");
const {
  createQueuedRun,
  transitionExecutionRun,
  resetExecutionRunsForTests,
} = await import("../lib/vacilando/execution-run.mjs");
const { grantMissionAuthorization } = await import("../lib/vacilando/trusted-host-authz.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
  DELEGATED_POLICIES_V1,
  OPERATOR_ONLY_ENVIRONMENTS,
  OPERATOR_OWNED_ACTION_KEYS,
} = await import("../lib/vacilando/director-authority.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetGovernedActionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  setGovernedActionExecuteImplForTests(null);
  setGovernedActionResumeImplForTests({});
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

const norm = (v) => String(v ?? "").trim().toLowerCase();

function executingRun(laneId = "alloy-identity") {
  const queued = createQueuedRun({
    laneId,
    instruction: "Certify Director governance and approval reliability",
    worktreePath: join(REPO, "scripts/local-dev"),
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  const moved = transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system", root: ROOT, reason: "delivered",
  });
  assert.equal(moved.ok, true, moved.error);
  return moved.run;
}

function censusProof() {
  return {
    action_key: ACTION_TYPES.DATABASE_READ_CENSUS,
    target: "alloy_deployed_primary",
    purpose: "Certify the approval path end to end.",
    artifact_refs: [Q15],
    requested_mode: "read_only",
    reason_worker_cannot_execute: "no hosted credentials; alloy-ro has credential_access=false",
  };
}

function fakeCensusResult(rec) {
  return {
    ok: true,
    action: {
      id: "tha_certcensus",
      state: "completed",
      actionType: rec.action_key,
      inputs: { queryHash: "abc", databaseTarget: rec.target },
      result: {
        census: { org_count: 1 },
        evidencePath: join(ROOT, "vacilando", "trusted-host-actions", "census.json"),
      },
    },
  };
}

// ── 1. An action declares where it runs ──────────────────────────────────────

await test("a delegated policy's action defaults to an environment that policy covers", () => {
  // THE REGRESSION GUARD FOR THE WHOLE MISSION.
  //
  // An enabled policy that can never be reached is worse than no policy: it
  // reads, in the governance document and in this repository, as authority the
  // Director has delegated — while every request escalates anyway. That is
  // precisely what happened to host.install_toolkit, whose policy had already
  // been widened to name a "host" environment that nothing ever set.
  for (const policy of DELEGATED_POLICIES_V1.filter((p) => p.enabled === true)) {
    const target = defaultTargetForAction(policy.action_key);
    assert.ok(
      policy.environments.map(norm).includes(norm(target)),
      `${policy.action_key} defaults to target "${target}", which policy `
      + `${policy.policy_id} does not cover (${policy.environments.join(", ")}). `
      + "Every request that omits a target will escalate and the policy is dead.",
    );
  }
});

await test("no delegated action defaults into an operator-only environment", () => {
  // The narrower half of the same property, stated separately because it fails
  // EARLIER in the evaluator — at step 3, before any policy is even looked for —
  // and so produces the misleading "this targets production" escalation reason
  // rather than an honest "no policy covers this".
  for (const policy of DELEGATED_POLICIES_V1.filter((p) => p.enabled === true)) {
    const target = defaultTargetForAction(policy.action_key);
    assert.ok(
      !OPERATOR_ONLY_ENVIRONMENTS.map(norm).includes(norm(target)),
      `${policy.action_key} defaults to the operator-only environment "${target}", `
      + "so its delegated policy can never be reached.",
    );
  }
});

await test("host.install_toolkit declares the host, not the deployed database", () => {
  assert.equal(defaultTargetForAction(ACTION_TYPES.HOST_INSTALL_TOOLKIT), "host");
});

await test("an unlisted action still defaults closed to the deployed primary", () => {
  // Fail-closed is the whole reason this is a table and not a rule. A newly
  // registered action inherits the most restrictive default and escalates until
  // somebody states where it runs.
  assert.equal(defaultTargetForAction("some.action_registered_tomorrow"), "alloy_deployed_primary");
  assert.equal(defaultTargetForAction(undefined), "alloy_deployed_primary");
});

await test("database and QA identity actions keep the deployed primary", () => {
  // These were left alone deliberately: read_census really does address the
  // deployed database, and the environment.* actions are operator-owned in V1
  // by explicit action key. Changing their declared target would have been a
  // governance change wearing the costume of a bug fix.
  assert.equal(defaultTargetForAction(ACTION_TYPES.DATABASE_READ_CENSUS), "alloy_deployed_primary");
  assert.equal(
    defaultTargetForAction(ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION),
    "alloy_deployed_primary",
  );
  assert.equal(
    defaultTargetForAction(ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY),
    "alloy_deployed_primary",
  );
});

await test("operator-owned action keys are still escalated, whatever their target", () => {
  // The refusal path, tested as hard as the success path. Widening WHERE a
  // policy applies must never widen WHAT runs unattended, and the action-key
  // reservation is the guard that has to survive it.
  for (const key of OPERATOR_OWNED_ACTION_KEYS) {
    const target = defaultTargetForAction(key);
    assert.ok(
      !DELEGATED_POLICIES_V1.some((p) => p.enabled === true && norm(p.action_key) === norm(key)
        && p.environments.map(norm).includes(norm(target))),
      `${key} is reserved to the operator but an enabled policy would cover it at "${target}".`,
    );
  }
});

// ── 2. Every decision states its basis ───────────────────────────────────────

await test("an escalated request records why it had to ask", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  const out = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.request.status, "awaiting_operator");
  // Before this, 53 of 103 operator-facing requests carried no reason at all —
  // including every census, which escalates before the evaluator runs.
  assert.ok(
    out.request.escalation_reason,
    "an escalated request must say why; a prompt that cannot explain itself cannot be removed",
  );
  assert.match(out.request.escalation_reason, /operator/i);
});

await test("an autonomously executed request records the authority it used", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  grantMissionAuthorization({
    missionId: mission.mission_id,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    databaseTarget: "alloy_deployed_primary",
    subjectScope: "any_within_mission",
    actor: "operator",
  });
  setGovernedActionExecuteImplForTests(fakeCensusResult);
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const out = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.request.status, "complete");
  // "Why did Vacilando do this without asking me?" has to be answerable from
  // the record, not reconstructed from a 200-request store that has rolled over.
  const basis = out.request.authorization_basis;
  assert.ok(basis, "an unattended execution must record its authorization basis");
  assert.equal(basis.reason, "existing_mission_authorization");
  assert.ok(basis.authorization_id, "the exact authorization spent must be named");
  assert.ok(basis.at);
});

// ── 3. One click is one approval ─────────────────────────────────────────────

await test("a second approval after completion changes nothing", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return fakeCensusResult(rec); });
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const out = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  const id = out.request.request_id;
  return Promise.resolve(approveGovernedAction(id, { actor: "operator", root: ROOT }))
    .then(async (first) => {
      assert.equal(first.ok, true, first.error);
      assert.equal(executions, 1);
      const second = await approveGovernedAction(id, { actor: "operator", root: ROOT });
      assert.equal(second.ok, true, second.error);
      assert.equal(second.already, true);
      assert.equal(executions, 1, "a second press must not run the action again");
    });
});

await test("a second approval on an approved but unfinished request converges, it does not re-execute", async () => {
  // THE GAP THE TERMINAL GUARD LEAVES.
  //
  // refuseTerminalDecision only catches a request that has already REACHED a
  // terminal state. A request that is approved and parked — awaiting a control
  // plane refresh, or mid-execution — walked past both guards, minted a SECOND
  // single-use grant (which is what defeated single-use: the replay was not
  // reusing the old grant, it was buying a new one), recorded a second
  // operator_approved, and re-entered executeGovernedAction, which has no
  // re-entry guard of its own.
  //
  // Measured over the 23 days to 2026-09-11: 111 duplicate approval events
  // across 20 requests and 141 executions beyond the first across 48. The worst
  // single request was approved 30 times in about 45 minutes.
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return fakeCensusResult(rec); });
  const out = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  const id = out.request.request_id;

  const rec = getGovernedAction(id, ROOT);
  rec.operator_approval = { decision: "approved", actor: "operator", at: new Date().toISOString() };
  rec.operator_approval_required = false;
  rec.policy_decision = "operator_approved";
  rec.grant_id = "grnt_alreadyspent";
  rec.status = "awaiting_control_plane_refresh";
  saveGovernedActionRecord(rec, ROOT);

  const again = await approveGovernedAction(id, { actor: "operator", root: ROOT });
  assert.equal(again.ok, true, again.error);
  assert.equal(again.already, true, "a duplicate decision reports the state that exists");
  assert.equal(again.duplicate, true);
  assert.equal(executions, 0, "a duplicate press must not execute");
  const after = getGovernedAction(id, ROOT);
  assert.equal(after.grant_id, "grnt_alreadyspent", "a duplicate press must not mint a second grant");
});

await test("a request that genuinely returned to awaiting_operator is still answerable", async () => {
  // The guard must narrow duplicates without stranding a real re-ask. An
  // approved record does not bounce back to awaiting_operator any more, so
  // finding one that has means the system is asking again for real.
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return fakeCensusResult(rec); });
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const out = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  const id = out.request.request_id;
  const rec = getGovernedAction(id, ROOT);
  rec.operator_approval = { decision: "approved", actor: "operator", at: new Date().toISOString() };
  rec.status = "awaiting_operator";
  rec.operator_approval_required = true;
  saveGovernedActionRecord(rec, ROOT);
  const answered = await approveGovernedAction(id, { actor: "operator", root: ROOT });
  assert.equal(answered.ok, true, answered.error);
  assert.notEqual(answered.duplicate, true, "a genuine re-ask must not be swallowed as a duplicate");
  assert.equal(executions, 1);
});

// ── 4. The control says what it is doing ─────────────────────────────────────

const View = await import("../apps/vacilando/public/gateway-view.mjs");

const APPROVAL_ROW = {
  request_id: "gar_certdecision01",
  content_fingerprint: "fp_cert",
  action_key: ACTION_TYPES.DATABASE_READ_CENSUS,
  status: "awaiting_operator",
  approve_label: "Authorize census",
  deny_label: "Deny",
  operator_card: { context: [] },
  escalation_reason: "A read against the deployed primary database is the operator's decision in V1.",
  purpose: "Verify authority coverage.",
};

await test("a ready approval offers exactly one approve and one deny", () => {
  View.clearGovernedDecisionState(APPROVAL_ROW.request_id);
  const html = View.renderPendingApprovalsBar([APPROVAL_ROW]);
  assert.equal((html.match(/data-gw-governed-approve/g) || []).length, 1);
  assert.equal((html.match(/data-gw-governed-deny/g) || []).length, 1);
  assert.ok(!/disabled/.test(html), "a ready control must be pressable");
});

await test("a repaint during a decision redraws it as submitting, not as ready", () => {
  // THE DEFECT THIS CLOSES. The handler disabled the DOM node and awaited the
  // POST; the very next repaint rebuilt the row from a template with no notion
  // of a decision in flight, so the button came back ENABLED under a request
  // that was still running. Every poll tick was a fresh invitation to press it
  // again — which the audit says operators accepted up to 30 times.
  View.setGovernedDecisionState(APPROVAL_ROW.request_id, "submitting");
  const html = View.renderPendingApprovalsBar([APPROVAL_ROW]);
  assert.match(html, /Approving…/);
  assert.ok(!/data-gw-governed-deny/.test(html), "deny must not be pressable mid-decision");
  assert.equal(
    (html.match(/data-gw-governed-approve/g) || []).length, 1,
    "the submitting control keeps its hook but is disabled, so the handler can still refuse it",
  );
  assert.match(html, /disabled/);
});

await test("the same in-flight state reaches every approval surface", () => {
  // Three surfaces render this decision — the global bar, the lane card and the
  // run decision bar — and an operator who pressed in one and then looked at
  // another used to find a live button waiting for them there.
  View.setGovernedDecisionState(APPROVAL_ROW.request_id, "submitting");
  const card = View.renderLaneApprovalCard({ lane_id: "lane_x" }, APPROVAL_ROW);
  assert.match(card, /Approving…/);
  const bar = View.renderOperatorDecisionActions({
    governed_action: { ...APPROVAL_ROW, status: "awaiting_operator" },
  });
  assert.match(bar, /Approving…/);
});

await test("a settled decision never re-arms the button", () => {
  View.setGovernedDecisionState(APPROVAL_ROW.request_id, "settled", { label: "Approved" });
  const html = View.renderPendingApprovalsBar([APPROVAL_ROW]);
  assert.match(html, /Approved/);
  assert.ok(!/data-gw-governed-approve/.test(html), "a settled decision offers nothing to press again");
});

await test("a failed decision is visible, named, and explicitly retryable", () => {
  // No silent no-op and no indefinite spinner. The operator is told what
  // happened and given one deliberate way to try again.
  View.setGovernedDecisionState(APPROVAL_ROW.request_id, "failed", {
    error: View.governedDecisionFailureCopy("self_approval_refused"),
  });
  const html = View.renderPendingApprovalsBar([APPROVAL_ROW]);
  assert.match(html, /cannot approve its own request/i);
  assert.match(html, /Try again/);
  assert.match(html, /data-gw-governed-approve/, "retry has to be reachable");
  View.clearGovernedDecisionState(APPROVAL_ROW.request_id);
});

await test("the escalation reason the server now always records is shown to the operator", () => {
  // The server-side half of this mission fills escalation_reason on every
  // escalation. It is worth nothing if the card does not say it, so both
  // approval surfaces are asserted to carry it.
  const html = View.renderPendingApprovalsBar([APPROVAL_ROW]);
  assert.match(html, /Why this needs you/);
  assert.match(html, /operator's decision in V1/);
  const card = View.renderLaneApprovalCard({ lane_id: "lane_x" }, APPROVAL_ROW);
  assert.match(card, /Why this needs you/);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
