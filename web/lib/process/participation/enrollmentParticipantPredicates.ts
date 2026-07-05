/**
 * Enrollment lifecycle predicates over ProcessParticipants — the ratified canonical definitions.
 * These are the ONE source of "Active Lead / New Lead / Waitlisted"; metrics (Phase 2), Work Views
 * (Phase 3), and the Focus Panel (Phase 4/5) will all consume these instead of ad-hoc status/
 * work_unit predicates. Pure. Enrollment-specific semantics layered on the generic participant
 * model via the Enrollment contract — the model itself stays process-neutral.
 *
 * Definitions (ratified):
 *   Active Lead  = an active Enrollment participant NOT enrolled/withdrawn/closed/archived/inactive
 *                  (a participant in Lead, Tour, Waitlist, Enrolling, Future Start … is still active).
 *   New Lead     = an Enrollment participant whose EFFECTIVE stage is 'lead'.
 *   Waitlisted   = an Enrollment participant in the Waitlist stage / waitlisted state.
 *
 * effective_stage = process_instances.stage_key ?? opportunities.stage_key   (contract-governed)
 */

import type { EnrollmentProcessState } from "@/lib/process/processInstances";
import { ENROLLMENT_PARTICIPATION_CONTRACT } from "./enrollmentParticipationContract";
import {
    effectiveStage,
    isOpenInstance,
    participantInScope,
    participantMatchesProcess,
    type ProcessParticipant,
} from "./processParticipant";

/** Canonical enrollment operator stage keys used by the predicates (from LIFECYCLE_STAGE_ORDER). */
export const ENROLLMENT_LEAD_STAGE_KEY = "lead" as const;
export const ENROLLMENT_WAITLIST_STAGE_KEY = "waitlist" as const;

/** States that END active-lead participation (durable enrollment outcomes). */
const TERMINAL_ENROLLMENT_STATES: ReadonlySet<EnrollmentProcessState> = new Set([
    "enrolled",
    "withdrawn",
    "not_enrolling",
]);

/** Context (household) statuses that mean the lead is no longer live. */
const CLOSED_CONTEXT_STATUS_KEYS: ReadonlySet<string> = new Set([
    "closed",
    "lost",
    "archived",
    "inactive",
]);

/** The participant's effective enrollment stage (contract coalesce). */
export function enrollmentEffectiveStage(participant: ProcessParticipant): string | null {
    return effectiveStage(participant, ENROLLMENT_PARTICIPATION_CONTRACT);
}

/**
 * A LIVE enrollment participant: an enrollment-process participant whose instance is open, whose
 * subject (child) is active, and whose context (household) is not closed/archived/inactive. The
 * shared gate under New Lead / Waitlisted / Active Lead.
 */
export function isLiveEnrollmentParticipant(participant: ProcessParticipant): boolean {
    if (!participantMatchesProcess(participant, ENROLLMENT_PARTICIPATION_CONTRACT)) return false;
    if (!isOpenInstance(participant)) return false;
    if (participant.subjectActive === false) return false;
    const ctx = (participant.contextStatusKey ?? "").trim().toLowerCase();
    if (ctx && CLOSED_CONTEXT_STATUS_KEYS.has(ctx)) return false;
    return true;
}

/**
 * Active Lead — a live enrollment participant whose durable state is NOT a terminal outcome. Note
 * this is deliberately stage-agnostic: Lead, Tour, Waitlist, Enrolling all count while state is
 * non-terminal. "Active Lead ≠ Lead stage."
 */
export function isActiveLeadParticipant(participant: ProcessParticipant): boolean {
    if (!isLiveEnrollmentParticipant(participant)) return false;
    const state = (participant.state ?? "").trim().toLowerCase();
    if (state && TERMINAL_ENROLLMENT_STATES.has(state as EnrollmentProcessState)) return false;
    return true;
}

/**
 * New Lead — a live enrollment participant currently in the Lead stage AND not yet dispositioned to
 * a durable outcome (state === null). The state gate keeps New Lead and Waitlisted mutually
 * exclusive: a participant that has been waitlisted (state='waitlisted') is not a "new" lead even if
 * a lagging stage_key still coalesces to 'lead' via the family track.
 */
export function isNewLeadParticipant(participant: ProcessParticipant): boolean {
    return (
        isLiveEnrollmentParticipant(participant) &&
        participant.state === null &&
        enrollmentEffectiveStage(participant) === ENROLLMENT_LEAD_STAGE_KEY
    );
}

/** Waitlisted — a live enrollment participant in the Waitlist stage or the waitlisted state. */
export function isWaitlistedParticipant(participant: ProcessParticipant): boolean {
    if (!isLiveEnrollmentParticipant(participant)) return false;
    const state = (participant.state ?? "").trim().toLowerCase();
    return (
        state === "waitlisted" ||
        enrollmentEffectiveStage(participant) === ENROLLMENT_WAITLIST_STAGE_KEY
    );
}

// ── Pure count helpers (parity proof; Phase 2 metrics consume the SAME predicates) ──────────────

export type ParticipantCountScope = { orgId: string; workUnitId?: string | null };

function inScope(p: ProcessParticipant, scope?: ParticipantCountScope): boolean {
    return scope ? participantInScope(p, scope) : true;
}

/**
 * Count participants matching a predicate, within optional org/work-unit scope. The metric layer
 * (Phase 2: enrollment.active_leads / new_leads / waitlisted) will count with these SAME predicates
 * so a metric value can never diverge from the queue membership it summarizes.
 */
export function countParticipants(
    participants: readonly ProcessParticipant[],
    predicate: (p: ProcessParticipant) => boolean,
    scope?: ParticipantCountScope,
): number {
    let n = 0;
    for (const p of participants) {
        if (inScope(p, scope) && predicate(p)) n += 1;
    }
    return n;
}

export const countActiveLeadParticipants = (
    participants: readonly ProcessParticipant[],
    scope?: ParticipantCountScope,
): number => countParticipants(participants, isActiveLeadParticipant, scope);

export const countNewLeadParticipants = (
    participants: readonly ProcessParticipant[],
    scope?: ParticipantCountScope,
): number => countParticipants(participants, isNewLeadParticipant, scope);

export const countWaitlistedParticipants = (
    participants: readonly ProcessParticipant[],
    scope?: ParticipantCountScope,
): number => countParticipants(participants, isWaitlistedParticipant, scope);
