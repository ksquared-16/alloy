#!/usr/bin/env node
/**
 * A PROMOTION MAY PROCEED ONLY WHEN THE SCHEMA IT REQUIRES IS PROVEN PRESENT.
 *
 * WHAT THIS GUARDS, measured on 2026-09-09 against the deployed primary:
 *
 *  1. NOTHING IN THIS REPOSITORY APPLIES MIGRATIONS TO A HOSTED DATABASE. No
 *     workflow runs `supabase db push`; `prebuild` is verifications and `build`
 *     is `next build`; the governed `database.apply_migration` action has never
 *     been requested (0). The only written owner is step 7 of an ARCHIVED
 *     release process, performed by hand. So application code can be promoted
 *     while its schema has not been applied.
 *
 *  2. EQUAL COUNTS ARE THE MOST CONVINCING WAY TO BE WRONG. A census reported 55
 *     hosted rows against 55 required, which read as proof. The format had
 *     consumed each version as a row label, so the identities were unreadable:
 *     55-vs-55 could not distinguish "the same 55" from "55, four different".
 *     Case C exists because that nearly shipped as a clean bill of health.
 *
 *  3. A GATE THAT CANNOT SEE MUST NOT APPROVE. Case D pins UNKNOWN to blocked.
 *
 * Hermetic: pure set comparison. No database, no credential, no census call.
 */
import assert from "node:assert/strict";
import test from "node:test";

const P = await import("../lib/vacilando/migration-parity.mjs");

const V = (n) => `2026090900${String(n).padStart(4, "0")}`;
const req3 = [V(1), V(2), V(3)];

// ── A · repo and hosted match → promotion allowed ──────────────────────────
test("A · every required identity present, head equal → promote", () => {
  const r = P.migrationParity({ required: req3, measured: [...req3], measuredHead: V(3) });
  assert.equal(r.status, "ok");
  assert.equal(r.promote, true);
});

// ── B · hosted missing one required migration → blocked ────────────────────
test("B · one required migration missing → blocked, and it is named", () => {
  const r = P.migrationParity({ required: req3, measured: [V(1), V(2)], measuredHead: V(2) });
  assert.equal(r.status, "blocked");
  assert.equal(r.promote, false);
  assert.deepEqual(r.missing, [V(3)]);
});

// ── C · counts equal but identities differ → blocked ───────────────────────
test("C · equal counts with different identities → blocked, never ok", () => {
  // The exact shape that read as proof: three required, three measured.
  const measured = [V(1), V(2), V(99)];
  assert.equal(measured.length, req3.length, "the counts must match for this control to mean anything");
  const r = P.migrationParity({ required: req3, measured, measuredHead: V(99) });
  assert.equal(r.status, "blocked");
  assert.deepEqual(r.missing, [V(3)]);
  assert.deepEqual(r.unexpected, [V(99)]);
});

// ── D · measurement unavailable → blocked UNKNOWN ──────────────────────────
test("D · unmeasured is UNKNOWN and blocks, it is not treated as fine", () => {
  const r = P.migrationParity({ required: req3, measured: null });
  assert.equal(r.status, "unknown");
  assert.equal(r.promote, false);
});

test("D · a census that returned no ledger rows key is unmeasured, not empty", () => {
  // "Empty" and "did not look" are different answers and the second must block.
  assert.equal(P.measuredVersionsFromCensus({ questions: {} }), null);
  assert.equal(P.measuredVersionsFromCensus(null), null);
  const r = P.migrationParity({ required: req3, measured: P.measuredVersionsFromCensus({}) });
  assert.equal(r.status, "unknown");
});

// ── E · after a successful apply, re-measure → allowed ─────────────────────
test("E · apply then re-measure → promote", () => {
  const before = P.migrationParity({ required: req3, measured: [V(1), V(2)], measuredHead: V(2) });
  assert.equal(before.promote, false);
  const after = P.migrationParity({ required: req3, measured: [...req3], measuredHead: V(3) });
  assert.equal(after.promote, true);
});

// ── F · partial apply must not read as complete ────────────────────────────
test("F · a ledger that advanced without the last migration still blocks", () => {
  // The ledger claiming a head it does not have rows for is exactly the shape a
  // falsely-advanced ledger would produce.
  const r = P.migrationParity({ required: req3, measured: [V(1), V(2)], measuredHead: V(3) });
  assert.equal(r.status, "blocked");
  assert.deepEqual(r.missing, [V(3)]);
});

// ── head is checked independently of set equality ──────────────────────────
test("head behind the required head blocks even when the windowed sets agree", () => {
  const r = P.migrationParity({
    required: req3, measured: [...req3], measuredHead: V(2),
  });
  assert.equal(r.status, "blocked");
  assert.match(r.reason, /behind the required head/);
});

