import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    DEFAULT_WORKSPACE_OIP_STRIP_KEYS,
    DEFAULT_WORK_UNIT_OIP_STRIP_KEYS,
} from "@/lib/kpi/workspaceOipExposure";
import {
    filterOperationalPulseKpis,
    MAX_OPERATIONAL_PULSE_METRICS,
    OPERATIONAL_PULSE_STRIP_KEYS,
} from "@/lib/kpi/workspaceKpiPresentation";
import { buildOipWarmScopeKey } from "@/lib/metrics/oipWorkspaceWarmCache";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("OIP V1 IA freeze pass", () => {
    it("caps operational pulse at four approved metrics", () => {
        expect(DEFAULT_WORKSPACE_OIP_STRIP_KEYS).toHaveLength(4);
        expect(DEFAULT_WORK_UNIT_OIP_STRIP_KEYS).toEqual(DEFAULT_WORKSPACE_OIP_STRIP_KEYS);
        expect(OPERATIONAL_PULSE_STRIP_KEYS).not.toContain("oip.enrollment.time_to_schedule_tour");
        expect(OPERATIONAL_PULSE_STRIP_KEYS).toEqual([
            "oip.enrollment.tour_conversion_rate",
            "oip.ops.needs_attention_count",
            "oip.ops.work_overdue_count",
            "oip.forms.completion_rate",
        ]);
        expect(MAX_OPERATIONAL_PULSE_METRICS).toBe(4);
    });

    it("filters workspace pulse KPIs to approved set", () => {
        const kpis = [
            { id: "oip.enrollment.tour_conversion_rate", label: "Tour", value: "62%", lane: "business" as const },
            { id: "oip.enrollment.time_to_schedule_tour", label: "Time", value: "3d", lane: "business" as const },
            { id: "oip.ops.needs_attention_count", label: "NA", value: "4", lane: "business" as const },
            { id: "oip.ops.work_overdue_count", label: "Overdue", value: "2", lane: "business" as const },
            { id: "oip.forms.completion_rate", label: "Forms", value: "80%", lane: "business" as const },
        ];
        const pulse = filterOperationalPulseKpis(kpis);
        expect(pulse).toHaveLength(4);
        expect(pulse.map((k) => k.id)).not.toContain("oip.enrollment.time_to_schedule_tour");
    });

    it("workspace header uses health strip and command operational pulse tiles", () => {
        const header = read("components/admin/workspace/WorkspaceCommandHeader.tsx");
        expect(header).toContain("WorkspaceHealthPulseSection");
        expect(read("components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx")).toContain(
            "OipPerformanceKpiRow"
        );
    });

    it("work unit header delegates to command surface layout system", () => {
        const header = read("components/admin/workspace/WorkUnitUnifiedOperationalHeader.tsx");
        expect(header).toContain("WorkUnitCommandSurface");
        expect(header).toContain('layout="inline"');
        expect(header).not.toContain("WorkspaceKpiUnifiedStrip");
    });

    it("analytics modal splits overview and playbooks tabs", () => {
        const panel = read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx");
        expect(panel).toContain('data-oip-tab="overview"');
        expect(panel).toContain('data-oip-tab="playbooks"');
        expect(panel).toContain("OipOverviewStructure");
        expect(read("components/admin/workspace/OipOverviewStructure.tsx")).toContain('layout="command"');
        expect(panel).not.toContain("OipHealthKpiCard");
        expect(panel).not.toContain("ENROLLMENT_SUMMARY_KEYS");
    });

    it("playbooks tab retains full KPI object cards", () => {
        const panel = read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx");
        expect(panel).toContain("OipKpiObjectCard");
        expect(panel).toContain('layout="compact"');
        expect(read("components/admin/workspace/OipKpiObjectCard.tsx")).toContain("data-oip-trend-placeholder");
    });

    it("process tiles cap inline teaser stats and avoid KPI cards", () => {
        const grid = read("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("selectTilePreviewMetrics");
        expect(grid).not.toContain("OipKpiObjectCard");
        expect(grid).toContain("max-w-[25rem]");
        expect(grid).toContain("data-ws-business-process-open");
    });

    it("healthy status chips use alloy-juniper not alloy-pine", () => {
        expect(read("lib/metrics/oipStatusPresentation.ts")).toContain("alloy-juniper");
        expect(read("lib/metrics/oipStatusPresentation.ts")).not.toMatch(/healthy[\s\S]*alloy-pine/);
    });

    it("OIP warm cache follows communications prewarm pattern", () => {
        const cache = read("lib/metrics/oipWorkspaceWarmCache.ts");
        expect(cache).toContain("runWhenAdminV2PrimarySurfaceReady");
        expect(cache).toContain("scheduleOipAnalyticsWarm");
        expect(cache).toContain("prefetchOipMetricsWarm");
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain("scheduleOipAnalyticsWarm");
    });

    it("builds deterministic warm scope keys", () => {
        const key = buildOipWarmScopeKey({
            siteId: "site-1",
            keys: ["ops.work_overdue_count", "enrollment.tour_conversion_rate"],
        });
        expect(key).toBe("site-1:org:enrollment.tour_conversion_rate,ops.work_overdue_count");
    });
});
