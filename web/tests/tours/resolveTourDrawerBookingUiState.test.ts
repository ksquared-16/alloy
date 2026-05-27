import { describe, expect, it } from "vitest";

import { resolveTourDrawerBookingUiState } from "@/lib/tours/opportunity/resolveTourDrawerBookingUiState";

describe("resolveTourDrawerBookingUiState", () => {
    it("returns active_booking when a non-terminal booking exists", () => {
        const state = resolveTourDrawerBookingUiState({
            statusKey: "tour_scheduled",
            metadata: { tour_date: "2026-06-01", tour_time: "09:00" },
            locationId: "loc-1",
            activeBookings: [
                {
                    id: "b1",
                    start_at: "2026-06-01T16:00:00.000Z",
                    timezone: "America/Los_Angeles",
                    status_key: "confirmed",
                } as never,
            ],
        });
        expect(state.kind).toBe("active_booking");
    });

    it("returns metadata_only compatibility state when status is tour_scheduled without booking", () => {
        const state = resolveTourDrawerBookingUiState({
            statusKey: "tour_scheduled",
            metadata: {
                tour_date: "2026-06-01",
                tour_time: "09:00",
                tour_schedule_source: "legacy_metadata_only",
            },
            locationId: "loc-1",
            activeBookings: [],
        });
        expect(state).toMatchObject({
            kind: "metadata_only",
            legacyMetadataOnly: true,
        });
    });

    it("returns missing_location when location is absent", () => {
        expect(
            resolveTourDrawerBookingUiState({
                statusKey: "tour_scheduled",
                metadata: {},
                locationId: "",
                activeBookings: [],
            }).kind
        ).toBe("missing_location");
    });
});
