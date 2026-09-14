/**
 * Director authority must survive the trip to EXECUTION.
 *
 * The defect this pins: fulfil authorised the action WITH the Director's
 * exact-request context, and then executeTrustedHostAction's per-action
 * executor authorised AGAIN with no context, fell through to
 * findAuthorization, found no standing grant, and escalated to the operator —
 * discarding an authorization that had passed every check seconds earlier.
 *
 * These fixtures deliberately DO NOT stub defaultExecute. An earlier attempt
 * did, reported "awaiting_operator: false", and proved nothing at all, because
 * the stub replaced the very path under test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-bridge-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
writeFileSync(join(ROOT, "vacilando", "repositories.json"), JSON.stringify({
  schema_version: "vacilando.repository.v1",
  repositories: { repo_alloy: { repository_id: "repo_alloy", name: "Alloy", remote: "git@github.com:ksquared-16/alloy.git", remote_normalized: "github.com/ksquared-16/alloy" } },
}), "utf8");

const G = await import("../lib/vacilando/governed-action-request.mjs");
const TH = await import("../lib/vacilando/trusted-host-actions.mjs");
/*
 * A REAL WORKTREE, BECAUSE AN UNMEASURED GATE IS NOT A PASSED GATE.
 *
 * This named a path on another machine and a SHA that was never in it. Two of
 * the routine-push policy's gates are MEASURED FROM THE WORKTREE —
 * `branch_owned_by_requesting_lane` reads its branch and HEAD, and
 * `no_credential_material` diffs its range — so against a path that does not
 * exist both came back null, and the Director escalated with
 *
 *   "Required gates were not measured: branch_owned_by_requesting_lane,
 *    no_credential_material. An unmeasured gate is not a passed gate."
 *
 * That refusal is CORRECT. The runtime was never wrong; the fixture asked it to
 * approve something it could not see. So the fixture now builds the smallest
 * faithful thing: a real repository, on the branch the request names, with the
 * SHA the request declares.
 *
 * Deliberately NOT done by relaxing the policy or stubbing the evidence. A
 * governance test whose fixture bypasses the evidence is testing nothing.
 */
const WT = mkdtempSync(join(tmpdir(), "vac-bridge-wt-"));
function git(...args) {
  return execFileSync("git", ["-C", WT, ...args], { encoding: "utf8" }).trim();
}
execFileSync("git", ["init", "-q", "-b", "agent/cursor/5-bridge-check", WT]);
git("config", "user.email", "bridge@test.local");
git("config", "user.name", "bridge");
writeFileSync(join(WT, "README.md"), "bridge fixture\n", "utf8");
git("add", "README.md");
git("commit", "-q", "-m", "bridge base");
/*
 * A BASE REF, because `no_credential_material` is measured over a RANGE.
 *
 * `credentialMaterialInRange(worktree, "origin/staging", sha)` cannot diff
 * against a ref that does not exist, so it answers null — and a null gate
 * escalates. With no base the fixture was asking the Director to certify "this
 * change carries no credentials" about a change it could not read.
 */
git("update-ref", "refs/remotes/origin/staging", git("rev-parse", "HEAD"));
writeFileSync(join(WT, "CHANGE.md"), "an ordinary change\n", "utf8");
git("add", "CHANGE.md");
git("commit", "-q", "-m", "bridge fixture");
const SHA = git("rev-parse", "HEAD");

