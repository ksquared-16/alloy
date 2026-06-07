/**
 * Layout runtime shadow parity — public exports (Phase 3).
 */

export type {
    DrawerStructureNode,
    DrawerStructureNodeKind,
    DrawerStructureSnapshot,
    ShadowParityMismatch,
    ShadowParityMismatchCategory,
    ShadowParityReport,
} from "./drawerStructureSnapshot";

export { captureVmOpportunityDrawerStructure } from "./captureVmOpportunityDrawerStructure";
export { captureLayoutRuntimeDrawerStructure, type CaptureLayoutRuntimeInput } from "./captureLayoutRuntimeDrawerStructure";
export {
    compareOpportunityDrawerShadowParity,
    runOpportunityDrawerShadowParity,
    type CompareShadowParityInput,
} from "./compareOpportunityDrawerShadowParity";
export {
    buildOpportunityDrawerShadowParityReport,
    type BuildShadowParityReportInput,
} from "./buildOpportunityDrawerShadowParityReport";
export { enrichShadowParityReport, type EnrichShadowParityInput } from "./enrichShadowParityReport";
export {
    runRealOpportunityShadowValidation,
    buildRealRecordShadowValidationFromVm,
    type RunRealOpportunityShadowValidationInput,
    type RealOpportunityShadowValidationResult,
    type OpportunityShadowValidationGate,
} from "./runRealOpportunityShadowValidation";
export {
    buildOpportunityDrawerShadowTelemetry,
    logOpportunityDrawerShadowTelemetry,
    type OpportunityDrawerShadowTelemetry,
} from "./opportunityDrawerShadowTelemetry";
export type { RealRecordShadowValidationReport, ShadowParityCoverageMetrics, MigrationReadinessAssessment, ShadowConvergenceGap } from "./drawerStructureSnapshot";
export {
    OPPORTUNITY_VM_TO_LAYOUT_SECTION_ALIASES,
    layoutSectionKeysForVmSection,
    normalizeFieldRefKeyForParity,
    vmSectionKeysForLayoutSection,
} from "./opportunitySectionAliases";
