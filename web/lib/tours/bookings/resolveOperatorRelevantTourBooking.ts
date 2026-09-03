/**
 * WHICH TOUR IS *THE* TOUR, when a family has more than one booking.
 *
 * The Operational Context needs to answer one question — "what is the operator-relevant Tour
 * state right now?" — and a family accumulates bookings: a completed tour in March, a
 * cancellation, a reschedule chain, a confirmed appointment next week. Picking the wrong row
 * makes the Process card lie, and the two ways to get it wrong are opposite: letting an old
 * completed tour hide a newer confirmed one, or letting a superseded pre-reschedule row show a
 * date the family is no longer coming on.
 *
 * ── THE RULE, AND WHERE IT COMES FROM ──
 *
 * 1. AN APPOINTMENT THAT STILL STANDS OUTRANKS HISTORY. If any booking is non-terminal —
 *    `requested`, `pending_approval`, `confirmed`, `rescheduled`, per
 *    `TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS` — the operator-relevant Tour is among
 *    those, whatever happened before. A completed tour in March cannot outrank next Tuesday.
 *
 * 2. SUPERSEDED ROWS NEVER WIN. `tour_bookings.rescheduled_from_booking_id` is real lineage,
 *    enforced by a trigger since the scheduling foundation. A booking another booking was
 *    rescheduled FROM has been replaced, so it is never the current Tour while its successor
 *    is present. This is what keeps a stale pre-reschedule date off the card.
 *
 * 3. AMONG WHAT REMAINS, SOONEST FIRST. Ties break on the earliest `start_at`: the next
 *    appointment is the one the operator is working toward.
 *
 * 4. WITH NO ACTIVE BOOKING, THE MOST RECENTLY CONCLUDED ONE SPEAKS. Ordered by when it
 *    actually concluded — `canceled_at` when the row carries one, otherwise `start_at`. NOT
 *    `created_at`: a cancellation recorded today for a tour that was scheduled months ago
 *    concluded today, and a booking created first is not thereby the one that ended last.
 *
 * PURE. Reads rows, returns one of them. No I/O, no status invention, no persistence — the
 * durable truth stays in `tour_bookings` and this only decides which row the projection speaks
 * for.
 */

import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

/** A booking whose status is still open — the family may yet attend it. PURE. */
export function isActiveTourBooking(booking: Pick<TourBookingRow, "status_key">): boolean {
    return ACTIVE.has(String(booking.status_key ?? ""));
}

/** Epoch ms, or null when the value cannot be read as an instant. */
function instant(value: string | null | undefined): number | null {
    const raw = (value ?? "").trim();
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    return Number.isNaN(ms) ? null : ms;
}

/** When this booking concluded: the cancellation if it has one, else its own start. */
function concludedAt(booking: TourBookingRow): number {
    return instant(booking.canceled_at) ?? instant(booking.start_at) ?? 0;
}

/**
 * The single booking the Process card's Tour concept speaks for, or null when the family has
 * never had one. PURE.
 */
export function resolveOperatorRelevantTourBooking(
    bookings: readonly TourBookingRow[] | null | undefined,
): TourBookingRow | null {
    const rows = (bookings ?? []).filter(Boolean);
    if (rows.length === 0) return null;

    // Rule 2 — anything another booking was rescheduled from has been replaced.
    const superseded = new Set(
        rows.map((b) => (b.rescheduled_from_booking_id ?? "").trim()).filter(Boolean),
    );
    const standing = rows.filter((b) => !superseded.has(b.id));
    // A chain that references rows we were not given must not empty the list.
    const candidates = standing.length > 0 ? standing : rows;

    // Rule 1 — an appointment that still stands outranks history.
    const active = candidates.filter(isActiveTourBooking);
    if (active.length > 0) {
        // Rule 3 — the next one the operator is working toward.
        return [...active].sort(
            (a, b) => (instant(a.start_at) ?? 0) - (instant(b.start_at) ?? 0),
        )[0]!;
    }

    // Rule 4 — otherwise the most recently concluded booking speaks for the Tour.
    return [...candidates].sort((a, b) => concludedAt(b) - concludedAt(a))[0]!;
}
