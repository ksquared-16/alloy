/**
 * Relationship ANCHOR resolution — where a relationship is written is authority, not a hint.
 *
 * The failures this guards against are silent and serious: granting an authorized pickup over a
 * sibling, or attaching an emergency contact to a child in another family. Two rules are absolute —
 * never infer a single child from a household, and never expand a missing anchor to every child.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, it, expect } from "vitest";

import {
    resolveRelationshipAnchor,
    type AnchorCandidate,
} from "@/lib/pos/processingCase/commit/resolveRelationshipAnchor";
import {
    relationshipDefinitionForRole,
    type RelationshipDefinition,
} from "@/lib/fields/relationship/relationshipDefinitions";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const HOUSEHOLD = "cust-1";
const OTHER_HOUSEHOLD = "cust-2";

const CHILD_A = "member-a";
const SIBLING_B = "member-b";
const OTHER_HOUSEHOLD_CHILD = "member-x";
const OTHER_ORG_CHILD = "member-z";

const HOUSEHOLD_CHILDREN: AnchorCandidate[] = [
    { customer_member_id: CHILD_A, customer_id: HOUSEHOLD, org_id: ORG },
    { customer_member_id: SIBLING_B, customer_id: HOUSEHOLD, org_id: ORG },
    // visible to the loader in these fixtures, but must be refused
    { customer_member_id: OTHER_HOUSEHOLD_CHILD, customer_id: OTHER_HOUSEHOLD, org_id: ORG },
    { customer_member_id: OTHER_ORG_CHILD, customer_id: HOUSEHOLD, org_id: OTHER_ORG },
];

const pickup = relationshipDefinitionForRole("authorized_pickup")!;

function resolve(overrides: {
    definition?: RelationshipDefinition;
    scope: string;
    customerMemberId?: string | null;
    selectedCustomerMemberIds?: string[] | null;
}) {
    return resolveRelationshipAnchor({
        definition: overrides.definition ?? pickup,
        orgId: ORG,
        householdChildren: HOUSEHOLD_CHILDREN,
        request: {
            customerId: HOUSEHOLD,
            scope: overrides.scope,
            customerMemberId: overrides.customerMemberId,
            selectedCustomerMemberIds: overrides.selectedCustomerMemberIds,
        },
    });
}

describe("relationship anchor resolution", () => {
    it("1. a valid child anchor is accepted and scoped to that child alone", () => {
        const res = resolve({ scope: "this_child", customerMemberId: CHILD_A });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.memberIds).toEqual([CHILD_A]);
        expect(res.anchorCustomerMemberId).toBe(CHILD_A);
        expect(res.householdWide).toBe(false);
    });

    it("2. a child-scoped relationship WITHOUT a child anchor is rejected — never inferred", () => {
        for (const missing of [undefined, null, "", "   "]) {
            const res = resolve({ scope: "this_child", customerMemberId: missing });
            expect(res.ok).toBe(false);
            if (!res.ok) expect(res.code).toBe("missing_child_anchor");
        }
    });

    it("2b. a single-child household still does not auto-resolve the anchor", () => {
        const res = resolveRelationshipAnchor({
            definition: pickup,
            orgId: ORG,
            householdChildren: [{ customer_member_id: CHILD_A, customer_id: HOUSEHOLD, org_id: ORG }],
            request: { customerId: HOUSEHOLD, scope: "this_child" },
        });
        expect(res.ok, "an only child must not be silently chosen as the anchor").toBe(false);
        if (!res.ok) expect(res.code).toBe("missing_child_anchor");
    });

    it("3. a child from another household is rejected", () => {
        const res = resolve({ scope: "this_child", customerMemberId: OTHER_HOUSEHOLD_CHILD });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("anchor_wrong_household");
            expect(res.status).toBe(403);
        }
    });

    it("4. a child from another organization is rejected", () => {
        const res = resolve({ scope: "this_child", customerMemberId: OTHER_ORG_CHILD });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("anchor_wrong_organization");
    });

    it("4b. an unknown member id is rejected rather than ignored", () => {
        const res = resolve({ scope: "this_child", customerMemberId: "member-does-not-exist" });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("anchor_not_found");
    });

    it("5. SIBLING ISOLATION — a child-specific commit never touches the sibling", () => {
        const res = resolve({ scope: "this_child", customerMemberId: CHILD_A });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.memberIds).not.toContain(SIBLING_B);
        expect(res.memberIds).toHaveLength(1);
    });

    it("6. selected-child scope affects only the selected children", () => {
        const res = resolve({ scope: "selected_children", selectedCustomerMemberIds: [SIBLING_B] });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.memberIds).toEqual([SIBLING_B]);
        expect(res.memberIds).not.toContain(CHILD_A);
    });

    it("6b. an empty selection is rejected, not treated as all children", () => {
        for (const empty of [[], null, undefined]) {
            const res = resolve({ scope: "selected_children", selectedCustomerMemberIds: empty });
            expect(res.ok).toBe(false);
            if (!res.ok) expect(res.code).toBe("empty_selection");
        }
    });

    it("6c. a selection containing a foreign child is rejected wholesale", () => {
        const res = resolve({ scope: "selected_children", selectedCustomerMemberIds: [CHILD_A, OTHER_HOUSEHOLD_CHILD] });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("anchor_wrong_household");
    });

    it("7. all-children scope expands only to this household, in this org", () => {
        const res = resolve({ scope: "all_children_in_household" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.memberIds.sort()).toEqual([CHILD_A, SIBLING_B].sort());
        expect(res.memberIds).not.toContain(OTHER_HOUSEHOLD_CHILD);
        expect(res.memberIds).not.toContain(OTHER_ORG_CHILD);
        expect(res.householdWide).toBe(true);
    });

    it("7b. expansion is a CHOICE — it is never how a missing child anchor is handled", () => {
        // Same request as the rejected case 2, but with the household scope explicitly selected.
        const rejected = resolve({ scope: "this_child" });
        const expanded = resolve({ scope: "all_children_in_household" });
        expect(rejected.ok).toBe(false);
        expect(expanded.ok).toBe(true);
    });

    it("8. a scope the definition does not permit is rejected", () => {
        const res = resolve({ scope: "this_opportunity", customerMemberId: CHILD_A });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("scope_not_supported");
    });

    it("9. scope behaviour is definition-driven — every shipped role obeys the same rules", () => {
        for (const role of ["guardian", "emergency_contact", "authorized_pickup"]) {
            const def = relationshipDefinitionForRole(role)!;
            // child-scoped without an anchor → rejected, for all of them
            const missing = resolveRelationshipAnchor({
                definition: def,
                orgId: ORG,
                householdChildren: HOUSEHOLD_CHILDREN,
                request: { customerId: HOUSEHOLD, scope: "this_child" },
            });
            expect(missing.ok, `${role} inferred a child anchor`).toBe(false);

            // with an anchor → exactly that child
            const ok = resolveRelationshipAnchor({
                definition: def,
                orgId: ORG,
                householdChildren: HOUSEHOLD_CHILDREN,
                request: { customerId: HOUSEHOLD, scope: "this_child", customerMemberId: CHILD_A },
            });
            expect(ok.ok, `${role} rejected a valid anchor`).toBe(true);
            if (ok.ok) expect(ok.memberIds).toEqual([CHILD_A]);
        }
    });

    it("11. changing the anchor produces a distinct, correctly scoped assignment", () => {
        const a = resolve({ scope: "this_child", customerMemberId: CHILD_A });
        const b = resolve({ scope: "this_child", customerMemberId: SIBLING_B });
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(a.memberIds).toEqual([CHILD_A]);
        expect(b.memberIds).toEqual([SIBLING_B]);
        expect(a.memberIds).not.toEqual(b.memberIds);
    });

    it("10. resolution is deterministic — the same anchor resolves identically every time", () => {
        const first = resolve({ scope: "this_child", customerMemberId: CHILD_A });
        const second = resolve({ scope: "this_child", customerMemberId: CHILD_A });
        expect(first).toEqual(second);
    });
});
