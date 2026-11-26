import type { WorkspaceRootMetrics } from "@/lib/workspace/workspaceRootMetrics";
import type { WorkspaceGrowthDeptSnapshot } from "@/lib/workspace/viewModels/workspaceRootRollup";
import type { DeptWorkUnitRow } from "@/lib/kpi/baseline";
import type { WuQueueItemsForKpi, WuQueueSummaryForKpi } from "@/lib/kpi/contextKpiMetrics";
import type { NormalizedQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";

/**
 * Code-level contract for workspace surface KPI reducers (Card 14).
 * Values are derived only from batches the org workspace page already loads.
 */
export type WorkspaceKpiContext = {
    metrics: WorkspaceRootMetrics | null;
    growthSnapshots: WorkspaceGrowthDeptSnapshot[];
};

export type DepartmentKpiContext = {
    deptWorkUnits: DeptWorkUnitRow[];
    deptWorkUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    deptQueueSummariesLoading: boolean;
    deptQueueSummariesError: string | null;
};

/**
 * Same session inputs as `AdminV2OpportunityWorkUnitPage` queue chrome (summaries + active tab + items).
 * `legacyOpportunityListTotal` is used only when QueueService summaries are not available.
 */
export type WorkUnitKpiContext = {
    workUnitId: string;
    queueSummaries: WuQueueSummaryForKpi[] | null;
    queueSummariesLoading: boolean;
    queueSummariesError: string | null;
    selectedQueueKey: string | null;
    queueItems: WuQueueItemsForKpi;
    queueItemsLoading: boolean;
    queueItemsError: string | null;
    legacyOpportunityListTotal: number | null;
    /** v2 queue_definition for grain labels when summary metadata is partial. */
    normalizedQueueDefinition?: NormalizedQueueDefinitionDocument | null;
};

export function workUnitContextFromParts(params: {
    workUnitId: string;
    queueSummaries: WuQueueSummaryForKpi[] | null;
    queueSummariesLoading: boolean;
    queueSummariesError: string | null;
    selectedQueueKey: string | null;
    queueItems: WuQueueItemsForKpi;
    queueItemsLoading: boolean;
    queueItemsError: string | null;
    legacyOpportunityListTotal: number | null;
    normalizedQueueDefinition?: NormalizedQueueDefinitionDocument | null;
}): WorkUnitKpiContext {
    return { ...params };
}
