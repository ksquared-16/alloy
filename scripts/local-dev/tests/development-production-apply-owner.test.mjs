/**
 * THE PRODUCTION MIGRATION APPLY OWNER.
 *
 * The parity gate can say the deployed primary is BEHIND. Before this owner
 * existed, nothing was authorized to answer that: the staging executor refuses
 * production by design and the only written owner was a step in an archived
 * release process. These controls pin the loop that closes — and, just as
 * importantly, the ways it must refuse to close.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import * as P from "../lib/vacilando/trusted-host-production-migrate.mjs";
import { validateMigrationInputs } from "../lib/vacilando/trusted-host-migrate.mjs";
import { evaluateMergeReadiness } from "../lib/vacilando/trusted-host-merge.mjs";
import * as M from "../lib/vacilando/migration-parity.mjs";
import { getActionDefinition, loadedActionKeys } from "../lib/vacilando/trusted-host-action-registry.mjs";
import { OPERATOR_OWNED_ACTION_KEYS, evaluateDirectorAuthority } from "../lib/vacilando/director-authority.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
// THE PROMOTED REVISION, not local HEAD. The lineage rule this action enforces
// is "reachable from origin/staging", so a fixture pinned to HEAD fails the
// moment the branch is one unpushed commit ahead — which is every feature
// branch, including the one adding this test.
const PROMOTED_SHA = git(["rev-parse", "origin/staging"]);
const HEAD_MIGRATION = "supabase/migrations/20260909240000_financials_read_for_director_roles.sql";
const HEAD_VERSION = "20260909240000";

const SHA40 = "a".repeat(40);
const mergeInspection = (parity) => ({
  ok: true,
  normalized: { repository: "ksquared-16/alloy", pullRequestNumber: 900, targetBranch: "staging", expectedHeadSha: SHA40 },
  pr: {
    number: 900, state: "OPEN", draft: false, baseRefName: "staging", headRefOid: SHA40, mergeable: "MERGEABLE",
    checks: { failing: [], pending: [], unknown: [], unscopedPending: [], unscopedUnknown: [], total: 2, required: 2, passing: 2, requirednessKnown: true },
  },
  migration_parity: parity,
});

const approval = (over = {}) => ({ decision: "approved", decision_actor: "operator", approved_versions: [HEAD_VERSION], ...over });
const runtime = (over = {}) => ({ sanctioned: true, target: "alloy_deployed_primary", ...over });
const behind = (over = {}) => ({ status: "blocked", missing: [HEAD_VERSION], unexpected: [], reason: "hosted head is behind", ...over });
const normalized = (over = {}) => ({
  actionType: "database.apply_promoted_migration",
  target: "alloy_deployed_primary",
  expectedSha: PROMOTED_SHA,
  migrations: [{ version: HEAD_VERSION, path: HEAD_MIGRATION, fileSha: "f".repeat(64) }],
  ...over,
});

// ── A/B/C — the merge boundary, by parity status ────────────────────────────

test("A — production parity PASS lets the merge proceed", () => {
  const r = evaluateMergeReadiness(mergeInspection({ status: "ok", reason: "hosted head satisfies required head" }));
  assert.equal(r.ok, true);
});

test("B — production BEHIND hard-blocks the merge", () => {
  const r = evaluateMergeReadiness(mergeInspection(behind()));
  assert.equal(r.ok, false);
  assert.equal(r.code, "hosted_migration_behind");
});

test("C — production UNKNOWN hard-blocks the merge", () => {
  const r = evaluateMergeReadiness(mergeInspection({ status: "unknown", reason: "no census established the head" }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "hosted_migration_parity_unknown");
  // Absent parity is UNKNOWN, not "fine".
  assert.equal(evaluateMergeReadiness(mergeInspection(null)).code, "hosted_migration_parity_unknown");
});

// ── D/E/F/G — what the production owner accepts and refuses ─────────────────

test("D — a production migration without Director approval is refused", () => {
  const r = P.assertProductionApplyPreconditions({
    normalized: normalized(), parity: behind(), approval: null, executorRuntime: runtime(),
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "director_approval_required");

  // A DELEGATED approval is not a Director approval. This is the exact
  // substitution the whole boundary exists to refuse.
  const delegated = P.assertProductionApplyPreconditions({
    normalized: normalized(), parity: behind(),
    approval: approval({ decision_actor: "policy" }), executorRuntime: runtime(),
  });
  assert.equal(delegated.code, "delegated_approval_rejected");

  // And the action is operator-owned, so no delegated policy can pick it up.
  assert.ok(OPERATOR_OWNED_ACTION_KEYS.includes("database.apply_promoted_migration"));
  const verdict = evaluateDirectorAuthority({
    request: { action_key: "database.apply_promoted_migration", target: "alloy_deployed_primary", inputs: { environment: "alloy_deployed_primary" } },
    evidence: {},
  });
  assert.equal(verdict.decision, "operator_approval_required");
});

test("E — an approved, promoted, in-gap migration is allowed", () => {
  const r = P.assertProductionApplyPreconditions({
    normalized: normalized(), parity: behind(), approval: approval(),
    registeredTarget: "alloy_deployed_primary", executorRuntime: runtime(),
  });
  assert.equal(r.ok, true, r.detail);
  assert.deepEqual(r.versions, [HEAD_VERSION]);
});

test("F — arbitrary SQL is refused, on every input spelling", () => {
  for (const key of ["sql", "statement", "body", "database_url", "databaseUrl"]) {
    const r = P.validateProductionMigrationInputs({
      target: "alloy_deployed_primary", expectedSha: PROMOTED_SHA,
      migrations: [{ version: HEAD_VERSION, path: HEAD_MIGRATION }], [key]: "drop table users",
    });
    assert.equal(r.ok, false, `${key} was accepted`);
    assert.equal(r.code, "arbitrary_sql_rejected");
  }
});

test("G — a migration outside the promoted revision is refused", () => {
  // POSITIVE CONTROL FIRST. Without it, every assertion below would also pass
  // if the validator simply refused everything — which is the failure mode a
  // refusal-only test cannot see.
  const accepted = P.validateProductionMigrationInputs({
    target: "alloy_deployed_primary", expectedSha: PROMOTED_SHA,
    migrations: [{ version: HEAD_VERSION, path: HEAD_MIGRATION }], worktreePath: REPO,
  });
  assert.equal(accepted.ok, true, `a real promoted migration must be accepted: ${accepted.code} ${accepted.detail || ""}`);
  assert.equal(accepted.normalized.actionType, "database.apply_promoted_migration");
  assert.ok(accepted.normalized.migrations[0].fileSha, "the artifact must be resolved out of the git object store");

  const r = P.validateProductionMigrationInputs({
    target: "alloy_deployed_primary", expectedSha: PROMOTED_SHA,
    migrations: [{ version: "20991231000000", path: "supabase/migrations/20991231000000_invented.sql" }],
    worktreePath: REPO,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "migration_missing_at_sha");

  // A path outside the canonical migration directory is refused too.
  const escape = P.validateProductionMigrationInputs({
    target: "alloy_deployed_primary", expectedSha: PROMOTED_SHA,
    migrations: [{ version: HEAD_VERSION, path: "../../etc/passwd" }], worktreePath: REPO,
  });
  assert.equal(escape.ok, false);

  // And a migration the hosted measurement does not report missing is refused
  // even when it IS promoted: production mutation closes a measured gap.
  const notInGap = P.assertProductionApplyPreconditions({
    normalized: normalized(), parity: behind({ missing: ["20260909230000"] }),
    approval: approval({ approved_versions: [HEAD_VERSION] }), executorRuntime: runtime(),
  });
  assert.equal(notInGap.code, "migration_not_in_measured_gap");
});

// ── H/I/J — the post-apply loop ─────────────────────────────────────────────

test("H — a successful apply with no re-census leaves the promotion blocked", () => {
  const r = P.evaluateProductionApplyOutcome({
    applyResult: { ok: true, results: [{ ok: true, version: HEAD_VERSION }] },
    censusResult: null, parityAfter: null, requestedVersions: [HEAD_VERSION],
  });
  assert.equal(r.promotion_released, false);
  assert.equal(r.state, "blocked_recensus_required");
  assert.equal(r.required_action, "database.read_census");
});

test("I — re-census PASS releases the promotion", () => {
  const r = P.evaluateProductionApplyOutcome({
    applyResult: { ok: true, results: [{ ok: true, version: HEAD_VERSION }] },
    censusResult: { ok: true },
    parityAfter: { status: "ok", measuredHead: HEAD_VERSION },
    requestedVersions: [HEAD_VERSION],
  });
  assert.equal(r.state, "promotion_released");
  assert.equal(r.promotion_released, true);
});

test("J — post-apply census UNKNOWN keeps the promotion blocked", () => {
  for (const [census, parityAfter] of [
    [{ ok: false, detail: "census timed out" }, null],
    [{ ok: true }, { status: "unknown", reason: "no proof" }],
  ]) {
    const r = P.evaluateProductionApplyOutcome({
      applyResult: { ok: true, results: [] }, censusResult: census, parityAfter, requestedVersions: [HEAD_VERSION],
    });
    assert.equal(r.promotion_released, false);
  }
});

test("J2 — applied, but the identity never appears, is ATTENTION not silence", () => {
  const r = P.evaluateProductionApplyOutcome({
    applyResult: { ok: true, results: [{ ok: true, version: HEAD_VERSION }] },
    censusResult: { ok: true },
    parityAfter: { status: "blocked", missing: [HEAD_VERSION] },
    requestedVersions: [HEAD_VERSION],
  });
  assert.equal(r.state, "attention_ledger_identity_absent");
  assert.equal(r.attention, true);
  assert.equal(r.promotion_released, false);
});

// ── K — ambiguity must not be replayed ──────────────────────────────────────

test("K — ambiguous or partial execution is never auto-retried", () => {
  const ambiguous = P.classifyApplyFailure({
    applyResult: { ok: false, results: [{ ok: false, code: "apply_failed", detail: "connection lost mid-statement" }] },
  });
  assert.equal(ambiguous.classification, "ambiguous");
  assert.equal(ambiguous.auto_retry, false);
  assert.equal(ambiguous.safe_to_retry, false);
  assert.equal(ambiguous.escalate, true);

  // A ledger/schema contradiction is KNOWN-bad, and still not a retry.
  const mismatch = P.classifyApplyFailure({ applyResult: { ok: false, results: [{ ok: false, code: "ledger_mismatch" }] } });
  assert.equal(mismatch.auto_retry, false);
  assert.equal(mismatch.escalate, true);

  // Only a refusal proven to precede execution is safe to retry — and even
  // then the executor does not do it by itself.
  const preflight = P.classifyApplyFailure({ applyResult: { ok: false, results: [{ ok: false, code: "artifact_hash_mismatch" }] } });
  assert.equal(preflight.classification, "no_effect");
  assert.equal(preflight.safe_to_retry, true);
  assert.equal(preflight.auto_retry, false, "safe to retry is not the same as retry automatically");

  // The registered action itself allows exactly one attempt.
  assert.equal(getActionDefinition("database.apply_promoted_migration").retry.maxAttempts, 1);
});

// ── The boundary itself ─────────────────────────────────────────────────────

test("BOUNDARY — the two apply actions cannot be substituted for one another", () => {
  // The staging executor still refuses production, in its own body.
  for (const env of ["production", "prod", "alloy_production", "alloy_deployed_primary"]) {
    const r = validateMigrationInputs({ environment: env, expectedSha: PROMOTED_SHA, migrations: [] });
    assert.equal(r.ok, false, `${env} was accepted by database.apply_migration`);
    assert.equal(r.code, "production_database_rejected");
  }
  // And the production owner refuses non-production targets, so it cannot be
  // used to apply a staging migration under production authority.
  for (const env of ["staging", "certification", "cert"]) {
    const r = P.validateProductionMigrationInputs({ target: env, expectedSha: PROMOTED_SHA, migrations: [] });
    assert.equal(r.ok, false, `${env} was accepted by the production owner`);
    assert.equal(r.code, "target_not_registered_production");
  }
  // Distinct keys, both registered, production one non-delegable.
  const keys = loadedActionKeys();
  assert.ok(keys.includes("database.apply_migration"));
  assert.ok(keys.includes("database.apply_promoted_migration"));
  const def = getActionDefinition("database.apply_promoted_migration");
  assert.equal(def.operatorApprovalRequired, true);
  assert.equal(def.delegable, false);
  assert.equal(def.requiredCapability, "trusted_host.database.migrate_production");
  assert.notEqual(def.requiredCapability, getActionDefinition("database.apply_migration").requiredCapability,
    "a staging migrate capability must not authorize a production write");
});

test("BOUNDARY — production classification is unchanged by any of this", async () => {
  const M = await import("../lib/vacilando/trusted-host-migrate.mjs");
  assert.ok(M.BLOCKED_ENVIRONMENTS.includes("alloy_deployed_primary"),
    "alloy_deployed_primary must remain production-classed");
  assert.ok(!M.ALLOWED_ENVIRONMENTS.includes("alloy_deployed_primary"));
  const A = await import("../lib/vacilando/director-authority.mjs");
  assert.ok(A.OPERATOR_ONLY_ENVIRONMENTS.includes("alloy_deployed_primary"));
});

test("DIRECTOR EXPERIENCE — the block names the missing files, not a count", () => {
  const said = P.describeMissingMigrations({
    missing: ["20260909240000"],
    paths: { 20260909240000: "20260909240000_financials_read_for_director_roles.sql" },
  });
  assert.match(said.headline, /Hosted database is missing:/);
  assert.match(said.headline, /20260909240000_financials_read_for_director_roles\.sql/);
  assert.equal(said.action_required, "database.apply_promoted_migration");
  assert.equal(P.describeMissingMigrations({ missing: [] }), null);
});

/* ──────────────────────────────────────────────────────────────────────────
 * THE PRE-MERGE CANDIDATE PATH.
 *
 * The promotion state machine had an unsatisfiable cycle: the merge gate
 * refuses a migration-bearing candidate until hosted carries its schema, and
 * this action refused to give hosted that schema until the candidate merged.
 * These tests pin the repair AND the six ways it must still refuse — because a
 * path that unblocks a promotion is exactly the path somebody will reach for
 * when they want to unblock something else.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * ANY sanctioned agent candidate that actually introduces migrations.
 *
 * Pinning one branch — and one branch's migration filenames — made this suite
 * depend on a feature branch nobody promised to keep, and on that branch still
 * carrying the same schema. What the pre-merge path needs is generic: a
 * published commit staging does not have, which introduces at least one
 * migration. The suite finds one and derives the rest, so it keeps testing the
 * control after Thread 5 is long merged. If the repository has no such branch,
 * these say so rather than passing quietly.
 */
