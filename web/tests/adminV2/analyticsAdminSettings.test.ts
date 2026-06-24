import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { computeWorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import { filterPerformanceKpis, splitWorkspaceKpiBands } from "@/lib/kpi/workspaceKpiPresentation";
import { kpiPlacementSurfaceOperatorLabel } from "@/lib/metrics/kpiPlacementCatalog";
import { oipStatusOperatorLabel } from "@/lib/metrics/oipKpiObjectPresentation";
import { DEFAULT_WORKSPACE_OIP_STRIP_KEYS } from "@/lib/kpi/workspaceOipExposure";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("V1 Needs Attention as first-class KPI", () => {
    it("includes needs attention in default OIP strip keys", () => {
        expect(DEFAULT_WORKSPACE_OIP_STRIP_KEYS).toContain("oip.ops.needs_attention_count");
    });

    it("dedupes inventory needs attention when OIP needs attention present", () => {
        const kpis = [
            { id: "ctx.wu.needs_attention_count", label: "Needs attention", value: "6", lane: "business" as const },
            { id: "oip.ops.needs_attention_count", label: "Needs attention", value: "6", lane: "business" as const },
        ];
        const { inventory, performance } = splitWorkspaceKpiBands(kpis);
        expect(performance).toHaveLength(1);
        expect(inventory).toHaveLength(0);
    });

    it("bridge maps oip needs attention strip key", () => {
        expect(read("lib/kpi/oipBridge.ts")).toContain('"oip.ops.needs_attention_count": "ops.needs_attention_count"');
    });
});

describe("V1 final visual polish", () => {
    it("KPI cards use Goal label and On track status copy", () => {
        expect(read("lib/metrics/oipKpiObjectPresentation.ts")).toContain("Goal ");
        expect(oipStatusOperatorLabel("healthy")).toBe("On track");
    });

    it("KPI cards include icon support", () => {
        expect(read("components/admin/workspace/OipKpiObjectCard.tsx")).toContain("OipKpiIcon");
        expect(read("lib/metrics/oipKpiIcons.ts")).toContain("oipMetricIconKey");
    });

    it("visual system delegates to Experience Builder tones", () => {
        const vs = read("lib/metrics/oipKpiCardVisualSystem.ts");
        expect(vs).toContain("layoutEditorWidgetStyle");
        expect(vs).toContain("OIP_DOMAIN_EB_TONE");
        expect(vs).toContain('enrollment: "green"');
        expect(vs).toContain("alloy-juniper");
    });

    it("workspace command header uses unified command banner", () => {
        const header = read("components/admin/workspace/WorkspaceCommandHeader.tsx");
        expect(header).toContain("WorkspaceHealthPulseSection");
        expect(read("components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx")).toContain(
            'data-ws-command-banner="true"'
        );
    });

    it("business process tiles use inline preview not KPI card boxes", () => {
        const grid = read("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("data-ws-business-process-tile");
        expect(grid).not.toContain("OipKpiObjectCard");
        expect(grid).toContain("oipDomainVisualTokens");
    });

    it("work unit command band delegates to layout system surface", () => {
        const header = read("components/admin/workspace/WorkUnitUnifiedOperationalHeader.tsx");
        expect(header).toContain("WorkUnitCommandSurface");
        expect(read("components/admin/workspace/layout/WorkUnitCommandSurface.tsx")).toContain(
            "data-work-unit-process-label"
        );
        expect(header).not.toContain("rounded-xl border");
    });

    it("health strip uses status chips not KPI cards", () => {
        expect(read("components/admin/workspace/OipHealthStrip.tsx")).toContain("data-oip-health-chip");
    });

    it("work unit header suppresses needs attention when OIP strip present", () => {
        const header = read("components/admin/workspace/WorkUnitUnifiedOperationalHeader.tsx");
        expect(header).toContain("hasOipPerformanceStrip");
        expect(header).toContain('section.key !== "needs_attention"');
        expect(header).toContain("WorkUnitCommandSurface");
    });

    it("analytics modal uses overview/playbooks split", () => {
        const panel = read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx");
        expect(panel).toContain('data-oip-tab="overview"');
        expect(panel).toContain('data-oip-tab="playbooks"');
        expect(panel).toContain("ComingSoonPacksGroup");
    });

    it("settings collapses coming soon playbooks", () => {
        const packs = read("app/adminV2/settings/analytics/KpiPacksPanel.tsx");
        expect(packs).toContain("data-oip-settings-coming-soon");
    });
});

describe("V1 KPI object card layout", () => {
    it("reserves trend benchmark and period compare slots", () => {
        const card = read("components/admin/workspace/OipKpiObjectCard.tsx");
        expect(card).toContain("data-oip-trend-placeholder");
        expect(card).toContain("data-oip-future-trend");
        expect(card).toContain("data-oip-future-benchmark");
        expect(card).toContain("data-oip-future-period-compare");
    });

    it("warning status uses Needs Review operator label", () => {
        expect(oipStatusOperatorLabel("warning")).toBe("Needs Review");
    });
});

describe("V1 workspace header convergence", () => {
    it("command header uses health pulse section with command KPI row", () => {
        const header = read("components/admin/workspace/WorkspaceCommandHeader.tsx");
        expect(header).toContain("WorkspaceHealthPulseSection");
        expect(read("components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx")).toContain(
            "OipPerformanceKpiRow"
        );
    });

    it("work unit uses unified operational header", () => {
        expect(read("components/admin/workspace/layout/WorkUnitCommandSurface.tsx")).toContain(
            "data-work-unit-operational-header"
        );
        expect(read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx")).toContain(
            "WorkUnitUnifiedOperationalHeader"
        );
    });
});

describe("Phase 3E workspace KPI objects (retained)", () => {
    it("workspace root uses integrated command header", () => {
        expect(read("components/admin/workspace/WorkspaceRootShell.tsx")).toContain("WorkspaceCommandHeader");
    });

    it("work unit strip separates operational performance surface", () => {
        const strip = read("components/admin/workspace/WorkspaceKpiUnifiedStrip.tsx");
        expect(strip).toContain("Operational Performance");
        expect(strip).toContain("data-work-unit-operational-performance");
    });

    it("filters performance KPIs only for header strip", () => {
        const kpis = [
            { id: "org.departments", label: "Departments", value: "3", lane: "business" as const },
            { id: "oip.enrollment.tour_conversion_rate", label: "Tour conversion", value: "62%", lane: "business" as const },
        ];
        expect(filterPerformanceKpis(kpis)).toHaveLength(1);
    });
});

describe("Operational Intelligence panel V1 polish", () => {
    it("overview tab uses structured overview with health and pulse sections", () => {
        const panel = read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx");
        const overview = read("components/admin/workspace/OipOverviewStructure.tsx");
        expect(panel).toContain("OipOverviewStructure");
        expect(overview).toContain("OipHealthStrip");
        expect(overview).toContain('layout="command"');
        expect(overview).toContain("Operational Pulse");
        expect(overview).toContain("data-oip-overview-command");
    });

    it("modal uses white surfaces without gradient fills", () => {
        expect(read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx")).not.toContain("linear-gradient");
    });
});

describe("Configuration usability (retained)", () => {
    it("playbooks panel is actionable", () => {
        const packs = read("app/adminV2/settings/analytics/KpiPacksPanel.tsx");
        expect(packs).toContain("Edit targets");
        expect(packs).toContain("Experience placement");
    });

    it("targets panel uses goal-oriented copy", () => {
        expect(read("app/adminV2/settings/analytics/KpiTargetsPanel.tsx")).toContain("Goals & current performance");
    });

    it("experience placement uses operator surface labels", () => {
        expect(kpiPlacementSurfaceOperatorLabel("workspace_strip")).toBe("Organization Workspace");
    });

    it("closes modal before configuration navigation", () => {
        expect(read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx")).toContain('closeWorkspaceModal("analytics")');
    });
});

describe("Health summary computation", () => {
    it("computes business operational enrollment health summary", () => {
        const summary = computeWorkspaceHealthSummary({});
        expect(summary).toHaveProperty("business");
        expect(summary).toHaveProperty("operational");
        expect(summary).toHaveProperty("enrollment");
    });
});
