/**
 * DURABLE HOUSEHOLD SUBJECT — the shape.
 *
 * ── THE HOUSEHOLD IS `customers`, AND ITS PEOPLE ARE TWO EDGES ──
 *
 *     customers          the household itself (and the ONLY one of the three with a `name` column)
 *     customer_persons   the ADULT edge — guardians, contacts, their roles and `is_primary`
 *     customer_members   the CHILD edge — the child rows, whose `person_id` is nullable
 *
 * That is the canonical family model, and it is complete without a case. Nothing here reads
 * `_inquiry_children`, `opportunity_persons` or any other case-shaped projection: those describe a
 * household as some enrollment saw it, which is a different and narrower question than "who is this
 * family".
 *
 * ── WHY A DURABLE HOUSEHOLD IS NOT A SECOND FAMILY MODEL ──
 *
 * The Household card already renders from a plain record through `buildHouseholdCardModel`, and its
 * contact rows already come from `buildOpportunityFamilyContactRows`, which reads `customer_id` +
 * `_customer_persons` as a fully self-sufficient source — its own comment anticipates "a household
 * guardian arriving via `_customer_persons` while shell `_opportunity_persons` is frozen". So the
 * durable composition supplies exactly those keys and REUSES the configured card. No card is copied,
 * no second family vocabulary is introduced, and a tenant that reconfigures the Household card
 * reconfigures it on both surfaces at once.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──
 *
 * Stage, queue position, enrollment health and anything else a case knows. A household exists whether
 * or not anyone is currently working it; borrowing a case's process state would put one enrollment's
 * situation onto the identity of a family that may have several, or none.
 */

import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";

/** One adult on the household — the `customer_persons` edge, as the card reads it. */
export type DurableHouseholdContact = {
    person_id: string;
    role_type: string | null;
    is_primary: boolean;
    name: string | null;
    phone: string | null;
    email: string | null;
};

/** One child on the household — the `customer_members` edge. `person_id` is nullable by schema. */
export type DurableHouseholdChild = {
    member_id: string;
    person_id: string | null;
    display_name: string | null;
    dob: string | null;
    is_active: boolean;
};

/** The composed durable Household subject. */
export type DurableHouseholdSubject = {
    /** `customers.id` — the identity of record. */
    householdId: string;
    /** Operator-facing name. `customers` DOES carry `name`; "Household" is a last resort. */
    label: string;
    /** Adults, primary contact first. */
    contacts: readonly DurableHouseholdContact[];
    /** Children of this household, active first. */
    children: readonly DurableHouseholdChild[];
    /** The composed record — the panel's `context.truth`. */
    truth: Record<string, unknown>;
};

/**
 * The panel grain for a durable household.
 *
 * `case` — not a new `OperationalGrain` value. The Focus Panel's grain vocabulary already means "the
 * family" by `case`, and the Household card is a case-grain card today; a household opened on its own
 * is the same grain reached without a case, not a different one. What distinguishes it is the SUBJECT
 * TYPE (`household`), which is the axis the card registry gates on.
 */
export const DURABLE_HOUSEHOLD_GRAIN: OperationalGrain = "case";
