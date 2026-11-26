/** Booking rows in these states consume slot capacity and block new overlapping bookings. */
export const TOUR_BOOKING_BLOCKING_STATUS_KEYS = [
    "pending_approval",
    "confirmed",
    "rescheduled",
] as const;

export type TourBookingBlockingStatusKey = (typeof TOUR_BOOKING_BLOCKING_STATUS_KEYS)[number];

export const TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS = [
    "requested",
    "pending_approval",
    "confirmed",
    "rescheduled",
] as const;

export type TourBookingActiveNonTerminalStatusKey = (typeof TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS)[number];

export const TOUR_LIFECYCLE_EVENT_TYPES = [
    "tour_requested",
    "tour_booking_pending",
    "tour_confirmed",
    "tour_rescheduled",
    "tour_canceled",
    "tour_no_show",
    "tour_completed",
    "tour_attendance_confirmed",
    "tour_reminder_sent",
] as const;

export type TourLifecycleEventType = (typeof TOUR_LIFECYCLE_EVENT_TYPES)[number];

export const TOUR_BOOKING_ENTITY_TYPE = "tour_bookings" as const;
