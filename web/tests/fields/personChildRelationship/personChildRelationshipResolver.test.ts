import { describe, expect, it } from "vitest";
import { resolvePersonChildRelationshipsForCustomerMember } from "@/lib/fields/personChildRelationship/personChildRelationshipResolver";

describe("resolvePersonChildRelationshipsForCustomerMember", () => {
    it("returns one row per relationship instance", () => {
        const result = resolvePersonChildRelationshipsForCustomerMember({
            orgId: "org",
            customerId: "cust",
            customerMemberId: "child-a",
            relationships: [
                {
                    id: "r1",
                    org_id: "org",
                    customer_id: "cust",
                    customer_member_id: "child-a",
                    person_id: "p1",
                    relationship_type: "mother",
                    priority: 1,
                    status: "active",
                },
                {
                    id: "r2",
                    org_id: "org",
                    customer_id: "cust",
                    customer_member_id: "child-a",
                    person_id: "p2",
                    relationship_type: "grandparent",
                    priority: 2,
                    status: "active",
                },
            ],
            roleAssignments: [
                { id: "a1", org_id: "org", relationship_id: "r1", role_key: "parent", is_active: true },
                { id: "a2", org_id: "org", relationship_id: "r2", role_key: "emergency_contact", is_active: true },
            ],
            personsById: new Map([
                ["p1", { display_name: "Sam" }],
                ["p2", { display_name: "Pat" }],
            ]),
        });
        expect(result.status).toBe("resolved");
        expect(result.items).toHaveLength(2);
    });

    it("filters by required operational role", () => {
        const result = resolvePersonChildRelationshipsForCustomerMember({
            orgId: "org",
            customerId: "cust",
            customerMemberId: "child-a",
            relationships: [
                {
                    id: "r1",
                    org_id: "org",
                    customer_id: "cust",
                    customer_member_id: "child-a",
                    person_id: "p1",
                    relationship_type: "aunt",
                    priority: null,
                    status: "active",
                },
            ],
            roleAssignments: [
                { id: "a1", org_id: "org", relationship_id: "r1", role_key: "emergency_contact", is_active: true },
            ],
            personsById: new Map([["p1", { display_name: "Alex" }]]),
            requiredOperationalRole: "emergency_contact",
        });
        expect(result.items).toHaveLength(1);
    });
});
