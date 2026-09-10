/**
 * THE MIGRATION-LEDGER RECONCILIATION OWNER.
 *
 * ── WHY THIS EXISTS, AND WHAT IT IS NOT ──
 *
 * During certification of the production migration executor, the exact certified
 * Thread 5 DDL was executed against the deployed primary before any governed
 * approval. The SQL completed; the ledger write did not happen, because
 * `defaultApplyMigrationFile` runs psql and returns `ledger: "applied"` without
 * inserting anything, and neither migration writes its own row.
 *
 * That left the database APPLIED BUT NOT RECORDED — the inverse of the
 * recorded-but-not-applied inconsistency `defaultInspectLedger` already guards
 * against. Parity reads the ledger, so it correctly continued to report both
 * identities missing while the objects sat in the catalog.
 *
 * This action makes recorded history agree with actual history. It is NOT a way
 * to manufacture migration history: it refuses unless the physical schema the
 * row would claim is independently proven present, and it writes only the exact
 * identities and content of committed migration files at a named revision.
 *
 * ── WHY NOT DROP AND RE-APPLY ──
 *
 * Because that is a second destructive production mutation which changes nothing
 * about the final schema. It would replay SQL whose intended result already
 * exists, risk incidental state created since, and conceal the incident behind a
 * tidy procedural history. The system should reconcile what happened, not
 * re-enact it.
 *
 * ── WHAT MAKES IT SAFE TO REPLAY ──
 *
 * `INSERT ... ON CONFLICT DO NOTHING` then re-read, the same shape the append
 * only ledgers elsewhere in Alloy use. An existing row with matching identity is
 * "already reconciled"; an existing row whose content DIFFERS is a refusal, never
 * an overwrite. Nothing here can modify a migration record the system wrote.
 */
import { createHash } from "node:crypto";

export const LEDGER_RECONCILE_ACTION_KEY = "database.reconcile_migration_ledger";

/** Production-class targets. The same allowlist the production apply uses. */
export const LEDGER_RECONCILE_TARGETS = Object.freeze(["alloy_deployed_primary"]);

export const LEDGER_RECONCILE_AUTHORITY = Object.freeze({
  action_key: LEDGER_RECONCILE_ACTION_KEY,
  operator_only: true,
  director_approval_required: true,
  delegable: false,
  consequence_class: "production_migration_ledger_write",
});

export const LEDGER_RECONCILE_FAILURES = Object.freeze({
  UNVALIDATED: "ledger_reconcile_unvalidated",
  TARGET_NOT_PRODUCTION: "target_not_registered_production",
  NO_VERSIONS: "no_versions_requested",
  SCHEMA_NOT_PROVEN: "physical_schema_not_proven",
  SCHEMA_DRIFT: "physical_schema_drift",
  ALREADY_RECORDED: "ledger_row_already_present",
  CONFLICTING_ROW: "ledger_row_conflicts",
  READ_FAILED: "ledger_unreadable",
  WRITE_FAILED: "ledger_write_failed",
  VERIFY_FAILED: "ledger_write_unverified",
  APPROVAL_REQUIRED: "director_approval_required",
  RUNNERS_NOT_COMPOSED: "ledger_runners_not_composed",
});

const norm = (v) => String(v ?? "").trim().toLowerCase();
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

/** A 14-digit migration identity, or null. */
export function migrationVersionOf(value) {
  const m = String(value ?? "").trim().match(/^(\d{14})/);
  return m ? m[1] : null;
}

/**
 * The ledger `name` for a migration file.
 *
 * The convention the migration system itself follows, read off rows it wrote:
 * the filename with the timestamp prefix and the `.sql` suffix removed.
 * `20260910120000_attendance_kiosk_producers.sql` → `attendance_kiosk_producers`.
 */
export function ledgerNameForMigrationPath(pathRel) {
  const base = String(pathRel || "").split("/").pop() || "";
  return base.replace(/^\d{14}_/, "").replace(/\.sql$/i, "");
}

/**
 * Split a migration file into the statement array the ledger stores.
 *
 * Deliberately conservative and deliberately NOT a SQL parser. The ledger's
 * `statements` column is evidence of what was applied, not something anything
 * re-executes, so the only property that matters is that it faithfully
 * represents the file. A dollar-quoted body is tracked so a `;` inside a
 * function definition does not split one statement into two.
 */