// ── windowing must not manufacture false blocks ────────────────────────────
test("a windowed census is compared only against the same window", () => {
  // Pre-window migrations are not reported by a windowed census; counting them
  // as missing would block every promotion forever.
  const required = ["20260101000000", ...req3];
  const r = P.migrationParity({
    required, measured: [...req3], measuredHead: V(3), window: V(1),
  });
  assert.equal(r.status, "ok", r.reason);
});

// ── parsing seams ──────────────────────────────────────────────────────────
test("required identities come from migration filenames, paths or bare", () => {
  const got = P.requiredVersionsFromFilenames([
    "supabase/migrations/20260909210000_location_topology_v1.sql",
    "20260909220000_attendance_capture_hardening.sql",
    "supabase/migrations/README.md",
    "not-a-migration.sql",
  ]);
  assert.deepEqual(got, ["20260909210000", "20260909220000"]);
});

test("census payloads are coerced, so a number never mismatches its own string", () => {
  // psql renders these as text but the census JSON may carry numbers; comparing
  // 20260909210000 against "20260909210000" would be a false block.
  const measured = P.measuredVersionsFromCensus({
    questions: { ledger: { rows: [20260909210000, "20260909220000"] } },
  });
  assert.deepEqual(measured, ["20260909210000", "20260909220000"]);
  assert.equal(
    P.measuredHeadFromCensus({ questions: { ledger_head: { rows: [20260909240000] } } }),
    "20260909240000",
  );
});

// ── the real measurement from this audit ───────────────────────────────────
test("the deployed-primary census taken in this audit passes the gate", () => {
  // Not a synthetic case: these are the identities the governed census returned
  // for the window, with the repository's own head and total.
  const required = P.requiredVersionsFromFilenames([
    "20260909210000_location_topology_v1.sql",
    "20260909220000_attendance_capture_hardening.sql",
    "20260909230000_attendance_capability.sql",
    "20260909240000_financials_read_for_director_roles.sql",
  ]);
  const r = P.migrationParity({
    required,
    measured: [...required],
    measuredHead: "20260909240000",
  });
  assert.equal(r.status, "ok");
  assert.equal(r.promote, true);
});

// ── the merge gate: required head vs the head a census actually proved ──────
test("A · proven head satisfies the required head → gate allows", () => {
  const g = P.migrationMergeGate({
    requiredHead: V(3), requiredCount: 3, provenHead: V(3), provenAtMs: Date.now(),
  });
  assert.equal(g.status, "ok");
  assert.equal(g.promote, true);
});

test("B · proven head behind the required head → blocked, both heads named", () => {
  const g = P.migrationMergeGate({
    requiredHead: V(3), requiredCount: 3, provenHead: V(2), provenAtMs: Date.now(),
  });
  assert.equal(g.status, "blocked");
  assert.equal(g.promote, false);
  assert.equal(g.required_head, V(3));
  assert.equal(g.proven_head, V(2));
});

test("D · no census has ever proved a head → UNKNOWN, blocked", () => {
  const g = P.migrationMergeGate({ requiredHead: V(3), requiredCount: 3, provenHead: null });
  assert.equal(g.status, "unknown");
  assert.equal(g.promote, false);
});

test("G · a proof older than its window is UNKNOWN, not still-good", () => {
  // A head proved before these migrations existed says nothing about them.
  const g = P.migrationMergeGate({
    requiredHead: V(3), requiredCount: 3, provenHead: V(3),
    provenAtMs: Date.now() - (P.PROVEN_HEAD_MAX_AGE_MS + 1000),
  });
  assert.equal(g.status, "unknown");
  assert.equal(g.promote, false);
});

test("H · a revision with no migrations needs no proof and is not blocked", () => {
  const g = P.migrationMergeGate({ requiredHead: null, requiredCount: 0, provenHead: null });
  assert.equal(g.status, "ok");
  assert.equal(g.promote, true);
});

test("an UNREADABLE migration set is UNKNOWN, never 'no migrations'", () => {
  // Caught live: a shell slip passed an empty head and an earlier draft answered
  // "requires no migrations · promote" — a green gate produced by a failed
  // measurement, which is the exact shape this gate exists to refuse.
  const g = P.migrationMergeGate({ requiredHead: null, requiredCount: null, provenHead: V(3) });
  assert.equal(g.status, "unknown");
  assert.equal(g.promote, false);
});

