/**
 * Business Process runtime registry — documents the canonical platform chain.
 *
 * Current state:
 *   stage_operating_plan_v1.work_templates → resolveWorkDefinitionKeyFromTemplate
 *   → platformWorkDefinitionCatalog → instantiateWorkFromDefinition → operational_tasks
 *
 * Target state:
 *   Process-agnostic templates + definitions with per-org lifecycle metadata overrides.
 *
 * Migration path:
 *   1) Require template→definition resolution at save (validateStageOperatingPlanWorkDefinitions)
 *   2) Canonical BP runtime fingerprint dedupe (buildBusinessProcessWorkRuntimeFingerprint)
 *   3) Expand platformWorkDefinitionCatalog for non-enrollment verticals
 *   4) Move ENROLLMENT_TEMPLATE_WORK_DEFINITION_DEFAULTS into template registry seeds
 */

export { listPlatformWorkDefinitions, getPlatformWorkDefinition } from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
export { resolveWorkDefinition, resolveEffectiveWorkDefinitions } from "@/lib/admin/operationalWork/resolveWorkDefinition";
export {
    resolveWorkDefinitionKeyFromTemplate,
    resolveEffectiveWorkDefinitionKeyFromTemplate,
    ENROLLMENT_TEMPLATE_WORK_DEFINITION_DEFAULTS,
} from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
export { validateStageOperatingPlanWorkDefinitions } from "@/lib/lifecycle/validateStageOperatingPlanWorkDefinitions";
export {
    buildBusinessProcessWorkRuntimeFingerprint,
    findOpenBusinessProcessWorkTask,
} from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";
export { buildBusinessProcessWorkTaskMetadata } from "@/lib/lifecycle/buildBusinessProcessWorkTaskMetadata";
export { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
export {
    emitDomainLifecycleStatusChangedEvent,
    DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID,
} from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";

export const BUSINESS_PROCESS_RUNTIME_CHAIN = [
    "Business Process Template (stage_operating_plan_v1.work_templates)",
    "Work Definition (platformWorkDefinitionCatalog + lifecycle overrides)",
    "Operational Task (operational_tasks via instantiateWorkFromDefinition)",
] as const;
