/**
 * Safeguarding V1 — the canonical answer to "what is currently forbidden".
 *
 * Relationship truth answers *who is this person to the child*. Safeguarding truth answers *what
 * restriction is active*. They are different questions and they are both true at once: a person can
 * hold an `authorized_pickup` relationship AND be subject to an active "may not pick up"
 * restriction. Encoding the restriction as a negative relationship — `prohibited_pickup` — collapses
 * that into one field, and then revoking a restriction becomes indistinguishable from deleting a
 * family tie.
 *
 * Scope is what the real enrollment packet proves. This is not case management, not an incident log,
 * and not a child-welfare ontology.
 *
 * Pure + deterministic. No I/O.
 */

/** The kinds the real packet proves. Adding one is a Director decision, not a convenience. */
export const SAFEGUARDING_RESTRICTION_KINDS = [
    "custody_restriction",
    "protective_or_restraining_order",
    "pickup_or_contact_restriction",
] as const;
export type SafeguardingRestrictionKind = (typeof SAFEGUARDING_RESTRICTION_KINDS)[number];

/**
 * What the restriction DOES, kept separate from what it IS.
 *
 * A restraining order and a custody arrangement can carry the same operational effect, and the same
 * kind can carry different effects in two families. Deriving the effect from the kind would make
 * Alloy guess at the terms of a court order.
 */
export const SAFEGUARDING_OPERATIONAL_EFFECTS = [
    "may_not_pick_up",
    "contact_restricted",
    "informational_only",
] as const;
export type SafeguardingOperationalEffect = (typeof SAFEGUARDING_OPERATIONAL_EFFECTS)[number];

export const SAFEGUARDING_STATUSES = ["proposed", "active", "expired", "superseded", "revoked"] as const;
export type SafeguardingStatus = (typeof SAFEGUARDING_STATUSES)[number];

export const SAFEGUARDING_REVIEW_STATES = ["pending_review", "approved", "rejected"] as const;
export type SafeguardingReviewState = (typeof SAFEGUARDING_REVIEW_STATES)[number];

/**
 * How we know. REQUIRED, so that "a restriction with no court order attached" stays distinguishable
 * from "a restriction backed by a court order" — and both stay distinguishable from no restriction
 * at all. A parent's word is evidence; it is simply a different kind of evidence, and flattening the
 * difference would let a missing document read as a missing restriction.
 */
export const SAFEGUARDING_EVIDENCE_BASES = ["document", "parent_declaration", "operator_entry"] as const;
export type SafeguardingEvidenceBasis = (typeof SAFEGUARDING_EVIDENCE_BASES)[number];

export const SAFEGUARDING_SOURCES = ["enrollment_form", "processing_case", "operator"] as const;
export type SafeguardingSource = (typeof SAFEGUARDING_SOURCES)[number];

export interface SafeguardingRestriction {
    id: string;
    /** The child. A restriction protects a child, so the child is the grain even when it is about an adult. */
    customer_member_id: string;
    /** Nullable: "there is a custody arrangement" is a real restriction with no single named person. */
    affected_person_id: string | null;
    /** When the family named someone Alloy has no person record for yet. */
    affected_party_description: string | null;
    restriction_kind: SafeguardingRestrictionKind;
    operational_effect: SafeguardingOperationalEffect;
    status: SafeguardingStatus;
    effective_from: string | null;
    effective_to: string | null;
    evidence_basis: SafeguardingEvidenceBasis;
    /** Documents owns the artifact. This references it and never copies its content. */
    evidence_document_id: string | null;
    source: SafeguardingSource;
    review_state: SafeguardingReviewState;
    supersedes_id: string | null;
}

/**
 * The capability keys that gate this data.
 *
 * DECLARED here, and deliberately NOT seeded into `permission_definitions`: another program has
 * frozen that catalog at a measured width, and its own tests say a worker may not append to it —
 * adding these two rows is a Director-owned step in Access & Identity. `.view` also has no
 * enforcement site yet, and registering a key nothing checks is the matrix row with nothing behind
 * it that `IA-R6` forbids.
 *
 * Until then the boundary is carried by three things that are real today: the RLS policies (narrower
 * than the comparable relationship table — `manager` is not on the read list), the propose-only
 * command's type, and the database CHECK that forbids activating an unreviewed row. Naming a key the
 * catalog cannot yet satisfy fails CLOSED, which is the safe direction for a safety control.
 */
export const SAFEGUARDING_PERMISSIONS = {
    view: "crm.customers.safeguarding.view",
    manage: "crm.customers.safeguarding.manage",
} as const;

/**
 * Is this restriction in force on a given date?
 *
 * Approval is part of being in force, not a separate check a caller might forget: a `proposed`
 * restriction is an assertion someone made, and acting on an unreviewed assertion is its own harm.
 */
export function isInForce(r: Pick<SafeguardingRestriction, "status" | "review_state" | "effective_from" | "effective_to">, onDate: string): boolean {
    if (r.status !== "active") return false;
    if (r.review_state !== "approved") return false;
    if (r.effective_from && onDate < r.effective_from) return false;
    if (r.effective_to && onDate > r.effective_to) return false;
    return true;
}