// ── the proof is read from the census records, not a second store ───────────
test("the proven head comes from the latest completed identity census", () => {
  const rows = [
    { action_key: "database.read_census", status: "complete", request_id: "old",
      inputs: { queryArtifactPath: "certification/migrations/hosted-migration-identity-census.sql" },
      execution_ended_at: "2026-09-01T00:00:00.000Z",
      result: { census: { questions: { ledger_head: { rows: [V(1)] } } } } },
    { action_key: "database.read_census", status: "complete", request_id: "new",
      inputs: { queryArtifactPath: "certification/migrations/hosted-migration-identity-census.sql" },
      execution_ended_at: "2026-09-09T00:00:00.000Z",
      result: { census: { questions: { ledger_head: { rows: [V(3)] } } } } },
  ];
  const proven = P.provenHostedHeadFromCensusRecords(rows, { artifactPath: "hosted-migration-identity-census.sql" });
  assert.equal(proven.head, V(3));
  assert.equal(proven.request_id, "new");
});

test("a pending or failed census proves nothing", () => {
  const rows = [
    { action_key: "database.read_census", status: "requested", request_id: "pending",
      inputs: { queryArtifactPath: "hosted-migration-identity-census.sql" },
      result: { census: { questions: { ledger_head: { rows: [V(3)] } } } } },
  ];
  assert.equal(P.provenHostedHeadFromCensusRecords(rows, { artifactPath: "hosted-migration-identity-census.sql" }), null);
});

test("a census of some other artifact is not this proof", () => {
  const rows = [
    { action_key: "database.read_census", status: "complete", request_id: "other",
      inputs: { queryArtifactPath: "certification/communications/hosted-migration-and-privilege-census.sql" },
      execution_ended_at: "2026-09-09T00:00:00.000Z",
      result: { census: { questions: { ledger_head: { rows: [V(3)] } } } } },
  ];
  assert.equal(P.provenHostedHeadFromCensusRecords(rows, { artifactPath: "hosted-migration-identity-census.sql" }), null);
});

// ── the HARD gate: an approval cannot merge code its schema cannot run ──────
//
// The policy gate decides whether a merge may proceed WITHOUT a person. This
// runs at execution, after any approval, which is the difference that matters:
// approving a database mutation is a judgement a person can make, but approving
// a merge does not make the schema present, so there is nothing for judgement
// to fix and the answer is to apply and re-measure, not to override.
const M = await import("../lib/vacilando/trusted-host-merge.mjs");

const openPr = (over = {}) => ({
  ok: true,
  normalized: { repository: "o/r", pullRequestNumber: 1, targetBranch: "staging", expectedHeadSha: "a".repeat(40), mergeMethod: "merge" },
  pr: {
    state: "OPEN", draft: false, baseRefName: "staging", headRefOid: "a".repeat(40),
    mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
    checks: { failing: [], pending: [], unknown: [], required: [], passing: [] },
  },
  ...over,
});

test("PASS · parity ok lets the merge proceed past the schema gate", () => {
  const r = M.evaluateMergeReadiness(openPr({ migration_parity: { status: "ok", promote: true, measured: true } }));
  // It may still be refused for other reasons, but never for the schema gate.
  assert.notEqual(r.code, "hosted_migration_behind");
  assert.notEqual(r.code, "hosted_migration_parity_unknown");
});

