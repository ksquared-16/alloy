import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";

/** Flat snapshot extracted from live page presentation models for shadow diff. */
export type LiveWorkUnitShadowSnapshot = {
    work_unit_id: string;
    department_id: string;
    first_paint_settled: boolean;
    header_pill_count: number;
    selected_queue_key: string | null;
    queue_row_count: number;
    queue_rows_loading: boolean;
    lane_reveal_state: string;
    kpi_metric_count: number;
    kpi_metrics_pending: boolean;
    actions_rail_state: string;
    queue_lane_state: string;
};

export function assembleLiveWorkUnitShadowSnapshot(params: {
    departmentId: string;
    workUnitId: string;
    selectedQueueKey: string | null;
    workUnitAboveFold: WorkUnitAboveFoldRenderModel;
    queueModel: WorkUnitWorkspaceModel | null;
    kpiMetricCount: number;
    kpiMetricsPending: boolean;
    firstPaintSettled: boolean;
    laneRevealState: string;
    queueRowsLoading: boolean;
}): LiveWorkUnitShadowSnapshot {
    const pillCount = params.workUnitAboveFold.header.sections.reduce(
        (n, sec) => n + sec.chips.length,
        0
    );
    return {
        work_unit_id: params.workUnitId,
        department_id: params.departmentId,
        first_paint_settled: params.firstPaintSettled,
        header_pill_count: pillCount,
        selected_queue_key: params.selectedQueueKey,
        queue_row_count: params.queueModel?.primaryQueue?.items?.length ?? 0,
        queue_rows_loading: params.queueRowsLoading,
        lane_reveal_state: params.laneRevealState,
        kpi_metric_count: params.kpiMetricCount,
        kpi_metrics_pending: params.kpiMetricsPending,
        actions_rail_state: params.workUnitAboveFold.actions_rail.state,
        queue_lane_state: params.workUnitAboveFold.queue_lane.state,
    };
}

export function extractWorkUnitViewModelShadowSnapshot(
    vm: import("@/lib/adminV2/viewModel/workUnit/types").WorkUnitViewModel
): LiveWorkUnitShadowSnapshot {
    const pillCount = vm.above_fold.header.sections.reduce(
        (n, sec) => n + sec.chips.length,
        0
    );
    return {
        work_unit_id: vm.entity.work_unit_id,
        department_id: vm.entity.department_id,
        first_paint_settled: vm.first_paint.settled,
        header_pill_count: pillCount,
        selected_queue_key: vm.queue.selected_queue_key,
        queue_row_count: vm.queue.row_count,
        queue_rows_loading: vm.queue.rows_loading,
        lane_reveal_state: vm.queue.lane_reveal,
        kpi_metric_count: vm.kpi.metric_count,
        kpi_metrics_pending: vm.kpi.metrics_pending,
        actions_rail_state: vm.above_fold.actions_rail.state,
        queue_lane_state: vm.above_fold.queue_lane.state,
    };
}
