export type {
    CatalogAvailableActionDef,
    CatalogCommunicationHints,
    CatalogEscalationHints,
    CatalogInterpolationValues,
    CatalogRecommendedActionTemplate,
    CatalogTemplatePlaceholder,
    CatalogTemplateTier,
    CatalogWorkflowHints,
    OperationalRecommendationCatalogEntryV1,
    OperationalRecommendationCatalogKey,
    OperationalRecommendationCatalogSupplementalKey,
    RenderedCatalogCopyV1,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";

export { CATALOG_TEMPLATE_PLACEHOLDERS } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";

export {
    listTemplatePlaceholders,
    renderCatalogTemplate,
    renderCatalogTemplateWithOptionalClauses,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCopyTemplates";

export type { GenericCopyIssue } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogValidation";

export {
    assertNotGenericCopy,
    BANNED_GENERIC_ACTION_LABELS,
    findGenericCopyIssues,
    RecommendationCatalogValidationError,
    validateCatalogEntryEnums,
    validateCatalogEntryTemplates,
    validateOperationalRecommendationCatalog,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogValidation";

export {
    getOperationalRecommendationCatalogEntry,
    LEGACY_STALE_NEW_INQUIRY_ACTION_LABEL,
    LEGACY_STALE_NEW_INQUIRY_SUMMARY_PREFIX,
    OPERATIONAL_RECOMMENDATION_CATALOG_V1,
    PHASE1_REQUIRED_CATALOG_KEYS,
    renderCatalogEntryCopy,
    resolveCatalogKeyForAttentionReason,
    WAITING_ON_INTERNAL_CATALOG_KEY,
} from "@/lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog";
