/**
 * THE PRODUCTION MIGRATION EXECUTOR.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * `database.apply_promoted_migration` was registered, validated, authority-
 * classified and tested, and it had never once executed. It appeared in four
 * files and in NEITHER of the two that make a governed action run: there was no
 * branch in `defaultExecute`, no branch in `executeTrustedHostAction`, and no
 * fulfiller. Every filing therefore failed `action_unavailable` — the same shape
 * as the provider-ceiling and QA-restore defects already recorded in those two
 * dispatches, and the third instance of it.
 *
 * The consequence was worse than an unusable action. `assertProductionApplyPre-
 * conditions` — the seven proofs that are supposed to stand between a governed
 * approval and a production schema mutation — had no production caller at all.
 * They were reachable only from their own tests. A control that nothing calls is
 * not a weak control; it is an absent one wearing the name of a present one.
 *
 * ── WHAT THIS MODULE IS, AND IS NOT ──
 *
 * It is the ORCHESTRATION between the approval and the mutation: revalidate,
 * resolve the credential, re-measure hosted state, run the seven proofs, apply,
 * re-measure again, and hand back an auditable result.
 *
 * It holds no credential, opens no socket, and spawns no process. Every effect
 * is an injected adapter supplied by the trusted host, which is what lets the
 * whole path be certified without a production database: a test replaces the
 * SECRET SOURCE and keeps the real dispatch, the real preconditions and the real
 * migration behaviour. Mocking the orchestration instead would certify nothing.
 *
 * ── TIME OF CHECK IS NOT TIME OF USE ──
 *
 * The database may change between filing and execution, and on this path it
 * demonstrably does: the whole reason a production apply is requested is that
 * hosted is behind, and "behind" is a measurement with an age. So nothing
 * measured at proposal time is execution authority here. The request is
 * revalidated, the hosted ledger is read LIVE, and the proofs run against that
 * live reading immediately before the first statement. A hosted head that moved
 * since the approval fails closed and demands a fresh governed action rather
 * than applying into a database nobody has looked at recently.
 */
import { migrationParity } from "./migration-parity.mjs";
import {
  PRODUCTION_APPLY_ACTION_KEY,
  PRODUCTION_APPLY_TARGETS,
  assertProductionApplyPreconditions,
  evaluateProductionApplyOutcome,
  classifyApplyFailure,
  resolveMigrationOutcome,
} from "./trusted-host-production-migrate.mjs";

/**
 * The credential binding, stated as a NAME so it can be audited.
 *
 * This is not new secret infrastructure and deliberately does not create any.
 * `alloy_load_trusted_server_env_exports` is the canonical trusted-host resolver
 * already in production use: the governed census reads `alloy_deployed_primary`
 * through exactly this reference, in exactly this child-process boundary. The
 * write path reuses it rather than minting a second way to reach the same
 * database, because two credential paths to one database is two things to audit
 * and one of them will drift.
 */
export const PRODUCTION_CREDENTIAL_BINDING = Object.freeze({
  target: "alloy_deployed_primary",
  credential_ref: "ambient:ALLOY_SERVER_ENV_SOURCE#DATABASE_URL",
  /*
   * WHAT THE AUDIT WRITES, AND WHY IT IS SHORTER THAN THE REFERENCE ABOVE.
   *
   * The governed result detector treats the bare token DATABASE_URL as secret
   * material — correctly, for a payload that should never mention it. A
   * production audit is the one thing that has to NAME its credential, so
   * writing the full reference into a governed result made every successful
   * apply fail `result_validation_failed` and never reach the operator. An
   * integration run through the real governed path found this; the unit tests
   * could not, because they stop at the trusted-host boundary.
   *
   * The fix is not to loosen a detector that guards every action's result. It
   * is to have the audit name the credential SOURCE, which identifies it
   * unambiguously, and leave the exact field spelled out here in reviewed code
   * where no detector is guarding anything. A reader of either knows precisely
   * which credential ran.
   */
  audit_ref: "ambient:ALLOY_SERVER_ENV_SOURCE",
  resolver: "alloy_load_trusted_server_env_exports (scripts/local-dev/lib/verify.sh)",
  resolved_in: "the trusted-host action child process only",
  never: [
    "held by a lane, a worker or any provider process",
    "written into repository config or a governed-action payload",
    "passed through a browser",
    "printed to stdout, stderr, the action store or an operator result",
  ],
  absence_is: "trusted_credential_unavailable (child exit 42), a distinct failure and never a generic one",
});

