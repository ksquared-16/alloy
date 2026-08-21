#!/usr/bin/env node
/**
 * Ledger write-after-success, evidence, and bounded ledger repair.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const {
  applyMigrationBatch,
  requireMigrationEvidence,
  ACCESS_IDENTITY_STAGING_MIGRATIONS,
} = await import("../lib/vacilando/trusted-host-migrate.mjs");
const {
  validateLedgerRepairInputs,
  applyLedgerRepair,
  LEDGER_REPAIR_ALLOWED_VERSIONS,
} = await import("../lib/vacilando/trusted-host-repair-ledger.mjs");
const { ACTION_TYPES, listRegisteredActions } = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const sha = (text) => createHash("sha256").update(String(text), "utf8").digest("hex");

function entry(version, body) {
  return {
    version,
    path: `supabase/migrations/${version}_x.sql`,
    fileSha: sha(body),
    text: body,
  };
}

function batchOf(entries, extra = {}) {
  return {
    environment: "staging",
    expectedSha: "abc1234",
    migrations: entries.map(({ text, ...rest }) => rest),
    ...extra,
  };
}

function runnersFor(entries, { failAt = null, ledger = new Set(), applied = new Set(), invariants = {} } = {}) {
  const written = [];
  const executed = [];
  const byVersion = Object.fromEntries(entries.map((e) => [e.version, e]));
  return {
    written,
    executed,
    inspectLedger: ({ version }) => ({ applied: ledger.has(version) }),
    applyFile: ({ entry }) => {
      executed.push(entry.version);
      if (failAt && entry.version === failAt) return { ok: false, code: "apply_failed", detail: "boom" };
      applied.add(entry.version);
      return { ok: true };
    },
    readContent: ({ relative }) => {
      const e = entries.find((x) => x.path === relative) || Object.values(byVersion)[0];
      return { ok: true, text: e.text };
    },
    verifyInvariant: ({ version }) => {
      if (invariants[version] === undefined) return { ok: true, pass: true, skipped: true };
      return invariants[version]
        ? { ok: true, pass: true }
        : { ok: false, pass: false, detail: "missing schema" };
    },
    recordLedger: ({ version }) => {
      written.push(version);
      ledger.add(version);
      return { ok: true };
    },
  };
}

const e1 = entry("20260818170000", "-- one\nselect 1;");
const e2 = entry("20260818220000", "-- s3\nselect 2;");
const e3 = entry("20260818230000", "-- drop\nselect 3;");

{
  const r = runnersFor([e1, e2, e3], { failAt: "20260818220000" });
  const out = applyMigrationBatch(batchOf([e1, e2, e3]), r);
  assert.equal(out.ok, false);
  assert.equal(out.stopped, true);
  assert.deepEqual(r.written, ["20260818170000"]);
  assert.deepEqual(r.executed, ["20260818170000", "20260818220000"]);
  assert.equal(out.results.find((x) => x.version === "20260818220000").status, "failed");
  assert.equal(out.results.find((x) => x.version === "20260818230000").status, "not_attempted");
  assert.equal(r.written.includes("20260818220000"), false);
  assert.equal(r.written.includes("20260818230000"), false);
  assert.ok(out.evidence.length >= 2);
  assert.equal(out.evidence.find((x) => x.version === "20260818220000").status, "failed");
  assert.equal(out.evidence.find((x) => x.version === "20260818230000").status, "not_attempted");
}

{
  const gate = requireMigrationEvidence({ ok: true, results: [{ version: "1" }], evidence: [] });
  assert.equal(gate.ok, false);
  assert.equal(gate.code, "evidence_missing");
}

{
  const ledger = new Set(["20260818170000"]);
  const r = runnersFor([e1, e2], { ledger, failAt: "20260818220000" });
  const out = applyMigrationBatch(batchOf([e1, e2]), r);
  assert.equal(out.results[0].status, "already_applied");
  assert.equal(r.executed.includes("20260818170000"), false);
  assert.deepEqual(r.written, []);
  assert.equal(out.results[1].status, "failed");
}

{
  const r = runnersFor([e1], {});
  const first = applyMigrationBatch(batchOf([e1]), r);
  assert.equal(first.ok, true);
  assert.deepEqual(r.written, ["20260818170000"]);
  const second = applyMigrationBatch(batchOf([e1]), {
    ...r,
    inspectLedger: () => ({ applied: true }),
    applyFile: () => { throw new Error("retry must not re-apply"); },
  });
  assert.equal(second.ok, true);
  assert.equal(second.results[0].idempotent || second.results[0].status === "already_applied", true);
}

{
  const r = runnersFor([e2], {
    ledger: new Set(["20260818220000"]),
    invariants: { "20260818220000": false },
  });
  const out = applyMigrationBatch(batchOf([e2]), r);
  assert.equal(out.ok, false);
  assert.equal(out.results[0].code, "ledger_inconsistent");
  assert.deepEqual(r.written, []);
}

{
  const bad = validateLedgerRepairInputs({
    environment: "staging",
    versions: ["20260818220000"],
    reason: "false ledger",
    originating_action_id: "tha_x",
    expected_ledger_versions: ["20260818220000"],
    evidence_refs: ["art_1"],
    sql: "DELETE FROM supabase_migrations.schema_migrations",
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "arbitrary_sql_rejected");
}

{
  const arbitrary = validateLedgerRepairInputs({
    environment: "production",
    versions: ["20260818220000"],
    reason: "false ledger",
    originating_action_id: "tha_x",
    expected_ledger_versions: ["20260818220000"],
    evidence_refs: ["art_1"],
  });
  assert.equal(arbitrary.ok, false);
  assert.equal(arbitrary.code, "environment_not_allowed");
}

{
  const offList = validateLedgerRepairInputs({
    environment: "staging",
    versions: ["19990101000000"],
    reason: "false ledger",
    originating_action_id: "tha_x",
    expected_ledger_versions: ["19990101000000"],
    evidence_refs: ["art_1"],
  });
  assert.equal(offList.ok, false);
  assert.equal(offList.code, "version_not_allowlisted");
}

{
  const ok = validateLedgerRepairInputs({
    environment: "staging",
    versions: ["20260818220000", "20260818230000"],
    reason: "failed or never-executed governed batch",
    originating_action_id: "tha_a28ea95925b1dd",
    expected_ledger_versions: ["20260818230000", "20260818220000"],
    evidence_refs: ["tmp/20260818220000.err"],
  });
  assert.equal(ok.ok, true, ok.detail);
  const deleted = [];
  const refused = applyLedgerRepair(ok.normalized, {
    inspectLedger: () => ({ applied: true }),
    verifyInvariant: () => ({ ok: true, pass: true }),
    deleteVersions: ({ versions }) => { deleted.push(...versions); return { ok: true }; },
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "repair_refused");
  assert.deepEqual(deleted, []);
}

{
  const ok = validateLedgerRepairInputs({
    environment: "staging",
    versions: ["20260818220000"],
    reason: "failed governed batch",
    originating_action_id: "tha_a28ea95925b1dd",
    expected_ledger_versions: ["20260818220000"],
    evidence_refs: ["tmp/20260818220000.err"],
  });
  const deleted = [];
  const repaired = applyLedgerRepair(ok.normalized, {
    inspectLedger: () => ({ applied: true }),
    verifyInvariant: () => ({ ok: false, pass: false }),
    deleteVersions: ({ versions }) => { deleted.push(...versions); return { ok: true }; },
  });
  assert.equal(repaired.ok, true);
  assert.deepEqual(deleted, ["20260818220000"]);
}

{
  const ok = validateLedgerRepairInputs({
    environment: "staging",
    versions: ["20260818220000"],
    reason: "failed governed batch",
    originating_action_id: "tha_a28ea95925b1dd",
    expected_ledger_versions: ["20260818220000"],
    evidence_refs: ["tmp/20260818220000.err"],
  });
  const again = applyLedgerRepair(ok.normalized, {
    inspectLedger: () => ({ applied: false }),
    verifyInvariant: () => ({ ok: false, pass: false }),
    deleteVersions: () => { throw new Error("must not delete absent row"); },
  });
  assert.equal(again.ok, true);
  assert.equal(again.idempotent, true);
}

{
  const registered = listRegisteredActions().map((a) => a.actionType);
  assert.equal(registered.includes(ACTION_TYPES.DATABASE_REPAIR_MIGRATION_LEDGER), true);
  assert.equal(LEDGER_REPAIR_ALLOWED_VERSIONS.includes("20260818220000"), true);
  assert.equal(ACCESS_IDENTITY_STAGING_MIGRATIONS[0].version, "20260818170000");
}

{
  const s3 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20260818220000_s3_action_link_token_hash.sql"),
    "utf8",
  );
  assert.match(s3, /IF EXISTS/);
  assert.match(s3, /column_name = 'token'/);
  assert.doesNotMatch(s3, /SET token = /);
}

console.log("ok - trusted-host ledger repair and evidence");
