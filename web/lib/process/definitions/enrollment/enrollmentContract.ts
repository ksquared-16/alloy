/**
 * Enrollment Definition — the participation contract instance.
 * Subject = child (customer_members), context = opportunity/household; a child inherits the family
 * (opportunity) stage until its own journey forks. This is Enrollment expressed as ONE contract —
 * the engine treats it as data.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_CONTEXT_TYPE, ENROLLMENT_SUBJECT_TYPE } from "@/lib/process/processInstances";
import type { ProcessParticipationContract } from "@/lib/process/engine";
import {
    participationContractFromConfig,
    type ParticipationConfigV1,
} from "@/lib/process/participationConfig";

/**
 * The Enrollment DEFAULT participation config — the seed the Process Builder shows before an operator
 * publishes their own, and the fallback the engine uses when none is published. Enrollment is now the
 * first CONFIGURED Business Process; this is a default, not a hardcode. Change it in the Process
 * Builder and the engine reads the change (see resolveEnrollmentParticipationContract).
 */
export const DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG: ParticipationConfigV1 = {
    version: 1,
    subject_type: ENROLLMENT_SUBJECT_TYPE, //   "child"
    context_type: ENROLLMENT_CONTEXT_TYPE, //   "opportunity"
    inherits_context_stage: true, //            a child rides the family track until it forks
    participant_creation: "one_per_child_member",
    available_views: ["family", "child", "candidate"],
};

/** The default contract — DERIVED from the default config (not hand-written), so config is the source. */
export const ENROLLMENT_PARTICIPATION_CONTRACT: ProcessParticipationContract = participationContractFromConfig(
    ENROLLMENT_PROCESS_KEY,
    DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG,
);

/** Per-process attributes the Enrollment projection attaches; the engine passes these through. */
export type EnrollmentAttributes = {
    /** opportunities.status_key (collapsed open/closed) — used by the "live" gate. */
    contextStatusKey: string | null;
    /** customer_members.is_active !== false. */
    subjectActive: boolean;
    /** Waitlist rank when the participant is a placement candidate (null otherwise). */
    waitlistRank: number | null;
    /** opportunities.location_id — family/case site authority. */
    contextLocationId: string | null;
    /**
     * Child site authority from opportunity_customer_members.location_id when present.
     * Null falls back to `contextLocationId` for location-scoped participant metrics.
     */
    subjectLocationId: string | null;
};
