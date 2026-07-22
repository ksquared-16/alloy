import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { LOCATION_PROGRAM_CATEGORY_SELECT_PUBLICATION } from "@/lib/locations/locationProgramCategorySelect";

function asOptionalString(value: unknown): string | null {
    const raw = String(value ?? "").trim();
    return raw || null;
}

function mapCategoryRow(row: Record<string, unknown>): LocationProgramCategoryRow | null {
    const id = String(row.id ?? "").trim();
    const location_id = String(row.location_id ?? "").trim();
    const key = String(row.key ?? "").trim();
    const label = String(row.label ?? "").trim();
    if (!id || !location_id || !key || !label) return null;
    return {
        id,
        org_id: String(row.org_id ?? "").trim(),
        location_id,
        key,
        label,
        sort_order: row.sort_order != null ? Number(row.sort_order) : null,
        is_active: row.is_active !== false,
        metadata:
            row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : null,
        program_id: asOptionalString(row.program_id),
        program_revision_id: asOptionalString(row.program_revision_id),
        configuration_consumption_id: asOptionalString(row.configuration_consumption_id),
        local_display_name: asOptionalString(row.local_display_name),
        available_from: asOptionalString(row.available_from),
        available_through: asOptionalString(row.available_through),
        local_description_override: asOptionalString(row.local_description_override),
        local_authorization_evidence: asOptionalString(row.local_authorization_evidence),
    };
}

/** Server-side batch load for org location program categories (includes inactive for display). */
export async function loadLocationProgramCategoriesForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<LocationProgramCategoryRow[]> {
    const { data, error } = await supabase
        .from("location_program_categories")
        .select(LOCATION_PROGRAM_CATEGORY_SELECT_PUBLICATION)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

    if (error || !data?.length) return [];

    return data
        .map((raw) => mapCategoryRow(raw as Record<string, unknown>))
        .filter((r): r is LocationProgramCategoryRow => r != null);
}
