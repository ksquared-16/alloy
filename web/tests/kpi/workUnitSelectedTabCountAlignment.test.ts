import { describe, expect, it } from "vitest";
import { workUnitSelectedTabCount } from "@/lib/kpi/contextKpiMetrics";

describe("workUnitSelectedTabCount alignment", () => {
    const summaries = [{ key: "new_inquiry", label: "New Inquiry", count: 3 }];

    it("returns 0 when loaded queue list is empty at offset 0", () => {
        const count = workUnitSelectedTabCount({
            summaries,
            selectedQueueKey: "new_inquiry",
            queueItems: {
                queue: { key: "new_inquiry" },
                total: 3,
                total_omitted: true,
                offset: 0,
                items: [],
            },
            queueItemsLoading: false,
            queueItemsError: null,
        });
        expect(count).toBe(0);
    });

    it("returns authoritative total when list is loaded with rows", () => {
        const count = workUnitSelectedTabCount({
            summaries,
            selectedQueueKey: "new_inquiry",
            queueItems: {
                queue: { key: "new_inquiry" },
                total: 1,
                offset: 0,
                items: [{ id: "opp-1" }],
            },
            queueItemsLoading: false,
            queueItemsError: null,
        });
        expect(count).toBe(1);
    });

    it("falls back to summary tab count while queue items are still loading", () => {
        const count = workUnitSelectedTabCount({
            summaries,
            selectedQueueKey: "new_inquiry",
            queueItems: null,
            queueItemsLoading: true,
            queueItemsError: null,
        });
        expect(count).toBe(3);
    });
});
