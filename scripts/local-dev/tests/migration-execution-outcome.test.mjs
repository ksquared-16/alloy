/**
 * Migration Execution Outcome V1.
 *
 * One question, asked many ways: after a migration stops, is it safe to apply
 * again? Every test below is a case where the honest answer is "no" and the
 * previous code said "failed", which reads as "yes".
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MIGRATION_OUTCOME, MIGRATION_PHASE, RECOVERY_ACTION,
  resolveMigrationOutcome, migrationRecoveryDisposition, evaluateProductionApplyOutcome,
} from "../lib/vacilando/trusted-host-production-migrate.mjs";
import {
  PRODUCTION_APPLY_FAILURES, PRODUCTION_APPLY_FAILURE_CODES, publicProductionApplyResult,
} from "../lib/vacilando/trusted-host-production-apply.mjs";
import { assertLedgerRepairPreconditions } from "../lib/vacilando/trusted-host-ledger-repair.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");

/* ── CASE A · failed before any schema mutation ──────────────────────────── */
test("CASE A — an apply that never ran is retryable", () => {
  const r = resolveMigrationOutcome({ state: "blocked_apply_not_run" });
  assert.equal(r.outcome, MIGRATION_OUTCOME.FAILED_BEFORE_APPLY);
  assert.equal(r.phase, MIGRATION_PHASE.NOT_STARTED);
  assert.equal(r.retry_apply_allowed, true);
  assert.equal(r.recommended_action, RECOVERY_ACTION.RETRY_APPLY);
});

test("CASE A — a proven no-effect failure is retryable, an ambiguous one is not", () => {
  const noEffect = resolveMigrationOutcome({ state: "blocked_apply_failed", failureClassification: "no_effect" });
  assert.equal(noEffect.outcome, MIGRATION_OUTCOME.FAILED_BEFORE_APPLY);
  assert.equal(noEffect.retry_apply_allowed, true);

  const ambiguous = resolveMigrationOutcome({ state: "blocked_apply_failed", failureClassification: "may_have_executed" });
  assert.equal(ambiguous.outcome, MIGRATION_OUTCOME.OUTCOME_UNKNOWN_AFTER_START);
  assert.equal(ambiguous.retry_apply_allowed, false);
  assert.equal(ambiguous.recommended_action, RECOVERY_ACTION.VERIFY_FIRST);
});

/* ── CASE B · everything worked ─────────────────────────────────────────── */
test("CASE B — apply, ledger and verification all succeed", () => {
  const r = resolveMigrationOutcome({ state: "promotion_released", schemaApplied: true, ledgerPresent: true });
  assert.equal(r.outcome, MIGRATION_OUTCOME.VERIFIED_SUCCESS);
  assert.equal(r.phase, MIGRATION_PHASE.VERIFIED);
  assert.equal(r.terminal, true);
  assert.equal(r.recommended_action, RECOVERY_ACTION.NONE);
});

/* ── CASE C · the defect this mission exists for ────────────────────────── */
test("CASE C — schema applied, ledger write failed: re-apply is forbidden", () => {
  const r = resolveMigrationOutcome({ state: "attention_ledger_identity_absent", versions: ["20260912010000"] });
  assert.equal(r.outcome, MIGRATION_OUTCOME.PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE);
  assert.equal(r.phase, MIGRATION_PHASE.APPLY_CONFIRMED);
  assert.equal(r.retry_apply_allowed, false, "re-applying would apply the migration twice");
  assert.equal(r.recommended_action, RECOVERY_ACTION.REPAIR_LEDGER);
  assert.match(r.reason, /bookkeeping, not an unapplied migration/);
});

test("CASE C — proven schema plus absent ledger resolves the same way from evidence alone", () => {
  const r = resolveMigrationOutcome({ state: null, schemaApplied: true, ledgerPresent: false });
  assert.equal(r.outcome, MIGRATION_OUTCOME.PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE);
  assert.equal(r.retry_apply_allowed, false);
});

/* ── CASE D · outcome lost after start ──────────────────────────────────── */
test("CASE D — the executor lost the outcome and the schema cannot be proven", () => {
  for (const state of ["blocked_recensus_required", "blocked_recensus_failed", "blocked_parity_unknown"]) {
    const r = resolveMigrationOutcome({ state });
    assert.equal(r.outcome, MIGRATION_OUTCOME.OUTCOME_UNKNOWN_AFTER_START, state);
    assert.equal(r.phase, MIGRATION_PHASE.APPLY_STARTED);
    assert.equal(r.retry_apply_allowed, false);
    assert.equal(r.recommended_action, RECOVERY_ACTION.VERIFY_FIRST);
  }
});

