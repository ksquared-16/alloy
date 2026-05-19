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
    configurationProposalToBosProposalEnvelope,
    needsAttentionSuggestionToBosProposalEnvelope,
    taskAssistSuggestionToBosProposalEnvelope,
    workflowAssistSuggestionToBosProposalEnvelope,
} from "@/lib/bos/adapters";
