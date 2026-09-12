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
  OPERATOR_ONLY_ENVIRONMENT_READ_EXEMPTIONS,
  readOnlyEnvironmentExemptionApplies,
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
  //
  // The census is the one action that DOES default into an operator-only
  // environment on purpose, because that environment is genuinely where it
  // reads. It reaches its policy through an enumerated read exemption rather
  // than through its target, so it is excluded here by that enumeration — never
  // by name, so the exclusion cannot outlive the exemption.
  const exempt = new Set(
    OPERATOR_ONLY_ENVIRONMENT_READ_EXEMPTIONS.map((x) => `${norm(x.action_key)}@${norm(x.environment)}`),
  );
  for (const policy of DELEGATED_POLICIES_V1.filter((p) => p.enabled === true)) {
    const target = defaultTargetForAction(policy.action_key);
    if (exempt.has(`${norm(policy.action_key)}@${norm(target)}`)) continue;
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
  // AND IT NAMES THE GATE, NOT JUST THE FACT THAT A HUMAN IS NEEDED.
  //
  // This request omits `expectedQueryHash`, so the census policy refuses on
  // census_query_hash_pinned. Asserting the specific gate is the difference
  // between a reason and an apology: "an operator must decide" is unactionable,
  // "the request did not pin the query hash" tells the lane what to fix.
  assert.match(out.request.escalation_reason, /census_query_hash_pinned/);
});

await test("a census that pins nothing is refused by a gate, not by its environment", () => {
  // The refusal survived the delegation — it just got a cause. Before this, the
  // same request escalated with "This targets alloy_deployed_primary", which is
  // true of EVERY census and therefore distinguishes none of them.
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  const out = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  assert.equal(out.request.status, "awaiting_operator");
  assert.equal(out.request.director_decision?.decision, "policy_denied");
  assert.equal(out.request.director_decision?.matched_policy, "allowlisted_read_only_census_v1");
  assert.ok((out.request.director_decision?.failed_gates || []).includes("census_query_hash_pinned"));
  assert.doesNotMatch(out.request.escalation_reason, /always an operator decision/);
});

await test("the read exemption cannot be worn by a write", () => {
  // The exemption is the one place a production write could be smuggled in, so
  // it is probed directly rather than only through its consumers.
  assert.equal(
    readOnlyEnvironmentExemptionApplies(
      { action_key: "database.read_census", requested_mode: "read_only" },
      "alloy_deployed_primary",
    ),
    true,
  );
  // Same action, wrong mode.
  assert.equal(
    readOnlyEnvironmentExemptionApplies(
      { action_key: "database.read_census", requested_mode: "migration_apply" },
      "alloy_deployed_primary",
    ),
    false,
  );
  // An operator-owned class can never be exempted, even if someone lists it.
  for (const key of OPERATOR_OWNED_ACTION_KEYS) {
    assert.equal(
      readOnlyEnvironmentExemptionApplies({ action_key: key, requested_mode: "read_only" }, "alloy_deployed_primary"),
      false,
      `${key} is operator-owned and must never be exempted`,
    );
  }
  // An unlisted action in the same environment is still refused.
  assert.equal(
    readOnlyEnvironmentExemptionApplies(
      { action_key: "database.repair_migration_ledger", requested_mode: "read_only" },
      "alloy_deployed_primary",
    ),
    false,
  );
});

