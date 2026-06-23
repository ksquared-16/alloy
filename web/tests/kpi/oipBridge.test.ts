import { describe, expect, it } from "vitest";
import {
    extractOipMetricKeysFromPlacements,
    oipMetricKeyForStripKey,
    resolveOipStripValue,
} from "@/lib/kpi/oipBridge";
import { resolveKpisForWorkUnit } from "@/lib/kpi/resolver";
import { workUnitContextFromParts } from "@/lib/kpi/surfaceContext";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";

describe("oipBridge", () => {
    it("maps strip keys to OIP metric keys", () => {
        expect(oipMetricKeyForStripKey("oip.enrollment.tour_conversion_rate")).toBe(
            "enrollment.tour_conversion_rate"
        );
    });

    it("extracts keys from placements", () => {
        const rows: WorkspaceKpiPlacementRow[] = [
            {
                id: "1",
                org_id: "o",
                surface: "work_unit",
                department_id: "d",
                work_unit_id: "w",
                metric_key: "oip.ops.work_overdue_count",
                display_order: 1,
                is_visible: true,
                label_override: null,
                format_override: null,
                lane_override: null,
                metadata: null,
            },
        ];
        expect(extractOipMetricKeysFromPlacements(rows)).toEqual(["ops.work_overdue_count"]);
    });

    it("resolveOipStripValue uses pre-fetched server values", () => {
        const v = resolveOipStripValue("oip.ops.work_overdue_count", {
            "ops.work_overdue_count": "3",
        } as never);
        expect(v).toBe("3");
    });
});

describe("resolveKpisForWorkUnit O-family", () => {
    it("renders OIP metrics from server-provided values without client math", () => {
        const ctx = workUnitContextFromParts({
            workUnitId: "w",
            queueSummaries: [{ key: "all", label: "All", count: 5 }],
            queueSummariesLoading: false,
            queueSummariesError: null,
            selectedQueueKey: "all",
            queueItems: null,
            queueItemsLoading: false,
            queueItemsError: null,
            legacyOpportunityListTotal: null,
        });
        const { items } = resolveKpisForWorkUnit({
            placementRows: [
                {
                    id: "1",
                    org_id: "o",
                    surface: "work_unit",
                    department_id: "d",
                    work_unit_id: "w",
                    metric_key: "oip.enrollment.tour_conversion_rate",
                    display_order: 0,
                    is_visible: true,
                    label_override: null,
                    format_override: null,
                    lane_override: null,
                    metadata: null,
                },
            ],
            scopeHasPlacementRows: true,
            context: ctx,
            oipMetricValues: { "enrollment.tour_conversion_rate": "42.0%" } as never,
        });
        expect(items).toHaveLength(1);
        expect(items[0]?.value).toBe("42.0%");
        expect(items[0]?.id).toBe("oip.enrollment.tour_conversion_rate");
    });
});
