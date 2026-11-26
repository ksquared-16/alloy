import { NextResponse } from "next/server";

export function tourPublicJson(data: unknown, init?: { status?: number }) {
    return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function tourPublicErr(message: string, status: number, extras?: Record<string, unknown>) {
    return NextResponse.json({ ok: false, error: message, ...extras }, { status });
}

export function tourPublicRateLimited(retryAfterSec: number) {
    return NextResponse.json(
        { ok: false, error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSec)) } }
    );
}

/**
 * The ONLY booking shape a public tour route may return.
 *
 * The replay branches used to return the raw `tour_bookings` row, which carried
 * `org_id`, `primary_person_id` and every other internal column to an unauthenticated
 * caller. Narrowing here rather than at each call site means a new route cannot
 * reintroduce the leak by forgetting to pick fields.
 */
export type PublicTourBookingState = "held" | "confirmed" | "cancelled" | "finished";

/** Internal `status_key` → the state a parent is allowed to be told. */
function publicBookingState(statusKey: string): PublicTourBookingState {
    switch (statusKey) {
        case "confirmed":
            return "confirmed";
        case "cancelled":
        case "canceled":
            return "cancelled";
        case "completed":
        case "no_show":
            return "finished";
        default:
            // requested / pending_approval and anything new: the tour is held but
            // not yet confirmed. A future internal status must never leak by default.
            return "held";
    }
}

export function publicTourBookingView(booking: {
    id: string;
    status_key: string;
    start_at?: string | null;
    end_at?: string | null;
    timezone?: string | null;
}): { id: string; state: PublicTourBookingState; start_at: string | null; end_at: string | null; timezone: string | null } {
    return {
        id: booking.id,
        // NOT `status_key`. Both the key name and its values are internal
        // vocabulary; a disclosure audit of the live public payload flagged them.
        state: publicBookingState(booking.status_key),
        start_at: booking.start_at ?? null,
        end_at: booking.end_at ?? null,
        timezone: booking.timezone ?? null,
    };
}
