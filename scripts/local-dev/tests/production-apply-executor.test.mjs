/**
 * CERTIFYING THE PRODUCTION MIGRATION EXECUTION PATH.
 *
 * `database.apply_promoted_migration` was registered, authority-classified,
 * input-validated, operator-approval-required and covered by its own owner
 * tests — and it had never executed once. It was absent from BOTH dispatches,
 * so every filing failed `action_unavailable`, and the seven production proofs
 * had no caller outside a test file.
 *
 * These controls pin the repaired path. The first two are the ones that would
 * have caught the original defect; the rest exist because a path that can now
 * mutate a production database has to be provably harder to misuse than one
 * that could not run at all.
 *
 * WHAT IS SUBSTITUTED, AND WHY ONLY THAT. The credential source and the hosted
 * database are the two things this suite cannot have. Everything else is the
 * shipped code: the real dispatch, the real validator, the real seven proofs,
 * the real apply batch, the real verification. Substituting the orchestration
 * would certify the substitute.
 *
 * WHAT REMAINS UNTESTED UNTIL THE FIRST PRODUCTION INVOCATION is stated in
 * X15 rather than left implicit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");

// The store root is resolved per call by the runtime, but only if it is set
// before anything writes. Set it first, then import.
const ROOT = mkdtempSync(join(tmpdir(), "prod-apply-exec-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const TH = await import("../lib/vacilando/trusted-host-actions.mjs");
const GA = await import("../lib/vacilando/governed-action-request.mjs");
const EX = await import("../lib/vacilando/trusted-host-production-apply.mjs");
const PM = await import("../lib/vacilando/trusted-host-production-migrate.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const PRODUCTION_KEY = "database.apply_promoted_migration";
const STAGING_KEY = "database.apply_migration";
const TARGET = "alloy_deployed_primary";

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
const SHA = git(["rev-parse", "origin/staging"]);

/** A migration identity the deployed primary already carries, plus one it does not. */
const APPLIED = "20260101000000";
const PENDING = "20260909240000";
const PENDING_PATH = "supabase/migrations/20260909240000_financials_read_for_director_roles.sql";
const CONTENT = "-- migration body\nselect 1;\n";
const FILE_SHA = execFileSync("shasum", ["-a", "256"], { input: CONTENT, encoding: "utf8" }).split(" ")[0];

/** Inputs the REGISTRY validator accepts: no fabricated artifact hash. */
const registryInputs = (over = {}) => ({
  target: TARGET,
  expectedSha: SHA,
  worktreePath: REPO,
  migrations: [{ version: PENDING, path: PENDING_PATH }],
  ...over,
});

const normalized = (over = {}) => ({
  actionType: PRODUCTION_KEY,
  target: TARGET,
  environment: TARGET,
  expectedSha: SHA,
  worktreePath: REPO,
  gitCwd: REPO,
  contentFingerprint: "fp-1",
  migrations: [{ version: PENDING, path: PENDING_PATH, fileSha: FILE_SHA }],
  sourceRelation: "staging_ancestry",
  ...over,
});

const approval = (over = {}) => ({
  decision: "approved",
  actor: "operator",
  decision_actor: "operator",
  at: new Date().toISOString(),
  delegated: false,
  content_fingerprint: "fp-1",
  approved_versions: [PENDING],
  ...over,
});

/** Hosted: everything the candidate requires except the one being applied. */
const REQUIRED = [APPLIED, PENDING];
const hostedBefore = () => ({ ok: true, versions: [APPLIED], head: APPLIED });
const hostedAfter = () => ({ ok: true, versions: [APPLIED, PENDING], head: PENDING });

/**
 * The adapter set. Only the credential source and the hosted reading are
 * substituted; `applyBatch` runs the SHIPPED `applyMigrationBatch` with a
 * substituted file-runner, so artifact hashing and ordering are real.
 */
function runners(over = {}) {
  let reads = 0;
  const calls = { revalidate: 0, identity: 0, hosted: 0, apply: 0, applied: [] };
  const base = {
    calls,
    revalidate: () => { calls.revalidate += 1; return { ok: true, normalized: normalized() }; },
    resolveExecutorIdentity: () => {
      calls.identity += 1;
      return { ok: true, dbHostKind: "direct", dbProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF, apiProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF };
    },
    readHostedVersions: () => {
      calls.hosted += 1;
      reads += 1;
      return reads === 1 ? hostedBefore() : hostedAfter();
    },
    readRequiredVersions: () => [...REQUIRED],
    applyBatch: (n) => {
      calls.apply += 1;
      return applyReal(n, calls);
    },
  };
  return { ...base, ...over, calls };
}

/** The real batch runner, with only the migration FILE read and write substituted. */
function applyReal(n, calls) {
  return TH.applyMigrationBatchForTests
    ? TH.applyMigrationBatchForTests(n)
    : realBatch(n, calls);
}

