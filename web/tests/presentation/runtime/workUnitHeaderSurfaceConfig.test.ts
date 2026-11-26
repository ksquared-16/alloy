import { describe, expect, it } from "vitest";
import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    buildWorkUnitHeaderPresentationForRuntime,
    normalizeWorkUnitHeaderSurfaceConfig,
    workUnitHeaderKpiSourceKeys,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";
import { WORKSPACE_HEADER_NO_DATA_VALUE } from "@/lib/presentation/runtime/workspaceHeaderCards";
import { WORKSPACE_HEADER_KPI_REQUIRED_COUNT, WORKSPACE_HEADER_KPI_SLOT_COUNT } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

describe("workUnitHeaderSurfaceConfig", () => {
    it("normalizes to 5 KPI slots with work-unit defaults", () => {
        const config = normalizeWorkUnitHeaderSurfaceConfig(null);
        expect(config.kpis).toHaveLength(WORKSPACE_HEADER_KPI_SLOT_COUNT);
        expect(config.kpis.slice(0, WORKSPACE_HEADER_KPI_REQUIRED_COUNT).every((k) => k.enabled)).toBe(true);
        expect(config.kpis[0]?.sourceKey).toBe("ops.needs_attention_count");
        expect(config.kpis[1]?.accent).toBe("gold");
        expect(config.kpis[2]?.sourceKey).toBe("enrollment.active_leads");
        expect(config.kpis[2]?.label).toBeNull();
    });

    it("buildWorkUnitHeaderPresentationForRuntime falls back to process and work-view labels", () => {
        const presentation = buildWorkUnitHeaderPresentationForRuntime(DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG, {
            fallbackTitle: "Enrollment",
            fallbackSubtitle: "Active Pipeline",
            resolved: null,
        });
        expect(presentation.title).toBe("Enrollment");
        expect(presentation.subtitle).toBe("Active Pipeline");
        expect(presentation.kpis).toHaveLength(3);
        expect(presentation.kpis.every((k) => k.formattedValue === WORKSPACE_HEADER_NO_DATA_VALUE)).toBe(true);
    });

    it("workUnitHeaderKpiSourceKeys collects enabled calculation keys", () => {
        const keys = workUnitHeaderKpiSourceKeys(DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG);
        expect(keys).toEqual(["ops.needs_attention_count", "ops.work_overdue_count", "enrollment.active_leads"]);
    });
});
