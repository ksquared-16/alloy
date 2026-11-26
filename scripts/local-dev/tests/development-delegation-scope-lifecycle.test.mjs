#!/usr/bin/env node
/**
 * ONE AUTHORIZATION SCOPE, AND AUTHORITY SPENT ONLY WHEN IT IS USABLE.
 *
 * Two defects S15 proved live, both fail-closed, both fixed here.
 *
 * 1. THREE ANSWERS TO ONE QUESTION. The delegated path minted exact-request
 *    authority under `mission_id || lane_id` (-> lane_73a897409906), the policy
 *    lookup asked for `mission_id` (-> null), and the trusted-host action was
 *    created under authorityScopeFor (-> repo_alloy). A repository-authorized
 *    lane has no mission, so authority was written to one partition and searched
 *    for in another: minted, then not found, and a delegated push escalated to
 *    awaiting_operator. Everyone now uses authorityScopeFor.
 *
 * 2. AUTHORITY SPENT BEFORE IT WAS USED. The delegation was consumed the instant
 *    policy selected it. When the lookup above then failed, the run escalated,
 *    nothing was pushed — and the delegation was gone. Consumption now happens
 *    only after the authorization is minted AND proven resolvable, with a
 *    reservation holding single-use in between.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-scope-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const { requestGovernedAction } = await import("../lib/vacilando/governed-action-request.mjs");
const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");
const D = await import("../lib/vacilando/mission-delegation.mjs");

const PUSH = "repository.push";
const SHA = "f11d17f3dd18fe79b95cccff77c7bed4a3897712";
const REPO = "ksquared-16/alloy";

writeFileSync(repositoryStorePath(ROOT), `${JSON.stringify({
  schema_version: "vacilando.repository.v1",
  repositories: {
    repo_alloy: {
      schema_version: "vacilando.repository.v1",
      repository_id: "repo_alloy", name: "Alloy", profile: "alloy", state: "ACTIVE",
      root: join(ROOT, "r"), git_common_dir: join(ROOT, "r", ".git"),
      worktree_parent: join(ROOT, "w"), default_branch: "origin/staging",
      remote: "git@github.com:ksquared-16/alloy.git",
      created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
    },
  },
}, null, 2)}\n`, "utf8");

function newLane(name) {
  const made = createDurableLane({ name, repository_id: "repo_alloy", root: ROOT });
  return made.lane?.lane_id || made.lane_id;
}
function storedRequest(id) {
  const raw = JSON.parse(readFileSync(join(ROOT, "vacilando", "governed-actions", "requests.json"), "utf8"));
  const all = raw.requests || raw;
  return (Array.isArray(all) ? all : Object.values(all)).find((x) => x.request_id === id);
}
function auditStates(id) {
  try {
    return readFileSync(join(ROOT, "vacilando", "governed-actions", "audit.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((e) => e.request_id === id).map((e) => e.state || e.event);
  } catch { return []; }
}
let prCounter = 900;
function pushRequest(laneId, branch = "promote/scope-cert") {
  prCounter += 1;
  const out = requestGovernedAction({
    action_key: PUSH,
    lane_id: laneId,
    target: "staging",
    purpose: `scope certification ${prCounter}`,
    reason_worker_cannot_execute: "pushing is Director-owned",
    inputs: { repository: REPO, branch: `${branch}-${prCounter}`, expectedHeadSha: SHA, worktreePath: ROOT },
  }, { root: ROOT, processNow: true });
  const id = out.request?.request_id;
  return { id, rec: id ? storedRequest(id) : null, states: id ? auditStates(id) : [] };
}
function delegate(laneId, actions = [{ action_key: PUSH }]) {
  return D.recordMissionDelegation({
    laneId, repository: REPO, delegatedActions: actions, author: "director", root: ROOT,
  });
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// ------------------------------------------------------- scope convergence

test("a MISSION-LESS lane's delegated push executes unattended", () => {
  // THE S15 FAILURE, AS A REGRESSION TEST. mission_id is null; the lane is the
  // durable authority scope. Mint and lookup must land in the same partition.
  const laneId = newLane("Missionless promotion");
  assert.equal(delegate(laneId).created, 1);
  const { rec, states } = pushRequest(laneId);
  assert.equal(rec.mission_id, null, "this lane genuinely has no mission");
  assert.equal(rec.policy_decision, "mission_delegation", `declined: ${rec.delegation_declined}`);
  assert.ok(rec.mission_delegation.authorization_id, "authority must be minted");
  assert.equal(rec.mission_delegation.authorization_error, undefined);
  // It must reach execution WITHOUT being gated first. In this sandbox there is
  // no repository and no gh, so the trusted host escalates afterwards — the
  // proof is the ORDER: executing precedes any awaiting_operator, i.e. no
  // approval was required to get there.
  const firstExec = states.indexOf("executing");
  const firstGate = states.indexOf("awaiting_operator");
  assert.notEqual(firstExec, -1, `expected unattended execution, saw ${states.join(" -> ")}`);
  assert.ok(firstGate === -1 || firstExec < firstGate,
    `execution must not be gated first, saw ${states.join(" -> ")}`);
});

test("the minted authority is findable — mint and lookup share one partition", () => {
  const laneId = newLane("Scope agreement");
  delegate(laneId);
  const { rec } = pushRequest(laneId);
  // repo_alloy is authorityScopeFor's answer for a mission-less lane; the point
  // is only that ONE answer is used everywhere, and it resolved.
  assert.equal(rec.mission_delegation.authorization_scope, "repo_alloy");
  assert.ok(rec.mission_delegation.consumed, "resolvable authority is spent");
});

test("one lane's authority cannot cover another lane's request", () => {
  const laneA = newLane("Lane A");
  const laneB = newLane("Lane B");
  delegate(laneA);
  const a = pushRequest(laneA);
  assert.equal(a.rec.policy_decision, "mission_delegation");
  // Lane B never received a delegation. Sharing a repository partition must not
  // let it inherit lane A's authority: exact-request binding covers requestId
  // and content fingerprint, not merely the partition.
  const b = pushRequest(laneB);
  assert.notEqual(b.rec.policy_decision, "mission_delegation");
  assert.equal(b.rec.delegation_declined, "no_delegation_for_action");
  assert.ok(!b.states.includes("executing"), "lane B must not execute on lane A's authority");
});

test("no scope at all fails closed", () => {
  const out = D.recordMissionDelegation({
    repository: REPO, delegatedActions: [{ action_key: PUSH }], author: "director", root: ROOT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_mission_or_lane");
  const cover = D.findCoveringDelegation({ actionKey: PUSH, repository: REPO }, { root: ROOT });
  assert.equal(cover.ok, false);
  assert.equal(cover.error, "no_mission_scope");
});

// --------------------------------------------------- consumption lifecycle

test("a policy match alone does not consume — reservation holds it", () => {
  const laneId = newLane("Reserve only");
  const made = delegate(laneId);
  const id = made.delegations[0].delegation_id;
  const held = D.reserveMissionDelegation(id, { requestId: "gar_holder", root: ROOT });
  assert.equal(held.ok, true);
  assert.equal(D.delegationById(id, ROOT).status, "reserved");
  assert.notEqual(D.delegationById(id, ROOT).status, "consumed");
});

test("a reserved delegation is not available to a second request", () => {
  const laneId = newLane("Concurrency");
  const id = delegate(laneId).delegations[0].delegation_id;
  assert.equal(D.reserveMissionDelegation(id, { requestId: "gar_A", root: ROOT }).ok, true);
  const second = D.reserveMissionDelegation(id, { requestId: "gar_B", root: ROOT });
  assert.equal(second.ok, false);
  assert.equal(second.error, "delegation_reserved_by_another_request");
  assert.equal(second.held_by, "gar_A");
  // It is also not matchable, so no second request can even select it.
  assert.equal(D.delegationIsLive(D.delegationById(id, ROOT)), false);
  // And B cannot consume what A holds.
  const steal = D.consumeMissionDelegation(id, { requestId: "gar_B", root: ROOT });
  assert.equal(steal.ok, false);
  assert.equal(steal.error, "delegation_reserved_by_another_request");
});

test("a failed handoff releases the reservation — authority is NOT spent", () => {
  const laneId = newLane("Release");
  const id = delegate(laneId).delegations[0].delegation_id;
  D.reserveMissionDelegation(id, { requestId: "gar_A", root: ROOT });
  const released = D.releaseMissionDelegation(id, {
    requestId: "gar_A", reason: "authorization_not_resolvable", root: ROOT,
  });
  assert.equal(released.ok, true);
  const rec = D.delegationById(id, ROOT);
  assert.equal(rec.status, "unconsumed", "a pre-execution failure must not spend authority");
  assert.equal(rec.released_reason, "authorization_not_resolvable");
  assert.equal(D.delegationIsLive(rec), true, "it is available again");
  // A later request can now use it.
  assert.equal(D.reserveMissionDelegation(id, { requestId: "gar_B", root: ROOT }).ok, true);
});

test("only the holder may release a reservation", () => {
  const laneId = newLane("Release guard");
  const id = delegate(laneId).delegations[0].delegation_id;
  D.reserveMissionDelegation(id, { requestId: "gar_A", root: ROOT });
  const foreign = D.releaseMissionDelegation(id, { requestId: "gar_B", root: ROOT });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.error, "delegation_reserved_by_another_request");
  assert.equal(D.delegationById(id, ROOT).status, "reserved", "still held by A");
});

test("successful admission consumes exactly once, and replay refuses", () => {
  const laneId = newLane("Consume once");
  delegate(laneId);
  const first = pushRequest(laneId);
  assert.equal(first.rec.policy_decision, "mission_delegation");
  assert.equal(first.rec.mission_delegation.consumed, true);
  const recs = D.listMissionDelegations({ scopeKey: laneId, root: ROOT });
  assert.equal(recs[0].status, "consumed");
  assert.equal(recs[0].consumed_by_request_id, first.rec.request_id);
  // Replay is refused at the delegation, which is where single-use lives. (A
  // second governed request with the same ownership dedupes to the first while
  // it is still in flight, so the replay is asserted here rather than through a
  // second request that would not actually be a second request.)
  const replay = D.findCoveringDelegation({
    laneId, actionKey: PUSH, repository: REPO, branch: "promote/another",
  }, { root: ROOT });
  assert.equal(replay.ok, false);
  assert.equal(replay.error, "delegation_already_consumed");
  assert.equal(D.consumeMissionDelegation(recs[0].delegation_id, { requestId: "gar_other", root: ROOT }).ok, false);
});

test("a release cannot resurrect an already-consumed delegation", () => {
  const laneId = newLane("No resurrection");
  delegate(laneId);
  const first = pushRequest(laneId);
  const id = D.listMissionDelegations({ scopeKey: laneId, root: ROOT })[0].delegation_id;
  assert.equal(D.delegationById(id, ROOT).status, "consumed");
  const out = D.releaseMissionDelegation(id, { requestId: first.rec.request_id, root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "delegation_not_reserved");
  assert.equal(D.delegationById(id, ROOT).status, "consumed",
    "execution began under it; a later failure keeps it spent");
});

test("a revoked delegation can never be reserved", () => {
  const laneId = newLane("Revoked");
  const id = delegate(laneId).delegations[0].delegation_id;
  D.revokeMissionDelegation(id, { root: ROOT });
  const held = D.reserveMissionDelegation(id, { requestId: "gar_A", root: ROOT });
  assert.equal(held.ok, false);
  assert.equal(held.error, "delegation_not_live");
  assert.equal(held.status, "revoked");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
