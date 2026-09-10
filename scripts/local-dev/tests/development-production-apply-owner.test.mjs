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
