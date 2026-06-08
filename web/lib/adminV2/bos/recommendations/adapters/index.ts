export {
    attachOperationalRecommendationBundle,
    type AttachOperationalRecommendationBundleInput,
    type AttachOperationalRecommendationBundleResult,
} from "@/lib/adminV2/bos/recommendations/adapters/attachOperationalRecommendationBundle";

export {
    attachOperationalRecommendationQueuePreview,
    queueRowToRecommendationOpportunityRow,
    type AttachOperationalRecommendationQueuePreviewInput,
    type AttachOperationalRecommendationQueuePreviewResult,
} from "@/lib/adminV2/bos/recommendations/adapters/attachOperationalRecommendationQueuePreview";

export { buildOperationalRecommendationAttachInput } from "@/lib/adminV2/bos/recommendations/adapters/extractGroundingSignalsFromAttention";

export { mapAttentionReasonToCatalogKey } from "@/lib/adminV2/bos/recommendations/adapters/mapAttentionReasonToCatalogKey";

export { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";

export {
    tryBuildOperationalRecommendationFromAttention,
    type BuildOperationalRecommendationFromAttentionInput,
} from "@/lib/adminV2/bos/recommendations/adapters/tryBuildOperationalRecommendationFromAttention";

export {
    buildLegacyAttentionSuggestionCompat,
    buildLegacyQueuePreviewCompat,
    buildLegacyQueuePreviewCompatFromRecommendation,
    buildLegacySuggestionCompatFromRecommendation,
    type BuildLegacyAttentionSuggestionCompatInput,
    type BuildLegacyQueuePreviewCompatInput,
} from "@/lib/adminV2/bos/recommendations/adapters/buildLegacySuggestionCompat";

export {
    operationalRecommendationToAttentionSuggestionV1,
    projectRecommendationToLegacyAttentionSuggestion,
} from "@/lib/adminV2/bos/recommendations/adapters/projectRecommendationToLegacyAttentionSuggestion";

export {
    projectOperationalRecommendationQueuePreviewToLegacyAttentionSuggestionPreview,
    projectRecommendationPreviewToLegacyAttentionSuggestionPreview,
} from "@/lib/adminV2/bos/recommendations/adapters/projectRecommendationPreviewToLegacyAttentionSuggestionPreview";