/**
 * THE REGISTERED PRODUCTION PROJECT, REVIEWED IN THIS REPOSITORY.
 *
 * A Supabase project ref is public — the browser sends it on every API call —
 * so recording it here discloses nothing. What it buys is the thing proof 6
 * previously could not have: an identity the credential's own environment does
 * not get to assert. Before this it was null, the check degraded to "the two
 * values in the trusted env agree with each other", and a mis-pointed env would
 * have agreed with itself perfectly.
 *
 * Changing this line changes which database Alloy will migrate. That is the
 * point of it being a line.
 */
export const REGISTERED_PRODUCTION_PROJECT_REF = "ikaxilmwmrmbagoidedu";

/** Failure codes. Named separately so none of them can collapse into `action_unavailable`. */
export const PRODUCTION_APPLY_FAILURES = Object.freeze({
  REVALIDATION_FAILED: "production_request_revalidation_failed",
  PRECONDITION_REFUSED: "production_precondition_refused",
  CREDENTIAL_UNAVAILABLE: "trusted_credential_unavailable",
  EXECUTOR_NOT_SANCTIONED: "executor_not_sanctioned",
  EXECUTOR_TARGET_MISMATCH: "executor_target_mismatch",
  EXECUTOR_TARGET_UNREGISTERED: "executor_target_unregistered",
  HOSTED_READ_FAILED: "hosted_state_unreadable",
  HOSTED_DRIFT: "hosted_state_drifted_since_approval",
  REQUIRED_SET_UNREADABLE: "candidate_required_set_unreadable",
  APPLY_FAILED: "migration_sql_failed",
  APPLY_AMBIGUOUS: "migration_outcome_ambiguous",
  // Raised while the apply child is still choosing its database, before a
  // connection exists. Named here so they can be surfaced verbatim rather than
  // folded into "the SQL failed".
  TARGET_UNREGISTERED: "target_resolution_failed",
  TARGET_ENVIRONMENT_MISMATCH: "target_environment_mismatch",
  HOST_DEPENDENCY_MISSING: "trusted_host_dependency_missing",
  VERIFICATION_FAILED: "post_apply_verification_failed",
  /*
   * APPLIED, BUT THE LEDGER DOES NOT SAY SO — and this is not a verification
   * failure, however much it used to share that code.
   *
   * MEASURED TWICE. D2 (gar_792710a5f553ee) landed its schema and reported
   * post_apply_verification_failed; the repair gar_db1d3588e3fac9 moved the
   * ledger 405 → 412 and census gar_eefbd899c30b21 then confirmed parity. W-17
   * repeated it, 412 → 413.
   *
   * The old code covered two OPPOSITE facts: the ledger could not be re-read at
   * all (nobody knows whether the schema is there), and the ledger was read
   * cleanly and lacks the versions (the schema IS there and the bookkeeping is
   * not). Retrying the first wastes time; retrying the second applies a
   * migration a second time. They cannot share a name.
   */
  APPLIED_LEDGER_INCOMPLETE: "migration_applied_ledger_incomplete",
  RESULT_CONTAINED_SECRETS: "result_contained_secrets",
});

/**
 * No-effect failures worth naming to the caller as themselves.
 *
 * Not a second classifier. `classifyApplyFailure` has already decided the
 * database was never touched; this only decides whether the operator is told
 * WHY in the code, or told the generic thing and left to find the reason in a
 * detail string. Each is raised before a connection exists, carries no
 * credential material in its name, and has exactly one cause — which is what
 * makes it both safe and useful to surface verbatim.
 */
