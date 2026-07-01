import { describe, expect, it } from "vitest";

import { composeWorkUnitViewModel } from "@/lib/adminV2/viewModel/workUnit/composeWorkUnitViewModel";
import { buildWorkUnitViewModelActions } from "@/lib/adminV2/viewModel/workUnit/extractWorkUnitViewModelActions";
import { buildWorkUnitAboveFoldPlaceholder } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";
import {
    assembleLiveWorkUnitShadowSnapshot,
    extractWorkUnitViewModelShadowSnapshot,
} from "@/lib/adminV2/viewModel/workUnit/shadow/assembleLiveWorkUnitShadowSnapshot";
import { diffWorkUnitViewModelShadow } from "@/lib/adminV2/viewModel/workUnit/shadow/diffWorkUnitViewModelShadow";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    buildWorkUnitViewModelCacheKey,
    clearWorkUnitViewModelSessionCacheForTests,
    peekWorkUnitLaneCacheEntry,
    peekWorkUnitViewModelCacheEntry,
    putWorkUnitLaneCacheEntry,
    putWorkUnitViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";

const baseActionsInput = {
    opportunityQueueRowResolved: null as ResolvedActionForClient[] | null,
    enrollmentRightRailResolved: null as ResolvedActionForClient[] | null,
    queueRowActionsReady: true,
    enrollmentActionsSettled: true,
    queueRecordIds: [] as string[],
};

function mockAction(key: string): ResolvedActionForClient {
    return {
        key,
        label: key,
        description: null,
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };
}

describe("composeWorkUnitViewModel", () => {
    it("composes first_paint contract from shell + summaries + lane state + actions", () => {
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
            ...baseActionsInput,
            queueRecordIds: ["opp-1", "opp-2"],
            opportunityQueueRowResolved: [mockAction("open"), mockAction("message")],
            enrollmentRightRailResolved: [mockAction("ask_bos")],
        });

        expect(vm.entity.work_unit_id).toBe("wu-1");
        expect(vm.first_paint.settled).toBe(true);
        expect(vm.queue.row_count).toBe(2);
        expect(vm.summary.pill_count).toBe(1);
        expect(vm.kpi.metrics_pending).toBe(true);
        expect(vm.actions.action_availability_state).toBe("ready");
        expect(vm.actions.row_actions_by_record_id["opp-1"]).toHaveLength(2);
        expect(vm.actions.right_rail_actions).toHaveLength(1);
    });

    it("first_paint unsettled while row actions pending for populated lane", () => {
        const aboveFold = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: false });
        const vm = composeWorkUnitViewModel({
            departmentId: "dept-1",
            workUnitId: "wu-1",
            workUnitKey: "enrollment_pipeline",
            selectedQueueKey: "new_inquiry",
            queueSummaries: [{ key: "new_inquiry", count: 1 }],
            queueSummariesError: null,
            queueItems: { items: [{ id: "1" }] },
            queueItemsLoading: false,
            queueLaneRevealState: "ready_with_rows",
            workUnitAboveFold: aboveFold,
            queueModel: null,
            kpiMetrics: [],
            kpiMetricsPending: false,
            kpiStripVisible: false,
            shellReady: true,
            ...baseActionsInput,
            queueRecordIds: ["opp-1"],
            queueRowActionsReady: false,
        });

        expect(vm.first_paint.settled).toBe(false);
        expect(vm.actions.action_availability_state).toBe("empty");
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
            ...baseActionsInput,
            queueRecordIds: ["opp-1"],
            opportunityQueueRowResolved: [mockAction("open")],
            enrollmentRightRailResolved: [mockAction("workflow")],
        };
        const vm = composeWorkUnitViewModel(input);
        const actions = buildWorkUnitViewModelActions({
            opportunityQueueRowResolved: input.opportunityQueueRowResolved,
            enrollmentRightRailResolved: input.enrollmentRightRailResolved,
            queueRowActionsReady: input.queueRowActionsReady,
            enrollmentActionsSettled: input.enrollmentActionsSettled,
            queueRecordIds: input.queueRecordIds,
        });
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
            actions,
        });
        const vmSnap = extractWorkUnitViewModelShadowSnapshot(vm);
        const diff = diffWorkUnitViewModelShadow(live, vmSnap);
        expect(diff.mismatch_count).toBe(0);
    });

    it("shadow diff reports missing action ids", () => {
        const aboveFold = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: false });
        const actions = buildWorkUnitViewModelActions({
            opportunityQueueRowResolved: [mockAction("open"), mockAction("message")],
            enrollmentRightRailResolved: [mockAction("ask_bos")],
            queueRowActionsReady: true,
            enrollmentActionsSettled: true,
            queueRecordIds: ["opp-1"],
        });
        const live = assembleLiveWorkUnitShadowSnapshot({
            departmentId: "dept-1",
            workUnitId: "wu-1",
            selectedQueueKey: "lane",
            workUnitAboveFold: aboveFold,
            queueModel: { primaryQueue: { items: [{ id: "1" }] } } as import("@/lib/ui-v2/workspace-types").WorkUnitWorkspaceModel,
            kpiMetricCount: 0,
            kpiMetricsPending: false,
            firstPaintSettled: true,
            laneRevealState: "ready_with_rows",
            queueRowsLoading: false,
            actions,
        });
        const vmSnap = {
            ...live,
            row_action_keys: "open",
            row_action_count: 1,
        };
        const diff = diffWorkUnitViewModelShadow(live, vmSnap);
        expect(diff.mismatches.some((m) => m.includes("missing_action_ids"))).toBe(true);
    });
});

