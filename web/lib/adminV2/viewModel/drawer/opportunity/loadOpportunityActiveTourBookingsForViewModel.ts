import type { SupabaseClient } from "@supabase/supabase-js";

import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import { resolveOperatorRelevantTourBooking } from "@/lib/tours/bookings/resolveOperatorRelevantTourBooking";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

/** Active non-terminal tour bookings for opportunity drawer VM first paint. */
/**
 * One query, two questions.
 *
 * `active` keeps the meaning its consumers already depend on — the bookings the family may
 * still attend — and is unchanged. `operatorRelevant` is the single booking the Process card's
 * Tour concept speaks for, INCLUDING terminal ones, because a completed or cancelled tour is
 * operator-relevant truth and filtering it out was what let a finished tour present as though
 * no tour had ever happened.
 *
 * The rows were already being fetched and then discarded by the filter, so this costs nothing
 * extra; only the discarding changes.
 */
export async function loadOpportunityTourProjectionForViewModel(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<{ active: TourBookingRow[]; operatorRelevant: TourBookingRow | null }> {
    const oid = opportunityId.trim();
    if (!oid) return { active: [], operatorRelevant: null };

    const { data: rows, error } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", orgId)
        .eq("opportunity_id", oid)
        .order("start_at", { ascending: false })
        .limit(50);

    if (error) return { active: [], operatorRelevant: null };

    const all = (rows ?? []) as TourBookingRow[];
    return {
        active: all.filter((r) => ACTIVE.has(String(r.status_key ?? ""))),
        operatorRelevant: resolveOperatorRelevantTourBooking(all),
    };
}

/**
 * The active bookings, unchanged.
 *
 * Kept exactly as it was: `patchOpportunityDrawerVmDisplayRecord` and
 * `deriveOpportunityFocusPanelCards` both mean "bookings that still stand" by this, and
 * widening it in place would have silently changed what they say.
 */
export async function loadOpportunityActiveTourBookingsForViewModel(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<TourBookingRow[]> {
    return (await loadOpportunityTourProjectionForViewModel(supabase, orgId, opportunityId)).active;
}
