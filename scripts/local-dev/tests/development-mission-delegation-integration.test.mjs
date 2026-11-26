#!/usr/bin/env node
/**
 * DELEGATION MEETS THE POLICY PATH.
 *
 * The unit matrix proves the delegation MODULE refuses everything it should.
 * This proves the integration: that an explicit mission delegation actually
 * satisfies the operator-approval requirement of a real governed action, mints
 * the same exact-request execution authority a Director approval would, and
 * lets the request proceed to execution WITHOUT a click — while everything the
 * mission did not authorise still stops.
 *
 * The audit trail is the evidence. `requested -> executing` means no operator
 * was asked; `requested -> awaiting_operator` means one was.
 *
 * These runs deliberately stop at the real GitHub call — there is no repository
 * or `gh` in a temp directory — so the assertions are about WHO AUTHORISED the
 * attempt, never about a merge succeeding. A green merge is certified against
 * the live runtime, not here.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-deleg-integ-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const { requestGovernedAction } = await import("../lib/vacilando/governed-action-request.mjs");
const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");
const D = await import("../lib/vacilando/mission-delegation.mjs");

const SHA = "d9beb0c29508cf07f0f84ff077ece24b29b3baf4";
/** V2: typed authority. The prose below is deliberately inert. */
const FULL_ACTIONS = Object.freeze([
  { action_key: "repository.push" },
  { action_key: "promotion.open_pr", target_branch: "staging" },
  { action_key: "repository.merge_pull_request", target_branch: "staging", checks_required: true },
]);
/** Prose that mentions every privileged action, to prove it grants nothing. */
const INERT_PROSE = "validate this work, push it, open the PR, and merge it to staging when checks pass";

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

const made = createDurableLane({ name: "Delegation cert", repository_id: "repo_alloy", root: ROOT });
const laneId = made.lane?.lane_id || made.lane_id;

function storedRequest(id) {
  const raw = JSON.parse(readFileSync(join(ROOT, "vacilando", "governed-actions", "requests.json"), "utf8"));
  const all = raw.requests || raw;
  return (Array.isArray(all) ? all : Object.values(all)).find((x) => x.request_id === id);
}

/** Which states this request passed through. `executing` means nobody was asked. */
function auditStates(id) {
  try {
    return readFileSync(join(ROOT, "vacilando", "governed-actions", "audit.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((e) => e.request_id === id)
      .map((e) => e.state || e.event || e.status);
  } catch { return []; }
}

function mergeRequest(pr, { target = "staging" } = {}) {
  const out = requestGovernedAction({
    action_key: "repository.merge_pull_request",
    lane_id: laneId,
    target,
    purpose: `delegation certification pr ${pr}`,
    reason_worker_cannot_execute: "merging is Director-owned",
    inputs: {
      repository: "ksquared-16/alloy",
      pullRequestNumber: pr,
      targetBranch: target,
      expectedHeadSha: SHA,
      mergeMethod: "merge",
      requiredChecksGreen: true,
    },
  }, { root: ROOT, processNow: true });
  const id = out.request?.request_id;
  return { id, rec: id ? storedRequest(id) : null, states: id ? auditStates(id) : [] };
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// Order matters: these share one lane and one delegation lifecycle.

test("without delegation the merge waits for the operator and never executes", () => {
  const { rec, states } = mergeRequest(700);
  assert.equal(rec.status, "awaiting_operator");
  assert.equal(rec.policy_decision, "policy_default_requires_operator");
  assert.equal(rec.delegation_declined, "no_delegation_for_action");
  assert.ok(!states.includes("executing"), "nothing may execute without authority");
});

test("an explicit mission delegation satisfies the approval and executes unattended", () => {
  // Prose alone grants nothing — assert that first, in the real path.
  const proseOnly = D.recordMissionDelegation({
    laneId, repository: "github.com/ksquared-16/alloy",
    missionText: INERT_PROSE, author: "director", root: ROOT,
  });
  assert.equal(proseOnly.created, 0, "prose must never grant authority");

  const captured = D.recordMissionDelegation({
    laneId,
    // Deliberately the registry's remote shape, not the governed-input shape,
    // to prove the capture/compare seam holds in the real path.
    repository: "github.com/ksquared-16/alloy",
    delegatedActions: FULL_ACTIONS,
    author: "director",
    missionText: INERT_PROSE,
    root: ROOT,
  });
  assert.equal(captured.created, 3, "the typed field delegates push, open-PR and merge");

  const { rec, states } = mergeRequest(701);
  assert.equal(rec.policy_decision, "mission_delegation", "the mission supplied the approval");
  assert.equal(rec.mission_delegation.authorized_by, "mission_delegation");
  assert.ok(rec.mission_delegation.delegation_id, "the authority is identified");
  assert.equal(rec.mission_delegation.action_key, "repository.merge_pull_request");
  assert.equal(rec.mission_delegation.target_branch, "staging");
  // The same primitive a Director approval mints: one exact content identity.
  assert.ok(rec.mission_delegation.authorization_id, "execution authority must be derived");
  assert.equal(rec.mission_delegation.authorization_error, undefined);
  // THE PROOF: it reached execution without ever asking.
  assert.ok(states.includes("executing"), `expected an unattended execution, saw ${states.join(" -> ")}`);
});

test("the delegation is spent: a second merge asks the operator again", () => {
  const { rec, states } = mergeRequest(702);
  assert.equal(rec.status, "awaiting_operator");
  assert.equal(rec.delegation_declined, "delegation_already_consumed");
  assert.ok(!states.includes("executing"), "a consumed delegation must not execute anything");
});

test("a staging delegation cannot carry a production merge", () => {
  D.recordMissionDelegation({
    laneId, repository: "github.com/ksquared-16/alloy",
    delegatedActions: [{ action_key: "repository.merge_pull_request", target_branch: "staging" }],
    author: "director", root: ROOT,
  });
  const { rec, states } = mergeRequest(703, { target: "production" });
  assert.notEqual(rec.status, "complete");
  assert.ok(!states.includes("executing"), "production must never execute under delegation");
  // Refused before delegation is even consulted — the registry rejects it.
  assert.equal(rec.failure_code, "production_target_rejected");
  // And the staging delegation is still unspent, because it was never used.
  const live = D.listMissionDelegations({ scopeKey: laneId, root: ROOT })
    .filter((d) => d.action_key === "repository.merge_pull_request" && d.status === "unconsumed");
  assert.equal(live.length, 1, "a refused production attempt must not burn staging authority");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
