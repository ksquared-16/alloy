import type { SupabaseClient } from "@supabase/supabase-js";

export type OpportunityTourBookingContextRow = {
    id: string;
    org_id: string;
    location_id: string | null;
    primary_person_id: string | null;
    primary_contact_id: string | null;
};

export async function fetchOpportunityForTourAdmin(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<{ ok: true; row: OpportunityTourBookingContextRow } | { ok: false; status: 404 | 400; message: string }> {
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return { ok: false, status: 400, message: "opportunity_id required" };

    const { data, error } = await supabase
        .from("opportunities")
        .select("id, org_id, location_id, primary_person_id, primary_contact_id")
        .eq("id", oid)
        .eq("org_id", orgId)
        .maybeSingle();

    if (error) return { ok: false, status: 400, message: error.message };
    if (!data) return { ok: false, status: 404, message: "Opportunity not found" };
    return { ok: true, row: data as OpportunityTourBookingContextRow };
}

/** When the opportunity has a site, bookings must use that location unless caller is staff changing site explicitly (still org-scoped). */
export function assertBookingLocationMatchesOpportunity(
    opp: OpportunityTourBookingContextRow,
    locationId: string
): { ok: true } | { ok: false; message: string } {
    const loc = String(locationId ?? "").trim();
    const pinned = opp.location_id != null && String(opp.location_id).trim() !== "" ? String(opp.location_id).trim() : null;
    if (pinned && loc !== pinned) {
        return { ok: false, message: "location_id must match the opportunity's location" };
    }
    return { ok: true };
}
