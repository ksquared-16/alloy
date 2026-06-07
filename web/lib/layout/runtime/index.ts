/**
 * Layout runtime — public exports (Phase 0–4).
 */

export { buildLayoutRuntimePlan, layoutDocSupportsAllSprint1ItemKinds } from "./layoutRuntimePlan";
export type { LayoutRuntimePlan, LayoutRuntimeSectionPlan, LayoutRuntimeItemPlan } from "./layoutRuntimePlan";

export {
    classifyLayoutItemBinding,
    collectLayoutItems,
    withItemBinding,
    type LayoutItemBindingPlan,
} from "./classifyLayoutItemBinding";

export {
    LAYOUT_BINDING_METADATA_KEY,
    readItemBindingMetadata,
    type LayoutContractBlockKind,
    type LayoutItemBindingMetadata,
    type LayoutRelationDescriptor,
    type LayoutValueBindingClass,
    type LocationReferenceRole,
} from "./valueBinding";

export {
    OPPORTUNITY_DRAWER_RELATIONS,
    OPPORTUNITY_COMPUTE_KEYS,
    OPPORTUNITY_LAYOUT_ANCHOR_ENTITY,
    getOpportunityRelation,
} from "./opportunityRelationRegistry";

export {
    PERSON_DRAWER_RELATIONS,
    PERSON_LAYOUT_ANCHOR_ENTITY,
    getPersonRelation,
} from "./personRelationRegistry";

export {
    CHILD_DRAWER_RELATIONS,
    CHILD_COMPUTE_KEYS,
    CHILD_LAYOUT_ANCHOR_ENTITY,
    getChildRelation,
} from "./childRelationRegistry";

export { buildOpportunityDrawerRelationshipProofLayout } from "./opportunityDrawerRelationshipProofLayout";
export {
    appendOpportunityFutureTabPlaceholders,
    OPPORTUNITY_FUTURE_DRAWER_MODULES,
} from "./opportunityFutureTabProofLayout";
export {
    buildPersonDrawerRelationshipProofLayout,
    PERSON_FUTURE_DRAWER_MODULES,
} from "./personDrawerRelationshipProofLayout";
export {
    buildChildDrawerRelationshipProofLayout,
    CHILD_FUTURE_DRAWER_MODULES,
} from "./childDrawerRelationshipProofLayout";

export { buildProofOpportunityRecord, mergeApiRecordIntoProofRecord } from "./buildProofOpportunityRecord";
export { buildProofPersonRecord } from "./buildProofPersonRecord";
export { buildProofChildRecord } from "./buildProofChildRecord";
export { FUTURE_MODULE_METADATA_KEY } from "./proofLayoutHelpers";
export { isOpaqueIdValue, readProofComputed, readProofRelation, type ProofRelationHandle, type ProofRuntimeRecord } from "./proofRecordContext";
export { resolveProofBindingValue, shouldRenderProofItem, type ProofBindingResolution } from "./resolveProofBindingValue";

export {
    buildOpportunityDrawerShadowParityReport,
    buildRealRecordShadowValidationFromVm,
    runRealOpportunityShadowValidation,
    captureVmOpportunityDrawerStructure,
    captureLayoutRuntimeDrawerStructure,
    compareOpportunityDrawerShadowParity,
    enrichShadowParityReport,
    normalizeFieldRefKeyForParity,
    type ShadowParityReport,
    type ShadowParityMismatch,
    type DrawerStructureSnapshot,
    type RealRecordShadowValidationReport,
} from "./shadow";
