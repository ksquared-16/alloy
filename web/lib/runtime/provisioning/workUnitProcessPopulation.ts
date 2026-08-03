/**
 * THE PROCESS POPULATION — the one authoritative answer to "which records does this Work Unit's
 * Business Process govern?"
 *
 * THE DEFECT THIS EXISTS TO REMOVE. "All Leads" is an include-all Work View: no predicates, so it
 * means "every record in this process". It rendered 8 rows and counted 7. Both were computed
 * honestly, from different populations:
 *
 *   rows   → `opportunities WHERE org_id AND work_unit_id`            → the process population (8)
 *   counts → `primary_total_queue` → the `lifecycle_lead` EXECUTION LANE → 7
 *
 * The lane declares `case_status in (open, new_inquiry, new)`. One family (status `tour_scheduled`)
 * is outside that allowlist, so the lane cannot see it — and `findAllRecordsQueueKey` returns
 * `primary_total_queue` WITHOUT checking whether that lane is filtered, so the count of an
 * "all records" view was taken from a status-filtered slice of them.
 *
 * An execution lane is a slice of the process for people to work through. It is not the process.
 * A view that says "everything" must never be answered by one, and a record must never vanish from a
 * count because its status is not on some lane's worklist.
 *
 * So the population is defined ONCE, here, and both the rows and the counts read it. Not a count
 * corrected to match the rows — the same read, twice.
 *
 * WHAT THIS IS NOT. It is not a new membership authority: it selects nothing and filters nothing
 * beyond tenant, work unit and the caller's record scope. Work View predicates are still evaluated by
 * `computeOperationalProjection`, the one evaluator, exactly as before. It does not know what a stage
 * is, what a status means, or which lane exists.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";

/**
 * The operational fields a Work View predicate may read. Deliberately the SAME projection the
 * provisioning answer publishes rows from — a count evaluated over fewer fields than the rows would
 * silently disagree on any predicate that reads a missing one.
 */
export const PROCESS_POPULATION_SELECT =
    "id, org_id, work_unit_id, status_key, stage_key, stage_entered_at, created_at, updated_at, name, title, metadata, primary_person_id, location_id, customer_id";

/** Bounded, as the answer's read is. A population larger than this reports `truncated`. */
export const PROCESS_POPULATION_CAP = 500;

export type ProcessPopulation = {
    rows: Record<string, unknown>[];
    /** True when the cap was hit — a derived count may then undercount and must be reported unknown. */
    truncated: boolean;
};

/**
 * Load the Work Unit's process population.
 *
 * `scope` is the caller's already-resolved record scope (site / work-unit restrictions). It is applied
 * here rather than assumed away: the lane path applies it, so a population that ignored it would widen
 * what a restricted operator can count.
 */
export async function loadWorkUnitProcessPopulation(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    scope?: RecordScopeConstraints | null;
    scopeImpossible?: boolean;
}): Promise<ProcessPopulation> {
    // An impossible scope is an EMPTY population, not an unfiltered one.
    if (params.scopeImpossible) return { rows: [], truncated: false };

    let q = params.supabase
        .from("opportunities")
        .select(PROCESS_POPULATION_SELECT)
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId);

    const scope = params.scope ?? null;
    if (scope?.workUnitIds) q = q.in("work_unit_id", scope.workUnitIds);
    if (scope?.locationIds) q = q.in("location_id", scope.locationIds);

    const { data, error } = await q.limit(PROCESS_POPULATION_CAP);
    if (error) throw new Error(`process population read failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    return { rows, truncated: rows.length >= PROCESS_POPULATION_CAP };
}
