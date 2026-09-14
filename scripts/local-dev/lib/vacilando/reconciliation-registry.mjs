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
    /*
     * The script requires ORG_ID and the caller may not supply it.
     *
     * This is the whole point of the frozen table: a caller names a key, an
     * environment and a boolean, and everything the run actually needs is
     * resolved here. An ORG_ID accepted from the request would be a free-form
     * execution parameter aimed at a privileged_write, which is exactly what the
     * action contract exists to prevent.
     *
     * `DEV_QUEUE_ORG_ID` is the already-established name for the seeded staging
     * organization; `environment.assign_qa_identity_access` resolves its org the
     * same way, from the same trusted server env source, and refuses ambiguity
     * rather than guessing. This reuses that convention instead of inventing a
     * second one.
     */
    required_context: Object.freeze({ ORG_ID: "DEV_QUEUE_ORG_ID" }),
    dry_run_env: Object.freeze({ DRY_RUN: "1" }),
    apply_env: Object.freeze({ DRY_RUN: "0", QA_CONVERGE_APPLY: "1" }),
    /** What a caller may expect back, so a result that does not fit is a failure rather than noise. */
    result_shape: Object.freeze(["considered", "already_converged", "converged", "would_converge", "failed"]),
  }),

  /**
   * The Financials hosted certification fixture.
   *
   * Financials Thread 11 needs a hosted staging tenant that HAS something to be a
   * workspace about: households, children, enrolment agreements, funding
   * configuration. That structure is inert and safe to declare. Money is not, and
   * is not seeded here — it is earned through the canonical Financials services,
   * which is why this fixture writes none.
   *
   * THE ORGANIZATION IS FROZEN HERE, NOT ACCEPTED FROM A CALLER. This file already
   * says why, for ORG_ID on the reconciliation above: an organization accepted
   * from the request is a free-form execution parameter aimed at a
   * privileged_write. The same reasoning applies with more force to a fixture that
   * DELETES, so the caller names a key and a target and nothing else. The result
   * reports `organization_source: "registered_context"` so a reader can tell where
   * it came from rather than assuming.
   *
   * DESTRUCTIVE, AND BOUNDED. The fixture is idempotent by removing its own prior
   * rows first, with `session_replication_role = replica` suspending the triggers
   * that correctly refuse deletion of posted childcare money. Six of those
   * teardown statements were once scoped by organization alone; they are now
   * constrained through the fixture's own program and agency, and
   * `hosted-fixture-safety.mjs` is a required gate that keeps them that way.
   */
  seed_financials_demo_tenant: Object.freeze({
    key: "seed_financials_demo_tenant",
    description:
      "Seed the Financials hosted certification tenant with household, child, enrolment and funding STRUCTURE. Writes no money.",
    environments: Object.freeze(["staging"]),
    runner: "dev:cert:seed-financials-demo-tenant",
    /*
     * A fixture seed has no meaningful look-only mode: it is a teardown followed
     * by a rebuild. Declaring that here means `dry_run: true` is refused rather
     * than quietly ignored, and the caller must still state `false` explicitly —
     * the existing ambiguity rule, unchanged.
     */
    supportsDryRun: false,
    /**
     * Frozen, not resolved from the environment and not accepted from the caller.
     *
     * `converge_placement_waitlisted_children` resolves ORG_ID from a trusted env
     * var because the seeded staging org varies by host. This one must not vary:
     * it is one certification tenant, named in the repository, reviewed like code.
     */
    frozen_context: Object.freeze({
      ORG_ID: "93667019-bd28-49b5-a688-acc9bb1e0a19",
    }),
    /** Repository-owned and frozen. Never a path a caller supplies. */
    fixture_path: "certification/fixtures/financials-demo-tenant.sql",
    purpose: "financials_hosted_certification",
    apply_env: Object.freeze({ DRY_RUN: "0", CERT_FIXTURE_APPLY: "1" }),
    result_shape: Object.freeze(["seeded", "failed"]),
  }),
});

export const REGISTERED_RECONCILIATION_KEYS = Object.freeze(Object.keys(REGISTERED_RECONCILIATIONS));