function findMigrationBearingCandidate() {
  const listed = git(["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/agent/**"]);
  for (const sha of listed.split("\n").map((l) => l.trim()).filter(Boolean)) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", sha, PROMOTED_SHA], { cwd: REPO });
      continue; // already on staging — not the shape under test
    } catch { /* not an ancestor, which is what we want */ }
    const delta = P.candidateMigrationDelta(sha, { cwd: REPO });
    if (!delta || !delta.length) continue;
    const names = git(["ls-tree", "-r", "--name-only", sha, "supabase/migrations"]).split("\n");
    const migrations = delta
      .map((version) => ({ version, path: names.find((n) => n.includes(`/${version}_`)) }))
      .filter((m) => m.path);
    if (migrations.length) return { sha, migrations };
  }
  return null;
}
const CANDIDATE = findMigrationBearingCandidate();
const CANDIDATE_SHA = CANDIDATE?.sha ?? null;
const CANDIDATE_MIGRATIONS = CANDIDATE?.migrations ?? [];

/** The record governance writes when the parity gate refuses a merge. */
const refusedMerge = (over = {}) => ({
  action_key: "repository.merge_pull_request",
  request_id: "gar_test",
  policy_decision: "operator_approved",
  status: "failed",
  failure_code: "execution_failed",
  failure_reason: "hosted_migration_behind",
  updated_at: new Date().toISOString(),
  inputs: {
    repository: "ksquared-16/alloy",
    pullRequestNumber: 782,
    expectedHeadSha: CANDIDATE_SHA,
    targetBranch: "staging",
  },
  ...over,
});

