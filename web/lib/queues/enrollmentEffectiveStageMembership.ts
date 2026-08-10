/**
 * Effective-stage queue membership — thin adapter over engine `effectiveStage` so queues cannot
 * diverge from metrics/Focus Panel. A child's lane is decided by EFFECTIVE stage, never by
 * status_key or OCM:
 *
 *   effective_stage = process_instances.stage_key ?? opportunity.stage_key
 *   (when the process contract inherits context stage — Enrollment default)
 *
 * So a freshly-created child (PI.stage_key = null) riding the family track appears in the lane of
 * its household's stage (e.g. Lead), and a branched child (PI.stage_key = waitlist) appears in the
 * Waitlist lane — with no reliance on the OCM disposition. Pure; unit-tested.
 */

import { effectiveStage, type ProcessParticipant } from "@/lib/process/engine/processParticipant";
import type { ProcessParticipationContract } from "@/lib/process/engine/processParticipationContract";

/** Minimal inherit-context contract for queue coalesce (matches Enrollment default). */
const QUEUE_INHERIT_CONTEXT_CONTRACT: ProcessParticipationContract = {
    processKey: "*",
    subjectType: "*",
    contextType: "*",
    inheritsContextStage: true,
};

export function piEffectiveStageKey(
    piStageKey: string | null | undefined,
    contextStageKey: string | null | undefined,
): string | null {
    const participant = {
        participantId: "",
        orgId: "",
        processKey: "",
        subjectType: "",
        subjectId: "",
        contextId: null,
        participantStageKey:
            typeof piStageKey === "string" && piStageKey.trim() ? piStageKey.trim() : null,
        contextStageKey:
            typeof contextStageKey === "string" && contextStageKey.trim()
                ? contextStageKey.trim()
                : null,
        state: null,
        closeReasonKey: null,
        scopeId: null,
        stageEnteredAt: null,
        attributes: {},
    } satisfies ProcessParticipant;
    return effectiveStage(participant, QUEUE_INHERIT_CONTEXT_CONTRACT);
}

/** True when a process instance belongs to a lane by effective stage (PI stage ?? context stage). */
export function processInstanceBelongsToLane(args: {
    piStageKey: string | null | undefined;
    contextStageKey: string | null | undefined;
    laneStageKey: string;
}): boolean {
    const lane = args.laneStageKey.trim();
    if (!lane) return false;
    return piEffectiveStageKey(args.piStageKey, args.contextStageKey) === lane;
}