const PRE_EXECUTION_SURFACED_CODES = new Set([
  PRODUCTION_APPLY_FAILURES.TARGET_UNREGISTERED,
  PRODUCTION_APPLY_FAILURES.TARGET_ENVIRONMENT_MISMATCH,
  PRODUCTION_APPLY_FAILURES.CREDENTIAL_UNAVAILABLE,
  PRODUCTION_APPLY_FAILURES.HOST_DEPENDENCY_MISSING,
]);

/** Every failure this executor can return. Used by tests to prove none is a catch-all. */
export const PRODUCTION_APPLY_FAILURE_CODES = Object.freeze(Object.values(PRODUCTION_APPLY_FAILURES));

const norm = (v) => String(v ?? "").trim().toLowerCase();
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

/**
 * A VALUE detector, not a word detector.
 *
 * The distinction is load-bearing here and was found by this module's own test.
 * The audit's whole job on this path is to NAME the credential it used —
 * `ambient:ALLOY_SERVER_ENV_SOURCE#DATABASE_URL` is a reference, and a reference
 * is exactly what a reviewer needs to see. A detector that flags the bare token
 * would force the audit to describe the credential in words that avoid naming
 * it, which is how an audit becomes unreadable in the name of being safe.
 *
 * So a connection string, a key and an ASSIGNMENT are secrets; the name of an
 * environment variable, on its own, is not.
 */
const SECRET_RE = new RegExp([
  "postgresql://[^\\s\"']*[:@]",          // a connection string with an authority
  "postgres://[^\\s\"']*[:@]",
  "(?:DATABASE_URL|SERVICE_ROLE[A-Z_]*|PGPASSWORD)\\s*(?:=|\"\\s*:)\\s*[^\\s\"',}]",  // an assignment
  "ghp_[A-Za-z0-9]{10,}",
  "github_pat_[A-Za-z0-9_]{10,}",
  "eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]+\\.",  // a JWT
].join("|"), "i");

/** Would this value carry credential material if it were stored or shown? */
export function containsCredentialMaterial(value) {
  const text = typeof value === "string" ? value : (() => {
    try { return JSON.stringify(value); } catch { return ""; }
  })();
  return SECRET_RE.test(text);
}

/**
 * Judge a resolved trusted-host identity.
 *
 * Separated from the probe so the JUDGEMENT is testable without a database and
 * cannot be quietly satisfied by a probe that returns nothing: an empty
 * observation refuses, exactly as an unreadable one does.
 */
