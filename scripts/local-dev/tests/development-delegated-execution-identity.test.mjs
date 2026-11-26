#!/usr/bin/env node
/**
 * THE MINT AND THE BOUNDARY MUST DESCRIBE THE SAME ACTION.
 *
 * Four live certifications failed closed because they did not. The last one is
 * the reason this file exists: a delegated `repository.push` was authorised,
 * reached `executing`, and then stopped at the trusted-host boundary, because
 * the boundary derived the authorization environment as `alloy_deployed_primary`
 * — a DATABASE default, and an operator-only environment — while the mint had
 * recorded a branch name. No exact-request authorization for a push could ever
 * resolve, and the delegation was spent proving it.
 *
 * So the assertions here are not "did it execute". They are:
 *
 *   1. the identity minted equals the identity the boundary resolves;
 *   2. the run reached the trusted host with NO operator escalation;
 *   3. everything the mission did not delegate still stops.
 *
 * These runs stop at the real `git`/`gh` call — there is no remote in a temp
 * directory — so success means WHO AUTHORISED the attempt, never that a push
 * or a merge landed. Live promotion is certified against the running runtime.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-identity-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
const WORKTREE = join(ROOT, "w", "wt-cert");
mkdirSync(WORKTREE, { recursive: true });

const { requestGovernedAction } = await import("../lib/vacilando/governed-action-request.mjs");
const { createDurableLane } = await import("../lib/vacilando/development-lane.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");
const { listTrustedHostActions } = await import("../lib/vacilando/trusted-host-actions.mjs");
const { listAuthorizations } = await import("../lib/vacilando/trusted-host-authz.mjs");
const { resolveActionAuthorizationIdentity, sameAuthorizationIdentity, authorizationIdentityMismatch } =
  await import("../lib/vacilando/action-authorization-identity.mjs");
const D = await import("../lib/vacilando/mission-delegation.mjs");

const REPO = "ksquared-16/alloy";
const SHA = "83d624abb2621e48c09f7c5eb50a5fbc4faca24e";
const OTHER_SHA = "1f2e3d4c5b6a798877665544332211009988aabb";
const UNDELEGATED_SHA = "aabbccddeeff00112233445566778899aabbccdd";
/** The promotion branch is NOT the lane's branch — the case that failed once. */
const PROMOTE = "promote/identity-cert";
const LANE_BRANCH = "agent/claude/5-work-unit-grade-a";

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

const made = createDurableLane({ name: "Identity cert", repository_id: "repo_alloy", root: ROOT });
const laneId = made.lane?.lane_id || made.lane_id;

function storedRequest(id) {
  const raw = JSON.parse(readFileSync(join(ROOT, "vacilando", "governed-actions", "requests.json"), "utf8"));
  const all = raw.requests || raw;
  return (Array.isArray(all) ? all : Object.values(all)).find((x) => x.request_id === id);
}

