import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import type { WorkUnitQueueLaneRevealState } from "@/lib/workspace/workUnitQueueLaneRevealState";
import type { KPIVm, WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";

export type WorkUnitFirstPaintDependencyKey =
    | "work_unit_identity"
    | "department_identity"
    | "queue_summaries"
    | "enrollment_actions"
    | "active_lane_rows"
    | "kpi_placements";

export type WorkUnitFirstPaintDependencyDisposition = "first_paint_required" | "background_deferred";

export type WorkUnitFirstPaintDependencyState = {
    key: WorkUnitFirstPaintDependencyKey;
    disposition: WorkUnitFirstPaintDependencyDisposition;
    status: "ready" | "empty" | "pending" | "deferred";
};

export type WorkUnitFirstPaintContract = {
    settled: boolean;
    viewport_slots: Array<
        "shell" | "header_pills" | "actions_rail" | "queue_lane" | "kpi_strip"
    >;
    dependencies: WorkUnitFirstPaintDependencyState[];
};

export type WorkUnitViewModel = {
    generation: string;
    entity: {
        work_unit_id: string;
        department_id: string;
        work_unit_key: string;
    };
    first_paint: WorkUnitFirstPaintContract;
    above_fold: WorkUnitAboveFoldRenderModel;
    queue: {
        selected_queue_key: string | null;
        row_count: number;
        rows_loading: boolean;
        lane_reveal: WorkUnitQueueLaneRevealState;
        known_empty: boolean;
    };
    summary: {
        pill_count: number;
        summaries_complete: boolean;
    };
    kpi: {
        metric_count: number;
        metrics_pending: boolean;
        strip_visible: boolean;
    };
    timing: { compose_ms: number };
};

/** Live page inputs for shadow compose — no new fetches. */
export type ComposeWorkUnitViewModelInput = {
    departmentId: string;
    workUnitId: string;
    workUnitKey: string;
    selectedQueueKey: string | null;
    queueSummaries: Array<{ key: string; count: number }> | null;
    queueSummariesError: string | null;
    queueItems: { items?: unknown[] } | null;
    queueItemsLoading: boolean;
    queueLaneRevealState: WorkUnitQueueLaneRevealState;
    workUnitAboveFold: WorkUnitAboveFoldRenderModel;
    queueModel: WorkUnitWorkspaceModel | null;
    kpiMetrics: KPIVm[];
    kpiMetricsPending: boolean;
    kpiStripVisible: boolean;
    shellReady: boolean;
    enrollmentActionsSettled: boolean;
};
