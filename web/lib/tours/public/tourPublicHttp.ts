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
export function publicTourBookingView(booking: {
    id: string;
    status_key: string;
    start_at?: string | null;
    end_at?: string | null;
    timezone?: string | null;
}): { id: string; status_key: string; start_at: string | null; end_at: string | null; timezone: string | null } {
    return {
        id: booking.id,
        status_key: booking.status_key,
        start_at: booking.start_at ?? null,
        end_at: booking.end_at ?? null,
        timezone: booking.timezone ?? null,
    };
}
