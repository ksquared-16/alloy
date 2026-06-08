export { defaultOperationalWorkDueLocal, minOperationalWorkDatetimeLocalValue } from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
export { operationalWorkAssigneeCompactLabel, operationalWorkAssigneeDetailLabel } from "@/lib/admin/operationalWork/operationalWorkAssigneePresentation";
export { enrichOperationalTasksWithAssigneeLabels } from "@/lib/admin/operationalWork/operationalWorkAssigneeEnrichment";
export { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
export {
    LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY,
    lifecycleWorkDefinitionsHasStageBindings,
    parseLifecycleWorkDefinitionsV1,
} from "@/lib/admin/operationalWork/lifecycleWorkDefinitionsConfig";
export {
    PLATFORM_DEFAULT_WORK_DEFINITION_STAGE_BINDINGS,
    PLATFORM_MANUAL_AD_HOC_KEY,
    getPlatformWorkDefinition,
    isKnownWorkDefinitionKey,
    listPlatformWorkDefinitionKeys,
    listPlatformWorkDefinitions,
} from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
export {
    resolveAvailableWorkDefinitionKeys,
    resolveEffectiveWorkDefinitions,
    resolveWorkDefinition,
} from "@/lib/admin/operationalWork/resolveWorkDefinition";
export {
    buildInstantiateRequestFromDefinition,
    isSubjectAllowedForWorkDefinition,
    type BuildInstantiateRequestFromDefinitionParams,
    type BuildInstantiateRequestFromDefinitionResult,
} from "@/lib/admin/operationalWork/buildInstantiateRequestFromDefinition";
export {
    instantiateWorkFromDefinition,
    type InstantiateWorkFromDefinitionParams,
} from "@/lib/admin/operationalWork/instantiateWorkFromDefinition";
export {
    fetchOpportunityRecordOwnerUserId,
    resolveAssigneeFromWorkDefinitionPolicy,
} from "@/lib/admin/operationalWork/workDefinitionAssigneeResolution";
export { resolveDueAtFromWorkDefinitionPolicy } from "@/lib/admin/operationalWork/workDefinitionDueResolution";
export {
    buildCreateWorkModalDefinitionOptions,
    CREATE_WORK_AD_HOC_OPTION_KEY,
    resolveCreateWorkModalDefinition,
    resolveCreateWorkModalDefinitionPrefill,
    type CreateWorkModalDefinitionOption,
    type CreateWorkModalDefinitionPrefill,
} from "@/lib/admin/operationalWork/createWorkModalDefinitionPicker";
export {
    buildInstantiateWorkWorkflowProvenance,
    buildInstantiateWorkWorkflowActionOutputs,
    buildWorkflowInstantiateOperationalProvenance,
    executeInstantiateWorkWorkflowAction,
    formatInstantiateWorkWorkflowActionLog,
    INSTANTIATE_WORK_WORKFLOW_ACTION_TYPE,
    parseInstantiateWorkWorkflowActionPayload,
    resolveInstantiateWorkWorkflowSubject,
    resolveWorkflowInstantiateActor,
    resolveWorkflowInstantiateUserId,
    WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE,
    type ExecuteInstantiateWorkWorkflowActionParams,
    type ExecuteInstantiateWorkWorkflowActionResult,
    type InstantiateWorkWorkflowActionOutputs,
    type InstantiateWorkWorkflowActionPayloadV1,
    type InstantiateWorkWorkflowProvenanceV1,
    type InstantiateWorkWorkflowSubjectMappingV1,
    type ParsedInstantiateWorkWorkflowActionPayloadResult,
    type ResolvedInstantiateWorkWorkflowSubjectResult,
    type ResolveWorkflowInstantiateActorResult,
    type WorkflowInstantiateExecutorSource,
} from "@/lib/admin/operationalWork/workflowInstantiateWork";
export type {
    EffectiveWorkDefinition,
    LifecycleWorkDefinitionEntryConfig,
    LifecycleWorkDefinitionEntryOverrides,
    LifecycleWorkDefinitionStageBinding,
    LifecycleWorkDefinitionsV1,
    PlatformWorkDefinition,
    PlatformWorkDefinitionKey,
    ResolveWorkDefinitionsParams,
    WorkDefinitionAllowedSubject,
    WorkDefinitionAssigneePolicy,
    WorkDefinitionDuePolicy,
} from "@/lib/admin/operationalWork/workDefinitionTypes";
export {
    attachOperationalWorkView,
    buildOperationalWorkMetadataForCreate,
    buildOperationalWorkMetadataForInstantiate,
    mapInstantiateProvenanceToTaskSource,
    normalizeInstantiateProvenance,
    parseOperationalWorkViewFromTaskRow,
    toOperationalTaskApiRow,
    cancelWorkInstance,
    completeWorkInstance,
    createWorkInstance,
    instantiateWork,
    listWorkForEntity,
    listWorkForWorkspace,
    summarizeWorkCounts,
    syncOpportunityNextFollowUpFromOperationalTasks,
    updateWorkInstanceFields,
    validateWorkCreateBody,
    MANUAL_AD_HOC_WORK_DEFINITION_KEY,
    buildOperationalWorkDedupeKey,
    buildOperationalWorkSubjectFingerprint,
    resolveOperationalWorkDedupePolicy,
    type InstantiateWorkRequest,
    type InstantiateWorkResult,
    type OperationalTaskRow,
    type OperationalTaskWorkspaceRow,
    OPERATIONAL_WORK_FRAMEWORK_VERSION,
    type OperationalWorkCategory,
    type OperationalWorkContextSnapshot,
    type OperationalWorkDedupePolicy,
    type OperationalWorkInstanceRow,
    type OperationalWorkInstantiateProvenance,
    type OperationalWorkMetadataV1,
    type OperationalWorkProvenance,
    type OperationalWorkProvenanceSource,
    type OperationalWorkShape,
    type OperationalWorkSubject,
    type OperationalWorkView,
    type OperationalWorkWorkspaceFilter,
} from "@/lib/admin/operationalWork/operationalWorkService";
