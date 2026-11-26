/**
 * Which enrollment actions are honest to offer for a child in a given state.
 *
 * Offering the wrong one is not a cosmetic problem. "Start enrollment" on a child already mid
 * journey invites a second one; "Enroll directly" on a child already in care invites a duplicate
 * agreement. Both would be refused downstream, but only after the operator believed they were
 * doing something reasonable — and a surface that offers actions it will then refuse teaches
 * operators to distrust it.
 *
 * The state comes from the same derivation Records lists by, so what a row SAYS and what it OFFERS
 * cannot disagree. @see childEnrollmentState.ts
 */

import type { ChildRecordState } from "@/lib/adminV2/records/childEnrollmentState";

export type ChildNextAction = "start_enrollment" | "enroll_directly";

export type ChildNextActionOffer = {
    actions: ChildNextAction[];
    /** Why nothing is offered, when nothing is. Shown rather than leaving a silent gap. */
    reason: string | null;
};

export function childNextActions(state: ChildRecordState): ChildNextActionOffer {
    switch (state) {
        // On record: the child exists and nothing has been decided. Both paths are open, and this
        // is the only state where they are.
        case null:
            return { actions: ["start_enrollment", "enroll_directly"], reason: null };

        // A journey is already running. Starting a second is the thing the partial unique index
        // exists to prevent; direct enrollment alongside a live journey would strand that journey.
        case "in_process":
            return { actions: [], reason: "Enrollment is already in process for this child." };

        // Already in care, or about to be. Neither path applies to a child who has arrived.
        case "enrolled":
        case "starting":
            return { actions: [], reason: "This child already has an enrollment on record." };

        // Everything ended. Re-enrollment is legitimate — the partial index deliberately permits a
        // new episode — so both paths reopen.
        case "closed":
            return { actions: ["start_enrollment", "enroll_directly"], reason: null };

        default:
            return { actions: [], reason: null };
    }
}

export function offersAction(state: ChildRecordState, action: ChildNextAction): boolean {
    return childNextActions(state).actions.includes(action);
}
