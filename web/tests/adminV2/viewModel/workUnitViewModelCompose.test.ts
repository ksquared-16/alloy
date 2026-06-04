import { describe, expect, it } from "vitest";

import { composeWorkUnitViewModel } from "@/lib/adminV2/viewModel/workUnit/composeWorkUnitViewModel";
import { buildWorkUnitAboveFoldPlaceholder } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";
import {
    assembleLiveWorkUnitShadowSnapshot,
    extractWorkUnitViewModelShadowSnapshot,
} from "@/lib/adminV2/viewModel/workUnit/shadow/assembleLiveWorkUnitShadowSnapshot";
import { diffWorkUnitViewModelShadow } from "@/lib/adminV2/viewModel/workUnit/shadow/diffWorkUnitViewModelShadow";

describe("composeWorkUnitViewModel", () => {
    it("composes first_paint contract from shell + summaries + lane state", () => {
        const aboveFold = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: false });
        const vm = composeWorkUnitViewModel({
            departmentId: "dept-1",
            workUnitId: "wu-1",
            workUnitKey: "enrollment_pipeline",
            selectedQueueKey: "new_inquiry",
            queueSummaries: [{ key: "new_inquiry", count: 3 }],
            queueSummariesError: null,
            queueItems: { items: [{ id: "1" }, { id: "2" }] },
            queueItemsLoading: false,
            queueLaneRevealState: "ready_with_rows",
            workUnitAboveFold: aboveFold,
            queueModel: null,
            kpiMetrics: [],
            kpiMetricsPending: true,
            kpiStripVisible: true,
            shellReady: true,
            enrollmentActionsSettled: true,
        });

        expect(vm.entity.work_unit_id).toBe("wu-1");
        expect(vm.first_paint.settled).toBe(true);
        expect(vm.queue.row_count).toBe(2);
        expect(vm.summary.pill_count).toBe(1);
        expect(vm.kpi.metrics_pending).toBe(true);
    });

    it("shadow diff is empty when live matches composed VM", () => {
        const aboveFold = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: false });
        const input = {
            departmentId: "dept-1",
            workUnitId: "wu-1",
            workUnitKey: "enrollment_pipeline",
            selectedQueueKey: "new_inquiry",
            queueSummaries: [{ key: "new_inquiry", count: 1 }],
            queueSummariesError: null,
            queueItems: { items: [{ id: "1" }] },
            queueItemsLoading: false,
            queueLaneRevealState: "ready_with_rows" as const,
            workUnitAboveFold: aboveFold,
            queueModel: {
                primaryQueue: { items: [{ id: "1" }] },
            } as import("@/lib/ui-v2/workspace-types").WorkUnitWorkspaceModel,
            kpiMetrics: [],
            kpiMetricsPending: false,
            kpiStripVisible: false,
            shellReady: true,
            enrollmentActionsSettled: true,
        };
        const vm = composeWorkUnitViewModel(input);
        const live = assembleLiveWorkUnitShadowSnapshot({
            departmentId: input.departmentId,
            workUnitId: input.workUnitId,
            selectedQueueKey: input.selectedQueueKey,
            workUnitAboveFold: input.workUnitAboveFold,
            queueModel: input.queueModel,
            kpiMetricCount: 0,
            kpiMetricsPending: false,
            firstPaintSettled: vm.first_paint.settled,
            laneRevealState: input.queueLaneRevealState,
            queueRowsLoading: false,
        });
        const vmSnap = extractWorkUnitViewModelShadowSnapshot(vm);
        const diff = diffWorkUnitViewModelShadow(live, vmSnap);
        expect(diff.mismatch_count).toBe(0);
    });
});