/** Refusals, named so a caller learns the boundary rather than guessing at it. */
/**
 * Fields a caller may never send, even though none of them has anywhere to be
 * expressed.
 *
 * The resolver reads exactly three inputs, so a caller-supplied `sql` or
 * `fixture_path` could never have reached execution — it would have been
 * IGNORED. That is safe and dishonest: a caller who sends `sql` believes
 * something will run it, and silence lets them keep believing. Refusing says
 * what is true, which matters most for the two that look plausible —
 * `organization_id` is frozen in the registry, and `runner` is resolved from it.
 */
export const FORBIDDEN_CALLER_FIELDS = Object.freeze([
  "organization_id", "org_id", "ORG_ID",
  "sql", "query", "fixture_path", "fixture", "script", "runner", "command", "shell",
  "db_url", "database_url", "host", "password", "service_role_key", "connection_string",
  "env", "runner_env",
]);

export const RECONCILIATION_REFUSALS = Object.freeze({
  CALLER_FIELD_NOT_PERMITTED: "caller_field_not_permitted",
  MISSING_KEY: "missing_reconciliation_key",
  UNREGISTERED_KEY: "unregistered_reconciliation_key",
  MISSING_ENVIRONMENT: "missing_target_environment",
  ENVIRONMENT_NOT_PERMITTED: "environment_not_permitted",
  DRY_RUN_NOT_SUPPORTED: "dry_run_not_supported",
  DRY_RUN_NOT_BOOLEAN: "dry_run_must_be_boolean",
  CONTEXT_UNRESOLVED: "required_context_unresolved",
  CONTEXT_INVALID: "required_context_invalid",
  RUNNER_NOT_STARTED: "runner_not_started",
});

/**
 * Resolve a requested reconciliation, or say precisely why not.
 *
 * A caller supplies three things and none of them is executable: a registered key, an environment
 * name, and a boolean. Anything that looks like a path, a command or an environment variable is not
 * refused here — it has nowhere to be expressed in the first place.
 */
export function resolveReconciliationRequest(inputs = {}) {
  /*
   * THE RESOLVER MUST READ ITS OWN OUTPUT.
   *
   * This runs TWICE on the live path: once at request time, and again inside
   * `runRegisteredReconciliation`, whose input is the `normalized` object the
   * first run produced — because that object IS the action's stored inputs. And
   * `normalized` legitimately contains `runner` and `runner_env`, which are on
   * the forbidden list.
   *
   * So the first version of this check refused the executor's own re-resolution:
   * `caller_field_not_permitted: fixture_path, runner, runner_env`. A guard
   * against callers had become a guard against the runtime. That is the same
   * defect as the metadata validator that could not re-read its own normalized
   * output, rebuilt here in a new place — and the wrapper test found it in one
   * run, which a resolver test would not have.
   *
   * `dedupeKey` is written only by this function, so its presence identifies a
   * re-resolution rather than a request. A caller cannot reach execution by
   * forging one: every value below is re-derived from the frozen table, and the
   * trusted host re-reads the registry entry independently of this object.
   */
  const isReResolution = Object.prototype.hasOwnProperty.call(inputs, "dedupeKey");
  const offered = isReResolution
    ? []
    : FORBIDDEN_CALLER_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(inputs, f));
  if (offered.length) {
    return {
      ok: false,
      code: RECONCILIATION_REFUSALS.CALLER_FIELD_NOT_PERMITTED,
      detail: `${offered.join(", ")} ${offered.length === 1 ? "is" : "are"} resolved from the frozen registry, never from the request.`,
      offered,
    };
  }

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
      /*
       * Carried because the executor reads `action.inputs`, which IS this object.
       * A field the normalizer omits does not exist by the time the runner runs —
       * the defect class that cost two operator approvals on the metadata
       * promotion path.
       */
      frozen_context: entry.frozen_context ? { ...entry.frozen_context } : null,
      fixture_path: entry.fixture_path ?? null,
      purpose: entry.purpose ?? null,
      dedupeKey: `reconcile:${entry.key}:${environment}:${dryRun ? "dry" : "apply"}`,
    },
  };
}
