/**
 * BOS operational recommendations — public exports (Phase 1 foundation).
 */

export type {
    AvailableActionKindV1,
    AvailableActionV1,
    CommunicationChannelHintV1,
    CommunicationReferenceV1,
    ConfidenceLevelV1,
    DeterministicVsAiAssistedV1,
    EscalationReferenceV1,
    FingerprintInputsV1,
    GroundingSignalSourceTypeV1,
    GroundingSignalV1,
    OperationalContextEntityTypeV1,
    OperationalContextSourceSurfaceV1,
    OperationalContextV1,
    OperationalRecommendationDetailV1,
    OperationalRecommendationDrawerStripV1,
    OperationalRecommendationHandoffV1,
    OperationalRecommendationQueuePreviewV1,
    OperationalRecommendationRenderBundleV1,
    OperationalRecommendationV1,
    RecommendationFactorV1,
    RecommendationTypeV1,
    RecommendedActionV1,
    StaleReasonV1,
    StaleStateCheckV1,
    TrustBoundaryV1,
    UrgencyBandV1,
    WorkflowReferenceV1,
} from "@/lib/adminV2/bos/recommendations/types";

export {
    CONFIDENCE_LEVELS_V1,
    GROUNDING_SIGNAL_SOURCE_TYPES_V1,
    OPERATIONAL_RECOMMENDATION_MAX_LENGTHS,
    OPERATIONAL_RECOMMENDATION_PHASE1_DETERMINISTIC_MODES,
    OPERATIONAL_RECOMMENDATION_VERSION,
    RECOMMENDATION_TYPES_V1,
    STALE_REASONS_V1,
    TRUST_BOUNDARIES_V1,
    URGENCY_BANDS_V1,
} from "@/lib/adminV2/bos/recommendations/types";

export {
    OperationalRecommendationValidationError,
    validateOperationalRecommendationV1,
} from "@/lib/adminV2/bos/recommendations/validation/validateOperationalRecommendationV1";

export * from "@/lib/adminV2/bos/recommendations/catalog";

export * from "@/lib/adminV2/bos/recommendations/signals";

export * from "@/lib/adminV2/bos/recommendations/fingerprints";

export * from "@/lib/adminV2/bos/recommendations/builders";

export * from "@/lib/adminV2/bos/recommendations/adapters";

export * from "@/lib/adminV2/bos/recommendations/selectors";
