/**
 * THE CANONICAL OWNER OF EXECUTABLE RECONCILIATIONS.
 *
 * ── WHY THIS EXISTS ──
 *
 * `qaConvergePlacementWaitlistedChildren` is already canonical: it writes only through
 * `applyChildWaitlistViaOutcomeRuntime`, is idempotent, defaults to DRY_RUN, and contains no ad-hoc
 * SQL lifecycle write. What it had no way to be was RUN. The control plane's eighteen actions
 * include no script executor, and `vacilando.apply_reconciliation_plan` is not one — that applies
 * Vacilando METADATA corrections from a plan the executor recomputes itself, and misusing it to
 * move children between enrollment stages would be laundering product data through a governance
 * capability.
 *
 * So a sanctioned repair existed with no sanctioned way to perform it, and the alternatives were a
 * permanent admin endpoint or hand-run SQL. Both are worse than the gap.
 *
 * ── WHAT THIS MUST NEVER BECOME ──
 *
 * A way to say "run this command". The security property is that a worker names a KEY and nothing
 * else: no script path, no shell string, no executable, no environment variables. Every dimension a
 * run needs — which script, which environments it may touch, whether a dry run is even meaningful —
 * is resolved HERE, from a frozen table that ships with the toolkit and is reviewed like any other
 * promoted code. This mirrors `deployed-target-registry.mjs`, for the same reason and with the same
 * discipline.
 *
 * PRODUCTION IS ABSENT BY CONSTRUCTION. There is no production entry to disable, mis-key or
 * accidentally enable. Adding one would be a visible, reviewable change to this table.
 */

/** Environments a registered reconciliation may be permitted to touch. Production is not one. */
export const RECONCILIATION_ENVIRONMENTS = Object.freeze(["staging"]);

/**
 * Every reconciliation the trusted host may execute.
 *
 * `runner` names an npm script in `web/`, never a path the caller supplies. `dry_run_env` and
 * `apply_env` are the ONLY environment the runner receives beyond the trusted target credentials —
 * stated here so that "dry run" is a property of the registration rather than a promise the caller
 * makes.
 */
export const REGISTERED_RECONCILIATIONS = Object.freeze({
  converge_placement_waitlisted_children: Object.freeze({
    key: "converge_placement_waitlisted_children",
    description:
      "Converge children who are placement-waitlisted onto real child Waitlist membership, through the canonical outcome runtime.",
    environments: Object.freeze(["staging"]),
    /** npm script in web/. Resolved here; never accepted from a caller. */
    runner: "dev:qa:converge-placement-waitlisted",
    supportsDryRun: true,
    /** DRY_RUN is the default, and the apply must ALSO carry an explicit opt-in of its own. */
    dry_run_env: Object.freeze({ DRY_RUN: "1" }),
    apply_env: Object.freeze({ DRY_RUN: "0", QA_CONVERGE_APPLY: "1" }),
    /** What a caller may expect back, so a result that does not fit is a failure rather than noise. */
    result_shape: Object.freeze(["considered", "already_converged", "converged", "would_converge", "failed"]),
  }),
});

export const REGISTERED_RECONCILIATION_KEYS = Object.freeze(Object.keys(REGISTERED_RECONCILIATIONS));

/** Refusals, named so a caller learns the boundary rather than guessing at it. */
export const RECONCILIATION_REFUSALS = Object.freeze({
  MISSING_KEY: "missing_reconciliation_key",
  UNREGISTERED_KEY: "unregistered_reconciliation_key",
  MISSING_ENVIRONMENT: "missing_target_environment",
  ENVIRONMENT_NOT_PERMITTED: "environment_not_permitted",
  DRY_RUN_NOT_SUPPORTED: "dry_run_not_supported",
  DRY_RUN_NOT_BOOLEAN: "dry_run_must_be_boolean",
});

/**
 * Resolve a requested reconciliation, or say precisely why not.
 *
 * A caller supplies three things and none of them is executable: a registered key, an environment
 * name, and a boolean. Anything that looks like a path, a command or an environment variable is not
 * refused here — it has nowhere to be expressed in the first place.
 */
export function resolveReconciliationRequest(inputs = {}) {
  const key = String(inputs.reconciliation_key ?? "").trim();
  if (!key) return { ok: false, code: RECONCILIATION_REFUSALS.MISSING_KEY };

  const entry = Object.prototype.hasOwnProperty.call(REGISTERED_RECONCILIATIONS, key)
    ? REGISTERED_RECONCILIATIONS[key]
    : null;
  if (!entry) {
    return {
      ok: false,
      code: RECONCILIATION_REFUSALS.UNREGISTERED_KEY,
      detail: `"${key}" is not a registered reconciliation. Registered: ${REGISTERED_RECONCILIATION_KEYS.join(", ")}.`,
    };
  }

  const environment = String(inputs.target_environment ?? "").trim();
  if (!environment) return { ok: false, code: RECONCILIATION_REFUSALS.MISSING_ENVIRONMENT };
  if (!entry.environments.includes(environment)) {
    return {
      ok: false,
      code: RECONCILIATION_REFUSALS.ENVIRONMENT_NOT_PERMITTED,
      detail: `"${entry.key}" may run against ${entry.environments.join(", ")} — not "${environment}".`,
    };
  }

  const dryRun = inputs.dry_run;
  if (typeof dryRun !== "boolean") {
    // Not defaulted. A missing dry_run on an APPLY-capable capability is the one ambiguity that
    // could turn a look into a write, so the caller must say which it meant.
    return { ok: false, code: RECONCILIATION_REFUSALS.DRY_RUN_NOT_BOOLEAN };
  }
  if (dryRun && !entry.supportsDryRun) {
    return { ok: false, code: RECONCILIATION_REFUSALS.DRY_RUN_NOT_SUPPORTED };
  }

  return {
    ok: true,
    normalized: {
      reconciliation_key: entry.key,
      target_environment: environment,
      dry_run: dryRun,
      runner: entry.runner,
      // The executor reads the env from the ENTRY, never from the request.
      runner_env: dryRun ? { ...entry.dry_run_env } : { ...entry.apply_env },
      dedupeKey: `reconcile:${entry.key}:${environment}:${dryRun ? "dry" : "apply"}`,
    },
  };
}
