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
    type ProcessTileModel,
    type QueueRowModel,
    type WorkspaceSurfaceModel,
    type WorkUnitSurfaceIntents,
    type WorkUnitSurfaceModel,
    type WorkViewLinkModel,
} from "./types";

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

export { useWorkUnitSurfaceRuntime, type WorkUnitSurfaceRuntime } from "./useWorkUnitSurfaceRuntime";
