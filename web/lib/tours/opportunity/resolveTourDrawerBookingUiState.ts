import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

export type TourDrawerBookingUiState =
    | { kind: "active_booking"; primary: TourBookingRow }
    | { kind: "metadata_only"; tourDate: string | null; tourTime: string | null; legacyMetadataOnly: boolean }
    | { kind: "missing_location" }
    | { kind: "none" };

function readMetadata(row: { metadata?: unknown } | null | undefined): Record<string, unknown> | null {
    const md = row?.metadata;
    if (!md || typeof md !== "object" || Array.isArray(md)) return null;
    return md as Record<string, unknown>;
}

export function resolveTourDrawerBookingUiState(input: {
    statusKey?: string | null;
    metadata?: unknown;
    locationId?: string | null;
    activeBookings: TourBookingRow[];
}): TourDrawerBookingUiState {
    const locationId = String(input.locationId ?? "").trim();
    if (!locationId) return { kind: "missing_location" };

    const primary = input.activeBookings.find(
        (b) => b && typeof b.start_at === "string" && ACTIVE.has(String(b.status_key ?? "").trim())
    );
    if (primary) return { kind: "active_booking", primary };

    const status = String(input.statusKey ?? "").trim();
    const md = readMetadata({ metadata: input.metadata });
    const tourDate = md && typeof md.tour_date === "string" && md.tour_date.trim() ? md.tour_date.trim() : null;
    const tourTime = md && typeof md.tour_time === "string" && md.tour_time.trim() ? md.tour_time.trim() : null;
    const legacyMetadataOnly =
        md?.tour_schedule_source === "legacy_metadata_only" ||
        md?.tour_schedule_source === "legacy_metadata";

    if (status === "tour_scheduled" && (tourDate || tourTime)) {
        return {
            kind: "metadata_only",
            tourDate,
            tourTime,
            legacyMetadataOnly,
        };
    }

    return { kind: "none" };
}
