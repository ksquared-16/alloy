/**
 * Firefly staging seed — the tenant's lifecycle department the seed binds to (ALY-14 E3).
 *
 * One definition, read by the seed's gate and binding (renderSql.ts), its verification (verifySql.ts),
 * the scratch proof's `configured` model (scratchProof.ts) and the hosted tenant census
 * (tenantCensusSql.ts), so none of them can drift back to a guessed key.
 *
 * Source: the hosted staging census of 2026-10-23 (target `alloy_deployed_primary` = project
 * `ikaxilmwmrmbagoidedu`), certification/business-processes-v2/d2d5/enrollment-decision-config-census.sql.results.json,
 * question dd_01_stages. Firefly's one staged-lifecycle process is key `enrollment`, active, in the
 * department keyed `lead_management`, with seven active stages. The department keyed `enrollment` in that
 * output is QA Shared's. Firefly also has a department keyed `enrollment` (step 1, 2026-11-25) with no
 * active process; the seed and the census never bind to it.
 */

/** The Firefly department whose `metadata.lifecycle_builder_v1` holds the Enrollment process. */
export const FIREFLY_LIFECYCLE_DEPARTMENT_KEY = "lead_management" as const;

/**
 * That department's id as last observed (docs/handoffs/one-family-certification-handoff.md:21-22; five
 * Firefly migrations UPDATE it by this id). Reported by the census, never bound to: the key is the binding.
 */
export const FIREFLY_LIFECYCLE_DEPARTMENT_ID_OBSERVED = "3933ac47-077a-4de8-aaac-8aed48d80413" as const;

/** The key of the department's active process (`lifecycle_builder_v1.active_process_id` → this process). */
export const FIREFLY_ACTIVE_PROCESS_KEY = "enrollment" as const;

/** The active process's stages, in journey order. No `closed` / `closed_withdrawn` stage. */
export const FIREFLY_PROCESS_STAGE_KEYS = Object.freeze([
    "lead",
    "tour",
    "decision",
    "waitlist",
    "offered",
    "enrolling",
    "enrolled",
] as const);

/** The department's lifecycle queues, one `lifecycle_wu_<stage>` per stage — seven. */
export const FIREFLY_LIFECYCLE_WORK_UNIT_KEYS = Object.freeze(
    FIREFLY_PROCESS_STAGE_KEYS.map((stage) => `lifecycle_wu_${stage}` as const),
);

/** A department keyed this way exists in Firefly but holds no process; it is reported, never bound. */
export const FIREFLY_UNBOUND_DEPARTMENT_KEY = "enrollment" as const;
