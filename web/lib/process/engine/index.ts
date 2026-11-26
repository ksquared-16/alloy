/**
 * Process Engine — process-agnostic core. Subject · context · stage · state + generic primitives.
 * No grain, no table names, no process constants. Definitions and Presentation build on this.
 */

export type { ProcessParticipationContract } from "./processParticipationContract";
export {
    type ProcessParticipant,
    type ProcessInstanceBase,
    buildProcessParticipant,
    effectiveStage,
    isOpenInstance,
    participantMatchesProcess,
    participantInScope,
    participantStateIn,
    participantHasEffectiveStage,
    countParticipants,
} from "./processParticipant";
export {
    type EffectiveParticipantPosition,
    type EffectiveProcessPosition,
    type StageRollup,
    type LocationRollup,
    composeStageRollup,
    composeLocationRollup,
    contextBelongsToEffectiveStage,
    deriveEffectiveProcessPosition,
    effectiveProcessPositionBelongsToStage,
} from "./effectiveProcessPosition";
export {
    type ProcessParticipantProjection,
    type ProcessParticipantScope,
} from "./processParticipantProjection";