export function judgeProductionExecutorIdentity({
  target = null,
  /** direct | shared_pooler | unrecognised — how much the hostname can establish. */
  dbHostKind = null,
  dbProjectRef = null,
  apiProjectRef = null,
  /** Proven by a successful live read over the resolved credential. */
  connectionEstablished = false,
  registeredProjectRef = REGISTERED_PRODUCTION_PROJECT_REF,
} = {}) {
  const t = norm(target);
  if (!PRODUCTION_APPLY_TARGETS.includes(t)) {
    return { ok: false, code: PRODUCTION_APPLY_FAILURES.EXECUTOR_TARGET_MISMATCH, detail: `${t || "(none)"} is not a registered production target.` };
  }

  // 1 — A TRUSTED CONFIGURED IDENTITY MUST EXIST. Without one there is nothing
  // for the environment to be checked against, and the whole check collapses
  // into the environment agreeing with itself.
  const registered = norm(registeredProjectRef);
  if (!registered) {
    return {
      ok: false,
      code: PRODUCTION_APPLY_FAILURES.EXECUTOR_TARGET_UNREGISTERED,
      detail: "No production project is registered in the repository, so the resolved credential cannot be checked against anything.",
    };
  }

  // 2 — THE DEPLOYMENT'S OWN PROJECT MUST BE THE REGISTERED ONE.
  const api = norm(apiProjectRef);
  if (!api) {
    return { ok: false, code: PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED, detail: "The trusted host could not name the deployment's project. An unmeasured match is not a match." };
  }
  if (api !== registered) {
    return {
      ok: false,
      code: PRODUCTION_APPLY_FAILURES.EXECUTOR_TARGET_MISMATCH,
      detail: "The trusted environment is configured for a different Supabase project than the registered production one.",
    };
  }

  // 3 — THE HOSTNAME ESTABLISHES IDENTITY ONLY WHEN IT NAMES ONE PROJECT.
  //
  // `db.<ref>.supabase.co` does. A pooler host does not: it is shared
  // infrastructure serving many projects, and accepting it as identity would be
  // accepting "somewhere in this fleet" as "this database". The ref does live in
  // a pooler URL's username, and that is credential material this refuses to
  // read — the target is not worth reaching into the secret to prove.
  const kind = norm(dbHostKind);
  const db = norm(dbProjectRef);
  if (kind === "direct") {
    if (!db) {
      return { ok: false, code: PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED, detail: "A direct database host named no project. UNKNOWN refuses." };
    }
    if (db !== registered) {
      return {
        ok: false,
        code: PRODUCTION_APPLY_FAILURES.EXECUTOR_TARGET_MISMATCH,
        detail: "The database this credential reaches is not the registered production project.",
      };
    }
  } else if (kind !== "shared_pooler") {
    // An unrecognised host shape is UNKNOWN, and UNKNOWN refuses. A new
    // connection topology should be reviewed rather than assumed benign.
    return {
      ok: false,
      code: PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED,
      detail: `Unrecognised database host shape (${kind || "none"}); a connection topology this check has not been reviewed against cannot establish the target.`,
    };
  }

  // 4 — LIVE EVIDENCE. Configuration says which project is intended; only a
  // completed read proves the credential actually reaches a working database.
  // Required for every host kind, and the only identity evidence a shared
  // pooler has beyond configuration.
  if (connectionEstablished !== true) {
    return {
      ok: false,
      code: PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED,
      detail: "No live read has established that the resolved credential reaches the target database.",
    };
  }

  return {
    ok: true,
    sanctioned: true,
    target: t,
    project_ref: registered,
    host_kind: kind,
    // Named so the audit records HOW the target was established, not merely
    // that it was. The pooler basis is weaker than the direct one and says so.
    identity_proof: kind === "direct"
      ? "registered_ref_and_direct_host"
      : "registered_ref_with_pooler_connection",
  };
}

