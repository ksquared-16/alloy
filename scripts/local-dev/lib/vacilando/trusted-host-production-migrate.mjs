/**
 * THE PRODUCTION MIGRATION APPLY OWNER.
 *
 * ── WHY THIS EXISTS AS A SEPARATE ACTION ──
 *
 * The parity gate can now say, correctly, that the deployed primary is BEHIND
 * the revision being promoted. Until this module there was no governed way to
 * answer that: `database.apply_migration` refuses production by design, so the
 * only recorded owner of a production migration was step 7 of an ARCHIVED
 * release process — a human, a laptop and a CLI. A gate that detects a problem
 * nobody is authorized to fix does not close a loop; it just stops the line.
 *
 * The fix is NOT to let the staging executor accept production. That action's
 * refusal is its most important property, an operator reading an approval card
 * must be able to tell the two apart, and an approval minted for a staging
 * apply must never be spendable on the production database. So this is a
 * distinct action key with distinct authority, composing the shared artifact
 * discipline rather than copying it.
 *
 * PRODUCTION CLASSIFICATION IS NOT RELAXED HERE. `alloy_deployed_primary`
 * remains in BLOCKED_ENVIRONMENTS and OPERATOR_ONLY_ENVIRONMENTS. What changes
 * is that Vacilando gains a governed capability to operate it, under explicit
 * Director authorization, with no path by which that authorization becomes
 * automatic.
 */
import {
  assertNoArbitrarySql,
  validateMigrationRequestCore,
} from "./trusted-host-migrate.mjs";

/** The action key. Deliberately NOT `database.apply_migration`. */
export const PRODUCTION_APPLY_ACTION_KEY = "database.apply_promoted_migration";

/**
 * The registered production-class targets, by exact name.
 *
 * An allowlist of exact names rather than a pattern or a class flag: "looks
 * like production" is the kind of inference that eventually points a mutation
 * at the wrong database. If Alloy later needs a hosted staging database it gets
 * its OWN explicit target rather than a reinterpretation of this one.
 */
export const PRODUCTION_APPLY_TARGETS = Object.freeze(["alloy_deployed_primary"]);

/** Authority: never delegable, never satisfied by a policy gate. */
export const PRODUCTION_APPLY_AUTHORITY = Object.freeze({
  action_key: PRODUCTION_APPLY_ACTION_KEY,
  operator_only: true,
  director_approval_required: true,
  delegable: false,
  consequence_class: "production_database_mutation",
});

const norm = (v) => String(v ?? "").trim().toLowerCase();

/**
 * Inputs for a production apply.
 *
 * Everything the staging path proves about the ARTIFACT is proven here by the
 * same code: a real commit, reachable from promoted staging, canonical
 * migration paths, no duplicate versions, content read from the git object
 * store. What this adds is the target rule — exactly one registered production
 * database, named in full.
 */
export function validateProductionMigrationInputs(inputs = {}, {
  repoRoot = null,
  git = null,
  fetchIfMissing = true,
  stagingRef = "origin/staging",
} = {}) {
  const noSql = assertNoArbitrarySql(inputs);
  if (!noSql.ok) return noSql;

  const target = norm(inputs.target || inputs.environment || "");
  if (!target) {
    return { ok: false, code: "missing_target", detail: "target is required and must name a registered production database." };
  }
  if (!PRODUCTION_APPLY_TARGETS.includes(target)) {
    // A NON-PRODUCTION TARGET IS REFUSED HERE TOO, in the other direction.
    // If this action accepted staging it would become a way to apply a staging
    // migration under production authority, which is the same boundary failure
    // wearing the opposite coat.
    return {
      ok: false,
      code: "target_not_registered_production",
      detail: `${PRODUCTION_APPLY_ACTION_KEY} targets only: ${PRODUCTION_APPLY_TARGETS.join(", ")}`,
    };
  }

  const core = validateMigrationRequestCore(inputs, {
    environment: target,
    actionType: PRODUCTION_APPLY_ACTION_KEY,
    repoRoot,
    // `git` omitted when not injected, so the core keeps its own default
    // facade rather than receiving an explicit null.
    ...(git ? { git } : {}),
    fetchIfMissing,
    stagingRef,
  });
  if (!core.ok) return core;

  return {
    ok: true,
    normalized: {
      ...core.normalized,
      target,
      dedupeKey: `apply-promoted:${target}:${core.normalized.expectedSha.slice(0, 12)}:${
        core.normalized.migrations.map((m) => m.version).join(",")
      }`,
    },
  };
}

