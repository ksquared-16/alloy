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
    buildMetricComparison,
    siteAllowlistForScope,
    resolveSiteLabel,
    sanitizeSiteId,
    type SiteOption,
} from "@/lib/analytics/runtime/operationalSurfaceModel";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

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

describe("comparison display (no fabricated deltas)", () => {
    it("returns undefined when comparison is off", () => {
        expect(buildMetricComparison({ hasTrend: true, trendLabel: "+3", direction: "up" }, false)).toBeUndefined();
        expect(buildMetricComparison(null, false)).toBeUndefined();
    });

    it("is honestly unavailable when there is no prior snapshot", () => {
        expect(buildMetricComparison(null, true)).toEqual({
            available: false,
            label: "No prior snapshot yet",
            direction: "flat",
        });
        expect(buildMetricComparison({ hasTrend: false, trendLabel: "x", direction: "up" }, true)).toMatchObject({
            available: false,
        });
    });

    it("shows the real delta label/direction when a prior snapshot exists", () => {
        expect(buildMetricComparison({ hasTrend: true, trendLabel: "+3 vs previous", direction: "up" }, true)).toEqual({
            available: true,
            label: "+3 vs previous",
            direction: "up",
        });
    });
});

describe("site scope (no inaccessible exposure)", () => {
    const sites: SiteOption[] = [
        { id: "site-a", label: "Site A" },
        { id: "site-b", label: "Site B" },
    ];

    function scope(over: Partial<AdminAccessScopeDimensions>): AdminAccessScopeDimensions {
        return {
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
            ...over,
        };
    }

    it("passes null allowlist for unrestricted site scope and the explicit ids when restricted", () => {
        expect(siteAllowlistForScope(scope({ siteScope: "all" }))).toBeNull();
        expect(
            siteAllowlistForScope(scope({ siteScope: "restricted", allowedSiteLocationIds: ["site-a"] })),
        ).toEqual(["site-a"]);
        // restricted with no ids → empty allowlist (exposes nothing), never null
        expect(siteAllowlistForScope(scope({ siteScope: "restricted", allowedSiteLocationIds: null }))).toEqual([]);
    });

    it("sanitizes a URL site id against the accessible option set", () => {
        expect(sanitizeSiteId("site-a", sites)).toBe("site-a");
        expect(sanitizeSiteId("site-x", sites)).toBeNull(); // not in scope → All sites
        expect(sanitizeSiteId(null, sites)).toBeNull();
        expect(sanitizeSiteId("site-a", [])).toBeNull();
    });

    it("labels the selected site, falling back to All sites", () => {
        expect(resolveSiteLabel(null, sites)).toBe("All sites");
        expect(resolveSiteLabel("site-b", sites)).toBe("Site B");
        expect(resolveSiteLabel("site-x", sites)).toBe("Selected site");
    });
});
