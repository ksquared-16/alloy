#!/usr/bin/env node
/**
 * REGISTERING A MIGRATION THAT IS ALREADY THERE — AND REFUSING EVERYTHING ELSE.
 *
 * This capability writes the sentence "this migration ran" into the canonical
 * ledger. It must never be the thing that makes that sentence true, so nearly
 * all of these controls are refusals: the value of the action is what it will
 * not do.
 */
import test from "node:test";
import assert from "node:assert/strict";

const L = await import("../lib/vacilando/trusted-host-ledger-repair.mjs");

const V1 = "20260909250000", V2 = "20260909260000", V3 = "20260909270000";
const mig = (v, name, text = "-- sql\nselect 1;\n") => ({
  version: v, path: `supabase/migrations/${v}_${name}.sql`, fileSha: "f".repeat(64), text,
});
const MIGS = [
  mig(V1, "provider_initiated_reversal"),
  mig(V2, "merchant_rail_readiness"),
  mig(V3, "collection_attempt_action_type"),
];
const base = (over = {}) => ({
  normalized: { target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: MIGS },
  parity: { status: "blocked", missing: [V1, V2, V3] },
  physical: {
    [V1]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 },
    [V2]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 },
    [V3]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 },
  },
  ledgerHead: "20260909240000", ledgerCount: 393,
  expectedHead: "20260909240000", expectedCount: 393,
  expectedPostHead: V3, expectedPostCount: 396,
  ...over,
});

await test("LR1 — the canonical name is the filename without version or suffix", () => {
  // Measured from the five rows adjacent to this repair.
  assert.equal(L.canonicalLedgerName("supabase/migrations/20260909200000_payment_provider_refunds.sql"),
    "payment_provider_refunds");
  assert.equal(L.canonicalLedgerName("20260909240000_financials_read_for_director_roles.sql"),
    "financials_read_for_director_roles");
  assert.equal(L.canonicalLedgerName("supabase/migrations/not-a-migration.sql"), null);
});

await test("LR2 — the happy path is accepted, so the refusals below mean something", () => {
  const r = L.assertLedgerRepairPreconditions(base());
  assert.equal(r.ok, true, r.detail);
  assert.deepEqual(r.versions, [V1, V2, V3]);
  assert.equal(r.target, "alloy_deployed_primary");
});

await test("LR3 — only a registered production target may be reconciled", () => {
  for (const t of ["staging", "certification", "alloy_production", ""]) {
    const r = L.assertLedgerRepairPreconditions(base({
      normalized: { target: t, expectedSha: "a".repeat(40), migrations: MIGS },
    }));
    assert.equal(r.ok, false, `${t} was accepted`);
    assert.equal(r.code, "target_not_registered_for_ledger_repair");
  }
});

await test("LR4 — a version outside the measured parity gap is refused", () => {
  // THE RULE THAT STOPS THIS BECOMING HISTORY FORGERY. Only a version the hosted
  // measurement itself reports missing may be registered.
  const r = L.assertLedgerRepairPreconditions(base({ parity: { status: "blocked", missing: [V1, V2] } }));
  assert.equal(r.code, "version_not_in_measured_gap");
  assert.match(r.detail, new RegExp(V3));

  // And a gap this repair does not fully cover is refused too: registering three
  // while a fourth is missing leaves a ledger that still is not the truth.
  const extra = L.assertLedgerRepairPreconditions(base({
    parity: { status: "blocked", missing: [V1, V2, V3, "20260909280000"] },
  }));
  assert.equal(extra.code, "unexpected_missing_version");
});

await test("LR5 — parity that is not BEHIND refuses outright", () => {
  for (const status of ["ok", "unknown", undefined]) {
    const r = L.assertLedgerRepairPreconditions(base({ parity: status ? { status, missing: [] } : null }));
    assert.equal(r.ok, false);
    assert.equal(r.code, "parity_not_behind");
  }
});

await test("LR6 — a version without full physical proof is refused", () => {
  const absent = L.assertLedgerRepairPreconditions(base({
    physical: { [V1]: { classification: "PHYSICALLY_ABSENT", mismatches: 0 },
                [V2]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 },
                [V3]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 } },
  }));
  assert.equal(absent.code, "physical_state_not_present");

  const partial = L.assertLedgerRepairPreconditions(base({
    physical: { [V1]: { classification: "PARTIALLY_PRESENT", mismatches: 2 },
                [V2]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 },
                [V3]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 } },
  }));
  assert.equal(partial.code, "physical_state_not_present");

  // Present but not MATCHING is still refused: existence is not equivalence.
  const mismatched = L.assertLedgerRepairPreconditions(base({
    physical: { [V1]: { classification: "PHYSICALLY_PRESENT", mismatches: 1 },
                [V2]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 },
                [V3]: { classification: "PHYSICALLY_PRESENT", mismatches: 0 } },
  }));
  assert.equal(mismatched.code, "physical_definition_mismatch");

  const none = L.assertLedgerRepairPreconditions(base({ physical: null }));
  assert.equal(none.code, "missing_physical_state_proof");
});

