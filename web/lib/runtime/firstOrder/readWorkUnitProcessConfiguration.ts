import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * THE BUSINESS PROCESS CONFIGURATION DOCUMENT, FETCHED IN ONE ROUND TRIP.
 *
 * This module is a READER, not an owner. Every question about what the document MEANS — which
 * process is active, which stages it declares, what a stage is called, which one the record
 * occupies — is answered by `buildOpportunityWorkspaceLifecycleRail` and the
 * `lifecycleBuilderFromDepartmentMetadata` family. Nothing here interprets `metadata`.
 *
 * WHY THE EMBED. The canonical answer composer reaches this document in two hops: it already holds
 * the `work_units` row, so it reads `departments` by `wuRow.department_id`. A′ starts from a work
 * unit ID alone, and doing the same thing would put two serial round trips on the critical path to
 * answer one configuration question. `work_units_department_id_fkey` exists, so PostgREST resolves
 * the department as an embedded resource and the depth is ONE hop.
 *
 * WHY NO STATUS DEFINITIONS. `buildOpportunityWorkspaceLifecycleRail` takes `statusDefs` only to
 * turn a status key into a stage for its own `current_stage_key`. The canonical composer passes
 * `statusDefs: []` and `statusKey: null` for exactly this reason (`workUnitProvisioningAnswer.ts`)
 * — the record's own `stage_key` is the marker the card reads, and A′ already has it on the
 * population row. Reading status definitions would buy an answer we hold.
 */

export type WorkUnitProcessConfiguration = {
    workUnitId: string;
    departmentId: string | null;
    /** The department's configuration document, uninterpreted. */
    departmentMetadata: unknown;
};

type EmbeddedDepartment = { id?: unknown; metadata?: unknown };

export async function readWorkUnitProcessConfiguration(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
}): Promise<WorkUnitProcessConfiguration> {
    const { data, error } = await params.supabase
        .from("work_units")
        .select("id, department_id, departments(id, metadata)")
        .eq("org_id", params.orgId)
        .eq("id", params.workUnitId)
        .maybeSingle();

    // A failed configuration read THROWS. The composer turns a throw into UNAVAILABLE; returning an
    // empty document here would instead render a process with no stages, which reads as "this
    // process is not configured" — a claim about the tenant made from a network error.
    if (error) throw new Error(`work unit process configuration read failed: ${error.message}`);
    if (!data) throw new Error("work unit process configuration read returned no work unit");

    const row = data as Record<string, unknown>;
    // PostgREST returns a to-one embed as an object, but returns an array when it cannot prove
    // cardinality. Both shapes are accepted rather than assumed.
    const embedded = row.departments;
    const dept: EmbeddedDepartment | null = Array.isArray(embedded)
        ? ((embedded[0] as EmbeddedDepartment | undefined) ?? null)
        : ((embedded as EmbeddedDepartment | null) ?? null);

    return {
        workUnitId: String(row.id ?? params.workUnitId),
        departmentId: row.department_id == null ? null : String(row.department_id),
        departmentMetadata: dept?.metadata ?? null,
    };
}
