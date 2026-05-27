import {
    deriveTourMetadataMirrorFromBooking,
    TOUR_BOOKING_OPPORTUNITY_STATUS,
} from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import { recomputeOpportunityDrawerOperationalAttention } from "@/lib/admin/recomputeOpportunityDrawerOperationalAttention";

export type TourBookingDrawerRefreshInput = {
    start_at: string;
    timezone: string;
    status_key: string;
    /** Optional booking id for optimistic active-booking display until refetch settles. */
    booking_id?: string | null;
    /** When set, writes wall fields immediately (manual slot selection path). */
    mirror_override?: { tour_date: string; tour_time: string } | null;
};

/**
 * Apply tour booking mirror + status to an open drawer record and refresh operational attention in-place.
 */
export function patchOpportunityDrawerRecordAfterTourBooking(
    prev: Record<string, unknown>,
    booking: TourBookingDrawerRefreshInput,
    opts?: { nowMs?: number }
): Record<string, unknown> {
    const sk = String(booking.status_key ?? "").trim();
    const tz = String(booking.timezone ?? "").trim();
    const mirror =
        booking.mirror_override ??
        deriveTourMetadataMirrorFromBooking(booking.start_at, booking.timezone);
    const mdRaw = prev.metadata;
    const md =
        mdRaw && typeof mdRaw === "object" && !Array.isArray(mdRaw) ? { ...(mdRaw as Record<string, unknown>) } : {};

    const nextStatus =
        sk === "confirmed" || sk === "rescheduled" ? TOUR_BOOKING_OPPORTUNITY_STATUS.scheduled : prev.status_key;

    const next: Record<string, unknown> = {
        ...prev,
        metadata: {
            ...md,
            ...mirror,
            ...(tz ? { tour_timezone: tz } : {}),
        },
        ...(nextStatus != null ? { status_key: nextStatus } : {}),
        updated_at: new Date(opts?.nowMs ?? Date.now()).toISOString(),
    };

    if (booking.booking_id?.trim()) {
        next._optimistic_tour_booking = {
            id: booking.booking_id.trim(),
            start_at: booking.start_at,
            timezone: tz,
            status_key: sk || "confirmed",
        };
    }

    return {
        ...next,
        ...recomputeOpportunityDrawerOperationalAttention(next, { nowMs: opts?.nowMs }),
    };
}

/** Merge hook bookings with drawer-local optimistic preview (clears when server row matches). */
export function mergeOptimisticTourBookings<T extends { id?: string; start_at?: string }>(
    serverBookings: T[],
    optimistic: T | null | undefined
): T[] {
    if (!optimistic || typeof optimistic.start_at !== "string" || !optimistic.start_at.trim()) {
        return serverBookings;
    }
    const start = optimistic.start_at.trim();
    const matched = serverBookings.some((b) => String(b.start_at ?? "").trim() === start);
    if (matched) return serverBookings;
    const withoutDup = serverBookings.filter((b) => String(b.id ?? "") !== String(optimistic.id ?? ""));
    return [optimistic, ...withoutDup];
}

export function readOptimisticTourBookingFromOverview(row: Record<string, unknown> | null | undefined) {
    const raw = row?._optimistic_tour_booking;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as { id?: string; start_at?: string; timezone?: string; status_key?: string };
}
