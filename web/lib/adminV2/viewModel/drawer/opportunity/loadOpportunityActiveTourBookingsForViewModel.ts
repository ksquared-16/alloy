import type { SupabaseClient } from "@supabase/supabase-js";

import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

/** Active non-terminal tour bookings for opportunity drawer VM first paint. */
export async function loadOpportunityActiveTourBookingsForViewModel(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<TourBookingRow[]> {
    const oid = opportunityId.trim();
    if (!oid) return [];

    const { data: rows, error } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", orgId)
        .eq("opportunity_id", oid)
        .order("start_at", { ascending: false })
        .limit(50);

    if (error) return [];

    return (rows ?? []).filter((r) =>
        ACTIVE.has(String((r as { status_key?: string }).status_key ?? ""))
    ) as TourBookingRow[];
}
