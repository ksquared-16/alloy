import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

/** Server-side batch load for org location program categories (includes inactive for display). */
export async function loadLocationProgramCategoriesForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<LocationProgramCategoryRow[]> {
    const { data, error } = await supabase
        .from("location_program_categories")
        .select("id, org_id, location_id, key, label, sort_order, is_active, metadata")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

    if (error || !data?.length) return [];

    return data
        .map((raw) => {
            const row = raw as Record<string, unknown>;
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
            } satisfies LocationProgramCategoryRow;
        })
        .filter((r): r is LocationProgramCategoryRow => r != null);
}
