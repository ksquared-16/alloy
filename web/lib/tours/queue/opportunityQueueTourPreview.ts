import { UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";
import { deriveTourMetadataMirrorFromBooking } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";

export type OpportunityQueueTourBookingLite = { start_at: string; timezone: string };

/**
 * Resolve wall `tour_date` / `tour_time` + formatting IANA for queue/list previews.
 * Active `tour_bookings` row wins over `opportunities.metadata` mirror (SoT).
 */
export function resolveTourWallForQueuePreview(
    metadata: Record<string, unknown> | null,
    booking: OpportunityQueueTourBookingLite | null
): { tourDate: string | null; tourTime: string | null; formatTz: string; fromBooking: boolean } {
    const metaDate = metadata && typeof metadata.tour_date === "string" ? metadata.tour_date.trim() : null;
    const metaTime = metadata && typeof metadata.tour_time === "string" ? metadata.tour_time.trim() : null;
    let tourDate = metaDate;
    let tourTime = metaTime;
    let fromBooking = false;
    let formatTz = UTC_FALLBACK_IANA;
    if (booking?.start_at && typeof booking.timezone === "string") {
        try {
            const w = deriveTourMetadataMirrorFromBooking(booking.start_at, booking.timezone);
            tourDate = w.tour_date;
            tourTime = w.tour_time;
            formatTz = booking.timezone.trim() || UTC_FALLBACK_IANA;
            fromBooking = true;
        } catch {
            formatTz = UTC_FALLBACK_IANA;
        }
    }
    return { tourDate, tourTime, formatTz, fromBooking };
}

/** CRM compact `Tour` cell + `_tour_context` line (queue enrichment only; not authoritative storage). */
export function formatOpportunityTourQueueDisplays(
    metadata: Record<string, unknown> | null,
    booking: OpportunityQueueTourBookingLite | null,
    viewerFallbackTz: string
): { tourQueueDisplay: string | null; tourContext: string | null } {
    const { tourDate, tourTime, formatTz, fromBooking } = resolveTourWallForQueuePreview(metadata, booking);
    const fmtTz = fromBooking ? formatTz : viewerFallbackTz;
    if (!tourDate) return { tourQueueDisplay: null, tourContext: null };
    const disp = formatTourDateTime(tourDate, tourTime, { displayTimeZoneIana: fmtTz }).display;
    const suffix = fromBooking ? " (site time)" : "";
    return {
        tourQueueDisplay: `${disp}${suffix}`,
        tourContext: `Tour: ${disp}${suffix}`,
    };
}