/**
 * THE SEVEN PROOFS REQUIRED BEFORE MUTATING A PRODUCTION DATABASE.
 *
 * Every one of them refuses on UNKNOWN. "I could not establish it" is not
 * evidence of safety — that is the fail-open this whole effort exists to close,
 * and it is most tempting precisely here, where refusing means stopping a
 * promotion someone is waiting on.
 */
export function assertProductionApplyPreconditions({
  normalized = null,
  parity = null,
  approval = null,
  registeredTarget = null,
  executorRuntime = null,
} = {}) {
  const refuse = (code, detail) => ({ ok: false, code, detail });

  if (!normalized || normalized.actionType !== PRODUCTION_APPLY_ACTION_KEY) {
    return refuse("unvalidated_request", "Production apply requires a validated request of its own action type.");
  }
  const requested = normalized.migrations.map((m) => m.version);
  if (!requested.length) return refuse("no_migrations_requested", "A production apply must name the migrations it applies.");

  // 1 — the migrations exist in the exact promoted revision. Proven by
  // validateMigrationRequestCore, which resolves each entry out of the git
  // object store at expectedSha and refuses if it is not there. Asserted, not
  // assumed, because "the validator probably did that" is how a control ends up
  // never running.
  for (const m of normalized.migrations) {
    if (!m.fileSha) return refuse("migration_not_in_promoted_revision", `No committed artifact for ${m.version} at ${normalized.expectedSha}.`);
  }

  // 2 — the target is exactly the registered deployed primary.
  const target = norm(normalized.target);
  if (!PRODUCTION_APPLY_TARGETS.includes(target)) {
    return refuse("target_not_registered_production", `${target || "(none)"} is not a registered production target.`);
  }
  if (registeredTarget && norm(registeredTarget.name || registeredTarget) !== target) {
    return refuse("target_identity_mismatch", "Resolved database identity does not match the requested target.");
  }

  // 3 — parity currently reports BEHIND, by exactly these migrations.
  //
  // A production mutation is authorized to CLOSE a measured gap. If parity is
  // ok there is nothing to apply, and applying anyway would be a mutation with
  // no governing measurement behind it.
  if (!parity) return refuse("parity_unmeasured", "Hosted parity was not measured. Refusing to mutate production on an unmeasured gap.");
  if (parity.status === "unknown") return refuse("parity_unknown", parity.reason || "Hosted parity is UNKNOWN. UNKNOWN refuses.");
  if (parity.status === "ok") return refuse("parity_not_behind", "Hosted parity already reports PASS; there is no gap for this mutation to close.");
  if (parity.status !== "blocked") return refuse("parity_unknown", `Unrecognised parity status ${parity.status}.`);

  const missing = (parity.missing || []).map(String);
  if (!missing.length) return refuse("parity_gap_unidentified", "Parity reports BEHIND without naming the missing identities.");
  const notMissing = requested.filter((v) => !missing.includes(v));
  if (notMissing.length) {
    return refuse("migration_not_in_measured_gap", `Requested ${notMissing.join(", ")} which the hosted measurement does not report missing.`);
  }

  // 4 — no unexpected identity discrepancy making the situation ambiguous.
  //
  // Hosted rows the repository does not know about mean the two are not simply
  // "behind"; they have diverged, and applying more migrations into a database
  // whose history is not understood is how a recoverable gap becomes an
  // unrecoverable one.
  if ((parity.unexpected || []).length) {
    return refuse("hosted_identity_ambiguous", `Hosted database reports ${parity.unexpected.length} identity(ies) absent from the promoted revision.`);
  }

  // 5 — explicit Director approval, bound to THIS content.
  if (norm(approval?.decision) !== "approved") {
    return refuse("director_approval_required", "A production database mutation requires an explicit Director approval.");
  }
  if (norm(approval?.decision_actor) === "policy" || approval?.delegated === true) {
    return refuse("delegated_approval_rejected", "Production mutation cannot be satisfied by a delegated or policy approval.");
  }
  if (approval.content_fingerprint && normalized.contentFingerprint
      && approval.content_fingerprint !== normalized.contentFingerprint) {
    return refuse("approval_content_drift", "The approval was given for different content.");
  }
  const approvedVersions = (approval.approved_versions || []).map(String);
  if (approvedVersions.length) {
    const unapproved = requested.filter((v) => !approvedVersions.includes(v));
    if (unapproved.length) return refuse("migration_not_approved", `Not covered by the approval: ${unapproved.join(", ")}`);
  }

  // 6 — the executor is running with sanctioned production credentials.
  if (!executorRuntime || executorRuntime.sanctioned !== true) {
    return refuse("executor_not_sanctioned", "Production apply must run on the sanctioned trusted-host runtime.");
  }
  if (executorRuntime.target && norm(executorRuntime.target) !== target) {
    return refuse("executor_target_mismatch", "Executor credentials do not resolve to the requested target.");
  }

  // 7 — deterministic order. Applying migrations out of order is a schema
  // corruption that reports success.
  const ordered = [...requested].sort();
  if (ordered.join(",") !== requested.join(",")) {
    return refuse("nondeterministic_migration_order", "Migrations must be applied in ascending version order.");
  }

  return { ok: true, target, versions: requested, order: ordered };
}

