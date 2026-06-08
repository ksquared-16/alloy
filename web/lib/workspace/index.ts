export type {
    DepartmentWorkspaceLayout,
    WorkspaceBlock,
    WorkspaceBlockType,
    WorkspaceRuntimeData,
    WorkspaceSignalMetricKey,
    WorkspaceQueueDefinitionIntentV0,
    WorkspaceQueueFilterIntent,
} from "./types";
export { getDepartmentWorkspaceLayout } from "./registry";
export { isGrowthSliceDepartmentKey } from "./growthSliceDepartments";
export {
    computeOpportunityLifecycleKpis,
    type OpportunityLifecycleKpiSnapshot,
} from "./computeOpportunityLifecycleKpis";
export { partitionDepartmentBlocks } from "./partitionBlocks";
export {
    mergeJobListsById,
    computeOperationsSignalCounts,
    computeAttentionCategoryRuntime,
    filterJobsScheduledToday,
    filterJobsNeedsAttention,
    type JobRowForWorkspaceMetrics,
    type ComputeOperationsSignalCountsOptions,
} from "./deriveDepartmentJobMetrics";
export {
    NEEDS_ATTENTION_EXCEPTIONS,
    NEEDS_ATTENTION_EXCEPTION_ORDER,
    jobMatchesExceptionType,
    jobMatchesAnyNeedsAttentionException,
    filterJobsForNeedsAttentionWorkUnit,
    parseNeedsAttentionExceptionParam,
    type NeedsAttentionExceptionType,
} from "./exceptionTypes";
export { getNeedsAttentionSummary, type NeedsAttentionSummary } from "./getNeedsAttentionSummary";
export { NEEDS_ATTENTION_WORK_UNIT, type WorkUnitKind } from "./workUnitKinds";
export { resolveWorkspaceActionHref } from "./resolveWorkspaceActionHref";
