import type { SupabaseClient } from "@supabase/supabase-js";

export type OpportunityDepartmentIdSource = {
    metadata?: unknown;
    work_unit_id?: unknown;
};

function trimId(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Department id stored on create_lead and other intake paths lives in opportunity metadata. */
export function readOpportunityDepartmentIdFromMetadata(metadata: unknown): string | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return trimId((metadata as { department_id?: unknown }).department_id);
}

/** Resolve department scope for an opportunity row (metadata first, then work unit). */
export async function resolveOpportunityDepartmentId(
    supabase: SupabaseClient,
    orgId: string,
    source: OpportunityDepartmentIdSource,
): Promise<string | null> {
    const fromMetadata = readOpportunityDepartmentIdFromMetadata(source.metadata);
    if (fromMetadata) return fromMetadata;

    const workUnitId = trimId(source.work_unit_id);
    if (!workUnitId) return null;

    const { data } = await supabase
        .from("work_units")
        .select("department_id")
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .maybeSingle();

    return trimId((data as { department_id?: string | null } | null)?.department_id);
}
