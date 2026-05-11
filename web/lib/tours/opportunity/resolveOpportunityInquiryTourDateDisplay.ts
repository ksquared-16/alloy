import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { deriveTourMetadataMirrorFromBooking } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";

/**
 * Inquiry summary "Tour date" display: prefer wall-clock fields derived from the active
 * `tour_bookings` row (SoT); fall back to `opportunities.metadata` mirror / legacy manual.
 */
export function resolveOpportunityInquiryTourDateDisplay(
    metadata: unknown,
    activeBookings: TourBookingRow[]
): { tourDate: string | null; tourTime: string | null } {
    const md = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null;
    const metaDate = md && typeof md.tour_date === "string" && md.tour_date.trim() ? md.tour_date.trim() : null;
    const metaTime = md && typeof md.tour_time === "string" && md.tour_time.trim() ? md.tour_time.trim() : null;

    const primary = activeBookings[0];
    if (primary && typeof primary.start_at === "string" && typeof primary.timezone === "string") {
        try {
            const wall = deriveTourMetadataMirrorFromBooking(primary.start_at, primary.timezone);
            return { tourDate: wall.tour_date, tourTime: wall.tour_time };
        } catch {
            return { tourDate: metaDate, tourTime: metaTime };
        }
    }
    return { tourDate: metaDate, tourTime: metaTime };
}
