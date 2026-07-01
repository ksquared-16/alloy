import { describe, expect, it } from "vitest";
import {
    appendWorkspaceOipKpis,
    enrichLifecycleCardsWithOipMetrics,
    resolveWorkspaceOipMetricKeys,
} from "@/lib/kpi/workspaceOipExposure";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";

describe("workspace OIP exposure", () => {
    it("resolves default workspace OIP keys without placements", () => {
        const keys = resolveWorkspaceOipMetricKeys([], false);
        expect(keys).toContain("enrollment.tour_conversion_rate");
        expect(keys).toContain("ops.work_overdue_count");
        expect(keys).toContain("forms.completion_rate");
    });

    it("appends OIP KPI cells to workspace strip", () => {
        const strip = appendWorkspaceOipKpis([], {
            "enrollment.tour_conversion_rate": {
                metric_key: "enrollment.tour_conversion_rate",
                label: "Tour conversion rate",
                format: "percent",
                value: 0.42,
                formatted_value: "42.0%",
                window: "rolling_30d",
                window_start: "",
                window_end: "",
                computed_at: "",
                resolve_mode: "live",
                sources: [],
                source_metadata: { key: "enrollment.tour_conversion_rate", pack: "enrollment", computation_kind: "event_window", sources: ["tour_bookings"] },
            },
        });
        expect(strip.some((k) => k.id === "oip.enrollment.tour_conversion_rate")).toBe(true);
        expect(strip[0]?.value).toBe("42.0%");
    });

    it("enriches enrollment lifecycle cards with performance metrics", () => {
        const card: OperatorLifecycleLandingCard = {
            id: "1",
            departmentId: "d",
            processKey: "enrollment_pipeline",
            label: "Enrollment",
            description: "",
            entryHref: "/x",
            workQueues: [],
            stageCount: 5,
            activeRecordCount: 10,
            needsAttentionCount: 2,
        };
        const enriched = enrichLifecycleCardsWithOipMetrics([card], {
            "enrollment.time_to_schedule_tour": {
                metric_key: "enrollment.time_to_schedule_tour",
                label: "Time to schedule tour",
                format: "duration",
                value: 36,
                formatted_value: "36h",
                window: "rolling_30d",
                window_start: "",
                window_end: "",
                computed_at: "",
                resolve_mode: "live",
                sources: [],
                source_metadata: { key: "enrollment.time_to_schedule_tour", pack: "enrollment", computation_kind: "event_window", sources: ["tour_bookings"] },
            },
            "enrollment.tour_conversion_rate": {
                metric_key: "enrollment.tour_conversion_rate",
                label: "Tour conversion rate",
                format: "percent",
                value: 0.5,
                formatted_value: "50.0%",
                window: "rolling_30d",
                window_start: "",
                window_end: "",
                computed_at: "",
                resolve_mode: "live",
                sources: [],
                source_metadata: { key: "enrollment.tour_conversion_rate", pack: "enrollment", computation_kind: "event_window", sources: ["tour_bookings"] },
            },
        });
        expect(enriched[0]?.performanceMetrics?.length).toBe(2);
        expect(enriched[0]?.performanceMetrics?.[0]?.value).toBe("36h");
    });
});
