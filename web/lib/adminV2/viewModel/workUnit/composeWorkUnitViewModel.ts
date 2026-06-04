import type {
    ComposeWorkUnitViewModelInput,
    WorkUnitFirstPaintContract,
    WorkUnitFirstPaintDependencyState,
    WorkUnitViewModel,
} from "@/lib/adminV2/viewModel/workUnit/types";
import { buildWorkUnitViewModelActions } from "@/lib/adminV2/viewModel/workUnit/extractWorkUnitViewModelActions";

function dep(
    key: WorkUnitFirstPaintDependencyState["key"],
    disposition: WorkUnitFirstPaintDependencyState["disposition"],
    status: WorkUnitFirstPaintDependencyState["status"]
): WorkUnitFirstPaintDependencyState {
    return { key, disposition, status };
}

function buildFirstPaintContract(input: ComposeWorkUnitViewModelInput): WorkUnitFirstPaintContract {
    const summariesReady = input.queueSummaries != null || Boolean(input.queueSummariesError);
    const rowsReady =
        input.queueLaneRevealState === "ready_with_rows" ||
        input.queueLaneRevealState === "ready_empty" ||
        input.queueLaneRevealState === "ready_with_cache";
    const kpiReady = !input.kpiMetricsPending;
    const rowsNeedActions = input.queueRecordIds.length > 0;

    const dependencies: WorkUnitFirstPaintDependencyState[] = [
        dep(
            "work_unit_identity",
            "first_paint_required",
            input.shellReady ? "ready" : "pending"
        ),
        dep(
            "department_identity",
            "first_paint_required",
            input.shellReady ? "ready" : "pending"
        ),
        dep(
            "queue_summaries",
            "first_paint_required",
            summariesReady ? "ready" : "pending"
        ),
        dep(
            "enrollment_actions",
            "first_paint_required",
            input.enrollmentActionsSettled ? "ready" : "pending"
        ),
        dep(
            "right_rail_actions",
            "first_paint_required",
            input.enrollmentActionsSettled ? "ready" : "pending"
        ),
        dep(
            "row_queue_actions",
            "first_paint_required",
            !rowsNeedActions ? "empty" : input.queueRowActionsReady ? "ready" : "pending"
        ),
        dep(
            "active_lane_rows",
            "first_paint_required",
            rowsReady ? "ready" : input.queueItemsLoading ? "pending" : "empty"
        ),
        dep("kpi_placements", "background_deferred", kpiReady ? "ready" : "deferred"),
    ];

    const viewport_slots: WorkUnitFirstPaintContract["viewport_slots"] = [
        "shell",
        "header_pills",
        "actions_rail",
        "queue_lane",
    ];
    if (input.kpiStripVisible) viewport_slots.push("kpi_strip");

    const settled = dependencies
        .filter((d) => d.disposition === "first_paint_required")
        .every((d) => d.status === "ready" || d.status === "empty");

    return { settled, viewport_slots, dependencies };
}

/** Client-side VM compose from existing page state — shadow / contract validation only. */
export function composeWorkUnitViewModel(input: ComposeWorkUnitViewModelInput): WorkUnitViewModel {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const first_paint = buildFirstPaintContract(input);
    const rowCount =
        input.queueModel?.primaryQueue?.items?.length ??
        (Array.isArray(input.queueItems?.items) ? input.queueItems!.items!.length : 0);

    const actions = buildWorkUnitViewModelActions({
        opportunityQueueRowResolved: input.opportunityQueueRowResolved,
        enrollmentRightRailResolved: input.enrollmentRightRailResolved,
        queueRowActionsReady: input.queueRowActionsReady,
        enrollmentActionsSettled: input.enrollmentActionsSettled,
        queueRecordIds: input.queueRecordIds,
    });

    const vm: WorkUnitViewModel = {
        generation: `${input.workUnitId}:${input.selectedQueueKey ?? "default"}:${first_paint.settled ? "settled" : "pending"}`,
        entity: {
            work_unit_id: input.workUnitId,
            department_id: input.departmentId,
            work_unit_key: input.workUnitKey,
        },
        first_paint,
        above_fold: input.workUnitAboveFold,
        queue: {
            selected_queue_key: input.selectedQueueKey,
            row_count: rowCount,
            rows_loading: input.queueItemsLoading,
            lane_reveal: input.queueLaneRevealState,
            known_empty: input.queueLaneRevealState === "ready_empty",
        },
        summary: {
            pill_count: input.queueSummaries?.length ?? 0,
            summaries_complete: input.queueSummaries != null && !input.queueSummariesError,
        },
        kpi: {
            metric_count: input.kpiMetrics.length,
            metrics_pending: input.kpiMetricsPending,
            strip_visible: input.kpiStripVisible,
        },
        actions,
        timing: {
            compose_ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0),
        },
    };
    return vm;
}
