import { describe, expect, it } from "vitest";

import {
    metricWindowFromPeriod,
    periodDaysForWindow,
    windowLabel,
    DEFAULT_ANALYTICS_WINDOW,
} from "@/lib/analytics/runtime/metricWindow";
import {
    tallyStatusCounts,
    assembleBreakdownBars,
    affectedWorkFromBreakdown,
    healthFromKpiStatus,
} from "@/lib/analytics/runtime/operationalSurfaceModel";

describe("metricWindow mapping", () => {
    it("snaps period days to the nearest supported rolling window", () => {
        expect(metricWindowFromPeriod({ version: 1, kind: "rolling", days: 1 })).toBe("rolling_24h");
        expect(metricWindowFromPeriod({ version: 1, kind: "rolling", days: 5 })).toBe("rolling_7d");
        expect(metricWindowFromPeriod({ version: 1, kind: "rolling", days: 30 })).toBe("rolling_30d");
        expect(metricWindowFromPeriod({ version: 1, kind: "rolling", days: 90 })).toBe("rolling_30d");
    });

    it("defaults when no days are present", () => {
        expect(metricWindowFromPeriod(undefined)).toBe(DEFAULT_ANALYTICS_WINDOW);
        expect(metricWindowFromPeriod({ version: 1, kind: "rolling" })).toBe(DEFAULT_ANALYTICS_WINDOW);
    });

    it("round-trips window → days → window", () => {
        for (const w of ["rolling_24h", "rolling_7d", "rolling_30d"] as const) {
            expect(metricWindowFromPeriod({ version: 1, kind: "rolling", days: periodDaysForWindow(w) })).toBe(w);
        }
    });

    it("labels windows", () => {
        expect(windowLabel("rolling_30d")).toBe("Last 30 days");
    });
});

describe("operational surface model helpers", () => {
    it("tallies status counts and ignores blanks", () => {
        const counts = tallyStatusCounts(["new", "new", "touring", null, "", undefined, "touring", "touring"]);
        const byKey = Object.fromEntries(counts.map((c) => [c.statusKey, c.count]));
        expect(byKey).toEqual({ new: 2, touring: 3 });
    });

    it("assembles breakdown bars: ordered by count desc, capped, zero/blank dropped, drill resolved", () => {
        const counts = [
            { statusKey: "new", count: 2 },
            { statusKey: "touring", count: 5 },
            { statusKey: "waitlist", count: 0 },
            { statusKey: "enrolled", count: 1 },
        ];
        const bars = assembleBreakdownBars(
            counts,
            (k) => `Label:${k}`,
            (k) => `/adminV2/workspace/dept/d/work-unit/wu?status_keys=${k}`,
            2,
        );
        expect(bars.map((b) => b.statusKey)).toEqual(["touring", "new"]); // desc, capped to 2, zero dropped
        expect(bars[0]).toMatchObject({
            label: "Label:touring",
            value: 5,
            formatted: "5",
            drillHref: "/adminV2/workspace/dept/d/work-unit/wu?status_keys=touring",
        });
    });

    it("supports a null drill resolver (unresolved locator)", () => {
        const bars = assembleBreakdownBars([{ statusKey: "new", count: 3 }], (k) => k, () => null);
        expect(bars[0].drillHref).toBeNull();
    });

    it("derives affected work from the top breakdown segments", () => {
        const bars = assembleBreakdownBars(
            [
                { statusKey: "a", count: 9 },
                { statusKey: "b", count: 4 },
            ],
            (k) => `Stage ${k}`,
            (k) => `/q/${k}`,
        );
        const affected = affectedWorkFromBreakdown(bars, 1);
        expect(affected).toHaveLength(1);
        expect(affected[0]).toMatchObject({
            id: "status-a",
            title: "Stage a",
            detail: "9 open in this stage",
            badge: "9",
            drillHref: "/q/a",
        });
    });

    it("maps KPI status to health state", () => {
        expect(healthFromKpiStatus("healthy")).toBe("healthy");
        expect(healthFromKpiStatus("warning")).toBe("warning");
        expect(healthFromKpiStatus("critical")).toBe("critical");
        expect(healthFromKpiStatus(undefined)).toBe("unknown");
        expect(healthFromKpiStatus("bogus")).toBe("unknown");
    });
});
