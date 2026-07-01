import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    bumpOpportunityDrawerAdjacentPrefetchGeneration,
    prefetchAdjacentOpportunityDrawers,
} from "@/lib/admin/opportunityDrawerAdjacentPrefetch";
import { workUnitQueueSelectionFromPillKey } from "@/lib/adminV2/workUnitQueueSelection";
import { buildOpportunityDrawerQueueNavigatorFromDisplayItems } from "@/lib/admin/opportunityDrawerQueueNavigator";
import * as intentPrefetch from "@/lib/admin/opportunityDrawerIntentPrefetch";

describe("prefetchAdjacentOpportunityDrawers", () => {
    beforeEach(() => {
        vi.spyOn(intentPrefetch, "prefetchOpportunityDrawerOnRowIntent").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("advances adjacent prefetch after navigating record 1 → 2 → 3", () => {
        const gen = bumpOpportunityDrawerAdjacentPrefetchGeneration();
        const navigator = buildOpportunityDrawerQueueNavigatorFromDisplayItems({
            work_unit_id: "wu",
            department_id: "dept",
            queue_key: "pipeline",
            selection: workUnitQueueSelectionFromPillKey("wu", "pipeline"),
            displayItems: [
                { id: "r1", title: "1", quickActions: [] },
                { id: "r2", title: "2", quickActions: [] },
                { id: "r3", title: "3", quickActions: [] },
            ],
            generation: gen,
        })!;

        vi.mocked(intentPrefetch.prefetchOpportunityDrawerOnRowIntent).mockClear();

        prefetchAdjacentOpportunityDrawers({
            navigator,
            currentRecordId: "r1",
            workspaceContext: { work_unit_id: "wu", department_id: "dept" },
        });
        expect(intentPrefetch.prefetchOpportunityDrawerOnRowIntent).toHaveBeenCalledTimes(1);
        expect(intentPrefetch.prefetchOpportunityDrawerOnRowIntent).toHaveBeenCalledWith(
            "r2",
            { work_unit_id: "wu", department_id: "dept" },
            expect.anything()
        );

        vi.mocked(intentPrefetch.prefetchOpportunityDrawerOnRowIntent).mockClear();

        prefetchAdjacentOpportunityDrawers({
            navigator: { ...navigator, drawer_nav_generation: 1 },
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

    it("prefetches previous and next only", () => {
        const gen = bumpOpportunityDrawerAdjacentPrefetchGeneration();
        const navigator = buildOpportunityDrawerQueueNavigatorFromDisplayItems({
            work_unit_id: "wu",
            department_id: "dept",
            queue_key: "pipeline",
            selection: workUnitQueueSelectionFromPillKey("wu", "pipeline"),
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
