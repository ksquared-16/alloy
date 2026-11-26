import { describe, expect, it } from "vitest";
import { relationshipFieldAvailableInContext } from "@/lib/fields/personChildRelationship/personChildRelationshipAvailability";
import { personChildRelationshipProviderRef } from "@/lib/fields/personChildRelationship/personChildRelationshipFieldRegistry";
import { resolvePersonChildRelationshipsForCustomerMember } from "@/lib/fields/personChildRelationship/personChildRelationshipResolver";
import {
    filterReportingRowsByOperationalRole,
    filterReportingRowsByRelationshipType,
    projectRelationshipInstancesForReporting,
} from "@/lib/fields/personChildRelationship/personChildRelationshipReportingProjection";
import type {
    PersonChildRelationshipRecord,
    PersonChildRelationshipRoleAssignment,
} from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";

const ORG = "org-1";
const CUSTOMER = "cust-1";
const ALEX = "person-alex";
const MIA = "member-mia";
const NOAH = "member-noah";

const alexPerson = { id: ALEX, display_name: "Alex", email: "alex@example.com", phone: "555-0001" };

const relMia: PersonChildRelationshipRecord = {
    id: "rel-alex-mia",
    org_id: ORG,
    customer_id: CUSTOMER,
    customer_member_id: MIA,
    person_id: ALEX,
    relationship_type: "aunt",
    priority: 1,
    status: "active",
};

const relNoah: PersonChildRelationshipRecord = {
    id: "rel-alex-noah",
    org_id: ORG,
    customer_id: CUSTOMER,
    customer_member_id: NOAH,
    person_id: ALEX,
    relationship_type: "family_friend",
    priority: 2,
    status: "active",
};

const roles: PersonChildRelationshipRoleAssignment[] = [
    { id: "r1", org_id: ORG, relationship_id: "rel-alex-mia", role_key: "emergency_contact", is_active: true },
    { id: "r2", org_id: ORG, relationship_id: "rel-alex-noah", role_key: "authorized_pickup", is_active: true },
];

describe("Alex / Mia / Noah acceptance flow", () => {
    const persons = new Map([[ALEX, alexPerson]]);

    it("keeps exactly one Alex Person across two child relationships", () => {
        const mia = resolvePersonChildRelationshipsForCustomerMember({
            orgId: ORG,
            customerId: CUSTOMER,
            customerMemberId: MIA,
            relationships: [relMia, relNoah],
            roleAssignments: roles,
            personsById: persons,
        });
        const noah = resolvePersonChildRelationshipsForCustomerMember({
            orgId: ORG,
            customerId: CUSTOMER,
            customerMemberId: NOAH,
            relationships: [relMia, relNoah],
            roleAssignments: roles,
            personsById: persons,
        });
        expect(mia.items).toHaveLength(1);
        expect(noah.items).toHaveLength(1);
        expect(mia.items[0]?.person_id).toBe(ALEX);
        expect(noah.items[0]?.person_id).toBe(ALEX);
        expect(mia.items[0]?.relationship_type).toBe("aunt");
        expect(noah.items[0]?.relationship_type).toBe("family_friend");
    });

    it("stores operational roles separately from kinship type", () => {
        const mia = resolvePersonChildRelationshipsForCustomerMember({
            orgId: ORG,
            customerId: CUSTOMER,
            customerMemberId: MIA,
            relationships: [relMia, relNoah],
            roleAssignments: roles,
            personsById: persons,
        }).items[0];
        expect(mia?.operational_roles).toEqual(["emergency_contact"]);
        expect(mia?.relationship_type).toBe("aunt");
        expect(mia?.operational_roles).not.toContain("aunt");
    });

    it("exposes relationship fields only in relationship context", () => {
        const relCtx = {
            kind: "relationship_instance" as const,
            relationship: {
                organization_id: ORG,
                customer_id: CUSTOMER,
                customer_member_id: MIA,
                relationship_id: relMia.id,
                person_id: ALEX,
                operational_roles: ["emergency_contact"],
            },
            requiredOperationalRole: "emergency_contact",
        };
        expect(
            relationshipFieldAvailableInContext(personChildRelationshipProviderRef("relationship_type"), relCtx),
        ).toBe(true);
        expect(
            relationshipFieldAvailableInContext(personChildRelationshipProviderRef("relationship_type"), {
                kind: "person_profile",
            }),
        ).toBe(false);
    });

    it("reports both relationships distinctly at relationship grain", () => {
        const rows = projectRelationshipInstancesForReporting([
            {
                ...relMia,
                operational_roles: ["emergency_contact"],
                person: alexPerson,
                custom_field_values: { pickup_instructions: "Ring bell" },
            },
            {
                ...relNoah,
                operational_roles: ["authorized_pickup"],
                person: alexPerson,
                custom_field_values: { pickup_instructions: "Use side door" },
            },
        ]);
        expect(filterReportingRowsByRelationshipType(rows, "aunt")).toHaveLength(1);
        expect(filterReportingRowsByOperationalRole(rows, "authorized_pickup")).toHaveLength(1);
        expect(rows[0]?.custom_fields.pickup_instructions).toBe("Ring bell");
        expect(rows[1]?.custom_fields.pickup_instructions).toBe("Use side door");
    });
});
