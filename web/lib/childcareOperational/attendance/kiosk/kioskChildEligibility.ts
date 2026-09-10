/**
 * May this adult, at this kiosk, check this child IN or OUT?
 *
 * Pure and deterministic. Every fact it needs is handed in; it opens nothing.
 *
 * ── PER CHILD, ALWAYS ──
 *
 * The relationship graph is child-scoped: `person_child_relationships` links one
 * person to one child, and `person_child_relationship_roles` says in what
 * capacity. So a parent of two children may hold `authorized_pickup` on one and
 * nothing on the other, and that is a normal family, not a data error. Every
 * decision below is taken for ONE child from ONE child's rows. There is no path
 * by which authority over a sibling reaches this function.
 *
 * ── CHECK-IN AND CHECKOUT ARE DIFFERENT QUESTIONS ──
 *
 * Dropping a child off puts them into care. Collecting one takes them out of it.
 * Only the second releases a child to somebody, so only the second carries the
 * safeguarding prerequisite. Forcing them to share a rule for symmetry would
 * either block ordinary morning drop-off or quietly weaken collection; both are
 * worse than two honest rules.
 *
 * CHECK-IN accepts an active `parent`, `guardian` or `authorized_pickup`
 * relationship, and refuses anyone we can positively see is subject to an
 * in-force restriction. It does NOT require safeguarding screening: a child
 * arriving into care is not a release, and demanding screening here would turn an
 * unasked administrative question into a locked front door.
 *
 * CHECKOUT requires all of: the adult resolves to a canonical person; safeguarding
 * has positively been screened for this child; and `resolvePickupAuthorization`
 * answers `authorized`. Anything else — restricted, unknown, unscreened,
 * unresolvable — denies. That is the Director's ruling, and it is also what the
 * resolver already does on its own: unscreened yields `unknown`, and `unknown` is
 * not authorized.
 *
 * ── WHY CHECKOUT NEEDS THE `authorized_pickup` ROLE SPECIFICALLY ──
 *
 * The org role vocabulary names `authorized_pickup` — "Adult authorized to pick up
 * the child" — as its own role, alongside `parent` and `guardian`. Reading
 * `parent` as implying collection authority would be Alloy inventing an
 * authorization the family never granted, which is exactly what a pickup decision
 * must not do. The consequence is deliberate and was anticipated: the kiosk may
 * legitimately support a NARROWER checkout population than check-in until families
 * carry that role. A parent without it is not refused — they are directed to
 * staff, who can see the whole picture.
 *
 * ── WHAT A SHARED SCREEN MAY SAY ──
 *
 * Two reasons come out of every decision. `publicReason` is what may appear on a
 * tablet in a lobby: never a safeguarding detail, never whether a restriction
 * exists, never who it names. `internalReason` is for the audit trail. A denial
 * that explained itself would broadcast the most sensitive fact the platform
 * holds to whoever is standing in the queue.
 */

import {
    resolvePickupAuthorization,
    type PickupAuthorizationState,
} from "@/lib/safeguarding/resolvePickupAuthorization";
import { isInForce, type SafeguardingRestriction } from "@/lib/safeguarding/safeguardingRestriction";

/** Roles that may bring a child in. */
export const KIOSK_CHECK_IN_ROLES: readonly string[] = ["parent", "guardian", "authorized_pickup"];
/** The single role that may take a child out. */
export const KIOSK_CHECK_OUT_ROLE = "authorized_pickup";

export type KioskOperation = "check_in" | "check_out";

/** One child, and everything known about this adult's standing towards them. */
export type KioskChildFacts = {
    childId: string;
    /** Active role keys on an ACTIVE relationship between this adult and this child. */
    activeRoleKeys: readonly string[];
    /** Every restriction recorded for this child — unfiltered, including not-in-force ones. */
    restrictions: readonly SafeguardingRestriction[];
    /** Has the safeguarding question been asked for this child at all? */
    safeguardingScreened: boolean;
};