export function splitMigrationStatements(sql) {
  const text = String(sql || "");
  const out = [];
  let buf = "";
  let i = 0;
  let inLine = false;
  let inBlock = 0;
  let inSingle = false;
  let dollarTag = null;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLine) {
      buf += ch;
      if (ch === "\n") inLine = false;
      i += 1;
      continue;
    }
    if (inBlock > 0) {
      buf += ch;
      if (ch === "*" && next === "/") { buf += next; inBlock -= 1; i += 2; continue; }
      if (ch === "/" && next === "*") { buf += next; inBlock += 1; i += 2; continue; }
      i += 1;
      continue;
    }
    if (dollarTag) {
      buf += ch;
      if (ch === "$" && text.startsWith(dollarTag, i)) {
        buf += text.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") {
        if (next === "'") { buf += next; i += 2; continue; }
        inSingle = false;
      }
      i += 1;
      continue;
    }
    if (ch === "-" && next === "-") { buf += ch + next; inLine = true; i += 2; continue; }
    if (ch === "/" && next === "*") { buf += ch + next; inBlock = 1; i += 2; continue; }
    if (ch === "'") { buf += ch; inSingle = true; i += 1; continue; }
    if (ch === "$") {
      const tag = text.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (tag) { dollarTag = tag[0]; buf += tag[0]; i += tag[0].length; continue; }
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

export function sha256(text) {
  return createHash("sha256").update(String(text ?? "")).digest("hex");
}

/**
 * Validate a reconciliation request.
 *
 * The caller names a target, a source revision, and the migration entries whose
 * rows are missing. Everything else — the ledger name, the statement array, the
 * content hash — is DERIVED from the committed file, never accepted from the
 * request. A caller that could supply the statements could record a history that
 * never ran, which is the one thing this must be unable to do.
 */
export function validateLedgerReconcileInputs(inputs = {}, {
  readMigrationFile = null,
} = {}) {
  const target = norm(inputs.target || inputs.environment || "");
  if (!target) {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.TARGET_NOT_PRODUCTION, detail: "target is required." };
  }
  if (!LEDGER_RECONCILE_TARGETS.includes(target)) {
    return {
      ok: false,
      code: LEDGER_RECONCILE_FAILURES.TARGET_NOT_PRODUCTION,
      detail: `${LEDGER_RECONCILE_ACTION_KEY} targets only: ${LEDGER_RECONCILE_TARGETS.join(", ")}`,
    };
  }
  const expectedSha = String(inputs.expectedSha || inputs.expected_sha || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
    return {
      ok: false,
      code: LEDGER_RECONCILE_FAILURES.UNVALIDATED,
      detail: "A ledger reconciliation must name the full 40-character revision the migrations come from.",
    };
  }
  const entries = Array.isArray(inputs.migrations) ? inputs.migrations : [];
  if (!entries.length) {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.NO_VERSIONS, detail: "Name the migrations whose ledger rows are missing." };
  }
  if (typeof readMigrationFile !== "function") {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.RUNNERS_NOT_COMPOSED, detail: "A committed-file reader is required; content is never taken from the request." };
  }
  // A request may not carry SQL. The whole safety of this action rests on the
  // content coming from the git object store at a named revision.
  for (const key of ["sql", "statements", "content", "rollback"]) {
    if (inputs[key] !== undefined) {
      return { ok: false, code: LEDGER_RECONCILE_FAILURES.UNVALIDATED, detail: `A reconciliation request may not supply \`${key}\`; ledger content is derived from the committed file.` };
    }
  }

  const rows = [];
  for (const entry of entries) {
    const pathRel = String(typeof entry === "string" ? entry : (entry?.path || entry?.migration_path || "")).trim();
    const version = migrationVersionOf(typeof entry === "string" ? entry.split("/").pop() : (entry?.version || pathRel.split("/").pop()));
    if (!version) {
      return { ok: false, code: LEDGER_RECONCILE_FAILURES.UNVALIDATED, detail: `Cannot read a 14-digit migration identity from ${pathRel || JSON.stringify(entry)}.` };
    }
    if (!pathRel) {
      return { ok: false, code: LEDGER_RECONCILE_FAILURES.UNVALIDATED, detail: `Migration ${version} has no path; the committed file is what the row records.` };
    }
    const file = readMigrationFile({ sha: expectedSha, relative: pathRel });
    if (!file?.ok) {
      return {
        ok: false,
        code: LEDGER_RECONCILE_FAILURES.UNVALIDATED,
        detail: file?.detail || `No committed artifact for ${pathRel} at ${expectedSha}.`,
      };
    }
    rows.push({
      version,
      path: pathRel,
      name: ledgerNameForMigrationPath(pathRel),
      statements: splitMigrationStatements(file.text),
      contentSha: sha256(file.text),
      bytes: file.text.length,
    });
  }

  const versions = rows.map((r) => r.version);
  const ordered = [...versions].sort();
  if (ordered.join(",") !== versions.join(",")) {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.UNVALIDATED, detail: "Reconcile in ascending version order." };
  }
  if (new Set(versions).size !== versions.length) {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.UNVALIDATED, detail: "The same migration identity was named twice." };
  }

  return {
    ok: true,
    normalized: {
      actionType: LEDGER_RECONCILE_ACTION_KEY,
      target,
      expectedSha,
      rows,
      versions,
      dedupeKey: `reconcile-ledger:${target}:${expectedSha.slice(0, 12)}:${versions.join(",")}`,
    },
  };
}

