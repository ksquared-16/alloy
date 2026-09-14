#!/usr/bin/env node
/**
 * THE FIXTURE MUST WORK ON THE TENANT IT IS GIVEN, AND FAIL WITHOUT A TRACE.
 *
 * A read-only census of deployed staging proved three things at once, before
 * anything mutated:
 *
 *   - the organization the fixture assigned to ITSELF is not one of that
 *     database's three, so `customers_org_id_fkey` refused the first insert;
 *   - neither campus `location` it named exists there, and
 *     `child_enrollment_agreements.site_location_id` is NOT NULL REFERENCES
 *     locations(id), so the agreements could not have been written either;
 *   - `psql -f` is autocommit, so under the other reading of psql's variable
 *     precedence the four earlier inserts would have COMMITTED into a tenant
 *     holding 59 charges and 128 journal entries before the fifth refused.
 *
 * None of that is visible from the fixture alone, which is why it survived
 * review: every line of it is correct for the local cert stack it was written
 * against. These cases are the part that does not depend on knowing that.
 *
 * MEASURED ON EXECUTABLE TEXT ONLY. The fixture explains the defect it used to
 * have, and a contract that read prose would force that explanation out of the
 * file to stay green.
 */
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditHostedFixturePortability, readHostedFixture, executableText,
  organizationAssignments, organizationGuarded, foreignUuids,
  locationResolution, preconditions, transactionBoundary,
  HOSTED_FIXTURE_PATH, FIXTURE_UUID_PREFIX,
} from "../lib/vacilando/hosted-fixture-portability.mjs";
import { auditHostedFixture } from "../lib/vacilando/hosted-fixture-safety.mjs";

// Resolved from this file: Tier 2 runs from scripts/local-dev/tests and the
// prebuild gate runs from the repo root. A gate that silently skips in one of
// them is worse than no gate at all.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = readHostedFixture(ROOT);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** A planted defect that did not plant proves nothing. */
function plant(mutated, why) {
  assert.notEqual(mutated, SQL, `the mutation must actually change the fixture: ${why}`);
  return mutated;
}

/* ── PORTABILITY ──────────────────────────────────────────────────────────── */

test("1 — the fixture carries no organization authority of its own", () => {
  assert.deepEqual(organizationAssignments(SQL), [],
    "a \\set of org overrides the -v the governed runner passed");
  assert.ok(!/00000000-0000-4000-8000-000000000001/i.test(executableText(SQL)),
    "the local cert tenant must not appear in executable text");
});

test("2 — it does not redefine the runner-supplied organization", () => {
  // The precedence that made this invisible: psql applies -v at startup and
  // reads the file afterwards, so a later \set silently wins.
  assert.ok(!/^[ \t]*\\set[ \t]+org\b/im.test(executableText(SQL)));
});

test("3 — the organization comes from governed context, and its absence refuses", () => {
  assert.ok(organizationGuarded(SQL), "an absent org must refuse, not default");
  assert.ok(/:'org'/.test(executableText(SQL)), "and the fixture must actually consume it");
});

test("4 — enrollment locations are resolved from the target organization", () => {
  const loc = locationResolution(SQL);
  assert.ok(loc.lookup_present, "no site lookup at all");
  assert.ok(loc.organization_scoped, "the lookup is not scoped to :'org'");
  assert.ok(loc.captured_deterministically, "sites must be captured by a total, immutable ordering");
  assert.ok(loc.agreements_consume_resolved, "the agreements do not consume the resolved sites");
});

test("5 — no certification-stack location uuids remain", () => {
  assert.deepEqual(foreignUuids(SQL), [],
    "every uuid in executable text must be the fixture's own namespace");
  assert.deepEqual(locationResolution(SQL).agreement_literal_uuids, []);
  assert.ok(FIXTURE_UUID_PREFIX === "fd000000-");
});

test("6 — a tenant that cannot supply the fixture's shape fails before mutation", () => {
  const pre = preconditions(SQL);
  assert.ok(pre.organization_probe, "the organization is not probed");
  assert.ok(pre.site_sufficiency_probe, "two sites are not required before writing");
  assert.ok(pre.before_any_mutation, "a check after the first DELETE is not a precondition");
});

/* ── ATOMICITY ────────────────────────────────────────────────────────────── */

test("7 — the fixture executes as one transaction", () => {
  const tx = transactionBoundary(SQL);
  assert.equal(tx.begin_count, 1);
  assert.equal(tx.commit_count, 1);
  assert.ok(tx.encloses_teardown, "the transaction opens after the first DELETE");
  assert.ok(tx.encloses_declaration, "the transaction closes before the last INSERT");
  assert.ok(tx.suspension_is_transaction_local,
    "SET LOCAL is the only form a rolled-back transaction cannot outlive");
});

