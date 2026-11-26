/**
 * Adaptive Workspace System — public Presentation Runtime surface.
 *
 * Permanent platform capability: assistant presentation, region negotiation,
 * and adaptive layout derivation. Every operational workspace inherits this —
 * do not fork module-specific responsive systems.
 */

export {
    ADAPTIVE_REGION_ATTR,
    ADAPTIVE_REGION_PRIORITY,
    adaptiveRegionDomAttrs,
    type AdaptiveWorkspaceRegionRole,
} from "@/lib/presentation/adaptiveWorkspaceRegions";

export {
    ADAPTIVE_QUEUE_WIDTH_REM,
    ADAPTIVE_WORKSPACE_COMPACT_MIN_PX,
    ADAPTIVE_WORKSPACE_EXPANDED_MIN_PX,
    WORKSPACE_PRESENTATION_ATTR,
    WORK_UNIT_TWO_PANE_FLOOR_PX,
    adaptiveMetricDensity,
    adaptiveQueueWidthRem,
    deriveActivityCommsCompositionState,
    deriveAdaptiveWorkspacePresentation,
    deriveWorkUnitSelectionMode,
    shouldShowActivityTopicRail,
    type ActivityCommsCompositionState,
    type AdaptiveMetricDensity,
    type AdaptiveWorkspacePresentation,
    type WorkUnitSelectionMode,
} from "@/lib/presentation/adaptiveWorkspacePresentation";

export {
    BOS_PRESENTATION_ATTR,
    BOS_PRESENTATION_PREFERRED_ATTR,
    BOS_RAIL_WIDTH_CSS_VAR,
    BOS_PINNED_PRIMARY_MIN_PX,
    canHonorPinnedReserve,
    deriveBosPresentation,
    recommendBosPresentation,
    type BosPresentationDerivation,
    type BosPresentationDerivationInput,
} from "@/lib/bos/bosPresentationState";

export {
    BOS_FLOATING_GEOMETRY_KEY,
    BOS_FLOATING_POSITION_KEY,
    BOS_PINNED_DEFAULT_PX,
    BOS_PINNED_MAX_PX,
    BOS_PINNED_MIN_PX,
    BOS_PRESENTATION_STATE_KEY,
    BOS_PRESENTATION_WIDTH_KEY,
    clampBosPinnedWidthPx,
    defaultBosPinnedWidthPx,
    isBosPresentationState,
    readBosFloatingGeometry,
    readBosFloatingPosition,
    readBosPinnedWidthPx,
    readBosPresentationPreference,
    writeBosFloatingGeometry,
    writeBosFloatingPosition,
    writeBosPinnedWidthPx,
    writeBosPresentationPreference,
    type BosFloatingGeometry,
    type BosFloatingPosition,
    type BosPresentationState,
} from "@/lib/bos/bosPresentationPreference";

export {
    BOS_FLOAT_DEFAULT_HEIGHT_PX,
    BOS_FLOAT_DEFAULT_WIDTH_PX,
    BOS_FLOAT_MIN_HEIGHT_PX,
    BOS_FLOAT_MIN_WIDTH_PX,
    clampBosFloatingGeometry,
    defaultBosFloatingGeometry,
    geometriesEqual,
    maxBosFloatingHeightPx,
    maxBosFloatingWidthPx,
} from "@/lib/bos/bosFloatingGeometry";