/**
 * Is the equivalence claim backed by a GOVERNED measurement?
 *
 * The verdict "production matches the migration" is an analysis, and an analysis
 * a lane performed is not by itself evidence — a request that could simply
 * assert `equivalent: true` would make proof 1 a formality. So the claim must
 * name a completed `database.read_census` against the production target, and the
 * census must be the reviewed equivalence artifact rather than any query at all:
 * its hash is compared to the committed artifact's.
 *
 * This does not re-run the comparison. It establishes that a governed read of
 * the right database, through the right artifact, actually happened — the part
 * a caller must not be able to invent.
 */
export function verifySchemaEquivalenceEvidence({
  evidence = null,
  records = [],
  expectedQueryHash = null,
  target = "alloy_deployed_primary",
} = {}) {
  if (!evidence || typeof evidence !== "object") {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, detail: "No schema equivalence evidence was supplied." };
  }
  const requestId = String(evidence.census_request_id || evidence.censusRequestId || "").trim();
  if (!requestId) {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, detail: "The equivalence claim names no governed census; an unverifiable claim is not evidence." };
  }
  const rec = (records || []).find((r) => String(r?.request_id) === requestId) || null;
  if (!rec) {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, detail: `No governed action ${requestId} exists on this host.` };
  }
  if (norm(rec.action_key) !== "database.read_census") {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, detail: `${requestId} is not a census.` };
  }
  if (norm(rec.status) !== "complete") {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, detail: `Census ${requestId} did not complete (${rec.status}).` };
  }
  const censusTarget = norm(rec.result?.databaseTarget || rec.target);
  if (censusTarget !== norm(target)) {
    return { ok: false, code: LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, detail: `Census ${requestId} read ${censusTarget || "an unnamed database"}, not ${target}.` };
  }
  if (expectedQueryHash && String(rec.result?.queryHash || "") !== String(expectedQueryHash)) {
    return {
      ok: false,
      code: LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN,
      detail: "The named census did not run the reviewed schema-equivalence artifact.",
    };
  }
  return { ok: true, census_request_id: requestId, query_hash: rec.result?.queryHash || null, measured_at: rec.execution_ended_at || rec.updated_at || null };
}

/**
 * THE PROOFS REQUIRED BEFORE WRITING A MIGRATION LEDGER ROW.
 *
 * The row asserts "this migration was applied to this database". Each proof
 * answers a way that assertion could be false, and every one refuses on UNKNOWN.
 */