test("8 — a failure cannot leave partial fixture state", () => {
  assert.ok(auditHostedFixturePortability(SQL).atomic);
  // The guarantee is structural: everything the fixture destroys and everything
  // it declares sits between the two boundaries.
  const t = executableText(SQL);
  const begin = t.search(/^[ \t]*begin\s*;/im);
  const commit = t.search(/^[ \t]*commit\s*;/im);
  for (const m of t.matchAll(/^[ \t]*(delete\s+from|insert\s+into)\b/gim)) {
    assert.ok(m.index > begin && m.index < commit, `a write sits outside the transaction: ${m[0].trim()}`);
  }
});

/* ── WHAT MUST NOT HAVE MOVED ─────────────────────────────────────────────── */

test("9 — the 26/26 destructive-scope contract is untouched", () => {
  const a = auditHostedFixture(SQL);
  assert.equal(a.total_deletes, 26);
  assert.equal(a.fixture_scoped, 26);
  assert.deepEqual(a.org_wide, []);
});

test("10 — the replica window is still DELETE-only and fixture-scoped", () => {
  const a = auditHostedFixture(SQL);
  assert.ok(a.replica_window_present, "the window must still be recognised after SET LOCAL");
  assert.equal(a.replica_window_statements, 26);
  assert.deepEqual(a.replica_window_non_delete, []);
  assert.ok(a.subsidy.every((s) => s.present && s.scoped && s.mentions_column));
});

/* ── MUTATION PROOFS: each defect, put back ───────────────────────────────── */

test("11 — reintroducing a local \\set org is RED", () => {
  const mutated = plant(
    SQL.replace(/^(\\if :\{\?org\})/im, "\\set org '00000000-0000-4000-8000-000000000001'\n$1"),
    "\\set org",
  );
  const a = auditHostedFixturePortability(mutated);
  assert.equal(a.portable, false);
  assert.notDeepEqual(a.organization_assignments, []);
  assert.notDeepEqual(a.foreign_uuids, []);
});

test("12 — reintroducing a hard-coded location uuid is RED", () => {
  const mutated = plant(
    SQL.replace(":'site_1'::uuid", "'00000000-0000-4000-8000-000000000010'::uuid"),
    "hard-coded site",
  );
  const a = auditHostedFixturePortability(mutated);
  assert.equal(a.portable, false);
  assert.notDeepEqual(a.foreign_uuids, []);
  assert.notDeepEqual(a.location.agreement_literal_uuids, []);
});

test("13 — removing the transaction boundary is RED", () => {
  const mutated = plant(SQL.replace(/^[ \t]*begin\s*;\s*$/im, ""), "begin;");
  const a = auditHostedFixturePortability(mutated);
  assert.equal(a.atomic, false);
  assert.equal(a.transaction.begin_count, 0);
});

test("14 — dropping COMMIT, or moving it before the last write, is RED", () => {
  const dropped = plant(SQL.replace(/^[ \t]*commit\s*;\s*$/im, ""), "commit;");
  assert.equal(auditHostedFixturePortability(dropped).atomic, false);
  const early = plant(
    SQL.replace(/^[ \t]*(set local session_replication_role = origin;)/im, "commit;\n$1"),
    "early commit",
  );
  assert.equal(transactionBoundary(early).commit_count, 2);
  assert.equal(auditHostedFixturePortability(early).atomic, false);
});

test("15 — reverting SET LOCAL to a session-wide SET is RED", () => {
  const mutated = plant(
    SQL.replace(/^[ \t]*set local (session_replication_role = replica;)/im, "set $1"),
    "session-wide SET",
  );
  assert.equal(auditHostedFixturePortability(mutated).atomic, false);
  assert.equal(transactionBoundary(mutated).suspension_is_transaction_local, false);
});

test("16 — un-scoping the site lookup from the organization is RED", () => {
  const mutated = plant(
    SQL.replace(/where l\.org_id = :'org'::uuid and l\.location_type/gi, "where l.location_type"),
    "unscoped lookup",
  );
  const a = auditHostedFixturePortability(mutated);
  assert.equal(a.portable, false);
  assert.equal(a.location.organization_scoped, false);
});

test("17 — the frozen path is the one audited", () => {
  assert.equal(HOSTED_FIXTURE_PATH, "certification/fixtures/financials-demo-tenant.sql");
  assert.ok(SQL.includes("child_enrollment_agreements"), "the audited file is the fixture itself");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
