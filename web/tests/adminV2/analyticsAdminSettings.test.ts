import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listKpiPlacementCatalog } from "@/lib/metrics/kpiPlacementCatalog";
import { splitWorkspaceKpiBands } from "@/lib/kpi/workspaceKpiPresentation";
import { formatKpiTargetDisplay } from "@/lib/metrics/kpiTargetFormatting";
import { getKpiDefinition } from "@/lib/metrics/kpiRegistry";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("analytics admin settings", () => {
    it("registers Analytics in configuration workspace domains", () => {
        expect(read("lib/adminV2/configurationWorkspaceDomains.ts")).toContain('href: "/admin/settings/analytics"');
    });

    it("exposes analytics settings route and client", () => {
        expect(read("app/adminV2/settings/analytics/page.tsx")).toContain("AnalyticsSettingsClient");
        expect(read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx")).toContain("KpiPacksPanel");
        expect(read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx")).toContain("KpiTargetsPanel");
        expect(read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx")).toContain("KpiPlacementOverviewPanel");
    });

    it("breadcrumb includes Analytics", () => {
        expect(read("app/adminV2/settings/SettingsHierarchyBreadcrumb.tsx")).toContain('label: "Analytics"');
    });

    it("kpi targets API route supports GET and PATCH", () => {
        const route = read("app/api/admin/metrics/kpi-targets/route.ts");
        expect(route).toContain("export async function GET");
        expect(route).toContain("export async function PATCH");
        expect(route).toContain("metadata.kpi_targets");
    });
});

describe("KPI placement catalog", () => {
    it("lists default surfaces for tour conversion", () => {
        const row = listKpiPlacementCatalog().find((r) => r.kpi_key === "enrollment.tour_conversion_rate");
        expect(row).toBeDefined();
        expect(row!.surfaces).toContain("workspace_strip");
        expect(row!.surfaces).toContain("work_unit_strip");
        expect(row!.surfaces).toContain("analytics_modal");
        expect(row!.surfaces).toContain("lifecycle_tile");
    });
});

describe("workspace KPI unified strip", () => {
    it("splits inventory from OIP performance cells", () => {
        const kpis = [
            { id: "org.departments", label: "Departments", value: "3", lane: "business" as const },
            { id: "oip.enrollment.tour_conversion_rate", label: "Tour conversion", value: "62%", lane: "business" as const },
        ];
        const bands = splitWorkspaceKpiBands(kpis);
        expect(bands.inventory).toHaveLength(1);
        expect(bands.performance).toHaveLength(1);
        expect(read("components/admin/workspace/WorkspaceKpiUnifiedStrip.tsx")).toContain("Pipeline overview");
        expect(read("components/admin/workspace/WorkspaceKpiOrientationCrossfade.tsx")).toContain("WorkspaceKpiUnifiedStrip");
    });
});

describe("KPI target defaults (Phase 3)", () => {
    it("uses 60% tour conversion and 90% forms completion defaults", () => {
        const tour = getKpiDefinition("enrollment.tour_conversion_rate");
        const forms = getKpiDefinition("forms.completion_rate");
        expect(tour.defaultTarget.targetMinRate).toBe(0.6);
        expect(forms.defaultTarget.targetMinRate).toBe(0.9);
        expect(formatKpiTargetDisplay("enrollment.tour_conversion_rate", tour.defaultTarget)).toBe("60%");
        expect(formatKpiTargetDisplay("forms.completion_rate", forms.defaultTarget)).toBe("90%");
    });
});

describe("work unit OIP visibility", () => {
    it("lifecycle builder-owned shells show OIP-only strip", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("showOipOnlyKpiStrip");
        expect(page).toContain("appendWorkUnitOipKpis");
        expect(page).toContain("resolveWorkUnitOipMetricKeys");
    });

    it("default work unit OIP keys include forms completion", () => {
        expect(read("lib/kpi/workspaceOipExposure.ts")).toContain("oip.forms.completion_rate");
    });
});

describe("analytics modal operational intelligence center", () => {
    it("summary row and health chips in panel", () => {
        const panel = read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx");
        expect(panel).toContain("data-analytics-summary-row");
        expect(panel).toContain("Operational Intelligence");
        expect(panel).toContain("enrollment.tour_conversion_rate");
        expect(read("app/adminV2/components/AnalyticsModal.tsx")).toContain("Operational Intelligence");
    });
});
