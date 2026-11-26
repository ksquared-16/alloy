/**
 * The slot-capacity contract between the booking service and the database.
 *
 * Every capacity-consuming booking write records the limit of the slot it landed in under
 * `metadata.slot_capacity`. The trigger `enforce_tour_booking_slot_capacity`
 * (migration 20261211090000) re-counts overlapping bookings at the location under a
 * per-location advisory lock and refuses the write once the slot is full — so two families
 * racing for the last seat cannot both get it, whichever route they came through.
 */

/** The metadata key the capacity trigger reads. */
export const TOUR_BOOKING_SLOT_CAPACITY_METADATA_KEY = "slot_capacity" as const;

/** Raised by the database (SQLSTATE 23P01) when a write would overfill a slot. */
export const TOUR_SLOT_CAPACITY_EXCEEDED = "tour_slot_capacity_exceeded" as const;

/**
 * True when a booking write lost the race for the last seat. Nothing was written; callers
 * answer "that time was just taken — choose another", never a generic failure.
 */
export function isTourSlotCapacityConflict(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return message.includes(TOUR_SLOT_CAPACITY_EXCEEDED);
}
