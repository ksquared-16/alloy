import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { deriveTourMetadataMirrorFromBooking } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";

function readMetadataTourTimezone(metadata: unknown): string | null {
    const md = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null;
    const tz =
        md && typeof md.tour_timezone === "string" && md.tour_timezone.trim() ? md.tour_timezone.trim() : null;
    return tz;
}

/**
 * Inquiry summary "Tour date" display: prefer wall-clock fields derived from the active
 * `tour_bookings` row (SoT); fall back to `opportunities.metadata` mirror / legacy manual.
 */
export function resolveOpportunityInquiryTourDateDisplay(
    metadata: unknown,
    activeBookings: TourBookingRow[]
): { tourDate: string | null; tourTime: string | null; displayTimeZoneIana: string | null } {
    const md = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null;
    const metaDate = md && typeof md.tour_date === "string" && md.tour_date.trim() ? md.tour_date.trim() : null;
    const metaTime = md && typeof md.tour_time === "string" && md.tour_time.trim() ? md.tour_time.trim() : null;
    const metaTz = readMetadataTourTimezone(metadata);

    const primary = activeBookings[0];
    if (primary && typeof primary.start_at === "string" && typeof primary.timezone === "string") {
        try {
            const wall = deriveTourMetadataMirrorFromBooking(primary.start_at, primary.timezone);
            return {
                tourDate: wall.tour_date,
                tourTime: wall.tour_time,
                displayTimeZoneIana: primary.timezone.trim() || metaTz,
            };
        } catch {
            return { tourDate: metaDate, tourTime: metaTime, displayTimeZoneIana: metaTz };
        }
    }
    return { tourDate: metaDate, tourTime: metaTime, displayTimeZoneIana: metaTz };
}