await test("LR7 — a moved ledger refuses; the approval was for a state", () => {
  assert.equal(L.assertLedgerRepairPreconditions(base({ ledgerHead: "20260909250000" })).code, "ledger_head_changed");
  assert.equal(L.assertLedgerRepairPreconditions(base({ ledgerCount: 394 })).code, "ledger_count_changed");
});

await test("LR8 — order, duplicates and source identity", () => {
  const rev = [MIGS[2], MIGS[1], MIGS[0]];
  assert.equal(L.assertLedgerRepairPreconditions(base({
    normalized: { target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: rev },
  })).code, "nondeterministic_version_order");

  assert.equal(L.assertLedgerRepairPreconditions(base({
    normalized: { target: "alloy_deployed_primary", expectedSha: "abc", migrations: MIGS },
  })).code, "missing_exact_source_sha");

  const unresolved = MIGS.map((m, i) => (i === 0 ? { ...m, text: null } : m));
  assert.equal(L.assertLedgerRepairPreconditions(base({
    normalized: { target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: unresolved },
  })).code, "migration_not_in_approved_source");
});

await test("LR9 — the promised post-state must be arithmetically honest", () => {
  assert.equal(L.assertLedgerRepairPreconditions(base({ expectedPostCount: 400 })).code, "post_state_inconsistent");
  assert.equal(L.assertLedgerRepairPreconditions(base({ expectedPostHead: "20260909990000" })).code, "post_state_inconsistent");
});