const applyCandidate = (over = {}, opts = {}) =>
  P.validateProductionMigrationInputs({
    target: "alloy_deployed_primary",
    repository: "ksquared-16/alloy",
    expectedSha: CANDIDATE_SHA,
    migrations: CANDIDATE_MIGRATIONS,
    ...over,
  }, { promotionRequests: [refusedMerge()], ...opts });

const candidateTest = CANDIDATE_SHA
  ? test
  : (name) => test(name, { skip: "no unmerged sanctioned agent branch introduces a migration in this checkout" }, () => {});

candidateTest("R2 — an exact governed pre-merge candidate may apply its own migrations", () => {
  const r = applyCandidate();
  assert.equal(r.ok, true, r.detail);
  assert.equal(r.normalized.sourceRelation, "governed_promotion_candidate");
  assert.equal(r.normalized.candidate.pullRequestNumber, 782);
  assert.equal(r.normalized.candidate.headSha, CANDIDATE_SHA.toLowerCase());
});

candidateTest("R3 — an arbitrary sanctioned agent SHA with no governed promotion is refused", () => {
  // Branch membership is not authority. This is the rule the repair must NOT be.
  const r = applyCandidate({}, { promotionRequests: [] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "no_governed_promotion_candidate");
});

candidateTest("R4 — authority does not follow the branch when it advances", () => {
  /*
   * Governance approved head A. The branch moves to B. B is on the same
   * sanctioned ref and is not authorized by anything, and must be refused —
   * otherwise "approve this candidate" would silently mean "approve whatever
   * this branch becomes".
   */
  const authorizedElsewhere = refusedMerge({ inputs: { ...refusedMerge().inputs, expectedHeadSha: "b".repeat(40) } });
  const r = applyCandidate({}, { promotionRequests: [authorizedElsewhere] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "no_governed_promotion_candidate");
});

candidateTest("R5 — a merge record for a different PR head does not authorize this SHA", () => {
  const otherPr = refusedMerge({
    inputs: { repository: "ksquared-16/alloy", pullRequestNumber: 999, expectedHeadSha: "c".repeat(40) },
  });
  const r = applyCandidate({}, { promotionRequests: [otherPr] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "no_governed_promotion_candidate");
});

candidateTest("R5b — a merge that was never approved authorizes nothing", () => {
  const unapproved = refusedMerge({ policy_decision: null });
  const r = applyCandidate({}, { promotionRequests: [unapproved] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_authority_insufficient");
});

candidateTest("R5c — a merge refused for some OTHER reason establishes no hosted gap", () => {
  const differentFailure = refusedMerge({ failure_reason: "missing_repository", failure_code: "missing_repository" });
  const r = applyCandidate({}, { promotionRequests: [differentFailure] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_authority_insufficient");
});

candidateTest("R5d — a stale refusal is not standing authority", () => {
  const old = refusedMerge({ updated_at: new Date(Date.now() - 40 * 3600_000).toISOString() });
  const r = applyCandidate({}, { promotionRequests: [old] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_authority_stale");
});

candidateTest("R5e — another repository's candidate does not authorize this one", () => {
  const foreign = refusedMerge({ inputs: { ...refusedMerge().inputs, repository: "someone-else/app" } });
  const r = applyCandidate({}, { promotionRequests: [foreign] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "no_governed_promotion_candidate");
});

candidateTest("R6 — a pre-merge apply may not reach outside the candidate's own delta", () => {
  /*
   * `20260909240000` exists at the candidate SHA — it is already promoted — so
   * the artifact check alone would admit it. The delta bound is what stops this
   * path being used to replay migrations the promoted floor already owns.
   */
  const r = applyCandidate({
    // Ordered correctly on purpose: an out-of-order list is refused by the sort
    // check first, which would let this test pass without the delta bound
    // existing at all.
    migrations: [
      { version: "20260909240000", path: HEAD_MIGRATION },
      ...CANDIDATE_MIGRATIONS,
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "migration_outside_candidate_delta");
});

candidateTest("R6b — a short SHA is not an identity, even when it prefixes the candidate", () => {
  const r = applyCandidate({ expectedSha: CANDIDATE_SHA.slice(0, 12) });
  assert.equal(r.ok, false);
  assert.equal(r.code, "candidate_sha_not_exact");
});

test("R7 — once the candidate's migrations are applied, the merge gate lets the promotion through", () => {
  /*
   * The two controls, related rather than mocked apart. Before: hosted is behind
   * and the merge is correctly blocked. After: the same gate, the same required
   * head, and a hosted head that now satisfies it.
   */
  const requiredHead = "20260910130000";
  const before = M.migrationMergeGate({
    requiredHead, requiredCount: 395, provenHead: "20260909240000", provenAtMs: Date.now(),
  });
  assert.equal(before.status, "blocked");
  assert.equal(before.promote, false);

  const after = M.migrationMergeGate({
    requiredHead, requiredCount: 395, provenHead: requiredHead, provenAtMs: Date.now(),
  });
  assert.equal(after.status, "ok");
  assert.equal(after.promote, true);
});

test("R7b — the merge gate is unchanged: it still measures against the candidate head", () => {
  // Explicitly rejected alternative: comparing hosted against staging instead of
  // the candidate would let code merge whose schema is not deployed.
  const gate = M.migrationMergeGate({
    requiredHead: "20260910130000", requiredCount: 395,
    provenHead: "20260909240000", provenAtMs: Date.now(),
  });
  assert.equal(gate.status, "blocked");
  assert.match(gate.reason, /behind the required head 20260910130000/);
});

// ── THE EXEMPTION MUST SURVIVE INTO EXECUTION ───────────────────────────────
//
// THE INCIDENT. gar_4727b063b4222e — the first real trusted-host run of the
// promoted-migration path — was approved by the operator at 14:06:22Z and then
// failed `migration_changed_since_approval`. The three Thread 8C migrations are
// absent from staging BECAUSE their candidate has not merged, which is exactly
// the state a governed pre-merge promotion exists to serve, and validation
// exempted them correctly. Execution did not: `applyMigrationBatch` re-reads
// every migration, and the exemption was computed at validation and never
// carried onto `normalized`, so the runtime read applied staging semantics to a
// candidate. The file already documents this trap for `environment` — "the
// runtime re-read applies the SAME environment rule as validation" — and
// preMergeCandidate had the same hole.
test("R-EXEC — a pre-merge candidate exemption reaches the runtime re-read", async () => {
  const M = await import("../lib/vacilando/trusted-host-migrate.mjs");

  // The batch must FORWARD the flag, not merely accept one.
  const seen = [];
  const normalized = {
    environment: "alloy_deployed_primary",
    worktreePath: "/wt",
    expectedSha: "a".repeat(40),
    gitCwd: "/wt",
    stagingSha: "b".repeat(40),
    preMergeCandidate: true,
    migrations: [{ version: "20260909250000", path: "supabase/migrations/20260909250000_x.sql", fileSha: "deadbeef" }],
  };
  M.applyMigrationBatch(normalized, {
    readContent: (args) => { seen.push(args); return { ok: false, code: "stop", detail: "stop after capture" }; },
    inspectLedger: () => ({ applied: false }),
    applyFile: () => ({ ok: true }),
  });
  assert.equal(seen.length, 1, "the batch must re-read the migration");
  assert.equal(seen[0].preMergeCandidate, true,
    "validation exempted this candidate; execution must not re-apply staging semantics to it");
  assert.equal(seen[0].environment, "alloy_deployed_primary", "and the environment rule still travels too");

  // A non-candidate must NOT be exempted — the guard still has to catch real
  // drift, which is the whole reason it exists.
  const seen2 = [];
  M.applyMigrationBatch({ ...normalized, preMergeCandidate: false }, {
    readContent: (args) => { seen2.push(args); return { ok: false, code: "stop", detail: "stop" }; },
    inspectLedger: () => ({ applied: false }),
    applyFile: () => ({ ok: true }),
  });
  assert.equal(seen2[0].preMergeCandidate, false, "absence of a candidate must not become an exemption");
});
