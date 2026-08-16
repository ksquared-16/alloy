/**
 * D-100 — which known facts require one participant confirmation per Enrollment session.
 *
 * ## The decision
 *
 * A known participant fact contributing to the active Enrollment objective requires ONE confirmation
 * for that session, unless D-99 already records a confirmation of that exact value. The parent is
 * asked "We have DOB as May 4, 2021. Is that correct?" once — not silently assumed to be current,
 * and not asked again for any of the fifteen Forms that contain it.
 *
 * ## Why this is a key list and not a rule engine
 *
 * No repository-wide assurance framework exists, and Slice 2.4 deliberately left confirmation policy
 * to the caller rather than inventing one. This module is that caller's answer for Enrollment V1:
 * the ordinary identity and contact facts a parent can meaningfully verify at a glance.
 *
 * It is a NARROW, explicit, enumerated list — not a heuristic over field names, and not a
 * confidence model. Widening it is a visible edit to this file.
 *
 * ## What is excluded, structurally rather than by list
 *
 * Signatures, consents, acknowledgments and every recipient-scoped or artifact-specific control can
 * never reach this policy: Slice 2.4 gives them `artifact_specific` state and a null shared key, so
 * they have no canonical key to match and no confirm turn to reach. That exclusion is enforced by
 * the identity layer, which is why it cannot be undone by editing a list here.
 *
 * Pure. No I/O.
 */

/**
 * Canonical keys (`entity_type:field_key`) whose known values require confirmation.
 *
 * Child identity and household contact facts — the things an operator may hold from an inquiry
 * months ago and which a parent is the only reliable authority on today. Duplicated entity spellings
 * are intentional: `fieldScope.ts` treats several as child/household entities, and a tenant's forms
 * may bind either.
 */
export const ENROLLMENT_CONFIRMATION_REQUIRED_KEYS: ReadonlySet<string> = new Set([
    // Child identity
    "customer_member:first_name",
    "customer_member:last_name",
    "customer_member:dob",
    "child:first_name",
    "child:last_name",
    "child:dob",
    // Household / primary contact
    "person:first_name",
    "person:last_name",
    "person:email",
    "person:phone",
    "customer:address_line1",
    "customer:city",
    "customer:postal_code",
    "household:address_line1",
    "household:city",
    "household:postal_code",
]);

/**
 * The policy set for one Enrollment objective.
 *
 * A function rather than a bare constant so a later slice can vary it by tenant or business process
 * without every caller changing shape. V1 returns the platform default.
 */
export function enrollmentConfirmationPolicy(): ReadonlySet<string> {
    return ENROLLMENT_CONFIRMATION_REQUIRED_KEYS;
}