/**
 * POST-APPLY: A SUCCESSFUL EXECUTOR EXIT IS NOT A PASS.
 *
 * The executor knows it ran a file. It does not know the deployed database now
 * satisfies the revision — only a governed census can establish that. So the
 * promotion is released by the RE-MEASUREMENT, never by the apply.
 *
 * This is structural rather than a rule to remember: parity reads the proven
 * head from census records, and applying writes no census, so an apply alone
 * cannot move the proven head. There is no path by which "we applied it"
 * becomes "it is proven".
 */
export function evaluateProductionApplyOutcome({
  applyResult = null,
  censusResult = null,
  parityAfter = null,
  requestedVersions = [],
} = {}) {
  const state = (s, extra = {}) => ({ ...extra, state: s, promotion_released: s === "promotion_released" });

  if (!applyResult) return state("blocked_apply_not_run", { detail: "No apply result to evaluate." });
  if (applyResult.ok !== true) {
    return state("blocked_apply_failed", {
      detail: applyResult.detail || "Production migration apply failed.",
      failure: classifyApplyFailure({ applyResult }),
    });
  }

  // Apply succeeded. The promotion is STILL blocked until re-measured.
  if (!censusResult) {
    return state("blocked_recensus_required", {
      detail: "Migration applied. A governed census must re-measure hosted identities before promotion resumes.",
      required_action: "database.read_census",
    });
  }
  if (censusResult.ok !== true) {
    return state("blocked_recensus_failed", {
      detail: censusResult.detail || "Post-apply census did not complete. Parity is UNKNOWN and UNKNOWN blocks.",
      required_action: "database.read_census",
    });
  }
  if (!parityAfter || parityAfter.status === "unknown") {
    return state("blocked_parity_unknown", {
      detail: parityAfter?.reason || "Post-apply parity is UNKNOWN. UNKNOWN blocks.",
    });
  }

  // The migration ran and the census completed, but the identity the migration
  // was supposed to create is still not there. That is not a retry case — it is
  // a contradiction between two measurements, and it needs a person.
  if (parityAfter.status === "blocked") {
    const stillMissing = (parityAfter.missing || []).map(String).filter((v) => requestedVersions.includes(v));
    if (stillMissing.length) {
      return state("attention_ledger_identity_absent", {
        attention: true,
        stuck: true,
        detail: `Applied ${stillMissing.join(", ")} but the hosted ledger still does not report those identities.`,
        evidence: { requested: requestedVersions, still_missing: stillMissing },
      });
    }
    return state("blocked_further_migrations_required", {
      detail: `Hosted database is still behind: ${(parityAfter.missing || []).join(", ")}`,
    });
  }

  if (parityAfter.status === "ok") {
    return state("promotion_released", {
      detail: "Hosted identity parity re-measured PASS. Promotion may resume.",
      proven_head: parityAfter.measuredHead || parityAfter.proven_head || null,
    });
  }
  return state("blocked_parity_unknown", { detail: `Unrecognised parity status ${parityAfter.status}.` });
}

