/**
 * The one authority that creates a household child member row.
 *
 * ── WHY THIS EXISTS ──
 *
 * `customer_members` is the canonical Child record, and before this module FIVE
 * places inserted one independently:
 *
 *   1. `POST /api/admin/customer-members`        (the drawer's Add Child / Add Sibling)
 *   2. `executeRelationshipAction`               (relationship runtime, household scope)
 *   3. `applyCreateLeadChildParticipationFromIdentity`  (Create Lead)
 *   4. `applyIntakeChildToOpportunity`           (public form intake)
 *   5. Processing Identity `ports.createChild`   (frozen commit authority)
 *
 * Each had its own idea of the row's shape and its own answer to "what if this
 * child is already a member here" — one caught the unique violation and
 * re-queried, one threw, one never asked. Records adding a sixth would have made
 * the count the problem rather than the fragmentation.
 *
 * 1–3 are the OPERATOR-facing paths, and they now all go through here. 4 and 5
 * are separate bounded contexts (public intake apply; the frozen Processing
 * commit) and are deliberately not rerouted by this slice — see
 * `docs/product/records-roster-completion/phase-2-identity-safe-add-child.md`.
 *
 * ── WHAT THIS OWNS, AND WHAT IT DOES NOT ──
 *
 * OWNS: the row's shape, `relationship: "child"`, active-membership de-duplication,
 * and the insert itself.
 *
 * DOES NOT OWN: **who this child is**. Identity resolution is a placement concern
 * and the placements genuinely differ — Records gates on operator choice, Create
 * Lead resolves from intake facts, the drawer resolves from the inquiry. This
 * module takes an already-decided identity and refuses to guess one, which is
 * why it accepts `personId: null` as an ordinary answer rather than a gap.
 *
 * `tests/records/childMemberWriteAuthority.test.ts` fails if a sixth insert site
 * appears.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ChildMemberRow = {
    id: string;
    customer_id: string | null;
    person_id: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    is_active: boolean | null;
};

export const CHILD_MEMBER_COLUMNS =
    "id, customer_id, person_id, display_name, first_name, last_name, dob, is_active";

export type CreateChildMemberInput = {
    orgId: string;
    customerId: string;
    /** Null is canonical: `customer_members.person_id` is nullable and stays that way. */
    personId: string | null;
    firstName: string | null;
    lastName: string | null;
    dob: string | null;
    displayName: string;
    isActive?: boolean;
    /** Provenance. Rides `metadata.source`; callers that stamp `external_source` pass it too. */
    source: string;
    externalSource?: string | null;
    /** Extra provenance merged into metadata (never overrides `source`). */
    metadata?: Record<string, unknown> | null;
};

export type CreateChildMemberResult = {
    member: ChildMemberRow;
    /** False when an existing active membership was reused instead of a row being written. */
    created: boolean;
};

export function childMemberDisplayName(row: ChildMemberRow): string {
    return (
        (row.display_name ?? "").trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Child"
    );
}

/** The active child membership for this person in this household, if one exists. */
export async function findActiveChildMemberForPerson(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    personId: string
): Promise<ChildMemberRow | null> {
    const { data, error } = await supabase
        .from("customer_members")
        .select(CHILD_MEMBER_COLUMNS)
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("person_id", personId)
        .eq("relationship", "child")
        .eq("is_active", true)
        .limit(1);
    if (error) throw new Error(error.message);
    return ((data ?? []) as ChildMemberRow[])[0] ?? null;
}

/**
 * Create the household child member — or return the one that already exists.
 *
 * A person who is already an active child of this household is NOT written
 * again. That check ran in only one of the previous call sites, and only as a
 * unique-violation rescue after the fact; here it is the rule.
 */
export async function createHouseholdChildMember(
    supabase: SupabaseClient,
    input: CreateChildMemberInput
): Promise<CreateChildMemberResult> {
    const orgId = (input.orgId ?? "").trim();
    const customerId = (input.customerId ?? "").trim();
    if (!orgId) throw new Error("createHouseholdChildMember: orgId is required");
    if (!customerId) throw new Error("createHouseholdChildMember: customerId is required");

    const personId = (input.personId ?? "").trim() || null;
    if (personId) {
        const existing = await findActiveChildMemberForPerson(supabase, orgId, customerId, personId);
        if (existing) return { member: existing, created: false };
    }

    const { data, error } = await supabase
        .from("customer_members")
        .insert({
            org_id: orgId,
            customer_id: customerId,
            person_id: personId,
            display_name: input.displayName,
            first_name: input.firstName,
            last_name: input.lastName,
            dob: input.dob,
            relationship: "child",
            is_active: input.isActive !== false,
            ...(input.externalSource ? { external_source: input.externalSource } : {}),
            metadata: { ...(input.metadata ?? {}), source: input.source },
        })
        .select(CHILD_MEMBER_COLUMNS)
        .single();

    // A concurrent writer can still win the race the pre-check was guarding.
    // Re-reading is the honest recovery; inserting a second membership is not.
    if (error?.code === "23505" && personId) {
        const raced = await findActiveChildMemberForPerson(supabase, orgId, customerId, personId);
        if (raced) return { member: raced, created: false };
    }
    if (error || !data) {
        throw new Error(error?.message ?? "Could not create the child record");
    }
    return { member: data as ChildMemberRow, created: true };
}