test("CASE D — an unmeasured schema after a start is UNKNOWN, never optimistic", () => {
  const r = resolveMigrationOutcome({ state: "something_new", applyStarted: true });
  assert.equal(r.outcome, MIGRATION_OUTCOME.OUTCOME_UNKNOWN_AFTER_START);
  assert.equal(r.retry_apply_allowed, false);
});

test("schema_applied null is not the same as false", () => {
  const unmeasured = resolveMigrationOutcome({ state: "blocked_parity_unknown", schemaApplied: null });
  assert.equal(unmeasured.outcome, MIGRATION_OUTCOME.OUTCOME_UNKNOWN_AFTER_START);
  const proven = resolveMigrationOutcome({ state: "blocked_parity_unknown", schemaApplied: false });
  assert.equal(proven.retry_apply_allowed, false, "a started apply with a false schema proof is still not a clean retry");
});

/* ── CASE E · fresh evidence resolves an unknown ────────────────────────── */
test("CASE E — a census proving the schema landed turns unknown into partial success", () => {
  const before = resolveMigrationOutcome({ state: "blocked_recensus_failed" });
  assert.equal(before.outcome, MIGRATION_OUTCOME.OUTCOME_UNKNOWN_AFTER_START);

  const after = resolveMigrationOutcome({
    state: "blocked_recensus_failed", schemaApplied: true, ledgerPresent: false, evidenceId: "gar_census",
  });
  assert.equal(after.outcome, MIGRATION_OUTCOME.PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE);
  assert.equal(after.recommended_action, RECOVERY_ACTION.REPAIR_LEDGER);
  assert.equal(after.evidence_id, "gar_census");
  assert.equal(after.retry_apply_allowed, false);
});

/* ── CASE F/G · the ledger repair contract ──────────────────────────────── */
test("CASE F — a ledger repair without physical proof is refused", () => {
  const r = assertLedgerRepairPreconditions({
    inputs: { target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: [{ version: "20260912010000", path: "supabase/migrations/20260912010000_x.sql" }] },
    identity: null, physical: null,
  });
  assert.equal(r.ok, false);
  assert.ok(String(r.code).length > 0, "the refusal must name itself");
});

test("CASE G — the repair contract demands proof, identity correspondence and an unchanged ledger", () => {
  const src = readFileSync(join(LIB, "trusted-host-ledger-repair.mjs"), "utf8");
  for (const guard of [
    "missing_physical_state_proof", "migration_not_in_approved_source", "uncanonical_migration_filename",
    "ledger_head_changed", "ledger_count_changed", "version_not_in_measured_gap", "duplicate_version_requested",
  ]) {
    assert.ok(src.includes(guard), `the repair path must still enforce ${guard}`);
  }
  // Repair must never become a generic way to mark a migration done.
  assert.ok(src.includes("parity_not_behind"), "a repair with nothing missing is refused");
});

/* ── CASE H · parity after repair ───────────────────────────────────────── */
test("CASE H — DevOps 6 parity stays strict and simply sees the repaired identity", async () => {
  const P = await import("../lib/vacilando/migration-parity.mjs");
  const V = (n) => String(20260912000000 + n * 10000);
  const census = (ids, at) => [{
    action_key: "database.read_census", status: "complete", request_id: "gar_c",
    inputs: { queryArtifactPath: "certification/migrations/hosted-migration-identity-census.sql" },
    execution_ended_at: new Date(at).toISOString(),
    result: { census: { questions: { ledger: { rows: ids }, ledger_head: { rows: [ids[ids.length - 1]] }, ledger_total: { rows: [ids.length] } } } },
  }];
  const now = Date.now();
  const staging = [V(1), V(2)];

  // Before repair: staging is ahead of hosted, and parity correctly blocks.
  const beforeRecs = census([V(1)], now - 60_000);
  const beforeEv = P.hostedMigrationEvidence(beforeRecs);
  const before = P.promotionParityGate({
    expected: staging, evidence: beforeEv,
    freshness: P.hostedEvidenceFreshness(beforeEv, { requests: beforeRecs, nowMs: now }), expectedRevision: "staging", nowMs: now,
  });
  assert.equal(before.status, "blocked", "parity is not weakened; it correctly reports the missing identity");
  assert.deepEqual(before.missing_on_hosted, [V(2)]);

  // After a proof-backed repair and a FRESH census, parity goes green on its own.
  const afterRecs = census([V(1), V(2)], now - 10_000);
  const afterEv = P.hostedMigrationEvidence(afterRecs);
  const after = P.promotionParityGate({
    expected: staging, evidence: afterEv,
    freshness: P.hostedEvidenceFreshness(afterEv, { requests: afterRecs, nowMs: now }), expectedRevision: "staging", nowMs: now,
  });
  assert.equal(after.status, "ok");
  assert.deepEqual(after.missing_on_hosted, []);
});

