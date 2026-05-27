import {
    deriveTourMetadataMirrorFromBooking,
    TOUR_BOOKING_OPPORTUNITY_STATUS,
} from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import { recomputeOpportunityDrawerOperationalAttention } from "@/lib/admin/recomputeOpportunityDrawerOperationalAttention";

export type TourBookingDrawerRefreshInput = {
    start_at: string;
    timezone: string;
    status_key: string;
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
    const mirror = deriveTourMetadataMirrorFromBooking(booking.start_at, booking.timezone);
    const mdRaw = prev.metadata;
    const md =
        mdRaw && typeof mdRaw === "object" && !Array.isArray(mdRaw) ? { ...(mdRaw as Record<string, unknown>) } : {};

    const nextStatus =
        sk === "confirmed" || sk === "rescheduled" ? TOUR_BOOKING_OPPORTUNITY_STATUS.scheduled : prev.status_key;

    const next: Record<string, unknown> = {
        ...prev,
        metadata: { ...md, ...mirror },
        ...(nextStatus != null ? { status_key: nextStatus } : {}),
        updated_at: new Date(opts?.nowMs ?? Date.now()).toISOString(),
    };

    return {
        ...next,
        ...recomputeOpportunityDrawerOperationalAttention(next, { nowMs: opts?.nowMs }),
    };
}
