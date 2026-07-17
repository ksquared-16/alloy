/**
 * Presentation Runtime V2 — public surface of the runtime layer.
 * Surfaces import resolved models + hooks from here and never fetch.
 */

export {
    drillHrefForMetricKey,
    operationalAnswerModelsFromResolvedMetrics,
    opportunityQueuePreviewSeedFromRowContext,
    processTileModelFromLandingCard,
    queueRowModelFromQueueItem,
    queueRowModelsFromQueueItemsResult,
    queueRowSubjectDisplayName,
    queueTotalCountFromQueueItemsResult,
    workViewLinkFromWorkQueuePreview,
    workViewLinkModelsFromConfiguredViews,
    type OperationalAnswerModel,
    type PrimarySignalModel,
    type ProcessTileModel,
    type QueueRowModel,
    type SignalState,
    type WorkspaceSurfaceModel,
    type WorkUnitSurfaceIntents,
    type WorkUnitSurfaceModel,
    type WorkViewLinkModel,
} from "./types";

export {
    availableSignalsForProcess,
    businessProcessForProcessKey,
    defaultSignalKeyForProcess,
    resolvePrimarySignal,
    signalAnswerText,
    signalStateFromKpiStatus,
} from "./workspaceProcessSignal";

export {
    mapQueueRowSurfaceToCompactConfig,
    type CompactRowConfig,
    type CompactRowSlotConfig,
    type CompactRowSlots,
} from "./queueRowSurfaceConfig";

export {
    fallbackWorkspaceHeaderCardVms,
    refineWorkspaceHeaderCardVms,
    seedWorkspaceHeaderCalculations,
    workspaceHeaderCalculationKeys,
    workspaceHeaderCardVmsFromViews,
    type WorkspaceHeaderCalculationCardVm,
    type WorkspaceHeaderResolvedValue,
} from "./workspaceHeaderCards";

export {
    fallbackWorkUnitHeaderCards,
    seedWorkUnitHeaderCards,
    workUnitHeaderCardsFromDoc,
    workUnitHeaderCalculationKeys,
    type WorkUnitHeaderCalculationCardVm,
} from "./workUnitHeaderCards";

export {
    useOperationalAnswers,
    type OperationalAnswersResult,
    type OperationalAnswersScope,
} from "./useOperationalAnswers";

export {
    queueRowsRouteForView,
    useWorkViewTotals,
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "./useWorkViewTotals";

export { useWorkspaceSurfaceRuntime } from "./useWorkspaceSurfaceRuntime";

export {
    applyTodaysWorkConfig,
    normalizeWorkspaceProcessSurfaceConfig,
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    type WorkspaceProcessSurfaceConfig,
    type TodaysWorkSort,
} from "./workspaceProcessSurfaceConfig";

export { useWorkspaceProcessSurfaceConfig } from "./useWorkspaceProcessSurfaceConfig";

export {
    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    WORKSPACE_HEADER_LAYOUT_KEY,
    buildWorkspaceHeaderPresentation,
    enabledWorkspaceHeaderKpis,
    normalizeWorkspaceHeaderSurfaceConfig,
    workspaceHeaderKpiSourceKeys,
    type WorkspaceHeaderKpiVm,
    type WorkspaceHeaderPresentationModel,
    type WorkspaceHeaderSurfaceConfig,
} from "./workspaceHeaderSurfaceConfig";

export { useWorkspaceHeaderSurfaceConfigState } from "./useWorkspaceHeaderSurfaceConfig";

export {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    WORK_UNIT_HEADER_LAYOUT_KEY,
    buildWorkUnitHeaderPresentation,
    buildWorkUnitHeaderPresentationForRuntime,
    normalizeWorkUnitHeaderSurfaceConfig,
    workUnitHeaderKpiSourceKeys,
    type WorkUnitHeaderKpiVm,
    type WorkUnitHeaderPresentationModel,
    type WorkUnitHeaderSurfaceConfig,
} from "./workUnitHeaderSurfaceConfig";

export { useWorkUnitHeaderSurfaceConfigState } from "./useWorkUnitHeaderSurfaceConfig";
