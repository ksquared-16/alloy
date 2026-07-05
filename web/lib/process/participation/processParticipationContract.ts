/**
 * Process Participation Contract — the per-Business-Process configuration that declares WHAT a
 * participant is, WHERE its stage lives, and HOW it may be grained.
 *
 * Nothing about participants is hardcoded to Enrollment or to `opportunities`. Enrollment is ONE
 * contract (subject = child, context = opportunity/household); a future process declares its own
 * subject/context/creation-rule/stage-ownership/grain options. The generic participant model
 * (`processParticipant.ts`) and every consumer read this contract instead of assuming enrollment.
 *
 * A Business Process configuration MUST define exactly these five things:
 *   1. subject type            — what a participant IS (process_instances.subject_type)
 *   2. context type            — what a participant runs WITHIN (process_instances.context_type)
 *   3. participant creation rule — how participants come into being for this process
 *   4. stage ownership         — the authoritative stage field + the context stage it inherits
 *   5. work-view grain options — the grains a Work View may project this process's participants into
 */

/**
 * Grains a Work View may project participants into. This module is the SOURCE of the allowed grain
 * vocabulary per process; the queue/work-view layer consumes it (it must not invent its own).
 * Aligns with the existing queue grain vocabulary (family/child/candidate).
 */
export type ParticipantGrain = "family" | "child" | "candidate";

/** How participants are created for a process. Declarative — Create Lead (and future intakes) honor it. */
export type ParticipantCreationRule =
    /** One participant per child member (customer_members) on the context. Enrollment. */
    | "one_participant_per_child_member"
    /** One participant per context (the context row itself is the subject). */
    | "one_participant_per_context";

/**
 * Where a process's participant stage lives. The authoritative per-participant stage is always
 * `process_instances.stage_key`. `contextStageFallback` names the context column a participant
 * INHERITS until its own journey forks (the coalesce) — or `null` when a process has no such
 * inheritance and the participant stage stands alone.
 */
export type ProcessStageOwnership = {
    participantStage: "process_instances.stage_key";
    contextStageFallback: "opportunities.stage_key" | null;
};

/** The full participation contract for one Business Process. */
export type ProcessParticipationContract = {
    /** process_instances.process_key this contract governs (e.g. "enrollment"). */
    processKey: string;
    /** process_instances.subject_type for this process (Enrollment: "child"). */
    subjectType: string;
    /** process_instances.context_type for this process (Enrollment: "opportunity"). */
    contextType: string;
    /** How a participant is created for this process. */
    participantCreation: ParticipantCreationRule;
    /** Authoritative stage field + the context stage it coalesces onto. */
    stageOwnership: ProcessStageOwnership;
    /** The grains a Work View may project this process's participants into. */
    grainOptions: readonly ParticipantGrain[];
};

/** True when a contract permits a given work-view grain (config, not hardcode). */
export function contractAllowsGrain(
    contract: ProcessParticipationContract,
    grain: ParticipantGrain,
): boolean {
    return contract.grainOptions.includes(grain);
}
