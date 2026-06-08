import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_DISPLAY_LABEL_SELECT, locationDisplayLabelFromRow } from "@/lib/admin/locationDisplayLabel";

export type OrgSiteLocationOption = {
    id: string;
    label: string;
};

/**
 * Canonical org site list for admin UI (header filter, Share by Location, routing pickers).
 * Matches `/api/admin/workspace/site-filter` — active sites only, `location_type = site`.
 */
export async function resolveOrgSiteLocationsForAdmin(
    supabase: SupabaseClient,
    orgId: string,
    options?: { allowedSiteLocationIds?: string[] | null }
): Promise<OrgSiteLocationOption[]> {
    const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_DISPLAY_LABEL_SELECT)
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .or("is_active.is.null,is_active.eq.true")
        .order("label", { ascending: true })
        .limit(200);

    if (error) throw new Error(error.message);

    let sites = ((data ?? []) as Array<{ id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null }>)
        .map((row) => ({
            id: row.id,
            label: locationDisplayLabelFromRow(row)?.trim() || "Site",
        }))
        .filter((row) => row.id && row.label);

    if (options?.allowedSiteLocationIds?.length) {
        const allow = new Set(options.allowedSiteLocationIds);
        sites = sites.filter((s) => allow.has(s.id));
    }

    return sites.sort((a, b) => a.label.localeCompare(b.label));
}
