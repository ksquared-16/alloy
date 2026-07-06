/**
 * Enrollment Definition — process semantics. Active Lead / New Lead / Waitlisted are ENROLLMENT
 * concepts, composed from generic engine primitives over the Enrollment contract + attributes.
 * Billing/Staffing/Compliance define their own semantics in their own folders; the engine has none.
 *
 * Ratified definitions:
 *   Active Lead = live participant, state ∉ {enrolled, withdrawn, not_enrolling} (stage-agnostic).
 *   New Lead    = live, undispositioned (state null), effective stage 'lead'.
 *   Waitlisted  = live, waitlist stage OR waitlisted state.
 * New Lead / Waitlisted are mutually exclusive via the state gate.
 */

import type { EnrollmentProcessState } from "@/lib/process/processInstances";
import {
    effectiveStage,
    isOpenInstance,
    participantInScope,
    participantMatchesProcess,
    participantStateIn,
    type ProcessParticipant,
} from "@/lib/process/engine";
import {
    ENROLLMENT_PARTICIPATION_CONTRACT,
    type EnrollmentAttributes,
} from "./enrollmentContract";

export type EnrollmentParticipant = ProcessParticipant<EnrollmentAttributes>;

export const ENROLLMENT_LEAD_STAGE_KEY = "lead" as const;
export const ENROLLMENT_WAITLIST_STAGE_KEY = "waitlist" as const;

/** States that END active-lead participation (durable enrollment outcomes). */
const TERMINAL_ENROLLMENT_STATES: ReadonlySet<string> = new Set<EnrollmentProcessState>([
    "enrolled",
    "withdrawn",
    "not_enrolling",
]);

/** Context (household) statuses that mean the lead is no longer live. */
const CLOSED_CONTEXT_STATUS_KEYS: ReadonlySet<string> = new Set(["closed", "lost", "archived", "inactive"]);

/** The participant's effective enrollment stage (contract coalesce via the engine primitive). */
export function enrollmentEffectiveStage(p: EnrollmentParticipant): string | null {
    return effectiveStage(p, ENROLLMENT_PARTICIPATION_CONTRACT);
}

/**
 * A LIVE enrollment participant: enrollment process, instance open, subject active, context not
 * closed. The shared gate under Active / New / Waitlisted — composed from engine primitives + the
 * Enrollment attributes bag.
 */
export function isLiveEnrollmentParticipant(p: EnrollmentParticipant): boolean {
    if (!participantMatchesProcess(p, ENROLLMENT_PARTICIPATION_CONTRACT)) return false;
    if (!isOpenInstance(p)) return false;
    if (p.attributes.subjectActive === false) return false;
    const ctx = (p.attributes.contextStatusKey ?? "").trim().toLowerCase();
    if (ctx && CLOSED_CONTEXT_STATUS_KEYS.has(ctx)) return false;
    return true;
}

/** Active Lead — live, durable state NOT terminal. Stage-agnostic ("Active Lead ≠ Lead stage"). */
export function isActiveLeadParticipant(p: EnrollmentParticipant): boolean {
    return isLiveEnrollmentParticipant(p) && !participantStateIn(p, TERMINAL_ENROLLMENT_STATES);
}

/** New Lead — live, undispositioned (state null), effective stage 'lead'. */
export function isNewLeadParticipant(p: EnrollmentParticipant): boolean {
    return (
        isLiveEnrollmentParticipant(p) &&
        p.state === null &&
        enrollmentEffectiveStage(p) === ENROLLMENT_LEAD_STAGE_KEY
    );
}

/** Waitlisted — live, waitlist stage or waitlisted state. */
export function isWaitlistedParticipant(p: EnrollmentParticipant): boolean {
    if (!isLiveEnrollmentParticipant(p)) return false;
    return (
        (p.state ?? "").trim().toLowerCase() === "waitlisted" ||
        enrollmentEffectiveStage(p) === ENROLLMENT_WAITLIST_STAGE_KEY
    );
}

// ── Pure count helpers (Phase 2 metrics will reuse the SAME predicates) ─────────────────────────
export type EnrollmentCountScope = { orgId: string; scopeId?: string | null };

function countBy(
    participants: readonly EnrollmentParticipant[],
    predicate: (p: EnrollmentParticipant) => boolean,
    scope?: EnrollmentCountScope,
): number {
    let n = 0;
    for (const p of participants) {
        if ((scope ? participantInScope(p, scope) : true) && predicate(p)) n += 1;
    }
    return n;
}

export const countActiveLeadParticipants = (ps: readonly EnrollmentParticipant[], scope?: EnrollmentCountScope) =>
    countBy(ps, isActiveLeadParticipant, scope);
export const countNewLeadParticipants = (ps: readonly EnrollmentParticipant[], scope?: EnrollmentCountScope) =>
    countBy(ps, isNewLeadParticipant, scope);
export const countWaitlistedParticipants = (ps: readonly EnrollmentParticipant[], scope?: EnrollmentCountScope) =>
    countBy(ps, isWaitlistedParticipant, scope);

/** Active Lead at opportunity/case grain — distinct live contexts with ≥1 active-lead participant. */
function countDistinctContextsBy(
    participants: readonly EnrollmentParticipant[],
    predicate: (p: EnrollmentParticipant) => boolean,
    scope?: EnrollmentCountScope,
): number {
    const seen = new Set<string>();
    for (const p of participants) {
        if (scope && !participantInScope(p, scope)) continue;
        if (!predicate(p)) continue;
        const contextId = p.contextId?.trim();
        if (!contextId) continue;
        seen.add(contextId);
    }
    return seen.size;
}

export const countActiveLeadFamilies = (ps: readonly EnrollmentParticipant[], scope?: EnrollmentCountScope) =>
    countDistinctContextsBy(ps, isActiveLeadParticipant, scope);
