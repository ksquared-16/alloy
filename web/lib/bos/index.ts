export type {
    BosApplyPolicy,
    BosCapabilityClass,
    BosCapabilityDefinition,
    BosCapabilityDomain,
    BosCapabilityKey,
    BosProposalMode,
    BosProposalPersistence,
    BosProposalStatus,
    BosReadClass,
    BosRiskLevel,
    BosWriteClass,
} from "@/lib/bos/bosCapability";

export {
    BOS_AUDITED_CAPABILITY_KEYS,
    BOS_CAPABILITY_REGISTRY,
    getBosCapabilityByLegacyAgentKey,
    getBosCapabilityDefinition,
    tryGetBosCapabilityDefinition,
} from "@/lib/bos/bosCapabilityRegistry";

export type {
    BosProposalEnvelopeDiffV1,
    BosProposalEnvelopeSourceV1,
    BosProposalEnvelopeV1,
    BosProposalEnvelopeValidationV1,
    BosProposalEnvelopeWarningV1,
} from "@/lib/bos/bosProposalEnvelope";

export { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";

export { mapConfigLayoutAssistStateToBosStatus } from "@/lib/bos/bosProposalStatusMap";

export { canBosProposalApply, isBosProposalTerminal } from "@/lib/bos/bosProposalLifecycle";

export {
    COMMAND_SURFACE_CARD_CAPABILITY_KEY,
    capabilityKeyForCommandSurfaceCardType,
    withCommandSurfaceCardCapabilityKey,
    type CommandSurfaceActionCard,
} from "@/lib/bos/commandSurfaceBosMetadata";

export {
    agentV0QueueDefinitionToBosProposalEnvelope,
    agentV1RecordOverviewLayoutToBosProposalEnvelope,
    agentV2FieldVisibilityToBosProposalEnvelope,
    configurationProposalToBosProposalEnvelope,
    needsAttentionSuggestionToBosProposalEnvelope,
    taskAssistSuggestionToBosProposalEnvelope,
    workflowAssistSuggestionToBosProposalEnvelope,
} from "@/lib/bos/adapters";

export {
    BOS_CAPABILITIES_WITH_PROPOSAL_ADAPTERS,
    BOS_CAPABILITIES_WITHOUT_PROPOSAL_ADAPTERS,
} from "@/lib/bos/bosAdapterCatalog";

export {
    appendActionCardTurnWithBosMetadata,
} from "@/lib/bos/commandSurfaceBosWire";

export {
    buildBosEnvelopeForCommandSurfaceCard,
    buildBosEnvelopeLogSummary,
    enrichCommandSurfaceCardWithBosMetadata,
    type BosCommandSurfaceEnvelopeContext,
} from "@/lib/bos/bosCommandSurfaceEnvelope";

export {
    AI_ENRICHMENT_USE_PERMISSION_KEY,
    bosCapabilityUsesEnrichmentPortalProposeGate,
    computeOpenAiLiveInvocationPermitted,
    getBosCapabilityAccessHints,
    isAiEnrichmentUsePermissionRequired,
    resolveAiEnrichmentPortalAccess,
} from "@/lib/bos/auth";