/** Highest version in a measured set, or null. */
export function headOf(versions = []) {
  const sorted = [...versions].map(String).filter(Boolean).sort();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

function refuse(code, detail, extra = {}) {
  return { ok: false, code, detail, ...extra };
}

/**
 * Apply an approved production migration batch.
 *
 * Every argument that touches the world is an adapter. `revalidate` re-runs the
 * request's own validator; `resolveExecutorIdentity` asks the trusted host who it
 * is; `readHostedVersions` reads the live ledger; `readRequiredVersions` reads
 * the candidate's required set out of the git object store; `applyBatch` runs the
 * migrations. A test replaces the first and third of those and keeps the rest.
 */
export function executeProductionMigrationApply({
  revalidate = null,
  resolveExecutorIdentity = null,
  readHostedVersions = null,
  readRequiredVersions = null,
  applyBatch = null,
  approval = null,
  /** Hosted head recorded when the operator approved, when one was recorded. */
  approvedHostedHead = null,
  nowMs = Date.now(),
} = {}) {
  const started_at = iso(nowMs);
  const audit = {
    action_key: PRODUCTION_APPLY_ACTION_KEY,
    environment: "production",
    started_at,
    completed_at: null,
    approval: approval ? {
      decision: approval.decision || null,
      actor: approval.actor || approval.decision_actor || null,
      at: approval.at || null,
      authorization_id: approval.authorization_id || null,
      delegated: approval.delegated === true,
    } : null,
  };
  const done = (payload) => ({ ...payload, audit: { ...audit, completed_at: iso(nowMs), ok: payload.ok === true } });

  for (const [name, fn] of Object.entries({ revalidate, resolveExecutorIdentity, readHostedVersions, readRequiredVersions, applyBatch })) {
    if (typeof fn !== "function") {
      return done(refuse(PRODUCTION_APPLY_FAILURES.EXECUTOR_NOT_SANCTIONED, `Production apply requires a ${name} adapter from the trusted host.`));
    }
  }

  // ── 0. REVALIDATE. Not "the proposal validated once" — the candidate SHA, the
  // governed promotion authority, the delta bound and the migration artefacts
  // are all re-established now, against the world as it is at execution.
  const revalidated = revalidate();
  if (!revalidated?.ok) {
    return done(refuse(
      PRODUCTION_APPLY_FAILURES.REVALIDATION_FAILED,
      revalidated?.detail || "The production migration request no longer validates.",
      { proof: revalidated?.code || null },
    ));
  }
  const normalized = revalidated.normalized;
  audit.candidate_sha = normalized.expectedSha;
  audit.target = normalized.target;
  audit.migrations = normalized.migrations.map((m) => ({ version: String(m.version), path: m.path, file_sha: m.fileSha }));
  audit.source_relation = normalized.sourceRelation || null;

  // ── 1. CREDENTIAL. Before anything else touches the database, and fail-closed:
  // a credential that cannot be resolved must never become an attempted apply.
  const identity = resolveExecutorIdentity({ target: normalized.target });
  if (!identity?.ok) {
    return done(refuse(
      identity?.code || PRODUCTION_APPLY_FAILURES.CREDENTIAL_UNAVAILABLE,
      identity?.detail || "The trusted host could not resolve the deployed-primary credential.",
      { migration_attempted: false },
    ));
  }
  // The probe answers WHO the credential is for. It cannot yet answer whether
  // that credential reaches a working database — only a completed read does
  // that — so the judgement waits for the live reading below.
  audit.executor = {
    resolved: true,
    host_kind: identity.dbHostKind ?? identity.db_host_kind ?? null,
    credential_ref: PRODUCTION_CREDENTIAL_BINDING.audit_ref,
  };

  // ── 2. THE LIVE HOSTED READING. This is the time-of-use measurement; nothing
  // cached is permitted to stand in for it.
  const hosted = readHostedVersions();
  if (!hosted?.ok) {
    return done(refuse(
      hosted?.code === PRODUCTION_APPLY_FAILURES.CREDENTIAL_UNAVAILABLE
        ? PRODUCTION_APPLY_FAILURES.CREDENTIAL_UNAVAILABLE
        : PRODUCTION_APPLY_FAILURES.HOSTED_READ_FAILED,
      hosted?.detail || "Hosted migration state could not be read. UNKNOWN refuses.",
      { migration_attempted: false },
    ));
  }
  const measured = (hosted.versions || []).map(String);
  const headBefore = hosted.head || headOf(measured);
  audit.hosted_head_before = headBefore;

  // ── 2b. NOW the target can be judged: configuration plus a completed read.
  const judged = judgeProductionExecutorIdentity({
    target: normalized.target,
    dbHostKind: identity.dbHostKind ?? identity.db_host_kind,
    dbProjectRef: identity.dbProjectRef ?? identity.db_project_ref,
    apiProjectRef: identity.apiProjectRef ?? identity.api_project_ref,
    connectionEstablished: true,
  });
  if (!judged.ok) return done({ ...judged, migration_attempted: false, ok: false });
  audit.executor = {
    sanctioned: true,
    target: judged.target,
    project_ref: judged.project_ref,
    host_kind: judged.host_kind,
    identity_proof: judged.identity_proof,
    credential_ref: PRODUCTION_CREDENTIAL_BINDING.audit_ref,
  };

  // A head that moved since the approval means the operator approved against a
  // database that no longer exists in that state. That is not a retry.
  if (approvedHostedHead && String(approvedHostedHead) !== String(headBefore || "")) {
    return done(refuse(
      PRODUCTION_APPLY_FAILURES.HOSTED_DRIFT,
      `Hosted head was ${approvedHostedHead} when this was approved and is ${headBefore || "(none)"} now. A fresh governed action is required.`,
      { migration_attempted: false, approved_hosted_head: String(approvedHostedHead), observed_hosted_head: headBefore },
    ));
  }

  const required = readRequiredVersions({ sha: normalized.expectedSha });
  if (!Array.isArray(required) || !required.length) {
    return done(refuse(
      PRODUCTION_APPLY_FAILURES.REQUIRED_SET_UNREADABLE,
      "The candidate's required migration set could not be read from the git object store. UNKNOWN refuses.",
      { migration_attempted: false },
    ));
  }

  const parity = migrationParity({ required, measured, measuredHead: headBefore });
  audit.parity_before = { status: parity.status, missing: parity.missing, unexpected: parity.unexpected };

  // ── 3. THE SEVEN PROOFS, AT EXECUTION TIME, IMMEDIATELY BEFORE MUTATION.
  const proofs = assertProductionApplyPreconditions({
    normalized,
    parity,
    approval,
    registeredTarget: judged.target,
    executorRuntime: { sanctioned: true, target: judged.target },
  });
  if (!proofs.ok) {
    return done(refuse(
      PRODUCTION_APPLY_FAILURES.PRECONDITION_REFUSED,
      proofs.detail || "A production apply precondition refused.",
      { proof: proofs.code, migration_attempted: false },
    ));
  }
  audit.preconditions = { passed: true, versions: proofs.versions, order: proofs.order };

  // ── 4. MUTATE.
  const applyResult = applyBatch(normalized);
  audit.apply = {
    ok: applyResult?.ok === true,
    migrations: (applyResult?.results || []).map((r) => ({
      version: r.version, path: r.path, ok: r.ok, idempotent: Boolean(r.idempotent), ledger: r.ledger || null, code: r.code || null,
    })),
  };
  if (containsCredentialMaterial(applyResult)) {
    return done(refuse(PRODUCTION_APPLY_FAILURES.RESULT_CONTAINED_SECRETS, "The migration result carried credential material and was discarded."));
  }
  if (applyResult?.ok !== true) {
    const classified = classifyApplyFailure({ applyResult });
    // A refusal that never reached the database and an execution that may have
    // half-run are different facts and must never share a code.
    /*
     * Among refusals that never reached the database, "the SQL failed" is its
     * own kind of lie. So a no-effect refusal surfaces the reason it actually
     * had: a target routing does not recognise says so and names the name; a
     * missing credential says so. Only a no-effect failure with nothing more
     * specific to say falls back to `migration_sql_failed`, which is then true —
     * something reached the database and did not take.
     */
    const code = classified.classification === "no_effect"
      ? (PRE_EXECUTION_SURFACED_CODES.has(classified.code)
        ? classified.code
        : PRODUCTION_APPLY_FAILURES.APPLY_FAILED)
      : PRODUCTION_APPLY_FAILURES.APPLY_AMBIGUOUS;
    return done(refuse(code, classified.detail, {
      migration_attempted: classified.classification !== "no_effect",
      classification: classified,
      applied: (applyResult?.results || []).filter((r) => r.ok).map((r) => String(r.version)),
    }));
  }

  // ── 5. A SUCCESSFUL EXIT IS NOT A PASS. Re-read and let the measurement, not
  // the executor, say whether the schema is there.
  const after = readHostedVersions();
  if (!after?.ok) {
    return done(refuse(
      PRODUCTION_APPLY_FAILURES.VERIFICATION_FAILED,
      "Migrations applied, but hosted state could not be re-read to verify them. The outcome is not established; "
      + "whether the schema landed is UNKNOWN and must be measured before anything is re-applied.",
      {
        migration_attempted: true, verified: false,
        schema_applied: null, ledger_present: null,
        retry_apply_allowed: false,
        recommended_action: "verify_first",
      },
    ));
  }
  const measuredAfter = (after.versions || []).map(String);
  const headAfter = after.head || headOf(measuredAfter);
  audit.hosted_head_after = headAfter;
  const parityAfter = migrationParity({ required, measured: measuredAfter, measuredHead: headAfter });
  audit.parity_after = { status: parityAfter.status, missing: parityAfter.missing, unexpected: parityAfter.unexpected };

  const outcome = evaluateProductionApplyOutcome({
    applyResult,
    // The re-read IS the census for this purpose: it is a governed read of the
    // same hosted ledger, taken after the write, by the same trusted host.
    censusResult: { ok: true },
    parityAfter,
    requestedVersions: proofs.versions,
  });
  audit.outcome = outcome;

  const versionsPresent = proofs.versions.every((v) => measuredAfter.includes(String(v)));
  if (!versionsPresent) {
    const missing = proofs.versions.filter((v) => !measuredAfter.includes(String(v))).map(String);
    /*
     * The ledger WAS readable — `after.ok` is true above — so this is not an
     * unknown outcome. The apply reported success and the identity is absent,
     * which is a bookkeeping gap over schema that is already there. The
     * resolution is a proof-backed ledger repair, never a second apply, and the
     * result says so in the code rather than only in a detail string nobody
     * parses.
     */
    const disposition = resolveMigrationOutcome({
      state: outcome?.state ?? null,
      applyStarted: true,
      schemaApplied: true,
      ledgerPresent: false,
      versions: proofs.versions,
    });
    return done(refuse(
      PRODUCTION_APPLY_FAILURES.APPLIED_LEDGER_INCOMPLETE,
      `Applied ${proofs.versions.join(", ")} and the hosted ledger does not report ${missing.join(", ")}. `
      + "The schema change is present; the ledger identity is not. Do NOT re-apply: repair the ledger after proving the effects.",
      {
        migration_attempted: true,
        schema_applied: true,
        ledger_present: false,
        ledger_missing: missing,
        hosted_head_before: headBefore,
        hosted_head_after: headAfter,
        verified: false,
        outcome,
        disposition,
        retry_apply_allowed: false,
        recommended_action: disposition.recommended_action,
      },
    ));
  }

  return done({
    ok: true,
    target: normalized.target,
    expected_sha: normalized.expectedSha,
    migrations: audit.apply.migrations,
    hosted_head_before: headBefore,
    hosted_head_after: headAfter,
    verified: true,
    verification: { method: "post_apply_hosted_ledger_reread", versions: proofs.versions, parity_after: parityAfter.status },
    outcome,
    recensus_required: outcome.promotion_released !== true,
  });
}

/**
 * The result an operator and a worker are allowed to see.
 *
 * Built by naming fields rather than by deleting them: a redactor that removes
 * known-bad keys ships whatever key nobody thought of.
 */
export function publicProductionApplyResult(result) {
  if (!result) return null;
  return {
    ok: result.ok === true,
    action_key: PRODUCTION_APPLY_ACTION_KEY,
    target: result.target || result.audit?.target || null,
    expected_sha: result.expected_sha || result.audit?.candidate_sha || null,
    migrations: result.migrations || result.audit?.apply?.migrations || [],
    hosted_head_before: result.hosted_head_before ?? result.audit?.hosted_head_before ?? null,
    hosted_head_after: result.hosted_head_after ?? result.audit?.hosted_head_after ?? null,
    verified: result.verified === true,
    verification: result.verification || null,
    outcome: result.outcome || result.audit?.outcome || null,
    recensus_required: result.recensus_required !== false,
    code: result.ok === true ? null : (result.code || null),
    proof: result.proof || null,
    detail: result.ok === true ? null : (result.detail || null),
    migration_attempted: result.migration_attempted ?? null,
    /*
     * ENUMERATED, LIKE EVERY FIELD ABOVE IT — and that is why they are here.
     * This projection is built by NAMING fields, so a field added to the refusal
     * and not added here is computed, carried, and then silently dropped before
     * any operator or recovery pass sees it. That is what already happened to
     * the rich `outcome` during D2: it existed and never reached the reader.
     *
     * These are the fields that answer the only question that matters after a
     * migration stops: is it safe to apply again?
     */
    schema_applied: result.schema_applied ?? null,
    ledger_present: result.ledger_present ?? null,
    ledger_missing: result.ledger_missing || null,
    retry_apply_allowed: result.retry_apply_allowed ?? (result.ok === true ? false : null),
    recommended_action: result.recommended_action || null,
    disposition: result.disposition || null,
    audit: result.audit || null,
  };
}