export type KioskEligibility = {
    childId: string;
    operation: KioskOperation;
    allowed: boolean;
    /** Safe for a shared screen. Never names a restriction or a person. */
    publicReason: string;
    /** For the audit trail, never for the tablet. */
    internalReason: string;
    /** Present only for checkout, where the pickup resolver was consulted. */
    pickupState?: PickupAuthorizationState;
};

/** The one thing a denied adult is ever told, whatever the underlying reason. */
const SEE_STAFF = "Please see a member of staff.";

function hasRole(facts: KioskChildFacts, role: string): boolean {
    return facts.activeRoleKeys.includes(role);
}

/**
 * A restriction we can positively see barring this person from this child today.
 * Used by check-in as defence in depth; checkout goes through the full resolver.
 */
function visiblyRestricted(
    facts: KioskChildFacts,
    personId: string | null,
    onDate: string,
): boolean {
    if (!personId) return false;
    return facts.restrictions.some(
        (r) =>
            isInForce(r, onDate) &&
            r.affected_person_id === personId &&
            (r.operational_effect === "may_not_pick_up" || r.operational_effect === "contact_restricted"),
    );
}

export function resolveKioskChildEligibility(input: {
    operation: KioskOperation;
    /**
     * The adult's canonical person id, or null when they could not be resolved to
     * one. Null is a real state, not an error: it decides checkout on its own.
     */
    personId: string | null;
    facts: KioskChildFacts;
    /** The service date the question is asked for. Pickup is about TODAY. */
    onDate: string;
}): KioskEligibility {
    const { operation, personId, facts, onDate } = input;
    const base = { childId: facts.childId, operation };

    if (operation === "check_in") {
        const role = KIOSK_CHECK_IN_ROLES.find((r) => hasRole(facts, r));
        if (!role) {
            return {
                ...base,
                allowed: false,
                publicReason: SEE_STAFF,
                internalReason: "no active parent, guardian or authorized-pickup relationship to this child",
            };
        }
        if (visiblyRestricted(facts, personId, onDate)) {
            // Drop-off does not release a child, but a person we can SEE is
            // restricted should still meet a member of staff rather than a tablet.
            return {
                ...base,
                allowed: false,
                publicReason: SEE_STAFF,
                internalReason: "an in-force restriction names this person for this child",
            };
        }
        return {
            ...base,
            allowed: true,
            publicReason: "",
            internalReason: `active ${role} relationship`,
        };
    }

    // ── CHECKOUT ──
    if (!personId) {
        // Without a canonical person there is nothing to evaluate restrictions
        // against, and "we could not check" must never read as "nothing found".
        return {
            ...base,
            allowed: false,
            publicReason: SEE_STAFF,
            internalReason: "the adult could not be resolved to a canonical person identity",
        };
    }

    const pickup = resolvePickupAuthorization({
        relationshipAuthorizedPickup: hasRole(facts, KIOSK_CHECK_OUT_ROLE) ? true : null,
        restrictions: facts.restrictions,
        personId,
        onDate,
        safeguardingScreened: facts.safeguardingScreened,
    });

    return {
        ...base,
        allowed: pickup.state === "authorized",
        publicReason: pickup.state === "authorized" ? "" : SEE_STAFF,
        // The resolver's own reasons are safe HERE because this string never
        // reaches the tablet — it is the audit's copy.
        internalReason: pickup.reasons.join(" "),
        pickupState: pickup.state,
    };
}

/** Evaluate a whole sibling set, one child at a time. */
export function resolveKioskEligibility(input: {
    operation: KioskOperation;
    personId: string | null;
    children: readonly KioskChildFacts[];
    onDate: string;
}): KioskEligibility[] {
    return input.children.map((facts) =>
        resolveKioskChildEligibility({
            operation: input.operation,
            personId: input.personId,
            facts,
            onDate: input.onDate,
        }),
    );
}
