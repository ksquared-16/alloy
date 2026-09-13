/**
 * "Why can — or can't — this person collect this child?"
 *
 * The kiosk asks this one adult at a time, standing at a tablet. An administrator
 * needs the same question answered the other way round: for ONE child, every
 * adult, and the reason for each.
 *
 * ── THIS DERIVES; IT DOES NOT DECIDE ──
 *
 * The answer comes from `resolvePickupAuthorization`, the canonical seam, called
 * with the SAME inputs the kiosk constructs — including the detail that a missing
 * `authorized_pickup` role is passed as `null` rather than `false`, because "the
 * family never listed them" is not "the family said no". If this module built its
 * own rule, Settings and the front desk would eventually disagree about a
 * safeguarding decision, which is the one place disagreement is unacceptable.
 *
 * ── THE THREE LAYERS STAY SEPARATE ──
 *
 *   relationship authority   who the family listed, and in what capacity
 *   safeguarding             whether the question was ever asked, and what is in force
 *   the resulting decision   what follows from both, today
 *
 * They are reported as three fields, not folded into one boolean. An
 * administrator who sees only "not authorized" cannot tell an unasked screening
 * from a court order, and those need opposite actions.
 *
 * ── UNSCREENED IS NOT CLEAR ──
 *
 * `safeguardingScreened` false yields `unknown`, never `authorized`. A child
 * nobody has screened is not a child with no restrictions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolvePickupAuthorization,
    type PickupAuthorizationState,
} from "@/lib/safeguarding/resolvePickupAuthorization";
import type { SafeguardingRestriction } from "@/lib/safeguarding/safeguardingRestriction";

/** The role that actually confers collection authority. */
export const PICKUP_ROLE = "authorized_pickup";

export type ChildPickupPerson = {
    personId: string;
    displayName: string;
    /** Every active capacity the family recorded for this adult, for THIS child. */
    roleKeys: string[];
    /** Whether the family listed them as someone who may collect this child. */
    listedForPickup: boolean;
    state: PickupAuthorizationState;
    /** Operator-readable, from the canonical resolver. Never a raw enum. */
    reasons: string[];
    blockingRestrictionIds: string[];
};

export type ChildPickupAdministration = {
    childCustomerMemberId: string;
    /** Whether safeguarding was ever ASKED for this child. */
    safeguardingScreened: boolean;
    onDate: string;
    people: ChildPickupPerson[];
};

type RelationshipRow = { id: string; person_id: string; customer_member_id: string };
type RoleRow = { relationship_id: string; role_key: string };
type PersonRow = { id: string; first_name: string | null; last_name: string | null };

function personName(row: PersonRow | undefined): string {
    if (!row) return "Unknown person";
    const name = [row.first_name, row.last_name]
        .map((p) => String(p ?? "").trim())
        .filter(Boolean)
        .join(" ");
    return name || "Unnamed person";
}

/**
 * @param onDate - pickup is a question about TODAY, so the caller supplies the
 *   day being asked about rather than this module reading a clock. A restriction
 *   that expires tomorrow must not silently change yesterday's explanation.
 */
