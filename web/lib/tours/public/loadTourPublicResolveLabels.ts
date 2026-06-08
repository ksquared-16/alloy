import type { SupabaseClient } from "@supabase/supabase-js";
import type { TourPublicBookingLinkRow } from "@/lib/tours/public/resolveTourPublicBookingLink";

/**
 * Loads display labels only after verifying opportunity + location belong to the link's org
 * (prevents cross-tenant leakage if link row were ever inconsistent).
 */
export async function loadTourPublicResolveLabels(
    supabase: SupabaseClient,
    link: TourPublicBookingLinkRow
): Promise<{ opportunity_label: string; location_label: string } | { error: string; status: number }> {
    const { data: opp, error: oErr } = await supabase
        .from("opportunities")
        .select("name, org_id")
        .eq("id", link.opportunity_id)
        .eq("org_id", link.org_id)
        .maybeSingle();
    if (oErr || !opp) {
        return { error: "Invalid or unknown link", status: 404 };
    }
    const { data: loc, error: lErr } = await supabase
        .from("locations")
        .select("label, org_id")
        .eq("id", link.location_id)
        .eq("org_id", link.org_id)
        .maybeSingle();
    if (lErr || !loc) {
        return { error: "Invalid or unknown link", status: 404 };
    }
    const on = (opp as { name?: string | null }).name;
    const ln = (loc as { label?: string | null }).label;
    return {
        opportunity_label: on != null && String(on).trim() !== "" ? String(on).trim() : "Tour",
        location_label: ln != null && String(ln).trim() !== "" ? String(ln).trim() : "Location",
    };
}
