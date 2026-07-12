import { describe, expect, it } from "vitest";
import {
    buildPersonChildRelationshipReportingSource,
    personChildRelationshipReportingQueries,
} from "@/lib/fields/personChildRelationship/personChildRelationshipReportingSource";

describe("personChildRelationshipReportingSource", () => {
    const rows = buildPersonChildRelationshipReportingSource([
        {
            id: "r1", org_id: "o", customer_id: "c", customer_member_id: "mia", person_id: "alex",
            relationship_type: "aunt", priority: 1, status: "active", operational_roles: ["emergency_contact"],
            person: { display_name: "Alex" }, custom_field_values: { pickup_instructions: "Call after 5 PM" },
        },
        {
            id: "r2", org_id: "o", customer_id: "c", customer_member_id: "noah", person_id: "alex",
            relationship_type: "family_friend", priority: 2, status: "active", operational_roles: ["authorized_pickup"],
            person: { display_name: "Alex" }, custom_field_values: { pickup_instructions: "Photo ID required" },
        },
    ]);

    it("queries emergency contacts by relationship type at relationship grain", () => {
        const aunts = personChildRelationshipReportingQueries.emergencyContactsByRelationshipType(rows, "aunt");
        expect(aunts).toHaveLength(1);
        expect(aunts[0]?.customer_member_id).toBe("mia");
    });

    it("finds children without emergency contact", () => {
        const missing = personChildRelationshipReportingQueries.childrenWithoutEmergencyContact(["mia", "noah", "sam"], rows);
        expect(missing).toEqual(["noah", "sam"]);
    });
});
