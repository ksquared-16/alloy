import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComputeAvailableTourSlotsParams, TourAvailabilityRuleRow, TourBookingOverlapRow } from "@/lib/tours/availability/types";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import { computeSlotsFromRulesAndBookings } from "@/lib/tours/availability/internalCompute";
import { TOUR_BOOKING_BLOCKING_STATUS_KEYS } from "@/lib/tours/constants";

/**
 * Load active availability rules + blocking tour bookings, then compute bookable slots.
 * Rules are interpreted in each rule's `timezone`; bookings compared as UTC instants.
 */
export async function computeAvailableTourSlots(
    supabase: SupabaseClient,
    params: ComputeAvailableTourSlotsParams
): Promise<AvailableTourSlot[]> {
    const orgId = String(params.orgId).trim();
    const locationId = String(params.locationId).trim();
    const userId = params.userId != null && String(params.userId).trim() !== "" ? String(params.userId).trim() : null;
    const from = params.from;
    const to = params.to;

    let rulesQuery = supabase
        .from("tour_availability_rules")
        .select(
            "id, org_id, location_id, user_id, day_of_week, start_time, end_time, timezone, slot_duration_minutes, buffer_minutes, max_bookings_per_slot, approval_required, is_active"
        )
        .eq("org_id", orgId)
        .eq("is_active", true);

    if (userId) {
        rulesQuery = rulesQuery.or(`user_id.is.null,user_id.eq.${userId}`);
    }

    const { data: rulesRaw, error: rErr } = await rulesQuery;
    if (rErr) {
        throw new Error(`computeAvailableTourSlots: rules ${rErr.message}`);
    }

    const rules = (rulesRaw ?? []) as unknown as TourAvailabilityRuleRow[];
    const rulesForLocation = rules.filter((r) => {
        if (r.location_id == null || String(r.location_id).trim() === "") return true;
        return String(r.location_id) === locationId;
    });

    const blockingKeys = [...TOUR_BOOKING_BLOCKING_STATUS_KEYS];
    const { data: bookingsRaw, error: bErr } = await supabase
        .from("tour_bookings")
        .select("id, location_id, start_at, end_at, status_key")
        .eq("org_id", orgId)
        .eq("location_id", locationId)
        .in("status_key", blockingKeys)
        .lt("start_at", to.toISOString())
        .gt("end_at", from.toISOString());

    if (bErr) {
        throw new Error(`computeAvailableTourSlots: bookings ${bErr.message}`);
    }

    const bookings = (bookingsRaw ?? []) as unknown as TourBookingOverlapRow[];

    return computeSlotsFromRulesAndBookings(rulesForLocation, bookings, {
        locationId,
        userId,
        fromUtc: from,
        toUtc: to,
        excludeBookingId: null,
    });
}