/**
 * AMBIGUOUS EXECUTION MUST NOT BE REPLAYED.
 *
 * A migration that may have partially executed is the one case where the
 * helpful reflex — try again — is the dangerous one. A non-idempotent migration
 * replayed over its own partial effect can fail in a way that is much harder to
 * unwind than the original stall. So ambiguity escalates with its evidence and
 * stops; only a failure proven to have had NO effect is safe to retry.
 */
export function classifyApplyFailure({ applyResult = null } = {}) {
  const results = applyResult?.results || [];
  const failed = results.find((r) => r.ok === false) || null;
  const code = failed?.code || applyResult?.code || "apply_failed";

  // Failures that happen BEFORE any statement reaches the database. These are
  // the only ones a retry cannot make worse.
  const PRE_EXECUTION = new Set([
    "arbitrary_sql_rejected", "production_database_rejected", "target_not_registered_production",
    "migration_not_in_promoted_revision", "artifact_hash_mismatch", "apply_runner_missing",
    "source_sha_unavailable", "migration_not_in_measured_gap", "director_approval_required",
    "executor_not_sanctioned", "nondeterministic_migration_order", "preflight_failed",
  ]);
  if (PRE_EXECUTION.has(code)) {
    return {
      classification: "no_effect",
      safe_to_retry: true,
      auto_retry: false,
      code,
      detail: failed?.detail || applyResult?.detail || "Refused before execution; the database was not touched.",
    };
  }

  // The ledger disagreeing with the schema is a KNOWN-inconsistent state, not
  // an unknown one — and it is still not a retry.
  if (code === "ledger_mismatch") {
    return {
      classification: "inconsistent_known",
      safe_to_retry: false,
      auto_retry: false,
      code,
      detail: failed?.detail || "Ledger reports applied while schema evidence disagrees.",
      escalate: true,
    };
  }

  // Everything else: the statement may have run. Includes network loss after
  // mutation and a census that cannot be reached to find out.
  return {
    classification: "ambiguous",
    safe_to_retry: false,
    auto_retry: false,
    code,
    detail: failed?.detail || applyResult?.detail || "Execution outcome is not established.",
    escalate: true,
    required_next: "governed census to establish actual hosted state before any further action",
  };
}

/**
 * What Vacilando tells the Director when a promotion is blocked on schema.
 *
 * Named files, not a count and not a status word: the whole point of the
 * measurement is that the answer is specific.
 */
export function describeMissingMigrations(parity = null) {
  const missing = (parity?.missing || []).map(String);
  if (!missing.length) return null;
  const files = missing.map((v) => (parity.paths?.[v] ? parity.paths[v] : `${v}_*.sql`));
  return {
    headline: `Hosted database is missing:\n${files.join("\n")}`,
    versions: missing,
    files,
    action_required: PRODUCTION_APPLY_ACTION_KEY,
  };
}
