import { describe, expect, it } from "vitest";

import {
    encodeAnalyticsFilters,
    decodeAnalyticsFilters,
    DEFAULT_ANALYTICS_PERIOD,
    type AnalyticsFilterState,
} from "@/lib/analytics/runtime/analyticsContextUrl";

function roundTrip(state: AnalyticsFilterState): AnalyticsFilterState {
    return decodeAnalyticsFilters(encodeAnalyticsFilters(state));
}

describe("AnalyticsContext URL codec", () => {
    it("defaults to a rolling 30d period when no params present", () => {
        const decoded = decodeAnalyticsFilters(new URLSearchParams());
        expect(decoded.dateRange).toEqual(DEFAULT_ANALYTICS_PERIOD);
        expect(decoded.comparisonPeriod).toBeUndefined();
    });

    it("round-trips a minimal canonical state", () => {
        const state: AnalyticsFilterState = { dateRange: { version: 1, kind: "rolling", days: 30 } };
        expect(roundTrip(state)).toEqual(state);
    });

    it("round-trips a fully-populated canonical state", () => {
        const state: AnalyticsFilterState = {
            dateRange: { version: 1, kind: "custom", startIso: "2026-01-01", endIso: "2026-03-31" },
            comparisonPeriod: { version: 1, kind: "quarter_over_quarter" },
            siteLocationIds: ["site-a", "site-b"],
            departmentId: "dept-1",
            programIds: ["infant", "toddler"],
            roomLocationIds: ["room-9"],
            businessProcessKey: "enrollment",
            workUnitId: "wu-7",
            stageKeys: ["touring", "waitlist"],
            staffIds: ["staff-3"],
            accountCategory: "tuition",
            agingBucket: "30_60",
            drillSelection: {
                destinationKind: "queue",
                target: "queue/leads",
                dimensionKey: "status_key",
                dimensionValue: "new_inquiry",
                markScope: "Site A",
            },
        };
        expect(roundTrip(state)).toEqual(state);
    });

    it("is idempotent under repeated decode/encode", () => {
        const params = new URLSearchParams("period=month_over_month&site=a,b&drill=queue/x&drill_kind=queue");
        const once = decodeAnalyticsFilters(params);
        const twice = roundTrip(once);
        expect(twice).toEqual(once);
    });

    it("omits null/empty values from the query string", () => {
        const state: AnalyticsFilterState = {
            dateRange: { version: 1, kind: "rolling", days: 7 },
            siteLocationIds: [],
        };
        const qs = encodeAnalyticsFilters(state).toString();
        expect(qs).not.toContain("site=");
        expect(qs).toContain("period=rolling");
        expect(qs).toContain("period_days=7");
    });

    it("ignores an invalid period kind and falls back to default", () => {
        const decoded = decodeAnalyticsFilters(new URLSearchParams("period=not_a_kind"));
        expect(decoded.dateRange).toEqual(DEFAULT_ANALYTICS_PERIOD);
    });

    it("ignores a drill selection without a valid kind", () => {
        const decoded = decodeAnalyticsFilters(new URLSearchParams("drill=queue/x&drill_kind=bogus"));
        expect(decoded.drillSelection).toBeUndefined();
    });

    it("produces stable (sorted) param ordering", () => {
        const state: AnalyticsFilterState = {
            dateRange: { version: 1, kind: "rolling", days: 30 },
            staffIds: ["s1"],
            departmentId: "d1",
        };
        const a = encodeAnalyticsFilters(state).toString();
        const b = encodeAnalyticsFilters(state).toString();
        expect(a).toBe(b);
    });
});