function routinePush(branch = "agent/cursor/5-bridge-check") {
  /*
   * THE WORKTREE IS PUT ON THE BRANCH THE REQUEST NAMES.
   *
   * `branch_owned_by_requesting_lane` compares the worktree's CURRENT branch and
   * HEAD against the branch and SHA in the request. A case that pushes a branch
   * the fixture never created is asking the Director to approve a claim it can
   * disprove — and it correctly refuses. Done here rather than per case, so a
   * new case cannot forget.
   */
  try { git("checkout", "-q", branch); }
  catch { git("checkout", "-q", "-b", branch); }
  const out = G.requestGovernedAction({
    lane_id: "lane_bridge", mission_id: "msn_bridge", action_key: "repository.push", target: "staging",
    title: "t", purpose: "p", reason_worker_cannot_execute: "w", worktreePath: WT,
    inputs: { repository: "ksquared-16/alloy", branch, expectedHeadSha: SHA, worktreePath: WT },
  }, { root: ROOT, processNow: true });
  return G.getGovernedAction(out.request?.request_id || out.request_id, ROOT);
}

await test("1 — a Director-approved routine push does NOT escalate to the operator", () => {
  G.resetGovernedActionsForTests(ROOT);
  const rec = routinePush();
  assert.equal(rec.policy_decision, "director_approved");
  assert.equal(rec.director_approval?.actor, "director");
  assert.ok(rec.director_approval?.authorization_id, "execution authority must be derived");
  // THE POINT OF THE SLICE. Execution may still fail on its own merits — this
  // temp root has no matching remote — but it must never bounce back to the
  // operator for want of an authorization the Director already granted.
  assert.notEqual(rec.status, "awaiting_operator", `escalated anyway: ${rec.escalation_reason || rec.failure_reason || "-"}`);
  assert.equal(rec.operator_approval_required, false);
  assert.ok(!rec.operator_approval, "no operator decision may be fabricated");
});

await test("2 — execution failure is recorded as failure, never as a new approval", () => {
  G.resetGovernedActionsForTests(ROOT);
  const rec = routinePush("agent/cursor/5-bridge-fail");
  if (rec.status === "failed") {
    assert.ok(rec.failure_reason, "a failure must say why");
    assert.ok(!rec.operator_approval_required, "a failed execution is not an approval request");
  }
  assert.notEqual(rec.status, "awaiting_operator");
});

await test("3 — re-authorising an already-authorised action honours the pinned authority", () => {
  // Idempotence is what stops the second authorisation from discarding the
  // first. It must re-validate the pin, not assume it.
  const src = TH.authorizeTrustedHostAction;
  assert.equal(typeof src, "function");
  const code = src.toString();
  assert.match(code, /authorizationState === "authorized"/, "must short-circuit an already-authorised action");
  // Targeted at the stillValid conjunction itself. A looser /expires_at/ match
  // passed even with the expiry check deleted, because the exact-request block
  // above also mentions it — the mutation survived and the assertion, not the
  // guard, was at fault.
  assert.match(code, /stillValid\s*=\s*pinned[\s\S]{0,80}status === "active"/, "must re-validate the pin as active");
  assert.match(code, /stillValid[\s\S]{0,200}pinned\.expires_at[\s\S]{0,60}Date\.parse\(pinned\.expires_at\)/, "must re-check the PINNED authorization expiry");
});

await test("4 — the derived authority is still exact, not a standing grant", async () => {
  G.resetGovernedActionsForTests(ROOT);
  const A = await import("../lib/vacilando/trusted-host-authz.mjs");
  const rec = routinePush("agent/cursor/5-bridge-exact");
  const auth = A.listAuthorizations("msn_bridge").find((a) => a.authorizationId === rec.director_approval?.authorization_id);
  assert.ok(auth, "the derived authorization must exist");
  assert.equal(auth.scope, A.AUTHORIZATION_CLASSES.EXACT_REQUEST);
  assert.equal(auth.granted_by, "director");
  assert.equal(auth.requestId, rec.request_id);
  assert.equal(auth.sourceSha, SHA);
  // And it covers nothing else, even now that it has been consumed.
  assert.equal(A.exactAuthorizationCovers(auth, {
    requestId: "gar_other", contentFingerprint: auth.contentFingerprint,
    actionType: auth.actionType, environment: "staging",
    repository: auth.repository, sourceSha: SHA,
  }), false);
});