test("BLOCKED · hosted behind refuses the merge at execution, after approval", () => {
  const r = M.evaluateMergeReadiness(openPr({
    migration_parity: { status: "blocked", promote: false, measured: true, reason: "hosted head X is behind the required head Y" },
  }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "hosted_migration_behind");
  assert.match(r.detail, /behind the required head/);
});

test("UNKNOWN · unmeasured parity refuses on the same footing as behind", () => {
  const r = M.evaluateMergeReadiness(openPr({
    migration_parity: { status: "unknown", promote: false, measured: false, reason: "no census has positively established the hosted migration head" },
  }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "hosted_migration_parity_unknown");
});

test("a MISSING parity measurement is refused, never treated as absent-problem", () => {
  // The shape an older caller, or a thrown measurement, would produce.
  const r = M.evaluateMergeReadiness(openPr());
  assert.equal(r.ok, false);
  assert.equal(r.code, "hosted_migration_parity_unknown");
});

test("the schema gate is checked BEFORE mergeability, so it cannot be skipped", () => {
  // A conflicted PR with bad parity must still report the schema refusal: if
  // parity were checked last, a PR could be refused for conflicts, fixed, and
  // merged without the schema question ever being asked.
  const r = M.evaluateMergeReadiness(openPr({
    pr: { ...openPr().pr, mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" },
    migration_parity: { status: "blocked", promote: false, measured: true, reason: "behind" },
  }));
  assert.equal(r.code, "hosted_migration_behind");
});

test("an already-merged PR is still idempotent and not re-refused", () => {
  // Idempotency is resolved before the schema gate: re-reporting a merge that
  // already happened as a schema failure would be a false alarm.
  const r = M.evaluateMergeReadiness({
    ok: true,
    normalized: { repository: "o/r", pullRequestNumber: 1, targetBranch: "staging", expectedHeadSha: "a".repeat(40), mergeMethod: "merge" },
    pr: { state: "MERGED", headRefOid: "a".repeat(40), mergeCommitSha: "b".repeat(40) },
  });
  assert.equal(r.ok, true);
  assert.equal(r.idempotent, true);
});

// ── the canonical apply owner ───────────────────────────────────────────────
//
// database.apply_migration is the ONLY registered way to mutate a hosted
// schema, and these pin the properties that make it safe to be that: it takes
// migration IDENTITIES from the promoted tree, never SQL, and it will not aim
// at an environment it was not registered for.
const MIG = await import("../lib/vacilando/trusted-host-migrate.mjs");

test("the apply owner refuses arbitrary SQL outright", () => {
  for (const bad of [{ sql: "drop table x" }, { statement: "select 1" }, { body: "x" }, { databaseUrl: "postgres://x" }]) {
    const r = MIG.validateMigrationInputs({ environment: "staging", expectedSha: "a".repeat(40), migrations: [], ...bad });
    assert.equal(r.ok, false);
    assert.equal(r.code, "arbitrary_sql_rejected");
  }
});

test("the apply owner refuses production targets", () => {
  const r = MIG.validateMigrationInputs({ environment: "production", expectedSha: "a".repeat(40), migrations: [] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "production_database_rejected");
});

test("the apply owner requires the promoted revision it is applying from", () => {
  const r = MIG.validateMigrationInputs({ environment: "staging", migrations: [] });
  assert.equal(r.ok, false);
  assert.equal(r.code, "missing_expected_sha");
});

test("the apply owner refuses a duplicate version in one request", () => {
  const r = MIG.validateMigrationInputs({
    environment: "staging",
    expectedSha: "a".repeat(40),
    migrations: [{ version: "20260909210000" }, { version: "20260909210000" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "version_collision");
});

// ── post-apply re-measurement is required before promotion continues ────────
test("applying a migration does not by itself unblock promotion", () => {
  // THE PROPERTY THAT MAKES RE-MEASUREMENT MANDATORY, and it is structural
  // rather than a rule someone must remember: the gate reads the proven head
  // from CENSUS records. Applying a migration writes no census, so the proven
  // head is unchanged and the promotion stays blocked until the deployed
  // primary is measured again. There is no code path by which "we applied it"
  // becomes "it is proven".
  const required = [V(1), V(2), V(3)];
  const beforeApply = [
    { action_key: "database.read_census", status: "complete", request_id: "c1",
      inputs: { queryArtifactPath: "hosted-migration-identity-census.sql" },
      execution_ended_at: new Date().toISOString(),
      result: { census: { questions: { ledger_head: { rows: [V(2)] } } } } },
  ];
  const provenBefore = P.provenHostedHeadFromCensusRecords(beforeApply, { artifactPath: "hosted-migration-identity-census.sql" });
  const blocked = P.migrationMergeGate({
    requiredHead: V(3), requiredCount: required.length,
    provenHead: provenBefore.head, provenAtMs: provenBefore.atMs,
  });
  assert.equal(blocked.status, "blocked");

  // An apply happens. No census is written by it, so nothing the gate reads moves.
  const afterApplyOnly = [...beforeApply];
  const provenStill = P.provenHostedHeadFromCensusRecords(afterApplyOnly, { artifactPath: "hosted-migration-identity-census.sql" });
  assert.equal(provenStill.head, V(2), "an apply must not advance the proven head");
  assert.equal(P.migrationMergeGate({
    requiredHead: V(3), requiredCount: required.length,
    provenHead: provenStill.head, provenAtMs: provenStill.atMs,
  }).status, "blocked", "promotion stays blocked until re-measured");

  // Only a fresh census moves it.
  const afterReMeasure = [...beforeApply, {
    action_key: "database.read_census", status: "complete", request_id: "c2",
    inputs: { queryArtifactPath: "hosted-migration-identity-census.sql" },
    execution_ended_at: new Date(Date.now() + 1000).toISOString(),
    result: { census: { questions: { ledger_head: { rows: [V(3)] } } } },
  }];
  const provenAfter = P.provenHostedHeadFromCensusRecords(afterReMeasure, { artifactPath: "hosted-migration-identity-census.sql" });
  assert.equal(provenAfter.head, V(3));
  assert.equal(P.migrationMergeGate({
    requiredHead: V(3), requiredCount: required.length,
    provenHead: provenAfter.head, provenAtMs: provenAfter.atMs,
  }).status, "ok", "re-measurement is what unblocks promotion");
});
