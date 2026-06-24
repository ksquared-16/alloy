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

describe("Analytics settings IA cleanup", () => {
    it("settings page uses flat single-level tabs without nested builders", () => {
        const client = read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx");
        expect(client).toContain('"Calculations"');
        expect(client).toContain('"Display styles"');
        expect(client).toContain('"Where it appears"');
        expect(client).toContain('"Combined scores"');
        // No nested "Metric builders" wrapper tab and no redundant guidance callout.
        expect(client).not.toContain('"Metric builders"');
        expect(client).not.toContain("MetricPlatformBuilderTabs");
        expect(client).not.toContain("OipSettingsSummary");
    });

    it("primary tabs exclude Targets and Experience placement (moved to legacy/advanced)", () => {
        const client = read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx");
        // The primary TABS array must not list legacy surfaces.
        const tabsBlock = client.slice(client.indexOf("const TABS"), client.indexOf("const LEGACY_TABS"));
        expect(tabsBlock).not.toContain('label: "Targets"');
        expect(tabsBlock).not.toContain('label: "Experience placement"');
        // Legacy surfaces still reachable behind the Advanced disclosure.
        expect(client).toContain("data-analytics-legacy-advanced");
        expect(client).toContain("Targets (legacy)");
        expect(client).toContain("Experience placement (legacy V1)");
    });

    it("uses one primary '+ New metric' CTA and only the empty-state '+ New calculation'", () => {
        const client = read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx");
        expect(client).toContain("+ New metric");
        const panel = read("app/adminV2/settings/analytics/MetricBuilderPanel.tsx");
        // Exactly one create CTA remains in the panel — the empty-state action.
        const occurrences = panel.split("+ New calculation").length - 1;
        expect(occurrences).toBe(1);
        expect(panel).toContain("PlatformBuilderEmptyState");
    });

    it("tab subtitles use the final copy", () => {
        const client = read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx");
        expect(client).toContain("Define what is measured.");
        expect(client).toContain("Choose how metrics appear.");
        expect(client).toContain("Choose where metrics show up.");
        expect(client).toContain("Combine metrics into one health score.");
    });

    it("display styles support a background fill treatment using accent opacity", () => {
        const accents = read("lib/metrics/platform/metricVisualAccent.ts");
        expect(accents).toContain("resolveMetricCardSurface");
        expect(accents).toContain("softBg");
        expect(accents).toContain("normalizeMetricVisualFill");
        const builder = read("app/adminV2/settings/analytics/VisualizationBuilderPanel.tsx");
        expect(builder).toContain("Background fill");
        expect(builder).toContain("Border only");
        expect(builder).toContain("Soft background");
        const kpi = read("components/admin/metrics/MetricKpiCard.tsx");
        expect(kpi).toContain("resolveMetricCardSurface");
        expect(kpi).toContain('data-metric-fill');
    });

    it("multi-metric scorecard uses chip/checkbox picker and renders body metrics", () => {
        const builder = read("app/adminV2/settings/analytics/VisualizationBuilderPanel.tsx");
        expect(builder).toContain("toggleAdditional");
        expect(builder).toContain("Add related metrics to show them in this scorecard.");
        expect(builder).not.toContain("select multiple");
        const scorecard = read("components/admin/metrics/MetricScorecard.tsx");
        expect(scorecard).toContain('data-scorecard-metrics');
        const renderer = read("components/admin/metrics/MetricVisualRenderer.tsx");
        expect(renderer).toContain("scorecardMetrics");
    });

    it("removes the 'use the top-level Calculations tab' guidance box", () => {
        // The nested builder-tabs wrapper that carried the guidance callout is gone.
        expect(() => read("app/adminV2/settings/analytics/MetricPlatformBuilderTabs.tsx")).toThrow();
    });

    it("calculations use edit mode not unpublish-to-edit", () => {
        const panel = read("app/adminV2/settings/analytics/MetricBuilderPanel.tsx");
        expect(panel).toContain("Save changes");
        expect(panel).toContain('variant="primary" disabled={saving} onClick={() => void startEdit()}');
        expect(read("app/adminV2/settings/analytics/MetricFormFields.tsx")).toContain("METRIC_CATEGORY_OPTIONS");
    });

    it("display style preview uses MetricVisualRenderer", () => {
        expect(read("app/adminV2/settings/analytics/VisualizationStylePreview.tsx")).toContain("MetricVisualRenderer");
        expect(read("app/adminV2/settings/analytics/platformBuilderLabels.ts")).toContain("AVAILABLE_VIZ_TYPES");
    });

    it("placement builder uses 'Add another place' language", () => {
        const panel = read("app/adminV2/settings/analytics/PlacementBuilderPanel.tsx");
        expect(panel).toContain("Where this appears");
        expect(panel).toContain("Add another place");
        expect(panel).toContain("One display style can appear in multiple places.");
        expect(panel).not.toContain("+ Add location");
    });
});

describe("Analytics V2 guided setup flow", () => {
    it("settings page exposes a primary '+ New metric' guided flow", () => {
        const client = read("app/adminV2/settings/analytics/AnalyticsSettingsClient.tsx");
        expect(client).toContain("MetricSetupFlow");
        expect(client).toContain("+ New metric");
    });

    it("guided flow walks calculation, display style, placement, review", () => {
        const flow = read("app/adminV2/settings/analytics/MetricSetupFlow.tsx");
        expect(flow).toContain("Calculation");
        expect(flow).toContain("Display style");
        expect(flow).toContain("Where it appears");
        expect(flow).toContain("Review & publish");
        // Creates the full chain transparently.
        expect(flow).toContain("/api/admin/analytics/metrics");
        expect(flow).toContain("/api/admin/analytics/visualizations");
        expect(flow).toContain("/api/admin/analytics/placements");
        // Dedupe via shared write-plan helpers.
        expect(flow).toContain("resolveWriteTarget");
        expect(flow).toContain("planPlacementWrites");
    });

    it("display style list groups by metric and shows place counts", () => {
        const panel = read("app/adminV2/settings/analytics/VisualizationBuilderPanel.tsx");
        expect(panel).toContain("groupedStyles");
        expect(panel).toContain("place${count === 1");
    });

    it("icon picker is category-only; trend direction is dynamic", () => {
        const picker = read("app/adminV2/settings/analytics/BuilderIconPicker.tsx");
        expect(picker).not.toContain("trending-up");
        expect(picker).not.toContain("TrendingUp");
        const trendCard = read("components/admin/metrics/MetricTrendCard.tsx");
        expect(trendCard).toContain("deriveTrendDirection");
    });

    it("rendered KPI/trend cards apply the selected accent rail", () => {
        const kpi = read("components/admin/metrics/MetricKpiCard.tsx");
        expect(kpi).toContain("resolveMetricVisualAccent");
        expect(kpi).toContain("visual.rail");
        expect(kpi).toContain("truncate");
        const trend = read("components/admin/metrics/MetricTrendCard.tsx");
        expect(trend).toContain("resolveMetricVisualAccent");
    });

    it("data source helper copy explains system-provided sources", () => {
        expect(read("app/adminV2/settings/analytics/MetricFormFields.tsx")).toContain(
            "Data sources are system-provided. More sources can be added as Alloy expands."
        );
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
