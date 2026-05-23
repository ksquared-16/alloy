import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    bumpOpportunityDrawerAdjacentPrefetchGeneration,
    prefetchAdjacentOpportunityDrawers,
} from "@/lib/admin/opportunityDrawerAdjacentPrefetch";
import { buildOpportunityDrawerQueueNavigatorFromDisplayItems } from "@/lib/admin/opportunityDrawerQueueNavigator";
import * as intentPrefetch from "@/lib/admin/opportunityDrawerIntentPrefetch";

describe("prefetchAdjacentOpportunityDrawers", () => {
    beforeEach(() => {
        vi.spyOn(intentPrefetch, "prefetchOpportunityDrawerOnRowIntent").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("prefetches previous and next only", () => {
        const gen = bumpOpportunityDrawerAdjacentPrefetchGeneration();
        const navigator = buildOpportunityDrawerQueueNavigatorFromDisplayItems({
            work_unit_id: "wu",
            department_id: "dept",
            queue_key: "pipeline",
            displayItems: [
                { id: "r1", title: "1", quickActions: [] },
                { id: "r2", title: "2", quickActions: [] },
                { id: "r3", title: "3", quickActions: [] },
            ],
            generation: gen,
        })!;

        prefetchAdjacentOpportunityDrawers({
            navigator,
            currentRecordId: "r2",
            workspaceContext: { work_unit_id: "wu", department_id: "dept" },
        });

        expect(intentPrefetch.prefetchOpportunityDrawerOnRowIntent).toHaveBeenCalledTimes(2);
        expect(intentPrefetch.prefetchOpportunityDrawerOnRowIntent).toHaveBeenCalledWith(
            "r1",
            { work_unit_id: "wu", department_id: "dept" },
            expect.anything()
        );
        expect(intentPrefetch.prefetchOpportunityDrawerOnRowIntent).toHaveBeenCalledWith(
            "r3",
            { work_unit_id: "wu", department_id: "dept" },
            expect.anything()
        );
    });
});
