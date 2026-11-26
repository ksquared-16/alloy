import { describe, expect, it } from "vitest";
import {
    evaluateWorkViewFiltersForRow,
    filterQueueRowsByWorkViewFilters,
} from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import { computeOperationalProjection } from "@/lib/lifecycle/operationalProjection";
import { mergeActiveTourFactOntoOpportunityRow } from "@/lib/tours/queue/attachActiveTourFactsToOpportunityRows";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

function isoDateDaysFromNow(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

describe("family-grain Tours Work View — active Tour operational fact", () => {
    const tourDate = isoDateDaysFromNow(1);
    const toursView: WorkViewConfigV1Stored = {
        id: "new_work_view_5",
        label: "Tours",
        mission: "Tours in the next 7 days",
        row_grain_v1: "family",
        filters_v1: [
            { field_key: "has_active_tour", operator: "equals", value: "true" },
            { field_key: "tour_date", operator: "equals", value: "next:7:days" },
        ],
        visible_in_runtime: true,
    };

    const waitlistView: WorkViewConfigV1Stored = {
        id: "waitlist",
        label: "Waitlist",
        filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "waitlist" }],
        visible_in_runtime: true,
    };

    it("admits a waitlist-stage family with an active Tour without changing lifecycle stage", () => {
        const base = {
            id: "kurzman",
            name: "Kurzman Family",
            stage_key: "waitlist",
            lifecycle_stage_key: "waitlist",
            status_key: "open",
            metadata: {},
        };
        const withTour = mergeActiveTourFactOntoOpportunityRow(base, {
            has_active_tour: true,
            tour_booking_id: "booking-1",
            tour_status_key: "confirmed",
            tour_start_at: `${tourDate}T16:00:00.000Z`,
            tour_timezone: "America/Los_Angeles",
            tour_date: tourDate,
            tour_time: "09:00",
        });

        // Stage alone must NOT be the Tours membership gate.
        expect(
            evaluateWorkViewFiltersForRow(withTour, [
                { field_key: "opportunity_stage", operator: "equals", value: "tour" },
            ]).pass,
        ).toBe(false);

        expect(
            evaluateWorkViewFiltersForRow(withTour, toursView.filters_v1 ?? []).pass,
        ).toBe(true);

        // Same family remains eligible for Waitlist by stage.
        expect(
            evaluateWorkViewFiltersForRow(withTour, waitlistView.filters_v1 ?? []).pass,
        ).toBe(true);
    });

    it("count and rows come from the same projection for overlapping Waitlist + Tours", () => {
        const kurzman = mergeActiveTourFactOntoOpportunityRow(
            {
                id: "kurzman",
                name: "Kurzman Family",
                stage_key: "waitlist",
                lifecycle_stage_key: "waitlist",
                metadata: {},
            },
            {
                has_active_tour: true,
                tour_booking_id: "b1",
                tour_status_key: "confirmed",
                tour_start_at: `${tourDate}T16:00:00.000Z`,
                tour_timezone: "America/Los_Angeles",
                tour_date: tourDate,
                tour_time: "09:00",
            },
        );
        const noTour = mergeActiveTourFactOntoOpportunityRow(
            {
                id: "other",
                name: "Other Family",
                stage_key: "waitlist",
                lifecycle_stage_key: "waitlist",
                metadata: {},
            },
            {
                has_active_tour: false,
                tour_booking_id: null,
                tour_status_key: null,
                tour_start_at: null,
                tour_timezone: null,
                tour_date: null,
                tour_time: null,
            },
        );

        const projection = computeOperationalProjection({
            baseRows: [kurzman, noTour],
            workViews: [toursView, waitlistView],
        });

        const tours = projection.byViewId[toursView.id];
        const waitlist = projection.byViewId[waitlistView.id];
        expect(tours?.count).toBe(1);
        expect(tours?.rows).toHaveLength(1);
        expect(tours?.count).toBe(tours?.rows.length);
        expect(tours?.rows[0]?.id).toBe("kurzman");

        expect(waitlist?.count).toBe(2);
        expect(waitlist?.rows).toHaveLength(2);
        expect(waitlist?.rows.some((r) => r.id === "kurzman")).toBe(true);
    });

    it("rejects families without an active Tour even when metadata tour_date is set", () => {
        const staleMetaOnly = {
            id: "stale",
            stage_key: "waitlist",
            lifecycle_stage_key: "waitlist",
            metadata: { tour_date: tourDate, tour_time: "09:00" },
            _has_active_tour: false,
            has_active_tour: false,
        };
        expect(
            filterQueueRowsByWorkViewFilters([staleMetaOnly], toursView.filters_v1).map((r) => r.id),
        ).toEqual([]);
    });
});
