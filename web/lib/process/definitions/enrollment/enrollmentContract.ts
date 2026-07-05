/**
 * Enrollment Definition — the participation contract instance.
 * Subject = child (customer_members), context = opportunity/household; a child inherits the family
 * (opportunity) stage until its own journey forks. This is Enrollment expressed as ONE contract —
 * the engine treats it as data.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_CONTEXT_TYPE, ENROLLMENT_SUBJECT_TYPE } from "@/lib/process/processInstances";
import type { ProcessParticipationContract } from "@/lib/process/engine";

export const ENROLLMENT_PARTICIPATION_CONTRACT: ProcessParticipationContract = {
    processKey: ENROLLMENT_PROCESS_KEY, //   "enrollment"
    subjectType: ENROLLMENT_SUBJECT_TYPE, // "child"
    contextType: ENROLLMENT_CONTEXT_TYPE, // "opportunity"
    inheritsContextStage: true, //           a child rides the family track until it forks
};

/** Per-process attributes the Enrollment projection attaches; the engine passes these through. */
export type EnrollmentAttributes = {
    /** opportunities.status_key (collapsed open/closed) — used by the "live" gate. */
    contextStatusKey: string | null;
    /** customer_members.is_active !== false. */
    subjectActive: boolean;
    /** Waitlist rank when the participant is a placement candidate (null otherwise). */
    waitlistRank: number | null;
};
