/**
 * Enrollment Process Definition — the first configured process on the Process Engine.
 * Bundles: contract instance + projection (its own joins) + semantics (Active/New/Waitlisted).
 * A new process (Billing/Staffing/Compliance) is a sibling folder with the same three parts and
 * ZERO engine edits.
 */

export {
    ENROLLMENT_PARTICIPATION_CONTRACT,
    DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG,
    type EnrollmentAttributes,
} from "./enrollmentContract";
export {
    resolveEnrollmentParticipationConfig,
    resolveEnrollmentParticipationContract,
} from "./resolveEnrollmentParticipation";
export {
    enrollmentProjection,
    buildEnrollmentParticipants,
} from "./enrollmentProjection";
export {
    type EnrollmentParticipant,
    ENROLLMENT_LEAD_STAGE_KEY,
    ENROLLMENT_WAITLIST_STAGE_KEY,
    enrollmentEffectiveStage,
    isLiveEnrollmentParticipant,
    isActiveLeadParticipant,
    isNewLeadParticipant,
    isWaitlistedParticipant,
    countActiveLeadParticipants,
    countNewLeadParticipants,
    countWaitlistedParticipants,
} from "./enrollmentSemantics";
