/**
 * Presentation Runtime V2 — public surface of the runtime layer.
 * Surfaces import resolved models + hooks from here and never fetch.
 */

export {
    drillHrefForMetricKey,
    operationalAnswerModelsFromResolvedMetrics,
    processTileModelFromLandingCard,
    queueRowModelFromQueueItem,
    queueRowModelsFromQueueItemsResult,
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
    useOperationalAnswers,
    type OperationalAnswersResult,
    type OperationalAnswersScope,
} from "./useOperationalAnswers";

export { useWorkspaceSurfaceRuntime } from "./useWorkspaceSurfaceRuntime";

export { useWorkUnitSurfaceRuntime, type WorkUnitSurfaceRuntime } from "./useWorkUnitSurfaceRuntime";
