export type ComputeAvailableTourSlotsParams = {
    orgId: string;
    /** Site / facility for slot generation and booking overlap (required). */
    locationId: string;
    /** When set, only rules with `user_id` null or matching this id apply. */
    userId?: string | null;
    /** UTC inclusive lower bound for candidate slot **starts**. */
    from: Date;
    /** UTC inclusive upper bound for candidate slot **starts** (slots starting after this are dropped). */
    to: Date;
};

export type AvailableTourSlot = {
    startAt: string;
    endAt: string;
    timezone: string;
    remainingCapacity: number;
    ruleId: string;
    locationId: string;
    userId: string | null;
};

export type TourAvailabilityRuleRow = {
    id: string;
    org_id: string;
    location_id: string | null;
    user_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
};

export type TourBookingOverlapRow = {
    id: string;
    location_id: string;
    start_at: string;
    end_at: string;
    status_key: string;
};
