export type {
    BosCommandAdapter,
    BosCommandConfirmation,
    BosCommandConversationMessage,
    BosCommandDraft,
    BosCommandExecutionKind,
    BosCommandExecutionResult,
    BosCommandInputValue,
    BosCommandInvocation,
    BosCommandMode,
    BosCommandPlacement,
    BosCommandPreview,
    BosCommandRecoveryState,
    BosCommandResolutionState,
    BosCommandSession,
    BosCommandSessionPhase,
    BosInputEvidence,
    BosInputValueState,
    BosOperationalBriefingMessage,
    BosSlashCommandDescriptor,
} from "@/lib/bos/commandSession/types";

export {
    createBosCommandSession,
    emptyBosCommandDraft,
    emptyBosCommandResolution,
    nextBosMessageId,
    nextBosSourceTextId,
    type CreateBosCommandSessionInput,
} from "@/lib/bos/commandSession/createSession";

export { fingerprintBosCommandDraft } from "@/lib/bos/commandSession/fingerprint";

export {
    bosCommandSessionAllowsEdits,
    reduceBosCommandSession,
    type BosCommandSessionAction,
} from "@/lib/bos/commandSession/reduceSession";

export {
    BOS_COMMAND_SESSION_MAX_JSON_CHARS,
    BOS_COMMAND_SESSION_STORAGE_KEY,
    BOS_COMMAND_SOURCE_TEXT_MAX_CHARS,
    clearPersistedBosCommandSession,
    isBosCommandSessionPersistable,
    loadPersistedBosCommandSession,
    persistBosCommandSession,
    sanitizeBosCommandSessionForPersistence,
    syncPersistedBosCommandSession,
} from "@/lib/bos/commandSession/commandSessionPersistence";

export {
    applyIfBosRequestSeqCurrent,
    isBosRequestSeqCurrent,
    type BosRequestSeqGate,
} from "@/lib/bos/commandSession/staleGuards";

export {
    bosDraftToEligiblePayload,
    bosDraftToFormValues,
    bosDraftValueMap,
    bosInputStateCountsTowardEligibility,
    clearBosDraftField,
    upsertBosDraftValue,
} from "@/lib/bos/commandSession/draftValues";

export {
    applyCreateLeadParseToDraft,
    buildCreateLeadBosPreview,
    createLeadBosCommandAdapter,
    executeCreateLeadFromBosDraft,
    revalidateCreateLeadDraft,
    type CreateLeadAdapterContext,
} from "@/lib/bos/commandSession/adapters/createLeadAdapter";

export {
    applyFormValuesToDraft,
    applyOperatorFieldEdit,
    applyParseResult,
    confirmBosDraftField,
    formValuesFromDraft,
    removeInferredBosDraftField,
} from "@/lib/bos/commandSession/draftEdits";

export { isBosCreateLeadSessionEnabled } from "@/lib/bos/commandSession/bosCreateLeadSessionFlag";

export {
    CONVERSATION_INTAKE_SUPPORTED_VALUE_KINDS,
    buildEffectiveCreateLeadIntakeSpec,
    createLeadConversationIntakeAdapter,
    eligiblePayloadFromConversationDraft,
    labelForEffectiveField,
    type ConversationClarification,
    type ConversationIntakeAdapter,
    type ConversationUnderstandingSummary,
    type EffectiveCreateLeadIntakeSpec,
} from "@/lib/bos/commandSession/conversationIntake";