await test("LR10 — the generated SQL checks, writes, re-checks, then commits", () => {
  const out = L.buildLedgerRepairSql({
    migrations: MIGS, expectedHead: "20260909240000", expectedCount: 393,
    expectedPostHead: V3, expectedPostCount: 396,
  });
  assert.equal(out.ok, true);
  const sql = out.sql;

  // Atomic, and the guards are INSIDE the transaction so another writer's row
  // aborts the repair rather than being papered over.
  assert.ok(sql.indexOf("BEGIN;") < sql.indexOf("$vacpre$"), "pre-check inside the transaction");
  assert.ok(sql.indexOf("$vacpre$") < sql.indexOf("INSERT INTO"), "checks precede the write");
  assert.ok(sql.indexOf("INSERT INTO") < sql.indexOf("$vacpost$"), "post-check follows the write");
  assert.ok(sql.indexOf("$vacpost$") < sql.lastIndexOf("COMMIT;"), "and precedes the commit");

  // Fail-closed pre-state, including a version that appeared since approval.
  assert.match(sql, /ledger_count_changed/);
  assert.match(sql, /ledger_head_changed/);
  assert.match(sql, /version_already_registered/);
  assert.match(sql, /post_count_mismatch/);
  assert.match(sql, /post_head_mismatch/);

  // It writes ONLY the ledger, and creates nothing.
  assert.equal((sql.match(/INSERT INTO/g) || []).length, 1);
  assert.match(sql, /INSERT INTO supabase_migrations\.schema_migrations \(version, name, statements\)/);
  assert.equal(/CREATE |ALTER |DROP |TRUNCATE |DELETE |UPDATE /i.test(sql), false,
    "a ledger repair performs no DDL and mutates no application row");

  // Canonical row shape, derived from the artifact rather than supplied.
  assert.match(sql, /\('20260909250000', 'provider_initiated_reversal', ARRAY\[/);
  assert.match(sql, /\('20260909270000', 'collection_attempt_action_type', ARRAY\[/);
});

await test("LR11 — a body containing the quoting tag cannot end the literal early", () => {
  // The tag is random and re-rolled; this proves the generator does not emit a
  // literal that a crafted or unlucky migration body could terminate.
  const out = L.buildLedgerRepairSql({
    migrations: [mig(V1, "x", "select $vac_dead$ oops $vac_dead$;")],
    expectedHead: "20260909240000", expectedCount: 393, expectedPostHead: V1, expectedPostCount: 394,
  });
  assert.equal(out.ok, true);
  const tag = /ARRAY\[\$(vac_[0-9a-f]+)\$/.exec(out.sql)?.[1];
  assert.ok(tag, "a tag is emitted");
  assert.equal(out.sql.split(`$${tag}$`).length, 3, "the tag appears exactly twice: open and close");
});

// ── evidence comes from the census, and only from the census ────────────────

const censusOf = (over = {}) => ({ questions: {
  ledger_head: { rows: ["20260909240000"] },
  ledger_total: { rows: ["393"] },
  ledger_version: { rows: [
    `${V1} ~ registered ~ absent ~ false`,
    `${V2} ~ registered ~ absent ~ false`,
    `${V3} ~ registered ~ absent ~ false`] },
  m250000: { rows: ["t ~ e ~ o ~ true", "u ~ e ~ o ~ true"] },
  m260000: { rows: ["v ~ e ~ o ~ true"] },
  m270000: { rows: ["w ~ e ~ o ~ true"] },
  ...over,
}});

await test("LR12 — the census supplies ledger truth, gap and physical state together", () => {
  // ONE census on purpose: a repair authorised against a state must execute
  // against the same state, and two censuses minutes apart are two states.
  const ev = L.ledgerRepairEvidenceFromCensus(censusOf(), { versions: [V1, V2, V3] });
  assert.equal(ev.ok, true);
  assert.equal(ev.ledgerHead, "20260909240000");
  assert.equal(ev.ledgerCount, 393);
  assert.equal(ev.parity.status, "blocked");
  assert.deepEqual(ev.parity.missing, [V1, V2, V3]);
  for (const v of [V1, V2, V3]) assert.equal(ev.physical[v].classification, "PHYSICALLY_PRESENT");

  // End to end: this evidence satisfies the preconditions.
  const pre = L.assertLedgerRepairPreconditions({
    normalized: { target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: MIGS },
    parity: ev.parity, physical: ev.physical,
    ledgerHead: ev.ledgerHead, ledgerCount: ev.ledgerCount,
    expectedHead: "20260909240000", expectedCount: 393,
    expectedPostHead: V3, expectedPostCount: 396,
  });
  assert.equal(pre.ok, true, pre.detail);
});

await test("LR13 — a single unmatched physical row makes the version partial, and refuses", () => {
  const ev = L.ledgerRepairEvidenceFromCensus(
    censusOf({ m260000: { rows: ["v ~ text ~ absent ~ false"] } }), { versions: [V1, V2, V3] });
  assert.equal(ev.physical[V2].classification, "PARTIALLY_PRESENT");
  assert.equal(ev.physical[V2].mismatches, 1);

  const pre = L.assertLedgerRepairPreconditions({
    normalized: { target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: MIGS },
    parity: ev.parity, physical: ev.physical,
    ledgerHead: ev.ledgerHead, ledgerCount: ev.ledgerCount,
    expectedHead: "20260909240000", expectedCount: 393,
    expectedPostHead: V3, expectedPostCount: 396,
  });
  assert.equal(pre.ok, false);
  assert.equal(pre.code, "physical_state_not_present");
});

await test("LR14 — a version with no physical rows is absent, never assumed", () => {
  const ev = L.ledgerRepairEvidenceFromCensus(censusOf({ m270000: { rows: [] } }), { versions: [V1, V2, V3] });
  assert.equal(ev.physical[V3].classification, "PHYSICALLY_ABSENT");
  assert.equal(ev.physical[V3].checks, 0);
});

await test("LR15 — a census without ledger truth is refused rather than half-read", () => {
  const ev = L.ledgerRepairEvidenceFromCensus({ questions: { m250000: { rows: ["a ~ b ~ c ~ true"] } } }, { versions: [V1] });
  assert.equal(ev.ok, false);
  assert.equal(ev.code, "census_missing_ledger_truth");
});

await test("LR16 — a ledger already carrying a version reports no gap, and the repair refuses", () => {
  const ev = L.ledgerRepairEvidenceFromCensus(censusOf({
    ledger_version: { rows: [
      `${V1} ~ registered ~ registered ~ true`,
      `${V2} ~ registered ~ absent ~ false`,
      `${V3} ~ registered ~ absent ~ false`] },
  }), { versions: [V1, V2, V3] });
  assert.deepEqual(ev.parity.missing, [V2, V3]);
  const pre = L.assertLedgerRepairPreconditions({
    normalized: { target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: MIGS },
    parity: ev.parity, physical: ev.physical,
    ledgerHead: ev.ledgerHead, ledgerCount: ev.ledgerCount,
    expectedHead: "20260909240000", expectedCount: 393,
    expectedPostHead: V3, expectedPostCount: 396,
  });
  assert.equal(pre.code, "version_not_in_measured_gap",
    "a version already registered must not be registered again");
});

await test("LR17 — the validator hands the core its candidate authority", () => {
  // THE FIRST REAL ATTEMPT DIED HERE. gar_da28033efa52d1 was refused
  // `source_sha_not_reachable`: these migrations live on a governed promotion
  // candidate that has not merged — which is precisely why their versions are
  // absent from staging — and without candidateProof the core falls back to
  // plain staging-ancestry. An approval was spent on a request that could not
  // resolve its own source.
  let seen = null;
  const core = (inputs, opts) => { seen = opts; return { ok: false, code: "stop_after_capture" }; };
  L.validateLedgerRepairInputs({
    target: "alloy_deployed_primary",
    expectedSha: "a".repeat(40),
    migrations: MIGS,
    expectedLedger: { head: "20260909240000", count: 393, postHead: V3, postCount: 396 },
  }, { core, promotionRequests: [] });

  assert.ok(seen, "the core must be called");
  assert.equal(typeof seen.candidateProof, "function",
    "a governed pre-merge candidate cannot be resolved without it");
  assert.equal(seen.actionType, "database.repair_migration_ledger");
  assert.equal(seen.environment, "alloy_deployed_primary");
});

await test("LR18 — the approved ledger state is required, not optional", () => {
  const core = () => ({ ok: true, normalized: { expectedSha: "a".repeat(40), migrations: MIGS } });
  for (const bad of [undefined, { head: "x" }, { head: "x", count: 1 }, { head: "x", count: 1, postHead: "y" }]) {
    const r = L.validateLedgerRepairInputs({
      target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: MIGS,
      ...(bad ? { expectedLedger: bad } : {}),
    }, { core });
    assert.equal(r.ok, false);
    assert.equal(r.code, "missing_expected_ledger_state",
      "the operator approves a STATE, not only a version list");
  }
});

await test("LR19 — SQL is never accepted, on any spelling", () => {
  const core = () => ({ ok: true, normalized: { expectedSha: "a".repeat(40), migrations: MIGS } });
  for (const key of ["sql", "statement", "body", "database_url", "databaseUrl"]) {
    const r = L.validateLedgerRepairInputs({
      target: "alloy_deployed_primary", expectedSha: "a".repeat(40), migrations: MIGS,
      expectedLedger: { head: "h", count: 1, postHead: "p", postCount: 2 },
      [key]: "insert into anything",
    }, { core });
    assert.equal(r.code, "arbitrary_sql_rejected", `${key} was accepted`);
  }
});

await test("LR20 — the approval card says NO SCHEMA CHANGES, and cannot be read as a migration", async () => {
  /*
   * The card is the operator's only protection against approving the wrong
   * thing, and without its own branch this action inherited the DEFAULT one:
   * "Authorize" over whatever title the filing happened to carry. The single
   * fact that decides this approval — that nothing is applied — was left to the
   * requester's prose. Its two production siblings each got their own words for
   * exactly this reason.
   */
  const G = await import("../lib/vacilando/governed-action-request.mjs");
  const req = {
    action_key: "database.repair_migration_ledger",
    target: "alloy_deployed_primary",
    inputs: {
      target: "alloy_deployed_primary",
      migrations: [{ version: "20260910120000" }, { version: "20260910130000" }],
      expectedLedger: { head: "20260909270000", count: 396, postHead: "20260910130000", postCount: 398 },
    },
  };
  const card = G.presentationForGovernedAction(req);
  const all = `${card.approve_label} ${card.wait_label} ${card.mission_need} ${card.detail}`;
  assert.match(all, /NO SCHEMA CHANGES/);
  assert.match(all, /LEDGER/i);
  // Both ends of the state the operator is approving, not just the versions.
  assert.match(all, /20260909270000/);
  assert.match(all, /396/);
  assert.match(all, /398/);
  // And it is not the apply card.
  const apply = G.presentationForGovernedAction({ ...req, action_key: "database.apply_promoted_migration" });
  assert.notEqual(card.approve_label, apply.approve_label);
  assert.notEqual(card.mission_need, apply.mission_need);
  // It must not have fallen through to the generic default.
  assert.notEqual(card.approve_label, "Authorize");
});
