/**
 * The Enrollment participation contract — Enrollment expressed as ONE ProcessParticipationContract,
 * not a hardcoded assumption. Subject = child (customer_members), context = opportunity/household.
 * Future processes provide their own contract; the participant model treats this as data.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_CONTEXT_TYPE, ENROLLMENT_SUBJECT_TYPE } from "@/lib/process/processInstances";
import type { ProcessParticipationContract } from "./processParticipationContract";

export const ENROLLMENT_PARTICIPATION_CONTRACT = {
    processKey: ENROLLMENT_PROCESS_KEY, //   "enrollment"
    subjectType: ENROLLMENT_SUBJECT_TYPE, // "child"     — the participant IS a child
    contextType: ENROLLMENT_CONTEXT_TYPE, // "opportunity" — the household/lead is context
    participantCreation: "one_participant_per_child_member",
    stageOwnership: {
        participantStage: "process_instances.stage_key",
        // A child rides the family track (opportunity.stage_key) until a decision forks its journey.
        contextStageFallback: "opportunities.stage_key",
    },
    grainOptions: ["family", "child", "candidate"],
} as const satisfies ProcessParticipationContract;
