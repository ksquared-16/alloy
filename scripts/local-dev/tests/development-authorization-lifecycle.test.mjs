/**
 * Authorization lifecycle + structured branch references.
 *
 * Two live leaks, both of which failed in the direction that looks harmless
 * until you read it: an approval of ONE pull-request close became authority
 * over every close, and a branch was treated as depended-upon because a run's
 * instruction text mentioned its name.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-authz-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
const A = await import("../lib/vacilando/trusted-host-authz.mjs");
const B = await import("../lib/vacilando/branch-reference.mjs");

const M = "msn_authz";
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const find = (over = {}) => A.findAuthorization({ missionId: M, actionType: "repository.close_pull_request", databaseTarget: "staging", nowMs: Date.now(), ...over });

// ── Authorization ─────────────────────────────────────────────────────────

await test("NC1/NC2/NC3 — an absent subject binding is never a wildcard", () => {
  A.grantMissionAuthorization({ missionId: M, actionType: "repository.close_pull_request", databaseTarget: "staging", actor: "operator", nowMs: Date.now() });
  // Exactly the historical shape: mission grant, no queryHash.
  assert.equal(find({ queryHash: SHA }), null, "empty queryHash must not match an arbitrary subject");
  assert.equal(find({ queryHash: null }), null, "null subject must not match either");
  assert.equal(find({}), null, "a missing subject binding is not a wildcard");
  const legacy = A.legacyUnboundAuthorizations(M);
  assert.equal(legacy.length, 1, "the unbound grant must be surfaced, not silently ignored");
  assert.equal(legacy[0].classification, "legacy_unbound");
});

await test("NC4 — an EXPLICIT wildcard works, and only when declared", () => {
  const c = A.classifyStandingGrant({ scope: "mission", subject_scope: A.SUBJECT_SCOPES.ANY_WITHIN_MISSION });
  assert.equal(c.class, "explicit_wildcard");
  assert.equal(c.matchable, true);
  // The same grant without the declaration is inert.
  assert.equal(A.classifyStandingGrant({ scope: "mission" }).class, "legacy_unbound");
  assert.equal(A.classifyStandingGrant({ scope: "mission" }).matchable, false);
  // A bound grant is exact by definition.
  assert.equal(A.classifyStandingGrant({ scope: "mission", queryHash: SHA }).subject_scope, A.SUBJECT_SCOPES.EXACT);
});

await test("NC5 — a subject-bound grant matches its subject and nothing else", () => {
  const M2 = "msn_bound";
  A.grantMissionAuthorization({ missionId: M2, actionType: "repository.close_pull_request", databaseTarget: "staging", actor: "operator", queryHash: SHA, nowMs: Date.now() });
  const hit = A.findAuthorization({ missionId: M2, actionType: "repository.close_pull_request", databaseTarget: "staging", queryHash: SHA, nowMs: Date.now() });
  assert.ok(hit, "a bound grant must still authorise its own subject");
  assert.equal(A.findAuthorization({ missionId: M2, actionType: "repository.close_pull_request", databaseTarget: "staging", queryHash: OTHER, nowMs: Date.now() }), null);
});

await test("NC6/NC7/NC8 — a grant cannot cross mission, repository or environment", () => {
  const M3 = "msn_scoped";
  A.grantMissionAuthorization({ missionId: M3, actionType: "repository.close_pull_request", databaseTarget: "staging", actor: "operator", queryHash: SHA, nowMs: Date.now() });
  // Another mission never sees it.
  assert.equal(A.findAuthorization({ missionId: "msn_elsewhere", actionType: "repository.close_pull_request", databaseTarget: "staging", queryHash: SHA, nowMs: Date.now() }), null);
  // Declared repository/environment must agree when supplied.
  const store = A.listAuthorizations(M3);
  const g = store[store.length - 1];
  g.repository = "ksquared-16/alloy"; g.environment = "staging";
  assert.equal(A.exactAuthorizationCovers({ ...g, scope: "exact_request", contentFingerprint: "f", actionType: g.actionType },
    { contentFingerprint: "f", actionType: g.actionType, environment: "staging", repository: "someone/else", requestId: null, sourceSha: null }), false);

  // And through findAuthorization itself, not only the exact-request helper —
  // a mutation removing the repository filter survived until this was added.
  const M6 = "msn_repo";
  A.grantMissionAuthorization({ missionId: M6, actionType: "repository.close_pull_request", databaseTarget: "staging", actor: "operator", queryHash: SHA, repository: "ksquared-16/alloy", environment: "staging", nowMs: Date.now() });
  const base = { missionId: M6, actionType: "repository.close_pull_request", databaseTarget: "staging", queryHash: SHA, nowMs: Date.now() };
  assert.ok(A.findAuthorization({ ...base, repository: "ksquared-16/alloy" }), "its own repository must still match");
  assert.equal(A.findAuthorization({ ...base, repository: "someone/else" }), null, "a declared repository must not be crossed");
  assert.equal(A.findAuthorization({ ...base, environment: "production" }), null, "a declared environment must not be crossed");
});

await test("NC10 — production never inherits a staging grant", () => {
  for (const env of ["production", "alloy_deployed_primary"]) {
    assert.equal(A.isOperatorOnlyAuthzEnvironment(env), true, env);
    const out = A.grantExactRequestAuthorization({ missionId: M, requestId: "r", contentFingerprint: "f", actionType: "repository.close_pull_request", environment: env, nowMs: Date.now() });
    assert.equal(out.ok, false, `minted production authority for ${env}`);
  }
});

await test("NC11/NC12 — revoked and expired grants cannot match", () => {
  const M4 = "msn_rev";
  A.grantMissionAuthorization({ missionId: M4, actionType: "repository.close_pull_request", databaseTarget: "staging", actor: "operator", queryHash: SHA, nowMs: Date.now() });
  const g = A.listAuthorizations(M4)[0];
  A.revokeAuthorization(M4, g.authorizationId, { actor: "operator" });
  assert.equal(A.findAuthorization({ missionId: M4, actionType: "repository.close_pull_request", databaseTarget: "staging", queryHash: SHA, nowMs: Date.now() }), null, "revoked must not match");
  // Expiry: ask far in the future.
  const M5 = "msn_exp";
  A.grantMissionAuthorization({ missionId: M5, actionType: "repository.close_pull_request", databaseTarget: "staging", actor: "operator", queryHash: SHA, nowMs: Date.now() });
  const far = Date.now() + 365 * 24 * 3600 * 1000;
  assert.equal(A.findAuthorization({ missionId: M5, actionType: "repository.close_pull_request", databaseTarget: "staging", queryHash: SHA, nowMs: far }), null, "expired must not match");
});

await test("NC13 — the legacy unsafe shape cannot match silently, and the source proves it", () => {
  const src = readFileSync(new URL("../lib/vacilando/trusted-host-authz.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/return\s+!a\.queryHash\s*\|\|\s*!queryHash/.test(code), "the empty-queryHash wildcard must not exist in code");
  assert.match(code, /classifyStandingGrant\(a\)/, "matching must classify the grant explicitly");
  assert.ok(Object.isFrozen(A.SUBJECT_SCOPES));
});

// ── Branch references ─────────────────────────────────────────────────────

function fixture({ laneBranch = null, gaBranch = null, runWorktree = null, instructionText = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vac-ref-"));
  const lanes = join(dir, "lanes.json");
  const runs = join(dir, "runs.json");
  const gas = join(dir, "requests.json");
  writeFileSync(lanes, JSON.stringify({ lanes: [{ lane_id: "lane_x", status: "active", repository_id: "repo_alloy", binding: laneBranch ? { branch: laneBranch } : {} }] }));
  writeFileSync(runs, JSON.stringify({ lanes: { lane_x: [{ run_id: "erun_x", state: "EXECUTING", worktree_path: runWorktree, instruction: instructionText }] } }));
  writeFileSync(gas, JSON.stringify({ requests: gaBranch ? [{ request_id: "gar_x", status: "awaiting_operator", inputs: { branch: gaBranch, repository: "ksquared-16/alloy" } }] : [] }));
  return { lanesPath: lanes, runsPath: runs, governedActionsPath: gas };
}
const TARGET = "agent/cursor/5-some-branch";

await test("BR1/BR2 — instruction or summary text mentioning a branch is NOT a reference", () => {
  const f = fixture({ instructionText: `please clean up ${TARGET} when convenient` });
  const out = B.resolveBranchReferences({ branch: TARGET, ...f });
  assert.deepEqual(out.references, [], "prose must never establish ownership");
  assert.equal(B.branchIsReferenced({ branch: TARGET, ...f }), false);
  assert.ok(!B.REFERENCE_BASES.includes("substring_match"));
  assert.ok(B.REJECTED_BASES.includes("instruction_mentions_branch"));
});

await test("BR3 — an actual lane branch binding IS a reference", () => {
  const f = fixture({ laneBranch: TARGET });
  const out = B.resolveBranchReferences({ branch: TARGET, ...f });
  assert.equal(out.references.length, 1);
  assert.equal(out.references[0].basis, "lane_branch_binding");
  assert.equal(out.references[0].resource_type, "lane");
  assert.equal(B.branchIsReferenced({ branch: TARGET, ...f }), true);
});

await test("BR5 — a pending governed action targeting the branch IS a reference", () => {
  const f = fixture({ gaBranch: TARGET });
  const out = B.resolveBranchReferences({ branch: TARGET, ...f });
  assert.equal(out.references.length, 1);
  assert.equal(out.references[0].basis, "governed_action_source_branch");
});

await test("BR6/BR7 — terminal runs and other repositories do not create references", () => {
  const f = fixture({ laneBranch: TARGET });
  // Same branch name, different repository.
  assert.equal(B.branchIsReferenced({ branch: TARGET, repository: "other/repo", ...f }), false);
  // A branch nobody binds.
  assert.equal(B.branchIsReferenced({ branch: "agent/cursor/5-unrelated", ...f }), false);
});

await test("BR8 — unknown structured state is UNKNOWN, never a positive reference", () => {
  const out = B.resolveBranchReferences({ branch: TARGET, lanesPath: "/nope/lanes.json", runsPath: "/nope/runs.json", governedActionsPath: "/nope/ga.json" });
  assert.deepEqual(out.references, []);
  assert.ok(out.unknown.length >= 3);
  assert.equal(B.branchIsReferenced({ branch: TARGET, lanesPath: "/nope/a", runsPath: "/nope/b", governedActionsPath: "/nope/c" }), null,
    "unreadable stores are unmeasured, which escalates — not referenced, and not free");
});

await test("BR9 — the evidence collector no longer substring-scans", () => {
  const ev = readFileSync(new URL("../lib/vacilando/director-evidence.mjs", import.meta.url), "utf8");
  const code = ev.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/JSON\.stringify\(\w+\)\.includes\(/.test(code), "serialised-record substring matching must not exist");
  assert.match(code, /branchIsReferenced\(/, "the collector must use the structured resolver");
});

await test("BR10 — a governed action is never a reference to its OWN subject branch", () => {
  // The defect live certification found: a pending delete request whose
  // inputs.branch is the branch counted as a governed_action_source_branch
  // reference, so the request became its own blocking dependency and no branch
  // could ever be Director-deleted. Structural twin of the prose bug — there
  // the run that MENTIONED a branch blocked it, here the request that TARGETS
  // it did.
  const dir = mkdtempSync(join(tmpdir(), "vac-self-"));
  const lanes = join(dir, "lanes.json"); const runs = join(dir, "runs.json"); const gas = join(dir, "ga.json");
  writeFileSync(lanes, JSON.stringify({ lanes: [] }));
  writeFileSync(runs, JSON.stringify({ lanes: {} }));
  writeFileSync(gas, JSON.stringify({ requests: [
    { request_id: "gar_self", status: "awaiting_operator", inputs: { branch: "agent/cursor/5-x", repository: "ksquared-16/alloy" } },
    { request_id: "gar_other", status: "awaiting_operator", inputs: { branch: "agent/cursor/5-x", repository: "ksquared-16/alloy" } },
  ] }));
  const paths = { lanesPath: lanes, runsPath: runs, governedActionsPath: gas };

  // Without the exclusion both requests count, so the branch is "in use".
  assert.equal(B.resolveBranchReferences({ branch: "agent/cursor/5-x", ...paths }).references.length, 2);

  // Excluding the asking request leaves only the genuinely OTHER one.
  const withExclusion = B.resolveBranchReferences({ branch: "agent/cursor/5-x", excludeGovernedActionId: "gar_self", ...paths });
  assert.equal(withExclusion.references.length, 1);
  assert.equal(withExclusion.references[0].resource_id, "gar_other", "another action's reference must still count");

  // And when the asking request is the ONLY one, the branch is unreferenced.
  writeFileSync(gas, JSON.stringify({ requests: [{ request_id: "gar_self", status: "awaiting_operator", inputs: { branch: "agent/cursor/5-x", repository: "ksquared-16/alloy" } }] }));
  assert.equal(B.branchIsReferenced({ branch: "agent/cursor/5-x", excludeGovernedActionId: "gar_self", ...paths }), false,
    "a request must not block itself");
  assert.equal(B.branchIsReferenced({ branch: "agent/cursor/5-x", ...paths }), true,
    "without the exclusion it self-blocks — which is the bug");
});

await test("BR11 — the collector passes the requesting action's own id", async () => {
  const fsx = await import("node:fs");
  const src = fsx.readFileSync(new URL("../lib/vacilando/director-evidence.mjs", import.meta.url), "utf8");
  assert.match(src, /excludeGovernedActionId:\s*rec\?\.request_id/, "the collector must exclude the asking request");
});
