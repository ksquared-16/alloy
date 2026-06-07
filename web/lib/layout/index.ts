/**
 * Layout module — public runtime exports (Phase 0).
 */

export { resolveLayout, resolveFromRegistry, type ResolveLayoutInput, type ExtendedLayoutResolution } from "./layoutResolver";
export { resolveLayoutForOrg, type ResolveLayoutForOrgInput, type ResolveLayoutForOrgResult } from "./resolveLayoutRuntime";
export {
    isLayoutV2PreviewEnabledServer,
    isLayoutV2PreviewEnabledClient,
    isLayoutRuntimeEnabledServer,
    isLayoutRuntimeEnabledClient,
    isLayoutRuntimeReadPathEnabled,
} from "./featureFlag";
export type {
    QueueLayoutContextRequest,
    QueueLayoutContextDescriptor,
    QueueLayoutGrain,
    QueueLayoutQueueType,
} from "./queueLayoutContext";
export {
    extractQueueContextFromRecord,
    queueContextDescriptorMatchesRequest,
    isQueueLayoutContextEmpty,
} from "./queueLayoutContext";
export { resolveQueueLayoutVariantFromRecords, matchQueueLayoutVariant } from "./resolveQueueLayoutVariant";
export {
    OPPORTUNITY_BUILTIN_QUEUE_VARIANTS,
    ENROLLMENT_PIPELINE_CASE_QUEUE_CONTEXT,
    ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT,
    resolveBuiltinQueueLayoutVariant,
} from "./defaultQueueLayoutVariants";
export { buildEnrollmentWaitlistQueueDoc, buildLeadQueueDefaultDoc } from "./defaultLeadLayouts";
export {
    buildLayoutRuntimePlan,
    buildOpportunityDrawerRelationshipProofLayout,
    classifyLayoutItemBinding,
    OPPORTUNITY_DRAWER_RELATIONS,
    type LayoutItemBindingPlan,
    type LayoutValueBindingClass,
} from "./runtime";
