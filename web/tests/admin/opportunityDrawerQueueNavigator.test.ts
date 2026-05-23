import { describe, expect, it } from "vitest";

import {
    buildOpportunityDrawerQueueNavigatorFromDisplayItems,
    opportunityDrawerQueueNavigatorRecordIds,
    resolveOpportunityQueueNavigateTargetId,
    resolveOpportunityQueueNavigatorPosition,
} from "@/lib/admin/opportunityDrawerQueueNavigator";

describe("opportunityDrawerQueueNavigator", () => {
    const navigator = buildOpportunityDrawerQueueNavigatorFromDisplayItems({
        work_unit_id: "wu-1",
        department_id: "dept-1",
        queue_key: "pipeline",
        displayItems: [
            { id: "a", title: "A", quickActions: [] },
            { id: "b", title: "B", quickActions: [] },
            { id: "c", title: "C", quickActions: [] },
        ],
        total_count: 19,
        generation: 1,
    })!;

    it("dedupes record ids in order", () => {
        expect(opportunityDrawerQueueNavigatorRecordIds(navigator)).toEqual(["a", "b", "c"]);
    });

    it("resolves position and adjacent ids", () => {
        expect(resolveOpportunityQueueNavigatorPosition("b", navigator)).toMatchObject({
            index: 1,
            position: 2,
            total: 19,
            has_prev: true,
            has_next: true,
            prev_id: "a",
            next_id: "c",
        });
    });

    it("disables prev at first and next at last", () => {
        const first = resolveOpportunityQueueNavigatorPosition("a", navigator)!;
        const last = resolveOpportunityQueueNavigatorPosition("c", navigator)!;
        expect(first.has_prev).toBe(false);
        expect(first.prev_id).toBeNull();
        expect(last.has_next).toBe(false);
        expect(last.next_id).toBeNull();
    });

    it("resolveOpportunityQueueNavigateTargetId returns neighbors", () => {
        expect(resolveOpportunityQueueNavigateTargetId("prev", "b", navigator)).toBe("a");
        expect(resolveOpportunityQueueNavigateTargetId("next", "b", navigator)).toBe("c");
        expect(resolveOpportunityQueueNavigateTargetId("prev", "a", navigator)).toBeNull();
    });

    it("returns null when current record is not in loaded page", () => {
        expect(resolveOpportunityQueueNavigatorPosition("missing", navigator)).toBeNull();
    });
});