const { applyMigrationBatch } = await import("../lib/vacilando/trusted-host-migrate.mjs");
function realBatch(n, calls, over = {}) {
  return applyMigrationBatch(n, {
    readContent: () => ({ ok: true, text: CONTENT }),
    inspectLedger: () => ({ applied: false }),
    applyFile: ({ entry }) => { calls.applied.push(String(entry.version)); return { ok: true, ledger: "applied" }; },
    ...over,
  });
}

/** The runner bag as the executor takes it — bookkeeping stripped at the seam. */
const hostRunners = (over = {}) => { const { calls, ...r } = runners(over); return { runners: r, calls }; };

const run = (over = {}, extra = {}) => {
  const r = runners(over);
  const out = EX.executeProductionMigrationApply({
    ...r,
    approval: approval(),
    ...extra,
  });
  return { out, calls: r.calls };
};

// ── X1 — DISPATCH COMPLETENESS ──────────────────────────────────────────────

test("X1 — an approved production migration reaches the production executor, not action_unavailable", () => {
  // The trusted-host dispatch. This is the exact branch whose absence produced
  // the original failure; a fabricated action goes through the real
  // executeTrustedHostAction, and reaching the executor at all is the assertion.
  const actionId = seedAction();
  let reached = false;
  TH.setTrustedHostProductionRunnersForTests(hostRunners({
    revalidate: () => { reached = true; return { ok: false, code: "sentinel_reached", detail: "sentinel" }; },
  }).runners);
  const out = TH.executeTrustedHostAction(actionId, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });
  TH.setTrustedHostProductionRunnersForTests(null);

  assert.equal(reached, true, "the production executor was never reached");
  assert.notEqual(out.error, "unknown_action_type");
  assert.notEqual(out.error, "action_unavailable");
});

test("X1b — the governed dispatch reaches it too, and does not fall through", () => {
  const requestId = seedGovernedRequest();
  let reached = false;
  TH.setTrustedHostProductionRunnersForTests(hostRunners({
    revalidate: () => { reached = true; return { ok: false, code: "sentinel_reached", detail: "sentinel" }; },
  }).runners);
  const out = GA.executeGovernedAction(requestId, { root: ROOT, actor: "director" });
  TH.setTrustedHostProductionRunnersForTests(null);

  assert.equal(reached, true, "defaultExecute never dispatched the production key");
  // The fallthrough would have produced exactly this, and it is what every
  // filing produced before the repair.
  assert.notEqual(out?.request?.failure_code, "action_unavailable");
  assert.notEqual(out?.request?.failure_reason, "action_unavailable");
});

// ── X2 — THE STAGING ACTION IS UNCHANGED ────────────────────────────────────

test("X2 — staging and production remain two distinct actions", () => {
  assert.notEqual(PRODUCTION_KEY, STAGING_KEY);
  const prod = REG.getActionDefinition(PRODUCTION_KEY);
  const stage = REG.getActionDefinition(STAGING_KEY);
  assert.ok(prod && stage);
  assert.notEqual(prod.requiredCapability, stage.requiredCapability);
  assert.equal(prod.operatorApprovalRequired, true);
  assert.equal(prod.delegable, false);
  // The staging action still refuses production by name; the repair added an
  // owner for production, it did not loosen the refusal.
  const refused = stage.validateInputs({
    environment: TARGET, expectedSha: SHA, migrations: [{ version: PENDING, path: PENDING_PATH }],
  });
  assert.equal(refused.ok, false);
});

test("X2b — a production request is never satisfied by the staging executor", () => {
  // The production key routes to its own executor. Proven by the executor being
  // the thing that runs: the staging one has no revalidate adapter at all.
  const actionId = seedAction();
  let sawProductionExecutor = false;
  TH.setTrustedHostProductionRunnersForTests(hostRunners({
    revalidate: () => { sawProductionExecutor = true; return { ok: false, code: "sentinel", detail: "sentinel" }; },
  }).runners);
  TH.executeTrustedHostAction(actionId, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });
  TH.setTrustedHostProductionRunnersForTests(null);
  assert.equal(sawProductionExecutor, true);
});

// ── X3 — THE PRECONDITIONS ACTUALLY RUN ─────────────────────────────────────

