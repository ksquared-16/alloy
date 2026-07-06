import { describe, expect, it } from "vitest";
import {
    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    WORKSPACE_HEADER_KPI_REQUIRED_COUNT,
    WORKSPACE_HEADER_KPI_SLOT_COUNT,
    buildWorkspaceHeaderPresentation,
    enabledWorkspaceHeaderKpis,
    normalizeWorkspaceHeaderSurfaceConfig,
    workspaceHeaderKpiSourceKeys,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import { WORKSPACE_HEADER_NO_DATA_VALUE } from "@/lib/presentation/runtime/workspaceHeaderCards";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";

describe("workspaceHeaderSurfaceConfig", () => {
    it("normalizes to 5 KPI slots with required first 3 enabled", () => {
        const config = normalizeWorkspaceHeaderSurfaceConfig({
            title: "Firefly Early Learning",
            subtitle: "Operational Workspace",
            kpis: [
                { slot: 1, label: "Needs attention", sourceKey: "ops.needs_attention_count", icon: "users" },
                { slot: 2, enabled: false, label: "X", sourceKey: "ops.work_overdue_count" },
            ],
        });
        expect(config.kpis).toHaveLength(WORKSPACE_HEADER_KPI_SLOT_COUNT);
        expect(config.kpis.slice(0, WORKSPACE_HEADER_KPI_REQUIRED_COUNT).every((k) => k.enabled)).toBe(true);
        expect(config.title).toBe("Firefly Early Learning");
        expect(config.subtitle).toBe("Operational Workspace");
    });

    it("enabledWorkspaceHeaderKpis omits optional slots that are off", () => {
        const config = normalizeWorkspaceHeaderSurfaceConfig({
            kpis: [
                { slot: 1, enabled: true, label: "A", sourceKey: "ops.needs_attention_count", icon: "users" },
                { slot: 2, enabled: true, label: "B", sourceKey: "ops.work_overdue_count", icon: "clipboard" },
                { slot: 3, enabled: true, label: "C", sourceKey: "enrollment.active_leads", icon: "chart" },
                { slot: 4, enabled: true, label: "D", sourceKey: "enrollment.lead_count", icon: "spark" },
                { slot: 5, enabled: false, label: "E", sourceKey: "ops.readiness_gap_count", icon: "grid" },
            ],
        });
        expect(enabledWorkspaceHeaderKpis(config)).toHaveLength(4);
        expect(workspaceHeaderKpiSourceKeys(config)).toEqual([
            "ops.needs_attention_count",
            "ops.work_overdue_count",
            "enrollment.active_leads",
            "enrollment.lead_count",
        ]);
    });

    it("buildWorkspaceHeaderPresentation uses configured titles and no-data em dash", () => {
        const presentation = buildWorkspaceHeaderPresentation(DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG, {
            fallbackTitle: "Org Name",
            resolved: null,
        });
        expect(presentation.title).toBe("Org Name");
        expect(presentation.kpis).toHaveLength(3);
        expect(presentation.kpis.every((k) => k.formattedValue === WORKSPACE_HEADER_NO_DATA_VALUE)).toBe(true);
        expect(presentation.kpis[0]?.label).toBe("Needs attention");
    });

    it("buildWorkspaceHeaderPresentation applies resolved metric values", () => {
        const resolved = {
            "ops.needs_attention_count": {
                key: "ops.needs_attention_count",
                label: "Needs attention",
                formatted_value: "25",
                kpi: { status: "critical" },
            },
        } as unknown as ResolvedMetricMap;
        const presentation = buildWorkspaceHeaderPresentation(
            normalizeWorkspaceHeaderSurfaceConfig({
                title: "Firefly Early Learning",
                subtitle: "Operational Workspace",
            }),
            { fallbackTitle: "Ignored", resolved },
        );
        expect(presentation.title).toBe("Firefly Early Learning");
        expect(presentation.subtitle).toBe("Operational Workspace");
        expect(presentation.kpis[0]?.formattedValue).toBe("25");
        expect(presentation.kpis[0]?.status).toBe("critical");
        expect(presentation.kpis[1]?.formattedValue).toBe(WORKSPACE_HEADER_NO_DATA_VALUE);
    });
});