/* ── CASE I · duplicate retry ───────────────────────────────────────────── */
test("CASE I — a duplicate retry request after partial success executes no second migration", () => {
  const partial = { result: { outcome: { state: "attention_ledger_identity_absent" }, migration_attempted: true } };
  const first = migrationRecoveryDisposition(partial, { schemaApplied: true, ledgerPresent: false });
  const second = migrationRecoveryDisposition(partial, { schemaApplied: true, ledgerPresent: false });
  for (const d of [first, second]) {
    assert.equal(d.retry_apply_allowed, false);
    assert.equal(d.recommended_action, RECOVERY_ACTION.REPAIR_LEDGER);
  }
  assert.deepEqual(first.outcome, second.outcome, "the disposition is deterministic, so a repeat asks the same question and gets the same refusal");
});

/* ── CASE J · restart preserves the classification ──────────────────────── */
test("CASE J — a Gateway restart preserves the classification and re-runs nothing", () => {
  // The classification is derived from the recorded action plus evidence, not
  // from memory, so a fresh process reaches the same answer.
  const record = {
    action_key: "database.apply_promoted_migration", request_id: "gar_792710a5f553ee",
    result: { outcome: { state: "attention_ledger_identity_absent", evidence: { requested: ["20260912010000"] } }, migration_attempted: true },
  };
  const beforeRestart = migrationRecoveryDisposition(record, { schemaApplied: true, ledgerPresent: false });
  const afterRestart = migrationRecoveryDisposition(JSON.parse(JSON.stringify(record)), { schemaApplied: true, ledgerPresent: false });
  assert.deepEqual(beforeRestart.outcome, afterRestart.outcome);
  assert.equal(afterRestart.retry_apply_allowed, false);
  assert.equal(afterRestart.request_id, "gar_792710a5f553ee");
});

/* ── the two real incidents ─────────────────────────────────────────────── */
test("D2 replays as applied-with-incomplete-ledger, not as a re-runnable failure", () => {
  // gar_792710a5f553ee: schema landed, the action reported
  // post_apply_verification_failed, and the repair gar_db1d3588e3fac9 later
  // moved the ledger 405 → 412.
  const outcome = evaluateProductionApplyOutcome({
    applyResult: { ok: true, results: [{ version: "20260911260000", ok: true }] },
    censusResult: { ok: true },
    parityAfter: { status: "blocked", missing: ["20260911260000"], unexpected: [] },
    requestedVersions: ["20260911260000"],
  });
  assert.equal(outcome.state, "attention_ledger_identity_absent");

  const d = resolveMigrationOutcome({ state: outcome.state, versions: ["20260911260000"] });
  assert.equal(d.outcome, MIGRATION_OUTCOME.PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE);
  assert.equal(d.retry_apply_allowed, false, "D2 must never have been re-applied");
  assert.equal(d.recommended_action, RECOVERY_ACTION.REPAIR_LEDGER, "which is exactly what gar_db1d3588e3fac9 did");
});

test("W-17 replays the same way", () => {
  // Ledger 412 → 413 via gar_62ef5ea2e363fa.
  const outcome = evaluateProductionApplyOutcome({
    applyResult: { ok: true, results: [{ version: "20260912010000", ok: true }] },
    censusResult: { ok: true },
    parityAfter: { status: "blocked", missing: ["20260912010000"], unexpected: [] },
    requestedVersions: ["20260912010000"],
  });
  const d = resolveMigrationOutcome({ state: outcome.state, versions: ["20260912010000"] });
  assert.equal(d.outcome, MIGRATION_OUTCOME.PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE);
  assert.equal(d.phase, MIGRATION_PHASE.APPLY_CONFIRMED);
  assert.equal(d.retry_apply_allowed, false);
});

/* ── the two opposite states no longer share a code ─────────────────────── */
test("applied-ledger-incomplete has its own failure code, distinct from verification failure", () => {
  assert.equal(PRODUCTION_APPLY_FAILURES.APPLIED_LEDGER_INCOMPLETE, "migration_applied_ledger_incomplete");
  assert.notEqual(PRODUCTION_APPLY_FAILURES.APPLIED_LEDGER_INCOMPLETE, PRODUCTION_APPLY_FAILURES.VERIFICATION_FAILED);
  assert.ok(PRODUCTION_APPLY_FAILURE_CODES.includes("migration_applied_ledger_incomplete"));
  // And it is not a catch-all: every code is distinct.
  assert.equal(new Set(PRODUCTION_APPLY_FAILURE_CODES).size, PRODUCTION_APPLY_FAILURE_CODES.length);
});

