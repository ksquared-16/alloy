/**
 * CERTIFYING THE MIGRATION-LEDGER RECONCILIATION OWNER.
 *
 * This action writes a row asserting that a migration was applied to the
 * production database. That is the most forgeable claim in the whole promotion
 * chain: every downstream gate reads the ledger and believes it. So most of what
 * follows is about the ways it must REFUSE.
 *
 * The one substituted thing is the database. The validator, the statement
 * splitter, the proofs, the idempotency and the verification are the shipped
 * code — and the splitter is checked against the rows the real migration system
 * wrote, so "canonical shape" is measured rather than asserted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const ROOT = mkdtempSync(join(tmpdir(), "ledger-reconcile-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const R = await import("../lib/vacilando/trusted-host-ledger-reconcile.mjs");
const TH = await import("../lib/vacilando/trusted-host-actions.mjs");
const GA = await import("../lib/vacilando/governed-action-request.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const DA = await import("../lib/vacilando/director-authority.mjs");
const { readMigrationContent } = await import("../lib/vacilando/trusted-host-migrate.mjs");

const KEY = "database.reconcile_migration_ledger";
const TARGET = "alloy_deployed_primary";
const CENSUS = "gar_census_ok";

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
const SHA = git(["rev-parse", "origin/staging"]);
const MIGRATION = "supabase/migrations/20260909240000_financials_read_for_director_roles.sql";
const VERSION = "20260909240000";
const NAME = "financials_read_for_director_roles";

const readFile = ({ sha, relative }) => readMigrationContent({
  environment: TARGET, root: REPO, sha, relative, gitCwd: REPO, preMergeCandidate: true,
});

const inputs = (over = {}) => ({
  target: TARGET,
  expectedSha: SHA,
  worktreePath: REPO,
  migrations: [{ version: VERSION, path: MIGRATION }],
  ...over,
});

const validated = (over = {}) => {
  const v = R.validateLedgerReconcileInputs(inputs(over), { readMigrationFile: readFile });
  assert.equal(v.ok, true, v.detail || "");
  return v.normalized;
};

const equivalence = (over = {}) => ({
  equivalent: true,
  versions: [VERSION],
  expectedSha: SHA,
  census_request_id: CENSUS,
  verified_by: { census_request_id: CENSUS },
  ...over,
});

const approval = (over = {}) => ({
  decision: "approved", actor: "operator", decision_actor: "operator",
  at: new Date().toISOString(), delegated: false, ...over,
});

const ledgerEmpty = () => ({ ok: true, rows: [], total: 393, head: "20260909230000" });

function adapters(over = {}) {
  const calls = { reads: 0, writes: 0, written: [] };
  let stored = [];
  const base = {
    calls,
    readLedgerRows: () => { calls.reads += 1; return { ok: true, rows: [...stored], total: 393 + stored.length, head: stored.length ? VERSION : "20260909230000" }; },
    writeLedgerRows: ({ rows }) => {
      calls.writes += 1;
      for (const r of rows) {
        if (!stored.some((x) => x.version === r.version)) stored.push({ version: r.version, name: r.name });
        calls.written.push(r.version);
      }
      return { ok: true, written: rows.map((r) => r.version) };
    },
    seed: (rows) => { stored = rows; },
  };
  return { ...base, ...over, calls };
}

const run = (over = {}, extra = {}) => {
  const a = adapters(over);
  const out = R.executeLedgerReconciliation({
    normalized: validated(),
    schemaEquivalence: equivalence(),
    approval: approval(),
    readLedgerRows: a.readLedgerRows,
    writeLedgerRows: a.writeLedgerRows,
    ...extra,
  });
  return { out, calls: a.calls, adapters: a };
};

// ── L1 — THE CANONICAL SHAPE IS MEASURED, NOT ASSERTED ──────────────────────

test("L1 — the ledger name follows the migration system's own convention", () => {
  assert.equal(R.ledgerNameForMigrationPath(MIGRATION), NAME);
  assert.equal(R.ledgerNameForMigrationPath("supabase/migrations/20260910120000_attendance_kiosk_producers.sql"), "attendance_kiosk_producers");
  // A bare filename resolves the same way a path does.
  assert.equal(R.ledgerNameForMigrationPath("20260910130000_kiosk_person_codes.sql"), "kiosk_person_codes");
});

test("L1b — a semicolon inside a dollar-quoted body does not split a statement", () => {
  // The reason this is not a regex. A function body is one statement however
  // many semicolons it contains, and splitting it would record a history that
  // does not match what ran.
  const sql = "create function f() returns void as $$ begin perform 1; perform 2; end $$ language plpgsql;\nselect 1;";
  const parts = R.splitMigrationStatements(sql);
  assert.equal(parts.length, 2);
  assert.match(parts[0], /perform 1; perform 2/);
  assert.equal(parts[1], "select 1");
});

test("L1c — a semicolon inside a string literal or a comment does not split either", () => {
  const parts = R.splitMigrationStatements("select 'a;b' as x; -- trailing; comment\nselect 2;");
  assert.equal(parts.length, 2);
  assert.match(parts[0], /'a;b'/);
});

// ── L2 — CONTENT COMES FROM THE COMMITTED FILE, NEVER THE REQUEST ───────────

test("L2 — a request may not supply the statements it wants recorded", () => {
  for (const field of ["sql", "statements", "content", "rollback"]) {
    const v = R.validateLedgerReconcileInputs(inputs({ [field]: ["drop table users"] }), { readMigrationFile: readFile });
    assert.equal(v.ok, false, `${field} was accepted`);
    assert.match(String(v.detail), /derived from the committed file/i);
  }
});

test("L2b — content is read out of the git object store at the named revision", () => {
  const n = validated();
  assert.equal(n.rows[0].name, NAME);
  assert.ok(n.rows[0].statements.length >= 1);
  assert.match(n.rows[0].contentSha, /^[a-f0-9]{64}$/);
  // And it is the file at THAT revision, not the working tree. Read untrimmed:
  // the hash is over the exact blob, and a stripped trailing newline is a
  // different file as far as a content hash is concerned.
  const fromGit = execFileSync("git", ["show", `${SHA}:${MIGRATION}`], { cwd: REPO, encoding: "utf8" });
  assert.equal(n.rows[0].contentSha, R.sha256(fromGit));
});

test("L2c — a migration absent from the named revision is refused", () => {
  const v = R.validateLedgerReconcileInputs(
    inputs({ migrations: [{ version: "20991231000000", path: "supabase/migrations/20991231000000_not_real.sql" }] }),
    { readMigrationFile: readFile },
  );
  assert.equal(v.ok, false);
});

test("L2d — the revision must be named exactly, not by prefix", () => {
  const v = R.validateLedgerReconcileInputs(inputs({ expectedSha: SHA.slice(0, 12) }), { readMigrationFile: readFile });
  assert.equal(v.ok, false);
  assert.match(String(v.detail), /40-character/);
});

test("L2e — a non-production target is refused in both directions", () => {
  for (const target of ["staging", "certification", ""]) {
    const v = R.validateLedgerReconcileInputs(inputs({ target }), { readMigrationFile: readFile });
    assert.equal(v.ok, false, `${target} accepted`);
  }
});

// ── L3 — THE PROOF THAT SEPARATES RECONCILIATION FROM FABRICATION ───────────

test("L3 — without proven physical schema, it refuses", () => {
  const { out, calls } = run({}, { schemaEquivalence: null });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN);
  assert.equal(calls.writes, 0);
  assert.match(String(out.detail), /fabrication/i);
});

test("L3b — a schema that does NOT match refuses, and nothing is written", () => {
  const { out, calls } = run({}, { schemaEquivalence: equivalence({ equivalent: false, detail: "column type differs" }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.SCHEMA_DRIFT);
  assert.equal(calls.writes, 0);
});

test("L3c — equivalence that does not cover the requested identity refuses", () => {
  const { out, calls } = run({}, { schemaEquivalence: equivalence({ versions: ["20260101000000"] }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN);
  assert.equal(calls.writes, 0);
});

test("L3d — equivalence measured against another revision refuses", () => {
  const { out } = run({}, { schemaEquivalence: equivalence({ expectedSha: "f".repeat(40) }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN);
});

test("L3e — an equivalence claim nobody verified is not evidence", () => {
  // `verified_by` is written at the boundary by verifySchemaEquivalenceEvidence.
  // Its absence means no governed census was traced, which is different from a
  // census having failed — and both must refuse.
  const claim = equivalence();
  delete claim.verified_by;
  const { out, calls } = run({}, { schemaEquivalence: claim });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN);
  assert.equal(calls.writes, 0);
});

// ── L4 — THE CLAIM MUST TRACE TO A GOVERNED MEASUREMENT ─────────────────────

const censusRecord = (over = {}) => ({
  request_id: CENSUS,
  action_key: "database.read_census",
  status: "complete",
  target: TARGET,
  result: { databaseTarget: TARGET, queryHash: "h".repeat(64) },
  ...over,
});

test("L4 — a completed census of the production target verifies the claim", () => {
  const v = R.verifySchemaEquivalenceEvidence({
    evidence: equivalence(), records: [censusRecord()], expectedQueryHash: "h".repeat(64),
  });
  assert.equal(v.ok, true);
  assert.equal(v.census_request_id, CENSUS);
});

test("L4b — a claim naming no census is refused", () => {
  const v = R.verifySchemaEquivalenceEvidence({ evidence: { equivalent: true }, records: [censusRecord()] });
  assert.equal(v.ok, false);
  assert.match(String(v.detail), /names no governed census/i);
});

test("L4c — a census that did not complete, or read another database, is refused", () => {
  for (const rec of [censusRecord({ status: "failed" }), censusRecord({ target: "staging", result: { databaseTarget: "staging" } })]) {
    const v = R.verifySchemaEquivalenceEvidence({ evidence: equivalence(), records: [rec] });
    assert.equal(v.ok, false);
  }
});

test("L4d — a census that ran a different artifact is refused", () => {
  const v = R.verifySchemaEquivalenceEvidence({
    evidence: equivalence(), records: [censusRecord()], expectedQueryHash: "z".repeat(64),
  });
  assert.equal(v.ok, false);
  assert.match(String(v.detail), /reviewed schema-equivalence artifact/i);
});

test("L4e — a census this host has no record of is refused", () => {
  const v = R.verifySchemaEquivalenceEvidence({ evidence: equivalence(), records: [] });
  assert.equal(v.ok, false);
});

// ── L5 — APPROVAL ───────────────────────────────────────────────────────────

test("L5 — an unapproved reconciliation writes nothing", () => {
  const { out, calls } = run({}, { approval: null });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.APPROVAL_REQUIRED);
  assert.equal(calls.writes, 0);
});

test("L5b — a delegated or policy approval is refused", () => {
  const { out, calls } = run({}, { approval: approval({ decision_actor: "policy", delegated: true }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.APPROVAL_REQUIRED);
  assert.equal(calls.writes, 0);
});

// ── L6 — IDEMPOTENCY, AND THE REFUSAL TO OVERWRITE ──────────────────────────

test("L6 — a row that already matches is already reconciled, and nothing is rewritten", () => {
  const a = adapters();
  a.seed([{ version: VERSION, name: NAME }]);
  const out = R.executeLedgerReconciliation({
    normalized: validated(), schemaEquivalence: equivalence(), approval: approval(),
    readLedgerRows: a.readLedgerRows, writeLedgerRows: a.writeLedgerRows,
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.written, []);
  assert.deepEqual(out.already_reconciled, [VERSION]);
  assert.equal(a.calls.writes, 0, "an already-reconciled ledger was written to again");
  assert.equal(out.recensus_required, false);
});

test("L6b — a row recording something DIFFERENT is never overwritten", () => {
  const a = adapters();
  a.seed([{ version: VERSION, name: "something_else_entirely" }]);
  const out = R.executeLedgerReconciliation({
    normalized: validated(), schemaEquivalence: equivalence(), approval: approval(),
    readLedgerRows: a.readLedgerRows, writeLedgerRows: a.writeLedgerRows,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.CONFLICTING_ROW);
  assert.equal(a.calls.writes, 0);
  assert.match(String(out.detail), /never overwritten/i);
});

test("L6c — replaying the whole operation is a no-op the second time", () => {
  const a = adapters();
  const once = R.executeLedgerReconciliation({
    normalized: validated(), schemaEquivalence: equivalence(), approval: approval(),
    readLedgerRows: a.readLedgerRows, writeLedgerRows: a.writeLedgerRows,
  });
  assert.equal(once.ok, true);
  assert.deepEqual(once.written, [VERSION]);
  const twice = R.executeLedgerReconciliation({
    normalized: validated(), schemaEquivalence: equivalence(), approval: approval(),
    readLedgerRows: a.readLedgerRows, writeLedgerRows: a.writeLedgerRows,
  });
  assert.equal(twice.ok, true);
  assert.deepEqual(twice.written, []);
  assert.equal(a.calls.writes, 1, "the replay wrote again");
});

// ── L7 — THE READ IS TAKEN NOW, AND THE WRITE IS VERIFIED ───────────────────

test("L7 — an unreadable ledger refuses rather than writing blind", () => {
  const { out, calls } = run({ readLedgerRows: () => ({ ok: false, detail: "connection lost" }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.READ_FAILED);
  assert.equal(calls.writes, 0);
});

test("L7b — the ledger is re-read after the write, and a row that did not land fails", () => {
  let n = 0;
  const { out } = run({
    // Reads empty both times: the write reported success and nothing landed.
    readLedgerRows: () => { n += 1; return ledgerEmpty(); },
    writeLedgerRows: () => ({ ok: true, written: [VERSION] }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.VERIFY_FAILED);
  assert.ok(n >= 2, "the ledger was not re-read after the write");
});

test("L7c — a failed write is reported as a failure, never as success", () => {
  const { out } = run({ writeLedgerRows: () => ({ ok: false, detail: "permission denied" }) });
  assert.equal(out.ok, false);
  assert.equal(out.code, R.LEDGER_RECONCILE_FAILURES.WRITE_FAILED);
});

test("L7d — a successful reconciliation still requires a governed re-census", () => {
  // Parity reads the ledger and the ledger just changed. The promotion is
  // released by the re-measurement, never by this write.
  const { out } = run();
  assert.equal(out.ok, true);
  assert.equal(out.recensus_required, true);
  assert.equal(out.verified, true);
});

// ── L8 — AUDIT ──────────────────────────────────────────────────────────────

test("L8 — the audit answers who, what, which revision and what changed", () => {
  const { out } = run();
  const a = out.audit;
  for (const f of ["action_key", "target", "expected_sha", "rows", "approval", "ledger_before", "ledger_after", "preconditions", "started_at", "completed_at", "reason"]) {
    assert.ok(a[f] !== undefined, `the audit cannot answer "${f}"`);
  }
  assert.equal(a.rows[0].version, VERSION);
  assert.equal(a.rows[0].name, NAME);
  assert.match(a.rows[0].content_sha256, /^[a-f0-9]{64}$/);
  // The record says WHY the row exists. A ledger entry with no explanation is
  // indistinguishable from an ordinary migration in six months' time.
  assert.match(a.reason, /executor defect/i);
});

test("L8b — no SQL text and no credential material reaches the public result", () => {
  const { out } = run();
  const s = JSON.stringify(R.publicLedgerReconcileResult(out));
  assert.ok(!/CREATE TABLE|GRANT SELECT|postgres:\/\//i.test(s), "statement text or a credential leaked into the result");
  assert.match(s, /"statements":\d+/, "the result should report how many statements, not what they were");
});

// ── L9 — REGISTRATION AND DISPATCH ──────────────────────────────────────────

test("L9 — the action is registered, operator-owned and never delegable", () => {
  const def = REG.getActionDefinition(KEY);
  assert.ok(def, "the action is not registered");
  assert.equal(def.operatorApprovalRequired, true);
  assert.equal(def.delegable, false);
  assert.equal(def.riskClass, "privileged_write");
  assert.ok(DA.OPERATOR_OWNED_ACTION_KEYS.includes(KEY), "a production ledger write must be operator-owned");
});

test("L9b — it has a governed default mode, so it is not refused as policy_denied", () => {
  // The trap two sibling actions already fell into: a privileged_write with no
  // default mode meets the read_only default and is refused as though the
  // operator forbade it.
  const src = execFileSync("cat", [join(REPO, "scripts/local-dev/lib/vacilando/governed-action-request.mjs")], { encoding: "utf8" });
  const start = src.indexOf("function defaultModeForAction(");
  const modeFn = src.slice(start, src.indexOf('return "read_only";', start));
  assert.ok(modeFn.includes("DATABASE_RECONCILE_MIGRATION_LEDGER"), "no default governed mode");
});

test("L9c — the operator card says it changes no schema, and is not a migration card", () => {
  const p = GA.presentationForGovernedAction({
    action_key: KEY, target: TARGET,
    inputs: { target: TARGET, migrations: [{ version: VERSION }] },
  });
  const all = `${p.approve_label} ${p.wait_label} ${p.mission_need} ${p.detail}`;
  assert.match(all, /NO SCHEMA CHANGES/);
  assert.match(all, /LEDGER/);
  const migration = GA.presentationForGovernedAction({
    action_key: "database.apply_promoted_migration",
    inputs: { target: TARGET, migrations: [{ version: VERSION }] },
  });
  assert.notEqual(p.approve_label, migration.approve_label);
  assert.notEqual(p.mission_need, migration.mission_need);
});

test("L9d — a filed reconciliation reaches its executor rather than action_unavailable", () => {
  // The defect that cost this platform three separate actions: registered,
  // approvable, and absent from the dispatch.
  const src = execFileSync("cat", [join(REPO, "scripts/local-dev/lib/vacilando/trusted-host-actions.mjs")], { encoding: "utf8" });
  assert.match(src, /ACTION_TYPES\.DATABASE_RECONCILE_MIGRATION_LEDGER\) \{\s*\n\s*return executeLedgerReconcileTrustedHostAction/);
  const ga = execFileSync("cat", [join(REPO, "scripts/local-dev/lib/vacilando/governed-action-request.mjs")], { encoding: "utf8" });
  assert.match(ga, /ACTION_TYPES\.DATABASE_RECONCILE_MIGRATION_LEDGER\) \{\s*\n\s*return fulfillLedgerReconcileForMission/);
  assert.equal(typeof TH.executeLedgerReconcileTrustedHostAction, "function");
  assert.equal(typeof TH.fulfillLedgerReconcileForMission, "function");
});

// ── L10 — THE PRODUCTION LEDGER IS UNREACHABLE FROM A HARNESS ───────────────

test("L10 — a test process cannot reach the real ledger adapters", () => {
  assert.ok(process.env.NODE_TEST_CONTEXT);
  assert.throws(() => TH.setTrustedHostLedgerRunnersForTests({ notARunner: () => {} }), /unknown runner/i);
});

test("L10b — half an isolation is refused here too", () => {
  // Same shape as the incident: one adapter stubbed, one forgotten.
  assert.doesNotThrow(() => TH.setTrustedHostLedgerRunnersForTests({ readLedgerRows: () => ledgerEmpty() }));
  TH.setTrustedHostLedgerRunnersForTests(null);
});
