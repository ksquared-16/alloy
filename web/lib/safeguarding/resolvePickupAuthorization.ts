/**
 * The canonical resolution seam: relationship authority × active safeguarding restrictions.
 *
 * This exists because the two facts live in different places and a caller that reads only one of
 * them reaches a confident wrong answer. `authorized_pickup = true` on a relationship means "the
 * family listed this person as someone who may collect the child". It does not mean "no court order
 * says otherwise". Anything that asks "may this person collect this child" must ask HERE.
 *
 * Three outcomes, not two. `unknown` is the one that matters: a system that has never asked about
 * safeguarding must not return the same answer as one that asked and found nothing. Collapsing
 * those is how an unasked question becomes an implied "no restrictions".
 *
 * Pure + deterministic. No I/O.
 */

import { isInForce, type SafeguardingRestriction } from "./safeguardingRestriction";

export type PickupAuthorizationState = "authorized" | "restricted" | "unknown";

export interface PickupAuthorizationInput {
    /** The relationship's `authorized_pickup` config value, or null when no relationship exists. */
    relationshipAuthorizedPickup: boolean | null;
    /**
     * Every safeguarding restriction recorded for this child — including proposed, expired and
     * revoked ones. Filtering before you get here hides the difference between "nothing recorded"
     * and "something recorded that is not in force", and the caller cannot tell which it was given.
     */
    restrictions: readonly SafeguardingRestriction[];
    /** The person being asked about. */
    personId: string;
    /** ISO date the question is asked for. Pickup is a question about TODAY, not about a record. */
    onDate: string;
    /**
     * Has safeguarding been established for this child at all — i.e. was the question asked and
     * answered? Absent screening is not the same as a clear result.
     */
    safeguardingScreened: boolean;
}

export interface PickupAuthorizationResult {
    state: PickupAuthorizationState;
    /** True only when the answer is affirmatively `authorized`. Never true for `unknown`. */
    authorized: boolean;
    /** Operator-readable reasons, in the order they were decided. */
    reasons: string[];
    /** Restrictions that were in force and applied to this person. */
    blockingRestrictionIds: string[];
}

/**
 * Restrictions apply to a named person, and also to the child generally.
 *
 * A child-general restriction with no named party ("there is a custody arrangement") cannot
 * establish that a specific person is barred, so it never blocks by itself — but it does mean the
 * situation is not clear, which is what `unknown` is for.
 */
function appliesToPerson(r: SafeguardingRestriction, personId: string): boolean {
    return r.affected_person_id === personId;
}

export function resolvePickupAuthorization(input: PickupAuthorizationInput): PickupAuthorizationResult {
    const reasons: string[] = [];
    const inForce = input.restrictions.filter((r) => isInForce(r, input.onDate));

    // A restriction that bars this person wins over every relationship fact, and it wins FIRST —
    // evaluating the relationship first and then looking for exceptions is how the exception gets
    // skipped on the path where the relationship already said yes.
    const blocking = inForce.filter((r) => appliesToPerson(r, input.personId) && r.operational_effect === "may_not_pick_up");
    if (blocking.length > 0) {
        reasons.push("An active safeguarding restriction bars this person from collecting this child.");
        if (input.relationshipAuthorizedPickup) {
            // Stated explicitly because it is the situation this seam exists for. Both facts are
            // true; the restriction constrains the action.
            reasons.push("The family also lists this person as an authorized pickup — the restriction still applies.");
        }
        return { state: "restricted", authorized: false, reasons, blockingRestrictionIds: blocking.map((r) => r.id) };
    }

    // A contact restriction on this person is not a pickup bar, but it is not nothing either. The
    // honest answer is that this needs a human, not that pickup is fine.
    const contactRestricted = inForce.filter((r) => appliesToPerson(r, input.personId) && r.operational_effect === "contact_restricted");
    if (contactRestricted.length > 0) {
        reasons.push("An active contact restriction applies to this person; whether it covers collection must be confirmed.");
        return { state: "unknown", authorized: false, reasons, blockingRestrictionIds: contactRestricted.map((r) => r.id) };
    }

    if (!input.safeguardingScreened) {
        reasons.push("Safeguarding has not been established for this child, so no clear answer exists.");
        return { state: "unknown", authorized: false, reasons, blockingRestrictionIds: [] };
    }

    // A child-general restriction in force, with no named party, means the picture is incomplete.
    const general = inForce.filter((r) => r.affected_person_id === null && r.operational_effect !== "informational_only");
    if (general.length > 0) {
        reasons.push("A safeguarding restriction is active on this child without a named party; who it covers must be confirmed.");
        return { state: "unknown", authorized: false, reasons, blockingRestrictionIds: general.map((r) => r.id) };
    }

    if (input.relationshipAuthorizedPickup !== true) {
        reasons.push("This person is not listed as an authorized pickup.");
        return { state: "unknown", authorized: false, reasons, blockingRestrictionIds: [] };
    }

    reasons.push("Listed as an authorized pickup, with no safeguarding restriction in force.");
    return { state: "authorized", authorized: true, reasons, blockingRestrictionIds: [] };
}
