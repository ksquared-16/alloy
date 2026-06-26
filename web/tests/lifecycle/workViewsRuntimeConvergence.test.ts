import { describe, expect, it } from "vitest";
import {
    enrichWorkViewsCompatQueueKeys,
    operationalPerspectivesFromWorkViews,
    workViewToOperationalPerspective,
} from "@/lib/lifecycle/workViewsRuntimeConvergence";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

describe("workViewsRuntimeConvergence", () => {
    it("maps work view to operational perspective via compat queue key", () => {
        const view: WorkViewConfigV1Stored = {
            id: "tours_today",
            label: "Tours Today",
            mission: "Same-day tours",
            compat_queue_key: "tours",
            display_order: 2,
            visible_in_runtime: true,
        };
        expect(workViewToOperationalPerspective(view)).toEqual({
            queue_key: "tours",
            label: "Tours Today",
            mission: "Same-day tours",
            display_order: 2,
            visible_in_rail: true,
        });
    });

    it("prefers saved work views over stage perspectives in operationalPerspectivesFromWorkViews", () => {
        const views: WorkViewConfigV1Stored[] = [
            {
                id: "hot_leads",
                label: "Hot Leads",
                compat_queue_key: "hot_leads",
                display_order: 1,
            },
        ];
        const rows = operationalPerspectivesFromWorkViews(views, ["hot_leads", "tours"]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.queue_key).toBe("hot_leads");
        expect(rows[0]?.label).toBe("Hot Leads");
    });

    it("enriches missing compat queue keys from pipeline lanes", () => {
        const enriched = enrichWorkViewsCompatQueueKeys(
            [{ id: "tours_today", label: "Tours Today" }],
            [{ queueKey: "tours", label: "Tours Today" }],
        );
        expect(enriched[0]?.compat_queue_key).toBe("tours");
    });
});
