export {
    ESCALATION_CHIP_LABEL,
    queueTypeCueLabel,
    recommendationTypeLabel,
    resolveClassificationContextLine,
    resolveEscalationChipLabel,
    shouldShowDrawerTypeLine,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationClassificationSemantics";
export {
    resolveDrawerReadinessChrome,
    resolveHandoffTrustNote,
    resolveQueuePreviewTrustChrome,
    TRUST_READINESS_LABELS,
    type ResolvedDrawerReadinessChrome,
    type ResolvedQueuePreviewTrustChrome,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationTrustChrome";
export {
    QUEUE_PREVIEW_BOUNDARY_LABEL,
    resolveDrawerReviewAssistViewModel,
    resolveDrawerSupportingDetail,
    resolveQueueOperationalReadSlot,
    type QueueOperationalReadPreviewSlot,
    type ResolvedDrawerReviewAssistViewModel,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
export {
    getRecommendationDetailSummary,
    getRecommendationDrawerStrip,
    getRecommendationHandoff,
    getRecommendationQueuePreview,
    queueUrgencyChipLabel,
    resolveDrawerReadinessChromeForOverview,
    resolveQueueOperationalReadPreview,
    type RecommendationReadSource,
    type ResolvedDrawerRecommendationDisplay,
    type ResolvedDrawerSupportingDetail,
    type ResolvedQueueOperationalReadPreview,
    type ResolvedQueueRecommendationPreview,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