export function assertLedgerReconcilePreconditions({
  normalized = null,
  schemaEquivalence = null,
  ledgerState = null,
  approval = null,
} = {}) {
  const refuse = (code, detail) => ({ ok: false, code, detail });

  if (!normalized || normalized.actionType !== LEDGER_RECONCILE_ACTION_KEY) {
    return refuse(LEDGER_RECONCILE_FAILURES.UNVALIDATED, "Reconciliation requires a validated request of its own action type.");
  }

  // 1 — THE SCHEMA THE ROW WOULD CLAIM MUST BE PROVEN PRESENT.
  //
  // This is the proof that separates reconciliation from fabrication. Without
  // it, this action is a way to tell every downstream gate that a migration ran
  // when it did not.
  if (!schemaEquivalence) {
    return refuse(LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, "No physical schema equivalence evidence was supplied. A ledger row for an unproven schema is a fabrication.");
  }
  if (schemaEquivalence.equivalent !== true) {
    return refuse(LEDGER_RECONCILE_FAILURES.SCHEMA_DRIFT, schemaEquivalence.detail || "The physical schema does not match the migration-defined outcome.");
  }
  const proven = (schemaEquivalence.versions || []).map(String);
  const unproven = normalized.versions.filter((v) => !proven.includes(v));
  if (unproven.length) {
    return refuse(LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, `Schema equivalence does not cover ${unproven.join(", ")}.`);
  }
  if (schemaEquivalence.expectedSha && schemaEquivalence.expectedSha !== normalized.expectedSha) {
    return refuse(LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, "The equivalence evidence was measured against a different revision.");
  }
  // The claim must be traceable to a governed measurement, not merely asserted.
  // `verified_by` is written by verifySchemaEquivalenceEvidence at the boundary;
  // its absence means nobody checked, which is not the same as a check passing.
  if (!schemaEquivalence.verified_by?.census_request_id) {
    return refuse(LEDGER_RECONCILE_FAILURES.SCHEMA_NOT_PROVEN, "The equivalence claim was not traced to a completed governed census of the production target.");
  }

  // 2 — THE LEDGER MUST STILL BE MISSING THESE ROWS, read now and not earlier.
  if (!ledgerState || ledgerState.ok !== true) {
    return refuse(LEDGER_RECONCILE_FAILURES.READ_FAILED, ledgerState?.detail || "Hosted ledger state could not be read. UNKNOWN refuses.");
  }
  const present = new Map((ledgerState.rows || []).map((r) => [String(r.version), r]));
  const conflicts = [];
  const already = [];
  for (const row of normalized.rows) {
    const existing = present.get(row.version);
    if (!existing) continue;
    // An identical row is a completed reconciliation, not a problem.
    if (String(existing.name) === row.name) already.push(row.version);
    else conflicts.push({ version: row.version, expected_name: row.name, found_name: existing.name });
  }
  if (conflicts.length) {
    return refuse(
      LEDGER_RECONCILE_FAILURES.CONFLICTING_ROW,
      `The ledger already records ${conflicts.map((c) => `${c.version} as "${c.found_name}" (expected "${c.expected_name}")`).join("; ")}. A migration record the system wrote is never overwritten.`,
    );
  }

  // 3 — EXPLICIT OPERATOR APPROVAL, bound to this content.
  if (norm(approval?.decision) !== "approved") {
    return refuse(LEDGER_RECONCILE_FAILURES.APPROVAL_REQUIRED, "Writing a production migration ledger row requires an explicit Director approval.");
  }
  if (norm(approval?.decision_actor) === "policy" || approval?.delegated === true) {
    return refuse(LEDGER_RECONCILE_FAILURES.APPROVAL_REQUIRED, "Reconciliation cannot be satisfied by a delegated or policy approval.");
  }

  return {
    ok: true,
    target: normalized.target,
    versions: normalized.versions,
    // Versions already reconciled are reported so the executor can skip them and
    // still complete, which is what makes a replay a no-op rather than an error.
    alreadyReconciled: already,
    toWrite: normalized.rows.filter((r) => !already.includes(r.version)).map((r) => r.version),
  };
}

/**
 * Reconcile the ledger.
 *
 * Adapters do everything that touches the world, for the same reason the
 * production apply orchestrator uses them: this is certifiable without a
 * production database only if the SECRET SOURCE and the DATABASE are the only
 * substituted parts.
 */