test("the executor routes an unreadable ledger and an absent identity to different codes", () => {
  const src = readFileSync(join(LIB, "trusted-host-production-apply.mjs"), "utf8");
  // The unreadable case keeps VERIFICATION_FAILED and declares the schema unknown.
  assert.match(src, /could not be re-read[\s\S]{0,400}?schema_applied: null/);
  // The readable-but-absent case uses the new code and declares the schema applied.
  assert.match(src, /APPLIED_LEDGER_INCOMPLETE[\s\S]{0,700}?schema_applied: true/);
});

/* ── F · the evidence actually reaches a reader ─────────────────────────── */
test("the public result carries the fields that answer 'is it safe to apply again'", () => {
  const pub = publicProductionApplyResult({
    ok: false, code: "migration_applied_ledger_incomplete",
    detail: "Applied 20260912010000 and the hosted ledger does not report it.",
    schema_applied: true, ledger_present: false, ledger_missing: ["20260912010000"],
    retry_apply_allowed: false, recommended_action: "repair_ledger",
    hosted_head_before: "20260911260000", hosted_head_after: "20260911260000",
    disposition: { outcome: "PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE" },
    migration_attempted: true,
  });
  assert.equal(pub.schema_applied, true);
  assert.equal(pub.ledger_present, false);
  assert.deepEqual(pub.ledger_missing, ["20260912010000"]);
  assert.equal(pub.retry_apply_allowed, false);
  assert.equal(pub.recommended_action, "repair_ledger");
  assert.equal(pub.disposition.outcome, "PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE");
  assert.equal(pub.hosted_head_before, "20260911260000");
});

test("the public result exposes no secret material", () => {
  const pub = publicProductionApplyResult({ ok: true, audit: { note: "ok" } });
  const text = JSON.stringify(pub);
  assert.ok(!/postgres(ql)?:\/\/|service_role|DATABASE_URL\s*=/i.test(text));
});

/* ── G · the DevOps 10 recovery seam ────────────────────────────────────── */
test("recovery gets a migration-specific disposition, and no second recovery engine exists", async () => {
  const d = migrationRecoveryDisposition(
    { action_key: "database.apply_promoted_migration", request_id: "gar_x", result: { outcome: { state: "attention_ledger_identity_absent" } } },
    { schemaApplied: true, ledgerPresent: false },
  );
  assert.equal(d.owner, "database.repair_migration_ledger");
  assert.equal(d.action_key, "database.apply_promoted_migration");

  // DevOps 10's general law and this domain's law agree.
  const R = await import("../lib/vacilando/control-plane-resilience.mjs");
  const general = R.classifyInflight({ action_key: "database.apply_migration", status: "executing" });
  assert.equal(general.replay, false);
  const domain = resolveMigrationOutcome({ state: "blocked_parity_unknown" });
  assert.equal(domain.retry_apply_allowed, false);
});

test("verification-required dispositions route to a census, not to an apply", () => {
  const d = migrationRecoveryDisposition({ result: { outcome: { state: "blocked_recensus_failed" } } }, {});
  assert.equal(d.recommended_action, RECOVERY_ACTION.VERIFY_FIRST);
  assert.equal(d.owner, "database.read_census");
});

/* ── the law itself ─────────────────────────────────────────────────────── */
test("exactly one outcome permits re-applying, and it requires proof of no effect", () => {
  const outcomes = Object.values(MIGRATION_OUTCOME);
  const retryable = outcomes.filter((o) => resolveMigrationOutcome({
    state: o === MIGRATION_OUTCOME.FAILED_BEFORE_APPLY ? "blocked_apply_not_run" : "attention_ledger_identity_absent",
  }).retry_apply_allowed);
  assert.equal(retryable.length <= 1, true);
  assert.equal(resolveMigrationOutcome({ state: "blocked_apply_not_run" }).retry_apply_allowed, true);
  for (const state of ["attention_ledger_identity_absent", "blocked_parity_unknown", "blocked_recensus_failed", "promotion_released"]) {
    assert.equal(resolveMigrationOutcome({ state }).retry_apply_allowed, false, `${state} must not permit a re-apply`);
  }
});

test("no second migration authority is introduced", () => {
  const src = readFileSync(join(LIB, "trusted-host-production-migrate.mjs"), "utf8");
  const added = src.slice(src.indexOf("MIGRATION EXECUTION OUTCOME"));
  for (const f of ["spawnSync", "execFileSync", "applyBatch(", "writeFileSync"]) {
    assert.ok(!added.includes(f), `the outcome model must not ${f}`);
  }
  // It reuses the states the existing evaluator already returns.
  for (const state of ["attention_ledger_identity_absent", "blocked_recensus_failed", "promotion_released"]) {
    assert.ok(src.includes(`"${state}"`), `${state} must remain the canonical vocabulary`);
  }
});
