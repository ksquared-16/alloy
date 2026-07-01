import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Analytics trend UI contract", () => {
    it("KPI card renders server trend label and sparkline without client math", () => {
        const card = read("app/adminV2/analytics/AnalyticsKpiCard.tsx");
        expect(card).toContain("data-analytics-trend-label");
        expect(card).toContain("AnalyticsTrendSparkline");
        expect(card).not.toContain("deltaPercent");
        expect(card).not.toContain("value -");
    });

    it("workspace panel passes site filter to resolve and trends fetch", () => {
        const panel = read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx");
        expect(panel).toContain("useWorkspaceSiteFilter");
        expect(panel).toContain("fetchMetricTrends");
        expect(panel).toContain("siteId: selectedSiteId");
    });

    it("fetch helpers pass site_id query param", () => {
        expect(read("lib/metrics/fetchResolvedMetrics.ts")).toContain('qs.set("site_id"');
        expect(read("lib/metrics/fetchMetricTrends.ts")).toContain('qs.set("site_id"');
    });

    it("workspace page passes site filter to OIP resolve", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("useWorkspaceSiteFilter");
        expect(page).toContain("siteId: selectedSiteId");
    });
});
