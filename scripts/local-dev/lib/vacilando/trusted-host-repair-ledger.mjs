/**
 * Bounded trusted-host repair of false schema_migrations rows.
 *
 * Not arbitrary SQL. Deletes only exact versions after evidence of
 * non-execution AND an absent/failed invariant. Refuses if the schema
 * object the version is supposed to create is already present.
 */
import { ACCESS_IDENTITY_STAGING_MIGRATIONS } from "./trusted-host-migrate.mjs";

export const LEDGER_REPAIR_ALLOWED_VERSIONS = Object.freeze(
  ACCESS_IDENTITY_STAGING_MIGRATIONS.map((m) => m.version),
);

const VERSION_RE = /^\d{14}$/;

export function ledgerDeleteSql(versions) {
  const list = (versions || [])
    .map((v) => String(v).replace(/'/g, ""))
    .filter((v) => VERSION_RE.test(v));
  if (!list.length) return null;
  const inList = list.map((v) => `'${v}'`).join(", ");
  return `DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (${inList})
  AND version IN (${inList});`;
}

export function validateLedgerRepairInputs(inputs = {}) {
  if (inputs.sql || inputs.statement || inputs.body || inputs.database_url || inputs.databaseUrl || inputs.command) {
    return { ok: false, code: "arbitrary_sql_rejected", detail: "Arbitrary SQL is not a registered ledger-repair action." };
  }
  const environment = String(inputs.environment || inputs.env || "").trim().toLowerCase();
  if (environment !== "staging") {
    return { ok: false, code: "environment_not_allowed", detail: "Ledger repair is staging-only." };
  }
  const versions = [...new Set((inputs.versions || inputs.migration_versions || [])
    .map((v) => String(v || "").trim())
    .filter(Boolean))];
  if (!versions.length) {
    return { ok: false, code: "versions_required", detail: "Exact migration versions are required." };
  }
  for (const v of versions) {
    if (!VERSION_RE.test(v)) {
      return { ok: false, code: "invalid_version", detail: `Invalid migration version ${v}.` };
    }
    if (!LEDGER_REPAIR_ALLOWED_VERSIONS.includes(v)) {
      return { ok: false, code: "version_not_allowlisted", detail: `Version ${v} is not in the repair allowlist.` };
    }
  }
  const reason = String(inputs.reason || "").trim();
  if (!reason) {
    return { ok: false, code: "reason_required", detail: "Repair requires a reason." };
  }
  const originatingActionId = String(inputs.originating_action_id || inputs.originatingActionId || "").trim();
  if (!originatingActionId) {
    return { ok: false, code: "originating_action_required", detail: "originating_action_id is required." };
  }
  const expected = [...new Set((inputs.expected_ledger_versions || inputs.expectedLedgerVersions || versions)
    .map((v) => String(v || "").trim())
    .filter(Boolean))].sort();
  const sorted = [...versions].sort();
  if (expected.join(",") !== sorted.join(",")) {
    return {
      ok: false,
      code: "expected_ledger_mismatch",
      detail: "expected_ledger_versions must match the versions being repaired.",
    };
  }
  const evidenceRefs = inputs.evidence_refs || inputs.evidenceRefs || [];
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    return { ok: false, code: "evidence_required", detail: "Repair requires evidence refs proving non-execution." };
  }
  return {
    ok: true,
    normalized: {
      actionType: "database.repair_migration_ledger",
      environment: "staging",
      versions: sorted,
      reason,
      originatingActionId,
      expectedLedgerVersions: expected,
      evidenceRefs,
      queryHash: `repair-ledger:staging:${sorted.join(",")}:${originatingActionId}`,
    },
  };
}

export function applyLedgerRepair(normalized, {
  inspectLedger = null,
  verifyInvariant = null,
  deleteVersions = null,
} = {}) {
  const repaired = [];
  const refused = [];
  const already = [];
  for (const version of normalized.versions) {
    const ledger = inspectLedger ? inspectLedger({ version, environment: "staging" }) : { applied: false };
    if (ledger?.ok === false) {
      return { ok: false, code: ledger.code || "preflight_failed", detail: ledger.detail, repaired, refused, already };
    }
    if (!ledger?.applied) {
      already.push({ version, status: "already_absent" });
      continue;
    }
    const inv = verifyInvariant ? verifyInvariant({ version, environment: "staging" }) : { ok: true, pass: false, skipped: true };
    const skipped = inv?.skipped === true || inv?.skipped === true;
    const pass = inv?.pass === true || inv?.pass === true;
    if (skipped) {
      refused.push({ version, code: "invariant_unconfigured", detail: "No invariant probe; refusing to delete." });
      continue;
    }
    if (pass) {
      refused.push({
        version,
        code: "schema_present",
        detail: "Intended schema object is present; this row is not a proven-false ledger entry.",
      });
      continue;
    }
    repaired.push(version);
  }
  if (refused.length) {
    return {
      ok: false,
      code: "repair_refused",
      detail: "One or more versions still have their schema objects; refusing partial history mutation.",
      repaired: [],
      refused,
      already,
    };
  }
  const toDelete = repaired;
  if (!toDelete.length) {
    return { ok: true, repaired: [], refused: [], already, idempotent: true };
  }
  if (typeof deleteVersions !== "function") {
    return { ok: false, code: "repair_runner_missing", detail: "Ledger delete runner was not provided.", repaired: [], refused, already };
  }
  const deleted = deleteVersions({ versions: toDelete, environment: "staging" });
  if (deleted?.ok === false) {
    return { ok: false, code: deleted.code || "repair_failed", detail: deleted.detail, repaired: [], refused, already };
  }
  return {
    ok: true,
    repaired: toDelete,
    refused: [],
    already,
    idempotent: false,
    sqlKind: "bounded_version_delete",
  };
}