/** `executing` in this list means no operator was ever asked. */
function auditStates(id) {
  try {
    return readFileSync(join(ROOT, "vacilando", "governed-actions", "audit.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((e) => e.request_id === id)
      .map((e) => e.state || e.event || e.status);
  } catch { return []; }
}

function govern(action_key, inputs, { target = "staging" } = {}) {
  const out = requestGovernedAction({
    action_key,
    lane_id: laneId,
    target,
    purpose: `identity certification ${action_key}`,
    reason_worker_cannot_execute: "privileged repository write is Director-owned",
    inputs,
  }, { root: ROOT, processNow: true });
  const id = out.request?.request_id;
  return { out, id, rec: id ? storedRequest(id) : null, states: id ? auditStates(id) : [] };
}

/** The trusted-host action this request produced, if it created one. */
function actionFor(rec) {
  return listTrustedHostActions("repo_alloy")
    .filter((a) => a.actionType === rec.action_key)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}

function authById(id) {
  return listAuthorizations("repo_alloy").find((a) => a.authorizationId === id) || null;
}

/**
 * THE CENTRAL ASSERTION. The authorization as MINTED, and the identity the
 * trusted-host action carries, must be the same action — field by field.
 */
function assertIdentityConverged(rec, label) {
  const authId = rec.mission_delegation?.authorization_id || rec.director_approval?.authorization_id;
  assert.ok(authId, `${label}: execution authority must have been derived`);
  const auth = authById(authId);
  assert.ok(auth, `${label}: the authorization must be in the scope the boundary reads`);
  assert.equal(auth.missionId, "repo_alloy", `${label}: one partition for mint and lookup`);

  const action = actionFor(rec);
  assert.ok(action, `${label}: the request must have reached the trusted host`);
  assert.equal(action.missionId, auth.missionId, `${label}: action and authorization share a scope`);

  const boundary = resolveActionAuthorizationIdentity({
    actionType: action.actionType,
    scope: action.missionId,
    inputs: action.inputs,
    requestId: action.authorizationIdentity?.requestId || null,
    contentFingerprint: action.authorizationIdentity?.contentFingerprint || null,
  });
  const minted = {
    actionType: auth.actionType,
    scope: auth.missionId,
    repository: auth.repository,
    environment: auth.environment,
    targetRef: auth.targetRef,
    sourceSha: auth.sourceSha,
    subjectKey: auth.queryHash,
  };
  assert.ok(
    sameAuthorizationIdentity(minted, boundary),
    `${label}: mint and boundary disagree ${JSON.stringify(authorizationIdentityMismatch(minted, boundary))}`,
  );
  // And the authorization actually pinned to the action, not merely present.
  assert.equal(action.authorizationState, "authorized", `${label}: the boundary must have authorized it`);
  assert.equal(action.authorizationId, authId, `${label}: the boundary used THIS authorization`);
  return { auth, action, boundary };
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// Order matters: one lane, one delegation lifecycle, three actions in sequence.

test("with no delegation and no grant, nothing is authorized by default", () => {
  // NO GLOBAL FALLBACK. An unauthorized request must find nothing at all.
  // A commit of its own. A governed request dedupes on lane + action + target +
  // PR/SHA — NOT on branch — so a push proposed at the same SHA would return
  // this record, and its verdict would be read back as the delegated run's.
  const { rec, states } = govern("repository.push", {
    repository: REPO, branch: "promote/identity-cert-undelegated",
    expectedHeadSha: UNDELEGATED_SHA, worktreePath: WORKTREE,
  });
  assert.equal(rec.status, "awaiting_operator");
  assert.ok(!states.includes("executing"), "nothing executes without authority");
  assert.equal(rec.mission_delegation, undefined);
});

test("the mission delegates push, open-PR and merge — typed, not written", () => {
  const captured = D.recordMissionDelegation({
    laneId,
    repository: "github.com/ksquared-16/alloy",
    // The prose names every action and delegates none of them.
    missionText: "push it, open the PR and merge to staging — and never merge to main",
    delegatedActions: [
      { action_key: "repository.push" },
      { action_key: "promotion.open_pr", target_branch: "staging" },
      { action_key: "repository.merge_pull_request", target_branch: "staging", checks_required: true },
    ],
    author: "operator",
    root: ROOT,
  });
  assert.equal(captured.created, 3);
  const live = D.listMissionDelegations({ scopeKey: laneId, root: ROOT });
  assert.equal(live.length, 3, "exactly the typed actions, nothing the prose mentioned");
  // No source branch was inferred from the lane binding.
  assert.deepEqual([...new Set(live.map((d) => d.source_branch ?? null))], [null]);
});

test("repository.push: promotion branch differs from the lane branch, and it still executes unattended", () => {
  const { rec, states } = govern("repository.push", {
    repository: REPO, branch: PROMOTE, expectedHeadSha: SHA, worktreePath: WORKTREE,
  });
  assert.notEqual(PROMOTE, LANE_BRANCH, "the promotion branch is deliberately not the lane's");
  assert.equal(rec.policy_decision, "mission_delegation", `saw ${rec.policy_decision}`);
  assert.equal(rec.mission_delegation.consumed, true, "authority is spent only once it is usable");
  assert.equal(rec.mission_delegation.authorization_error, undefined);
  // THE REGRESSION THAT FAILED S15 FOUR TIMES.
  assert.ok(states.includes("executing"), `expected unattended execution, saw ${states.join(" -> ")}`);
  assert.ok(!states.includes("awaiting_operator"), `escalated anyway: ${states.join(" -> ")}`);

  const { auth, boundary } = assertIdentityConverged(rec, "push");
  // A push of promote/* writes a branch ref that deploys nowhere.
  assert.equal(auth.environment, "repository", "a push at promote/* is not a staging write");
  assert.equal(auth.targetRef, PROMOTE);
  assert.equal(auth.sourceSha, SHA, "bound to this exact commit");
  assert.equal(boundary.environment, "repository");
  assert.notEqual(auth.environment, "alloy_deployed_primary");
  assert.notEqual(auth.databaseTarget, "alloy_deployed_primary");
});

test("promotion.open_pr: head branch and base carry the same identity at mint and lookup", () => {
  const { rec, states } = govern("promotion.open_pr", {
    repository: REPO, headBranch: PROMOTE, base: "staging",
    expectedHeadSha: SHA, title: "Identity certification",
  });
  assert.equal(rec.policy_decision, "mission_delegation", `saw ${rec.policy_decision}`);
  assert.ok(states.includes("executing"), `expected unattended execution, saw ${states.join(" -> ")}`);
  const { auth } = assertIdentityConverged(rec, "open_pr");
  // Opening a proposal changes no branch; the base it aims at is still bound.
  assert.equal(auth.environment, "repository");
  assert.equal(auth.targetRef, "staging");
  assert.equal(auth.sourceSha, SHA);
});

test("repository.merge_pull_request: PR, SHA, target and method converge", () => {
  const { rec, states } = govern("repository.merge_pull_request", {
    repository: REPO, pullRequestNumber: 605, targetBranch: "staging",
    expectedHeadSha: SHA, mergeMethod: "merge", requiredChecksGreen: true,
  });
  assert.equal(rec.policy_decision, "mission_delegation", `saw ${rec.policy_decision}`);
  assert.ok(states.includes("executing"), `expected unattended execution, saw ${states.join(" -> ")}`);
  const { auth, action } = assertIdentityConverged(rec, "merge");
  // A merge DOES write the target branch, so it really is a staging write.
  assert.equal(auth.environment, "staging");
  assert.equal(auth.targetRef, "staging");
  assert.equal(auth.sourceSha, SHA);
  assert.equal(action.inputs.pullRequestNumber, 605);
  assert.equal(action.inputs.mergeMethod, "merge");
  assert.equal(action.inputs.requiredChecksGreen, true, "the check gate is never waived");
});

test("all three delegations are spent — a replay asks the operator again", () => {
  const live = D.listMissionDelegations({ scopeKey: laneId, root: ROOT })
    .filter((d) => d.status === "unconsumed");
  assert.equal(live.length, 0, "single use, three times over");
  const { rec, states } = govern("repository.merge_pull_request", {
    repository: REPO, pullRequestNumber: 606, targetBranch: "staging",
    expectedHeadSha: OTHER_SHA, mergeMethod: "merge", requiredChecksGreen: true,
  });
  assert.equal(rec.status, "awaiting_operator");
  assert.equal(rec.delegation_declined, "delegation_already_consumed");
  assert.ok(!states.includes("executing"));
});

test("a spent authorization does not cover a different commit", () => {
  // The push authority above was minted for one SHA. Nothing about the new
  // request may resolve it — a moved branch is a different decision.
  const { rec, states } = govern("repository.push", {
    repository: REPO, branch: PROMOTE, expectedHeadSha: OTHER_SHA, worktreePath: WORKTREE,
  });
  assert.equal(rec.status, "awaiting_operator");
  assert.ok(!states.includes("executing"));
});

test("a staging delegation cannot carry a production merge", () => {
  D.recordMissionDelegation({
    laneId, repository: "github.com/ksquared-16/alloy",
    delegatedActions: [{ action_key: "repository.merge_pull_request", target_branch: "staging" }],
    author: "operator", root: ROOT,
  });
  const { rec, states } = govern("repository.merge_pull_request", {
    repository: REPO, pullRequestNumber: 607, targetBranch: "production",
    expectedHeadSha: SHA, mergeMethod: "merge", requiredChecksGreen: true,
  }, { target: "production" });
  assert.ok(!states.includes("executing"), "production must never execute under delegation");
  assert.equal(rec.failure_code, "production_target_rejected");
  const live = D.listMissionDelegations({ scopeKey: laneId, root: ROOT })
    .filter((d) => d.action_key === "repository.merge_pull_request" && d.status === "unconsumed");
  assert.equal(live.length, 1, "a refused production attempt must not burn staging authority");
});

test("a delegated merge cannot be redirected to another repository", () => {
  const { rec, states } = govern("repository.merge_pull_request", {
    repository: "someone-else/private", pullRequestNumber: 608, targetBranch: "staging",
    expectedHeadSha: SHA, mergeMethod: "merge", requiredChecksGreen: true,
  });
  assert.ok(!states.includes("executing"), "another repository is not this authority");
  assert.notEqual(rec.status, "complete");
  const live = D.listMissionDelegations({ scopeKey: laneId, root: ROOT })
    .filter((d) => d.action_key === "repository.merge_pull_request" && d.status === "unconsumed");
  assert.equal(live.length, 1, "a refused repository must not burn the delegation");
});

test("a push at a protected ref is refused however it is asked for", () => {
  for (const branch of ["staging", "main", "production"]) {
    const { rec, states } = govern("repository.push", {
      repository: REPO, branch, expectedHeadSha: SHA, worktreePath: WORKTREE,
    });
    assert.ok(!states.includes("executing"), `${branch} must never be pushed directly`);
    assert.notEqual(rec.status, "complete");
  }
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
