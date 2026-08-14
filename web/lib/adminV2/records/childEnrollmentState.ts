/**
 * What state is this child's record in — from BOTH sources of enrollment truth.
 *
 * ── WHY THIS EXISTS ──
 *
 * Records derived a child's state solely from `process_instances`. That was honest only while a
 * governed journey was the only way a child could become enrolled. Direct Enroll breaks that
 * assumption: it materialises the durable care relationship (agreement → placement → schedule)
 * and creates NO process instance, so a genuinely enrolled child would have rendered as "On
 * record" — the surface would have been confidently wrong about a child who is in care.
 *
 * ── THE PRECEDENCE, AND WHY IT RUNS THIS WAY ROUND ──
 *
 *   1. a durable care relationship          → the child IS in care (or about to be)
 *   2. a process instance that reached enrolled
 *   3. a process instance still running     → in process
 *   4. anything terminal                    → closed
 *   5. nothing                              → on record (null)
 *
 * Durable truth wins because it describes the child's actual relationship with the centre, while a
 * process describes work someone is doing ABOUT that relationship. A child can be in care with no
 * process running, and a process can be running about a child who is not yet in care; only this
 * order is true in both directions.
 *
 * ── ONE DERIVATION, TWO CALLERS ──
 *
 * The cohort query (who qualifies) and the row projection (what the row says) both call this. They
 * were separately capable of disagreeing about the same child — a tab that lists a child as
 * Enrolled beside a row that says On record is worse than either answer alone.
 *
 * This adds NO lifecycle column. Every input is read from an existing canonical owner:
 * `child_enrollment_agreements.status` and `process_instances.state`.
 */

import {
    isAgreementOperationalStatus,
    type ChildEnrollmentAgreementStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";

/**
 * The record's enrollment state.
 *
 * `null` is "on record" — a complete, ordinary answer, not a gap. A child belongs to Records
 * because the household record exists, not because anything is running.
 */
export type ChildRecordState = "enrolled" | "starting" | "in_process" | "closed" | null;

/** `process_instances.state` values meaning the journey produced enrollment. */
export const PROCESS_ENROLLED_STATES = ["completed", "enrolled"] as const;
/** …and the ones meaning it ended without enrolling. Anything else running is in process. */
export const PROCESS_CLOSED_STATES = ["closed", "cancelled", "withdrawn"] as const;

function norm(v: string | null | undefined): string {
    return (v ?? "").trim().toLowerCase();
}

export function isProcessEnrolledState(state: string | null | undefined): boolean {
    return (PROCESS_ENROLLED_STATES as readonly string[]).includes(norm(state));
}

export function isProcessClosedState(state: string | null | undefined): boolean {
    return (PROCESS_CLOSED_STATES as readonly string[]).includes(norm(state));
}

/**
 * A process instance that is neither enrolled nor closed is RUNNING.
 *
 * An unknown state counts as running on purpose: a journey the platform has no word for is still
 * participation, and calling it "no process" would hide the child from the cohort that describes
 * them. An empty state is not a journey position at all and is excluded.
 */
export function isProcessRunningState(state: string | null | undefined): boolean {
    const s = norm(state);
    if (!s) return false;
    return !isProcessEnrolledState(s) && !isProcessClosedState(s);
}

export type ChildEnrollmentStateInput = {
    /** `child_enrollment_agreements.status` for this child, any site. */
    agreementStatuses?: readonly (string | null | undefined)[];
    /** `process_instances.state` for this child, any context. */
    processStates?: readonly (string | null | undefined)[];
};

/**
 * The record state for one child.
 *
 * Deliberately takes plain status lists rather than rows: the caller owns retrieval and access
 * scoping, and this owns only the meaning.
 */
export function deriveChildRecordState(input: ChildEnrollmentStateInput): ChildRecordState {
    const agreements = (input.agreementStatuses ?? []).map(norm).filter(Boolean);
    const processes = (input.processStates ?? []).map(norm);

    // 1. A durable care relationship. `ending` is still OPERATIONAL — an agreement with a known end
    //    date is a child who is in care today, not one who has left.
    const operational = agreements.filter((s) => isAgreementOperationalStatus(s));
    if (operational.length > 0) {
        // `pending_start` is a real commitment that has not begun. Calling it "enrolled" would
        // overstate it and put the child in today's rosters.
        const started = operational.some((s) => s !== "pending_start");
        return started ? "enrolled" : "starting";
    }

    // 2–3. No durable relationship: the journey is the only thing that can speak.
    if (processes.some((s) => isProcessEnrolledState(s))) return "enrolled";
    if (processes.some((s) => isProcessRunningState(s))) return "in_process";

    // 4. Everything that exists about this child has ended.
    if (agreements.length > 0 || processes.some((s) => isProcessClosedState(s))) return "closed";

    // 5. On record.
    return null;
}

/** States that mean the child has, or is about to have, a real relationship with the centre. */
export const ENROLLED_COHORT_STATES: readonly ChildRecordState[] = ["enrolled", "starting"];

export function isEnrolledCohortState(state: ChildRecordState): boolean {
    return ENROLLED_COHORT_STATES.includes(state);
}

/** Operator-facing label. `starting` is named distinctly so a commitment is not read as attendance. */
export const CHILD_RECORD_STATE_LABEL: Record<Exclude<ChildRecordState, null>, string> = {
    enrolled: "Enrolled",
    starting: "Starting",
    in_process: "In process",
    closed: "Closed",
};

export type { ChildEnrollmentAgreementStatus };