test("X3 — execution invokes the seven proofs, and a failing proof stops the migration", () => {
  // Parity reports PASS: proof 3 must refuse, and the batch must never run.
  const { out, calls } = run({ readHostedVersions: () => ({ ok: true, versions: [...REQUIRED], head: PENDING }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.PRECONDITION_REFUSED);
  assert.equal(out.proof, "parity_not_behind");
  assert.equal(calls.apply, 0, "the migration executor ran despite a failed precondition");
  assert.equal(out.migration_attempted, false);
});

test("X3b — the proofs are not merely available, they gate this path", () => {
  // A parity that cannot be measured is UNKNOWN, and UNKNOWN refuses.
  const { out, calls } = run({ readRequiredVersions: () => [...REQUIRED], readHostedVersions: () => ({ ok: false, detail: "unreachable" }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.HOSTED_READ_FAILED);
  assert.equal(calls.apply, 0);
});

// ── X4 — EXACT CANDIDATE ────────────────────────────────────────────────────

test("X4 — a request that no longer validates at execution denies", () => {
  const { out, calls } = run({
    revalidate: () => ({ ok: false, code: "candidate_sha_not_exact", detail: "not the approved head" }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.REVALIDATION_FAILED);
  assert.equal(out.proof, "candidate_sha_not_exact");
  assert.equal(calls.apply, 0);
});

test("X4b — validation is re-run at execution, not trusted from the proposal", () => {
  const { calls } = run();
  assert.equal(calls.revalidate, 1, "the executor did not revalidate");
});

// ── X5 — UNAPPROVED ─────────────────────────────────────────────────────────

test("X5 — an unapproved action denies before any mutation", () => {
  const r = runners();
  const out = EX.executeProductionMigrationApply({ ...r, approval: null });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.PRECONDITION_REFUSED);
  assert.equal(out.proof, "director_approval_required");
  assert.equal(r.calls.apply, 0);
});

test("X5b — a delegated or policy approval is refused, not silently accepted", () => {
  const r = runners();
  const out = EX.executeProductionMigrationApply({
    ...r,
    approval: approval({ decision_actor: "policy", delegated: true }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.proof, "delegated_approval_rejected");
  assert.equal(r.calls.apply, 0);
});

// ── X6 — STALE GOVERNED AUTHORITY ───────────────────────────────────────────

test("X6 — an approval given for different content denies", () => {
  const r = runners();
  const out = EX.executeProductionMigrationApply({
    ...r,
    approval: approval({ content_fingerprint: "fp-somethingelse" }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.proof, "approval_content_drift");
  assert.equal(r.calls.apply, 0);
});

test("X6b — a stale pre-merge promotion candidate loses its authority", () => {
  // The governed candidate path is time-bounded by its own owner; an expired
  // refusal record is not standing authority.
  const old = Date.now() - PM.PROMOTION_CANDIDATE_MAX_AGE_MS - 1000;
  const proof = PM.governedPromotionCandidateFor("b".repeat(40), {
    requests: [{
      action_key: "repository.merge_pull_request",
      policy_decision: "operator_approved",
      inputs: { repository: "ksquared-16/alloy", expected_head_sha: "b".repeat(40) },
      failure_reason: "hosted_migration_behind",
      updated_at: new Date(old).toISOString(),
    }],
    repository: "ksquared-16/alloy",
    nowMs: Date.now(),
  });
  assert.equal(proof.ok, false);
});

// ── X7 — OUTSIDE THE CANDIDATE DELTA ────────────────────────────────────────

test("X7 — a migration the approval does not cover denies", () => {
  const r = runners();
  const out = EX.executeProductionMigrationApply({
    ...r,
    approval: approval({ approved_versions: ["20259999000000"] }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.proof, "migration_not_approved");
  assert.equal(r.calls.apply, 0);
});

test("X7b — a migration the hosted measurement does not report missing denies", () => {
  // Hosted is behind by something else entirely. Applying anyway would be a
  // mutation with no governing measurement behind it.
  const { out, calls } = run({
    readRequiredVersions: () => [APPLIED, "20260808000000", PENDING],
    readHostedVersions: () => ({ ok: true, versions: [APPLIED, PENDING], head: PENDING }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.proof, "migration_not_in_measured_gap");
  assert.equal(calls.apply, 0);
});

// ── X8 — CHANGED MIGRATION ──────────────────────────────────────────────────

test("X8 — migration content that differs at execution time denies", () => {
  const calls = { applied: [] };
  const { out } = run({
    applyBatch: (n) => realBatch(n, calls, { readContent: () => ({ ok: true, text: "-- TAMPERED\n" }) }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.APPLY_FAILED);
  assert.equal(calls.applied.length, 0, "a tampered migration was executed");
  assert.match(String(out.detail), /approved artifact hash/i);
});

// ── X9 — HOSTED HEAD DRIFT ──────────────────────────────────────────────────

test("X9 — a hosted head that moved since the approval fails closed", () => {
  const r = runners();
  const out = EX.executeProductionMigrationApply({
    ...r,
    approval: approval(),
    approvedHostedHead: "20259999000000",
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.HOSTED_DRIFT);
  assert.equal(out.migration_attempted, false);
  assert.equal(r.calls.apply, 0);
  assert.match(String(out.detail), /fresh governed action/i);
});

test("X9b — the hosted reading is taken live, not carried from the proposal", () => {
  const { calls } = run();
  // Once before the proofs, once after the apply to verify.
  assert.equal(calls.hosted, 2);
});

// ── X10 — CREDENTIAL FAILURE ────────────────────────────────────────────────

test("X10 — an unresolvable production credential fails closed with no attempted migration", () => {
  const { out, calls } = run({
    resolveExecutorIdentity: () => ({ ok: false, code: EX.PRODUCTION_APPLY_FAILURES.CREDENTIAL_UNAVAILABLE, detail: "trusted_credential_unavailable" }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.CREDENTIAL_UNAVAILABLE);
  assert.equal(out.migration_attempted, false);
  assert.equal(calls.apply, 0);
  assert.equal(calls.hosted, 0, "the database was read before the credential was established");
});

test("X10b — a credential that resolves to a different project is refused", () => {
  const { out, calls } = run({
    resolveExecutorIdentity: () => ({ ok: true, dbHostKind: "direct", dbProjectRef: "aaaaaaaaaaaaaaaa", apiProjectRef: "bbbbbbbbbbbbbbbb" }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.EXECUTOR_TARGET_MISMATCH);
  assert.equal(calls.apply, 0);
});

test("X10c — an unnameable project is UNKNOWN, and UNKNOWN refuses", () => {
  for (const identity of [
    { dbHostKind: "direct", dbProjectRef: "", apiProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF },
    { dbHostKind: "direct", dbProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF, apiProjectRef: "" },
  ]) {
    const { out, calls } = run({ resolveExecutorIdentity: () => ({ ok: true, ...identity }) });
    assert.equal(out.ok, false);
    assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED);
    assert.equal(calls.apply, 0);
  }
});

// ── X11 — EXECUTOR FAILURE ──────────────────────────────────────────────────

test("X11 — a failing migration records failure, never success", () => {
  const calls = { applied: [] };
  const { out } = run({
    applyBatch: (n) => realBatch(n, calls, { applyFile: () => ({ ok: false, code: "apply_failed", detail: "syntax error at or near" }) }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.APPLY_AMBIGUOUS);
  assert.equal(out.migration_attempted, true);
  // An outcome that may have half-run is never marked safe to retry.
  assert.equal(out.classification.safe_to_retry, false);
  assert.equal(out.classification.escalate, true);
});

test("X11b — a refusal that never reached the database is distinguished from one that may have", () => {
  const calls = { applied: [] };
  const { out } = run({
    applyBatch: (n) => realBatch(n, calls, { inspectLedger: () => ({ ok: false, code: "apply_runner_missing", detail: "no runner" }) }),
  });
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.APPLY_FAILED);
  assert.equal(out.migration_attempted, false);
  assert.equal(out.classification.classification, "no_effect");
});

test("X11c — every failure has its own code; none is action_unavailable", () => {
  assert.ok(EX.PRODUCTION_APPLY_FAILURE_CODES.length >= 10);
  assert.equal(new Set(EX.PRODUCTION_APPLY_FAILURE_CODES).size, EX.PRODUCTION_APPLY_FAILURE_CODES.length);
  assert.ok(!EX.PRODUCTION_APPLY_FAILURE_CODES.includes("action_unavailable"));
});

// ── X12 — VERIFICATION ──────────────────────────────────────────────────────

test("X12 — a successful apply is verified by re-reading hosted state", () => {
  const { out, calls } = run();
  assert.equal(out.ok, true);
  assert.equal(out.verified, true);
  assert.equal(out.verification.method, "post_apply_hosted_ledger_reread");
  assert.equal(out.hosted_head_before, APPLIED);
  assert.equal(out.hosted_head_after, PENDING);
  assert.equal(calls.applied.length, 1);
  assert.equal(out.outcome.promotion_released, true);
});

test("X12b — an executor that says ok while the ledger disagrees is not a pass", () => {
  // The apply reports success; the ledger still does not carry the identity.
  const { out } = run({ readHostedVersions: () => hostedBefore() });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.VERIFICATION_FAILED);
  assert.equal(out.verified, false);
});

test("X12c — a post-apply read that fails is a verification failure, not a success", () => {
  let n = 0;
  const { out } = run({
    readHostedVersions: () => { n += 1; return n === 1 ? hostedBefore() : { ok: false, detail: "connection lost" }; },
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.VERIFICATION_FAILED);
  assert.equal(out.migration_attempted, true);
});

// ── X13 — APPROVAL PRESENTATION ─────────────────────────────────────────────

test("X13 — the production action renders unmistakably as production", () => {
  const req = {
    action_key: PRODUCTION_KEY,
    target: TARGET,
    inputs: { target: TARGET, expectedSha: SHA, migrations: [{ version: PENDING, path: PENDING_PATH }] },
  };
  const p = GA.presentationForGovernedAction(req);
  const all = `${p.approve_label} ${p.wait_label} ${p.mission_need} ${p.detail}`;
  assert.match(all, /PRODUCTION/);
  assert.match(all, new RegExp(TARGET));
  // The word an operator has approved many times must not appear here.
  assert.ok(!/staging/i.test(all), `staging vocabulary leaked into the production card: ${all}`);
});

test("X13b — the production and staging cards cannot be confused", () => {
  const inputs = { environment: "staging", target: TARGET, expectedSha: SHA, migrations: [{ version: PENDING, path: PENDING_PATH }] };
  const prod = GA.presentationForGovernedAction({ action_key: PRODUCTION_KEY, inputs });
  const stage = GA.presentationForGovernedAction({ action_key: STAGING_KEY, inputs });
  assert.notEqual(prod.approve_label, stage.approve_label);
  assert.notEqual(prod.mission_need, stage.mission_need);
  assert.match(stage.approve_label, /staging/i);
  assert.match(prod.approve_label, /PRODUCTION/);
});

test("X13c — the proposal names the environment, candidate, migrations and both heads", () => {
  const proposal = GA.governedProposalFor({
    action_key: PRODUCTION_KEY,
    inputs: { target: TARGET, repository: "ksquared-16/alloy", expectedSha: SHA, migrations: [{ version: PENDING, path: PENDING_PATH }] },
    proposal_snapshot: { hosted_head: APPLIED, required_head: PENDING },
  });
  assert.ok(proposal, "the production action has no proposal card");
  assert.match(proposal.headline, /PRODUCTION/);
  const labels = proposal.facts.map((f) => f.label);
  for (const need of ["Environment", "Database target", "Candidate commit", "Migrations", "Hosted head now", "Required head"]) {
    assert.ok(labels.includes(need), `the card omits "${need}"`);
  }
  assert.match(proposal.facts.find((f) => f.label === "Environment").value, /PRODUCTION/);
  assert.match(proposal.facts.find((f) => f.label === "Candidate commit").value, new RegExp(SHA));
  assert.ok(proposal.consequences.some((c) => /LIVE production database/.test(c)));
});

// ── X14 — NO SECRET LEAKAGE ─────────────────────────────────────────────────

test("X14 — no credential material reaches the result, the audit or the store", () => {
  const { out } = run();
  const serialized = JSON.stringify(EX.publicProductionApplyResult(out));
  assert.equal(EX.containsCredentialMaterial(serialized), false);
  for (const bad of ["postgresql://", "postgres://", "SERVICE_ROLE_KEY", "PGPASSWORD", "eyJ"]) {
    assert.ok(!serialized.includes(bad), `result carried ${bad}`);
  }
  // The reference NAME is present on purpose: an audit that cannot say which
  // credential was used is not an audit.
  assert.ok(serialized.includes("ambient:ALLOY_SERVER_ENV_SOURCE"));
  // ...but NOT the raw env-var token, which the governed result detector reads
  // as secret material. Writing the full reference into a governed result made
  // every successful apply fail result_validation_failed before it reached the
  // operator; an integration run through the real governed path found it.
  assert.ok(!serialized.includes("DATABASE_URL"), "the audit must not spell the env-var token into a governed result");
  // The credential is NAMED, never valued — the audit has to be able to say
  // which reference it used, and a detector that flagged the name would force
  // the audit to describe the credential without naming it.
  assert.match(EX.PRODUCTION_CREDENTIAL_BINDING.credential_ref, /^ambient:/);
  assert.equal(EX.containsCredentialMaterial(EX.PRODUCTION_CREDENTIAL_BINDING.credential_ref), false);
  // And the detector still catches every form of the actual value.
  for (const leak of [
    "postgresql://user:pw@host:5432/db",
    "postgres://user:pw@host/db",
    'DATABASE_URL=postgresql://user:pw@host/db',
    '{"DATABASE_URL":"postgres://u:p@h/d"}',
    "SUPABASE_SERVICE_ROLE_KEY=abc123",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
    "ghp_0123456789abcdef",
  ]) {
    assert.equal(EX.containsCredentialMaterial(leak), true, `detector missed: ${leak}`);
  }
});

test("X14b — a result carrying credential material is discarded rather than stored", () => {
  const { out } = run({
    applyBatch: () => ({ ok: true, results: [{ ok: true, version: PENDING, path: PENDING_PATH, detail: "postgresql://user:pw@host/db" }] }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, EX.PRODUCTION_APPLY_FAILURES.RESULT_CONTAINED_SECRETS);
});

test("X14c — the identity probe prints only public refs and never the connection string", () => {
  const script = readFileSync(join(REPO, "scripts/local-dev/lib/vacilando/trusted-host-production-identity.sh"), "utf8");
  assert.match(script, /unset DATABASE_URL/);
  // The only two things it is allowed to print.
  const printed = [...script.matchAll(/printf '([A-Z_]+)=%s\\n'/g)].map((m) => m[1]);
  assert.deepEqual(printed.sort(), ["API_PROJECT_REF", "DB_HOST_KIND", "DB_PROJECT_REF"]);
  // The pooler ref lives in the USERNAME. The probe must never reach for it.
  assert.ok(!/\$\{?DATABASE_URL.*@/.test(script.split("unset DATABASE_URL")[1] || ""),
    "the probe touches the credential after discarding it");
});

// ── X15 — WHAT REMAINS UNTESTED ─────────────────────────────────────────────

test("X15 — the untested remainder is named rather than implied", () => {
  // Everything above exercises the shipped dispatch, validator, proofs, apply
  // and verification. Two things cannot be exercised from any lane, by design,
  // and are first exercised by the first real production invocation:
  //
  //   1. `alloy_load_trusted_server_env_exports` actually resolving the
  //      deployed-primary DATABASE_URL inside the trusted-host child;
  //   2. psql executing the migration against the live deployed primary.
  //
  // Both live behind the two adapters this suite substitutes, and nothing else
  // is substituted. The audit records which of them ran.
  assert.equal(EX.PRODUCTION_CREDENTIAL_BINDING.resolver.startsWith("alloy_load_trusted_server_env_exports"), true);
  assert.match(EX.REGISTERED_PRODUCTION_PROJECT_REF, /^[a-z0-9]{16,32}$/);
});

test("X15b — the audit can answer who, what, where, which and when", () => {
  const { out } = run();
  const a = out.audit;
  for (const field of ["action_key", "target", "candidate_sha", "migrations", "hosted_head_before", "hosted_head_after", "started_at", "completed_at", "approval", "executor", "preconditions", "parity_before", "parity_after", "outcome"]) {
    assert.ok(a[field] !== undefined, `the audit cannot answer "${field}"`);
  }
  assert.equal(a.approval.decision, "approved");
  assert.equal(a.executor.credential_ref, EX.PRODUCTION_CREDENTIAL_BINDING.audit_ref);
  assert.equal(a.ok, true);
});


// ── X16 — THE SEAM THAT LET A TEST WRITE TO PRODUCTION ──────────────────────

test("X16 — a runner this executor would ignore is refused, not silently dropped", () => {
  // MEASURED. An integration harness passed inspectLedger/applyFile in the
  // production bag believing it had isolated the database. The executor read
  // those from the MIGRATION bag, the keys were dropped, the default runners
  // ran, and psql applied two migrations to the deployed primary. Every
  // assertion the harness made passed, because they were all against the mocks
  // that WERE honoured. A seam that accepts a key it does not use is a trapdoor.
  assert.throws(
    () => TH.setTrustedHostProductionRunnersForTests({ notARunner: () => {} }),
    /unknown runner/i,
  );
  // And the two runners that open a connection are honoured here now.
  let ledger = 0; let apply = 0;
  TH.setTrustedHostProductionRunnersForTests({
    resolveExecutorIdentity: () => ({ ok: true, dbHostKind: "direct", dbProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF, apiProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF }),
    readHostedVersions: () => hostedBefore(),
    readRequiredVersions: () => [...REQUIRED],
    revalidate: () => ({ ok: true, normalized: normalized() }),
    inspectLedger: () => { ledger += 1; return { applied: false }; },
    applyFile: () => { apply += 1; return { ok: true, ledger: "applied" }; },
    readContent: () => ({ ok: true, text: CONTENT }),
  });
  const actionId = seedAction();
  TH.executeTrustedHostAction(actionId, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });
  TH.setTrustedHostProductionRunnersForTests(null);
  assert.ok(ledger > 0, "the production bag's inspectLedger was ignored — it would have hit psql");
  assert.ok(apply > 0, "the production bag's applyFile was ignored — it would have hit psql");
});

// ── X17 — THE HARD NEGATIVE: PRODUCTION RUNNERS ARE UNREACHABLE FROM A HARNESS ─
//
// Not "a mock was called". These assert that the real psql runners CANNOT be
// arrived at, by every route the incident took and by the routes it did not.

test("X17 — an un-isolated harness is refused, never defaulted to the real runners", () => {
  // The incident exactly: the caller supplied neither database runner, because
  // the ones it supplied went into a bag this executor does not read. Before the
  // repair that fell through to psql. It must now refuse, and refuse having
  // touched nothing.
  const actionId = seedAction();
  TH.setTrustedHostProductionRunnersForTests({
    revalidate: () => ({ ok: true, normalized: normalized() }),
    resolveExecutorIdentity: () => ({ ok: true, dbHostKind: "direct", dbProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF, apiProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF }),
    readHostedVersions: () => hostedBefore(),
    readRequiredVersions: () => [...REQUIRED],
  });
  const out = TH.executeTrustedHostAction(actionId, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });
  TH.setTrustedHostProductionRunnersForTests(null);

  assert.equal(out.ok, false);
  assert.equal(out.action.result.code, EX.PRODUCTION_APPLY_FAILURES.APPLY_FAILED);
  assert.match(String(out.action.result.detail), /test process may not reach the production database runners/i);
  // Classified as a refusal that never reached a database, so it can never be
  // escalated as a possible partial migration.
  assert.equal(out.action.result.migration_attempted, false);
});

test("X17b — half an isolation is refused rather than completed from the real runners", () => {
  const actionId = seedAction();
  TH.setTrustedHostProductionRunnersForTests({
    revalidate: () => ({ ok: true, normalized: normalized() }),
    resolveExecutorIdentity: () => ({ ok: true, dbHostKind: "direct", dbProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF, apiProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF }),
    readHostedVersions: () => hostedBefore(),
    readRequiredVersions: () => [...REQUIRED],
    // One stubbed, one forgotten — the incident's mistake at a smaller scale.
    inspectLedger: () => ({ applied: false }),
  });
  const out = TH.executeTrustedHostAction(actionId, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });
  TH.setTrustedHostProductionRunnersForTests(null);
  assert.equal(out.ok, false);
  assert.match(String(out.action.result.detail), /must be supplied together/i);
  assert.equal(out.action.result.migration_attempted, false);
});

test("X17c — a test process cannot arm production execution, even deliberately", () => {
  // Defence in depth. Arming is what a real Gateway does at startup; a suite
  // that decided arming was harmless would re-open the exact hole.
  assert.ok(process.env.NODE_TEST_CONTEXT, "this assertion is only meaningful inside node --test");
  const armed = TH.armProductionDatabaseExecution({ reason: "a test trying to arm production" });
  assert.equal(armed.ok, false);
  assert.equal(armed.code, "production_runners_refused_in_test_context");
  assert.equal(TH.productionDatabaseExecutionArmed(), null);
});

test("X17d — the real psql runner has exactly one reachable reference on the production path", () => {
  // STRUCTURAL, because behaviour alone cannot prove a route nobody wrote a test
  // for. `defaultApplyMigrationFile` is the only thing that spawns the migration
  // child; if the production path can name it anywhere except inside the
  // composition root, a future edit can reach it without passing the gate.
  const src = readFileSync(new URL("../lib/vacilando/trusted-host-actions.mjs", import.meta.url), "utf8");
  const lines = src.split("\n");
  const refs = lines
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /\bdefaultApplyMigrationFile\b/.test(line));
  // Its definition, the STAGING executor (which refuses production by design),
  // and the composition root. Nothing else.
  assert.equal(refs.length, 3, `unexpected references to defaultApplyMigrationFile:\n${refs.map((r) => `${r.n}: ${r.line.trim()}`).join("\n")}`);
  assert.match(refs[0].line, /^function defaultApplyMigrationFile/);
  assert.match(refs[1].line, /runners\.applyFile \|\| defaultApplyMigrationFile/);
  const compositionStart = src.indexOf("function composeProductionDatabaseRunners");
  const compositionEnd = src.indexOf("/** The identities the candidate revision requires");
  const thirdIndex = src.indexOf("defaultApplyMigrationFile", src.indexOf("defaultApplyMigrationFile", src.indexOf("defaultApplyMigrationFile") + 1) + 1);
  assert.ok(thirdIndex > compositionStart && thirdIndex < compositionEnd,
    "the production path reaches the real apply runner outside composeProductionDatabaseRunners");
});

test("X17e — the production composition root is the Gateway server, and only it", () => {
  // The arming call must exist exactly once, in the process that executes
  // governed actions. A second caller would be a second way to become
  // production-capable.
  const server = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url), "utf8");
  assert.equal((server.match(/armProductionDatabaseExecution\(/g) || []).length, 1);
  const host = readFileSync(new URL("../lib/vacilando-gateway-host.mjs", import.meta.url), "utf8");
  assert.equal(/armProductionDatabaseExecution/.test(host), false, "the supervisor does not execute governed actions and must not arm");
});

// ── X18 — POOLER IDENTITY ───────────────────────────────────────────────────

test("X18 — a shared pooler hostname is not accepted as target identity", () => {
  const REF = EX.REGISTERED_PRODUCTION_PROJECT_REF;
  // What the live host actually returns today.
  const pooled = EX.judgeProductionExecutorIdentity({
    target: TARGET, dbHostKind: "shared_pooler", dbProjectRef: "",
    apiProjectRef: REF, connectionEstablished: true,
  });
  assert.equal(pooled.ok, true, "a pooler connection to the registered project must be establishable");
  // ...but the audit says the basis is weaker than a direct host.
  assert.equal(pooled.identity_proof, "registered_ref_with_pooler_connection");

  // The old behaviour — the hostname standing in for a project ref — is gone.
  const asIdentity = EX.judgeProductionExecutorIdentity({
    target: TARGET, dbHostKind: "shared_pooler", dbProjectRef: "aws-0-us-west-2.pooler.supabase.com",
    apiProjectRef: REF, connectionEstablished: true,
  });
  assert.equal(asIdentity.ok, true);
  assert.equal(asIdentity.project_ref, REF, "identity must come from the registered ref, never from the hostname");
});

test("X18b — configuration alone never establishes the target; a live read is required", () => {
  const REF = EX.REGISTERED_PRODUCTION_PROJECT_REF;
  const noRead = EX.judgeProductionExecutorIdentity({
    target: TARGET, dbHostKind: "shared_pooler", dbProjectRef: "", apiProjectRef: REF,
    connectionEstablished: false,
  });
  assert.equal(noRead.ok, false);
  assert.equal(noRead.code, EX.PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED);
  assert.match(String(noRead.detail), /live read/i);
});

test("X18c — a trusted env pointed at another project is refused", () => {
  const r = EX.judgeProductionExecutorIdentity({
    target: TARGET, dbHostKind: "direct", dbProjectRef: "zzzzzzzzzzzzzzzz",
    apiProjectRef: "zzzzzzzzzzzzzzzz", connectionEstablished: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, EX.PRODUCTION_APPLY_FAILURES.EXECUTOR_TARGET_MISMATCH);
  assert.match(String(r.detail), /registered production/i);
});

test("X18d — with no registered project there is nothing to check against, so it refuses", () => {
  const r = EX.judgeProductionExecutorIdentity({
    target: TARGET, dbHostKind: "direct", dbProjectRef: "aaaaaaaaaaaaaaaa",
    apiProjectRef: "aaaaaaaaaaaaaaaa", connectionEstablished: true,
    registeredProjectRef: null,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, EX.PRODUCTION_APPLY_FAILURES.EXECUTOR_TARGET_UNREGISTERED);
});

test("X18e — an unreviewed connection topology is UNKNOWN, and UNKNOWN refuses", () => {
  const r = EX.judgeProductionExecutorIdentity({
    target: TARGET, dbHostKind: "unrecognised", dbProjectRef: "",
    apiProjectRef: EX.REGISTERED_PRODUCTION_PROJECT_REF, connectionEstablished: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, EX.PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED);
});

// ── fixtures ────────────────────────────────────────────────────────────────

/** A trusted-host action record, pre-authorized, written straight into the store. */
function seedAction() {
  const dir = join(ROOT, "vacilando", "trusted-host-actions");
  mkdirSync(dir, { recursive: true });
  const id = `tha_test_${Math.random().toString(16).slice(2, 10)}`;
  const action = {
    schema_version: "vacilando.trusted_host_action.v1",
    id,
    missionId: "mission-prod-apply",
    actionType: PRODUCTION_KEY,
    actionVersion: 1,
    requestedBy: "director",
    requestedInputs: normalized(),
    inputs: normalized(),
    authorizationIdentity: { scope: "mission-prod-apply", actionType: PRODUCTION_KEY, resolved: true },
    authorizationState: "authorized",
    authorizationId: "authz-test",
    executionState: "not_started",
    state: "authorized",
    productionApproval: approval(),
    retryState: { attempts: 0, maxAttempts: 1 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(action, null, 2));
  const idxP = join(dir, "index-mission-prod-apply.json");
  let idx = { missionId: "mission-prod-apply", ids: [] };
  if (existsSync(idxP)) { try { idx = JSON.parse(readFileSync(idxP, "utf8")); } catch { /* */ } }
  idx.ids.push(id);
  writeFileSync(idxP, JSON.stringify(idx, null, 2));
  return id;
}

/** A governed-action record in the approved state, written straight into the store. */
function seedGovernedRequest() {
  GA.resetGovernedActionsForTests(ROOT);
  const p = join(ROOT, "vacilando", "governed-actions", "requests.json");
  const store = JSON.parse(readFileSync(p, "utf8"));
  const requestId = `gar_test_${Math.random().toString(16).slice(2, 10)}`;
  store.requests.push({
    schema_version: "vacilando.governed_action_request.v1",
    request_id: requestId,
    mission_id: "mission-prod-apply",
    lane_id: "lane_test",
    run_id: null,
    action_key: PRODUCTION_KEY,
    target: TARGET,
    worktree_path: REPO,
    inputs: registryInputs(),
    status: "approved",
    policy_decision: "operator_approved",
    operator_approval: { decision: "approved", actor: "operator", at: new Date().toISOString() },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  writeFileSync(p, JSON.stringify(store, null, 2));
  return requestId;
}
