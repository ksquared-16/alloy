export type {
    BuildOperationalRecommendationInputV1,
    OperationalRecommendationStaleInputsV1,
    RawGroundingSignalInputV1,
    SecondaryFactorInputV1,
} from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";

export {
    MAX_DETAIL_SIGNAL_LABELS_V1,
    MAX_DRAWER_STRIP_SIGNAL_LABELS_V1,
    MAX_GROUNDING_SIGNALS_V1,
    toRecommendationFactors,
} from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";

export {
    assertRequiredCatalogSignalsPresent,
    normalizeGroundingSignals,
    normalizedSignalCodesForFingerprint,
    OperationalRecommendationSignalError,
} from "@/lib/adminV2/bos/recommendations/signals/normalizeGroundingSignals";
