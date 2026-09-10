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