describe("workUnitViewModelSessionCache", () => {
    it("keys by org, dept, work unit, lane, and filters", () => {
        const keyA = buildWorkUnitViewModelCacheKey({
            context: { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" },
            lane: { selectedQueueKey: "new_inquiry", attentionBucketKey: null, laneUnmappedOnly: false },
        });
        const keyB = buildWorkUnitViewModelCacheKey({
            context: { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" },
            lane: { selectedQueueKey: "follow_up", attentionBucketKey: null, laneUnmappedOnly: false },
        });
        expect(keyA).not.toBe(keyB);
        expect(keyA).toContain("org-1");
        expect(keyA).toContain("new_inquiry");
    });

    it("supports warm peek with generation guard", () => {
        clearWorkUnitViewModelSessionCacheForTests();
        const aboveFold = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: false });
        const vm = composeWorkUnitViewModel({
            departmentId: "dept-1",
            workUnitId: "wu-1",
            workUnitKey: "enrollment_pipeline",
            selectedQueueKey: "new_inquiry",
            queueSummaries: [{ key: "new_inquiry", count: 1 }],
            queueSummariesError: null,
            queueItems: null,
            queueItemsLoading: false,
            queueLaneRevealState: "ready_empty",
            workUnitAboveFold: aboveFold,
            queueModel: null,
            kpiMetrics: [],
            kpiMetricsPending: false,
            kpiStripVisible: false,
            shellReady: true,
            ...baseActionsInput,
        });
        const lane = { selectedQueueKey: "new_inquiry" as string | null };
        const context = { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" };
        putWorkUnitViewModelCacheEntry({ viewModel: vm, generation: vm.generation, lane }, context);
        expect(peekWorkUnitViewModelCacheEntry({ context, lane })?.viewModel.entity.work_unit_id).toBe("wu-1");
        expect(
            peekWorkUnitViewModelCacheEntry({
                context,
                lane,
                expectedGeneration: "stale-generation",
            })
        ).toBeNull();
        clearWorkUnitViewModelSessionCacheForTests();
    });

    it("lane cache stores queue payload under lane key", () => {
        clearWorkUnitViewModelSessionCacheForTests();
        const context = { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" };
        const lane = {
            selectedQueueKey: "follow_up",
            attentionBucketKey: null,
            laneUnmappedOnly: false,
            recordFilterFingerprint: "_",
        };
        putWorkUnitLaneCacheEntry(
            {
                queuePayload: { items: [{ id: "1" }], queue: { key: "follow_up" } },
                generation: "wu-1:follow_up",
                lane,
            },
            context
        );
        const hit = peekWorkUnitLaneCacheEntry({ context, lane });
        expect(hit?.queuePayload.items).toHaveLength(1);
        clearWorkUnitViewModelSessionCacheForTests();
    });
});