export function executeLedgerReconciliation({
  normalized = null,
  schemaEquivalence = null,
  approval = null,
  readLedgerRows = null,
  writeLedgerRows = null,
  nowMs = Date.now(),
} = {}) {
  const started_at = iso(nowMs);
  const audit = {
    action_key: LEDGER_RECONCILE_ACTION_KEY,
    environment: "production",
    started_at,
    completed_at: null,
    reason: "migration ledger row omitted by an executor defect; SQL had already been applied",
    approval: approval ? {
      decision: approval.decision || null,
      actor: approval.actor || approval.decision_actor || null,
      at: approval.at || null,
      delegated: approval.delegated === true,
    } : null,
  };
  const done = (p) => ({ ...p, audit: { ...audit, completed_at: iso(nowMs), ok: p.ok === true } });
  const refuse = (code, detail, extra = {}) => done({ ok: false, code, detail, ...extra });

  if (typeof readLedgerRows !== "function" || typeof writeLedgerRows !== "function") {
    return refuse(LEDGER_RECONCILE_FAILURES.RUNNERS_NOT_COMPOSED, "Ledger reconciliation requires read and write adapters from the trusted host.");
  }
  if (!normalized) return refuse(LEDGER_RECONCILE_FAILURES.UNVALIDATED, "No validated request.");

  audit.target = normalized.target;
  audit.expected_sha = normalized.expectedSha;
  audit.rows = normalized.rows.map((r) => ({
    version: r.version, name: r.name, path: r.path,
    statements: r.statements.length, content_sha256: r.contentSha, bytes: r.bytes,
  }));

  // READ NOW. The earlier census is evidence of a past state, never authority
  // for this write.
  const before = readLedgerRows({ versions: normalized.versions });
  if (!before?.ok) return refuse(LEDGER_RECONCILE_FAILURES.READ_FAILED, before?.detail || "Hosted ledger could not be read.");
  audit.ledger_before = { total_rows: before.total ?? null, head: before.head ?? null, present: (before.rows || []).map((r) => r.version) };

  const proofs = assertLedgerReconcilePreconditions({ normalized, schemaEquivalence, ledgerState: before, approval });
  if (!proofs.ok) return refuse(proofs.code, proofs.detail);
  audit.preconditions = { passed: true, to_write: proofs.toWrite, already_reconciled: proofs.alreadyReconciled };

  const pending = normalized.rows.filter((r) => proofs.toWrite.includes(r.version));
  if (!pending.length) {
    // Fully reconciled already. Idempotent success, and the audit says why it
    // wrote nothing rather than reporting a write it did not perform.
    audit.ledger_after = audit.ledger_before;
    return done({
      ok: true,
      target: normalized.target,
      written: [],
      already_reconciled: proofs.alreadyReconciled,
      verified: true,
      recensus_required: false,
      detail: "Every named identity was already recorded with matching content.",
    });
  }

  const write = writeLedgerRows({ rows: pending });
  if (!write?.ok) return refuse(LEDGER_RECONCILE_FAILURES.WRITE_FAILED, write?.detail || "The ledger write failed.", { written: [] });

  // VERIFY BY RE-READING. A write that returned zero is not a write that landed.
  const after = readLedgerRows({ versions: normalized.versions });
  if (!after?.ok) {
    return refuse(LEDGER_RECONCILE_FAILURES.VERIFY_FAILED, "The rows were written but the ledger could not be re-read to confirm them.", { written: pending.map((r) => r.version) });
  }
  audit.ledger_after = { total_rows: after.total ?? null, head: after.head ?? null, present: (after.rows || []).map((r) => r.version) };

  const stillMissing = normalized.versions.filter((v) => !(after.rows || []).some((r) => String(r.version) === v));
  if (stillMissing.length) {
    return refuse(LEDGER_RECONCILE_FAILURES.VERIFY_FAILED, `Wrote ${pending.map((r) => r.version).join(", ")} but the ledger still does not report ${stillMissing.join(", ")}.`, { written: pending.map((r) => r.version) });
  }
  const wrongName = (after.rows || []).filter((r) => {
    const want = normalized.rows.find((x) => x.version === String(r.version));
    return want && String(r.name) !== want.name;
  });
  if (wrongName.length) {
    return refuse(LEDGER_RECONCILE_FAILURES.VERIFY_FAILED, `The ledger reports ${wrongName.map((r) => `${r.version} as "${r.name}"`).join("; ")} after the write.`);
  }

  return done({
    ok: true,
    target: normalized.target,
    written: pending.map((r) => r.version),
    already_reconciled: proofs.alreadyReconciled,
    verified: true,
    ledger_total_before: audit.ledger_before.total_rows,
    ledger_total_after: audit.ledger_after.total_rows,
    head_before: audit.ledger_before.head,
    head_after: audit.ledger_after.head,
    // Parity reads the ledger, and the ledger just changed. The promotion is
    // released by a governed re-measurement, never by this write.
    recensus_required: true,
  });
}

/** The result an operator and a worker may see. No SQL text, no credentials. */
export function publicLedgerReconcileResult(result) {
  if (!result) return null;
  return {
    ok: result.ok === true,
    action_key: LEDGER_RECONCILE_ACTION_KEY,
    target: result.target || result.audit?.target || null,
    expected_sha: result.audit?.expected_sha || null,
    rows: result.audit?.rows || [],
    written: result.written || [],
    already_reconciled: result.already_reconciled || [],
    verified: result.verified === true,
    ledger_total_before: result.ledger_total_before ?? result.audit?.ledger_before?.total_rows ?? null,
    ledger_total_after: result.ledger_total_after ?? result.audit?.ledger_after?.total_rows ?? null,
    head_before: result.head_before ?? result.audit?.ledger_before?.head ?? null,
    head_after: result.head_after ?? result.audit?.ledger_after?.head ?? null,
    recensus_required: result.recensus_required !== false,
    code: result.ok === true ? null : (result.code || null),
    detail: result.ok === true ? null : (result.detail || null),
    audit: result.audit || null,
  };
}
