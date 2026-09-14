#!/usr/bin/env node
/**
 * THE HOSTED FIXTURE MAY ONLY DESTROY WHAT IT OWNS.
 *
 * `financials-demo-tenant.sql` was written for the shared LOCAL cert stack,
 * where the tenant is disposable. Six subsidy teardown statements were scoped
 * `where org_id = :'org'` — every claim, remittance, authorization and variance
 * in the tenant, whoever made them — run with `session_replication_role =
 * replica`, which suspends the triggers enforcing "posted childcare money
 * REFUSES delete".
 *
 * Once a governed action can point that at HOSTED staging, the local reasoning
 * stops applying. The predicates were narrowed to the fixture's own program and
 * agency; these cases are what stops them drifting back.
 *
 * Emptiness is explicitly not the argument. That those six tables hold no
 * unrelated rows today is not why this is safe — the predicates are, and they
 * have to keep holding once unrelated subsidy data exists.
 */
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditHostedFixture, readHostedFixture, destructiveStatements, isFixtureScoped,
  replicaWindow, SUBSIDY_OWNERSHIP, HOSTED_FIXTURE_PATH,
} from "../lib/vacilando/hosted-fixture-safety.mjs";

// Resolved from this file: Tier 2 runs from scripts/local-dev/tests, the
// prebuild gate runs from the repo root, and a gate that silently skips in one
// of them is worse than no gate at all.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = readHostedFixture(ROOT);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── B7: the destructive contract ─────────────────────────────────────────── */

test("1 — the destructive statement count is known and pinned", () => {
  const a = auditHostedFixture(SQL);
  assert.equal(a.total_deletes, 26,
    "a changed count means the teardown was edited; re-audit rather than re-pin");
});

test("2 — every DELETE is fixture-scoped", () => {
  const a = auditHostedFixture(SQL);
  assert.equal(a.fixture_scoped, a.total_deletes);
  assert.deepEqual(a.org_wide, [],
    `scoped only by organization: ${a.org_wide.join(", ")}`);
});

test("3 — no DELETE may be scoped by org_id alone", () => {
  for (const d of destructiveStatements(SQL)) {
    assert.ok(isFixtureScoped(d.text),
      `${d.table} is constrained only by organization: ${d.text.slice(0, 120)}`);
  }
});

test("4 — the six subsidy tables stay owned through the fixture's own ids", () => {
  const a = auditHostedFixture(SQL);
  for (const s of a.subsidy) {
    assert.ok(s.present, `${s.table} teardown disappeared`);
    assert.ok(s.scoped, `${s.table} is no longer fixture-scoped`);
    assert.ok(s.mentions_column,
      `${s.table} must be constrained through ${s.required_column}, the column the schema actually gives it`);
  }
  assert.equal(a.subsidy.length, Object.keys(SUBSIDY_OWNERSHIP).length);
});

test("5 — reverting any predicate to org-only fails this contract", () => {
  // The mutation proof. Each of the six, put back the way it was.
  for (const table of Object.keys(SUBSIDY_OWNERSHIP)) {
    const mutated = SQL.replace(
      new RegExp(`delete from ${table}[\\s\\S]*?;`, "i"),
      `delete from ${table} where org_id = :'org'::uuid;`,
    );
    assert.notEqual(mutated, SQL, `could not construct the mutation for ${table}`);
    const a = auditHostedFixture(mutated);
    assert.ok(a.org_wide.includes(table),
      `reverting ${table} to org-only was NOT caught — this contract would not hold`);
  }
});

/* ── B8: what may run while triggers are suspended ────────────────────────── */

test("6 — the replica window exists and is bounded", () => {
  const w = replicaWindow(SQL);
  assert.equal(w.ok, true, "replica mode must be opened and restored in the same file");
});

test("7 — only DELETE executes while replication triggers are suspended", () => {
  const a = auditHostedFixture(SQL);
  assert.deepEqual(a.replica_window_non_delete, [],
    `INSERT/UPDATE inside the suspended window: ${a.replica_window_non_delete.join(", ")}. `
    + "Replica mode exists so the fixture can remove its own previously-posted money; "
    + "writing while protections are off is a different and much larger claim.");
});

test("8 — and every statement in that window is fixture-owned", () => {
  const w = replicaWindow(SQL);
  for (const d of destructiveStatements(w.body)) {
    assert.ok(isFixtureScoped(d.text), `${d.table} deletes org-wide with triggers suspended`);
  }
});

test("9 — an INSERT smuggled into the window fails the contract", () => {
  /*
   * THE MUTATION IS ANCHORED TO THE FILE, NOT TO A SPELLING OF IT.
   *
   * This pinned the literal `set session_replication_role = replica;`. Making
   * the fixture atomic changed that line to `SET LOCAL`, the replace matched
   * nothing, and the "mutated" text was the original — so the case was
   * asserting that an unmutated fixture fails, which is a planted defect that
   * was never planted. It failed loudly here rather than passing for the wrong
   * reason, which is the only acceptable version of that mistake; the opener is
   * now taken from the file itself, and the mutation is proven to have landed
   * before anything is concluded from it.
   */
  const opener = SQL.match(/^[ \t]*set\s+(?:local\s+)?session_replication_role\s*=\s*replica\s*;/im);
  assert.ok(opener, "the fixture must open a replica window for this case to mean anything");
  const mutated = SQL.replace(
    opener[0],
    `${opener[0]}\ninsert into charges (id) values (:'agr_a'::uuid);`,
  );
  assert.notEqual(mutated, SQL, "the planted INSERT must actually be planted");
  assert.notDeepEqual(auditHostedFixture(mutated).replica_window_non_delete, []);
});

test("10 — the frozen path is the one audited", () => {
  assert.equal(HOSTED_FIXTURE_PATH, "certification/fixtures/financials-demo-tenant.sql");
  assert.ok(SQL.includes("session_replication_role"), "the audited file is the fixture itself");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