await test("both migration actions are inventoried and reserved to the operator", () => {
  // These generated 28 Director clicks in the measured week while carrying no
  // tier at all, which is why the reconciliation test was red on staging.
  for (const key of ["database.apply_promoted_migration", "database.repair_migration_ledger"]) {
    assert.ok(OPERATOR_OWNED_ACTION_KEYS.includes(key), `${key} must be reserved to the operator`);
    assert.equal(
      DELEGATED_POLICIES_V1.some((p) => p.enabled === true && p.action_key === key), false,
      `${key} must not be covered by an enabled delegated policy`,
    );
    // And their target must stay the deployed primary, which is the second,
    // independent half of the refusal.
    assert.equal(defaultTargetForAction(key), "alloy_deployed_primary");
  }
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

// ── 3b. The census the Director stopped being asked about ────────────────────

await test("a pinned, read-only census against the deployed primary runs unattended", async () => {
  // THE 73-CLICKS-A-WEEK CASE, END TO END.
  //
  // Same action, same target, same production database. The difference is that
  // the request now pins the query it is asking to run, so every gate can be
  // measured — read-only mode, hash pinned by the request, artifact resolving
  // inside the worktree and still matching, SQL statically proven non-mutating,
  // target exactly the one that will be read — and none of them needs a human.
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const artifact = join(REPO, Q15);
  const doc = JSON.parse(readFileSync(artifact, "utf8"));
  const sql = doc.combined_query || doc.sql || doc.query;
  const queryHash = createHash("sha256").update(sql, "utf8").digest("hex");

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
    inputs: { expectedQueryHash: queryHash },
    worktree_path: join(REPO, "scripts/local-dev"),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.request.status, "complete", out.request.escalation_reason || "");
  assert.equal(executions, 1);
  assert.equal(out.request.director_decision?.decision, "director_approved");
  assert.equal(out.request.director_decision?.matched_policy, "allowlisted_read_only_census_v1");
  // Removing the click did not remove the account of it.
  assert.equal(out.request.authorization_basis?.policy_id, "allowlisted_read_only_census_v1");
  assert.equal(out.request.authorization_basis?.environment, "alloy_deployed_primary");
});

await test("a census whose artifact no longer matches its pinned hash refuses", async () => {
  // RE-MEASURED, NOT REMEMBERED. The artifact is a file; the gate re-runs the
  // registry's validator at decision time precisely so that a file which has
  // changed since the request was filed cannot ride an earlier pass.
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return fakeCensusResult(rec); });
  const out = requestGovernedAction({
    ...censusProof(),
    inputs: { expectedQueryHash: "0".repeat(64) },
    worktree_path: join(REPO, "scripts/local-dev"),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  // The registry refuses a hash mismatch outright, before policy is consulted;
  // either way nothing ran and nothing was authorised unattended.
  assert.equal(executions, 0);
  assert.notEqual(out.request?.status, "complete");
  assert.notEqual(out.request?.director_decision?.decision, "director_approved");
});

// ── 3c. Timing is observed, not fabricated ───────────────────────────────────

await test("an approval records a real lifecycle, not one repeated timestamp", async () => {
  // THE DEFECT. approveGovernedAction threads ONE nowMs through every
  // downstream appendAudit, so every event of an approval carried an identical
  // timestamp. Across the 962 approvals with a terminal event in the 23 days to
  // 2026-09-11, median approve-to-terminal reads as 0.0s — not a fast system, a
  // fabricated one. `decision_timing` is measured on a separate observability
  // clock so the ledger can answer how long things actually took.
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Governance V1", objective: "Certify", status: "running" });
  setGovernedActionExecuteImplForTests(fakeCensusResult);
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const filed = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  const id = filed.request.request_id;
  const submittedAt = new Date(Date.now() - 4000).toISOString();
  // A PINNED nowMs, deliberately: authorization stays deterministic while the
  // observed stamps move. If timing had been folded into nowMs, this test would
  // be asserting that the clock is broken.
  const approved = await approveGovernedAction(id, {
    actor: "operator", root: ROOT, nowMs: 1_000_000_000_000, submittedAt,
  });
  assert.equal(approved.ok, true, approved.error);
  const t = getGovernedAction(id, ROOT).decision_timing;
  assert.ok(t, "an approval must record its observed lifecycle");
  assert.equal(t.submitted_at, submittedAt, "the operator's press is the client's, not the server's guess");
  for (const field of ["accepted_at", "authorization_persisted_at", "execution_started_at", "execution_settled_at"]) {
    assert.ok(t[field], `${field} must be stamped`);
    assert.ok(Date.parse(t[field]) > 0, `${field} must be a real instant`);
  }
  // The authorization clock is untouched by all of this, which is the property
  // that keeps wall-clock time out of authorization correctness.
  assert.equal(getGovernedAction(id, ROOT).execution_started_at, new Date(1_000_000_000_000).toISOString());
  // And the stamps are ordered, which is the whole reason they exist.
  assert.ok(Date.parse(t.accepted_at) <= Date.parse(t.execution_started_at));
  assert.ok(Date.parse(t.execution_started_at) <= Date.parse(t.execution_settled_at));
  assert.ok(Date.parse(t.submitted_at) < Date.parse(t.accepted_at), "the press precedes acceptance");
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