export async function loadChildPickupAuthority(
    supabase: SupabaseClient,
    orgId: string,
    childCustomerMemberId: string,
    onDate: string,
): Promise<ChildPickupAdministration> {
    const empty: ChildPickupAdministration = {
        childCustomerMemberId,
        safeguardingScreened: false,
        onDate,
        people: [],
    };
    if (!childCustomerMemberId) return empty;

    const { data: relData } = await supabase
        .from("person_child_relationships")
        .select("id, person_id, customer_member_id")
        .eq("org_id", orgId)
        .eq("customer_member_id", childCustomerMemberId)
        // `status`, not `is_active`. The relationship table and the ROLE table
        // spell "active" differently, and using the role table's column here
        // would make this screen disagree with the kiosk about who is related.
        .eq("status", "active");
    const relationships = (relData ?? []) as RelationshipRow[];

    // Restrictions are read UNFILTERED, exactly as the kiosk reads them: the
    // resolver must see proposed, expired and revoked rows to tell "nothing
    // recorded" from "something recorded that is not in force".
    const { data: restrictionData } = await supabase
        .from("child_safeguarding_restrictions")
        .select(
            "id, customer_member_id, affected_person_id, affected_party_description, restriction_kind," +
                " operational_effect, status, effective_from, effective_to, evidence_basis," +
                " evidence_document_id, source, review_state, supersedes_id",
        )
        .eq("org_id", orgId)
        .eq("customer_member_id", childCustomerMemberId);
    const restrictions = (restrictionData ?? []) as unknown as SafeguardingRestriction[];

    const { data: screenData } = await supabase
        .from("child_safeguarding_screenings")
        .select("customer_member_id")
        .eq("org_id", orgId)
        .eq("customer_member_id", childCustomerMemberId);
    const safeguardingScreened = ((screenData ?? []) as { customer_member_id: string }[]).length > 0;

    if (relationships.length === 0) {
        return { ...empty, safeguardingScreened };
    }

    const { data: roleData } = await supabase
        .from("person_child_relationship_roles")
        .select("relationship_id, role_key")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .in(
            "relationship_id",
            relationships.map((r) => r.id),
        );
    const rolesByRelationship = new Map<string, string[]>();
    for (const row of (roleData ?? []) as RoleRow[]) {
        const list = rolesByRelationship.get(row.relationship_id) ?? [];
        list.push(row.role_key);
        rolesByRelationship.set(row.relationship_id, list);
    }

    const { data: personData } = await supabase
        .from("persons")
        .select("id, first_name, last_name")
        .eq("org_id", orgId)
        .in(
            "id",
            relationships.map((r) => r.person_id),
        );
    const personById = new Map(((personData ?? []) as PersonRow[]).map((p) => [p.id, p]));

    const people = relationships.map((rel) => {
        const roleKeys = rolesByRelationship.get(rel.id) ?? [];
        const listedForPickup = roleKeys.includes(PICKUP_ROLE);
        const pickup = resolvePickupAuthorization({
            // `true` or `null`, never `false` — matching the kiosk exactly. A
            // missing role is an absent claim, not a recorded refusal.
            relationshipAuthorizedPickup: listedForPickup ? true : null,
            restrictions,
            personId: rel.person_id,
            onDate,
            safeguardingScreened,
        });
        return {
            personId: rel.person_id,
            displayName: personName(personById.get(rel.person_id)),
            roleKeys,
            listedForPickup,
            state: pickup.state,
            reasons: pickup.reasons,
            blockingRestrictionIds: pickup.blockingRestrictionIds,
        };
    });

    // Authorized first, then the ones needing attention, then names — an
    // administrator is usually checking "who CAN collect today".
    const order: Record<PickupAuthorizationState, number> = { authorized: 0, unknown: 1, restricted: 2 };
    people.sort(
        (a, b) => order[a.state] - order[b.state] || a.displayName.localeCompare(b.displayName),
    );

    return { childCustomerMemberId, safeguardingScreened, onDate, people };
}

/** Operator phrasing for a relationship capacity. Role keys must not reach the screen. */
export function relationshipRoleLabel(roleKey: string): string {
    switch (roleKey) {
        case "parent":
            return "Parent";
        case "guardian":
            return "Guardian";
        case "authorized_pickup":
            return "Authorized to collect";
        case "emergency_contact":
            return "Emergency contact";
        default:
            return roleKey;
    }
}

/** One short operator-facing line for a pickup state. */
export function pickupStateLabel(state: PickupAuthorizationState): string {
    switch (state) {
        case "authorized":
            return "Can collect";
        case "restricted":
            return "Cannot collect";
        case "unknown":
            return "Needs a person to check";
    }
}
