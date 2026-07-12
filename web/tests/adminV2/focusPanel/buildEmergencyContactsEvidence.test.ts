import { describe, expect, it } from "vitest";
import {
    buildEmergencyContactsEvidenceForChild,
    relationshipBagsFromTruth,
} from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/buildEmergencyContactsEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

describe("buildEmergencyContactsEvidence", () => {
    it("filters emergency_contact role per child member", () => {
        const truth = {
            org_id: "org-1",
            customer_id: "cust-1",
            _person_child_relationships_by_member: [
                {
                    customer_member_id: "member-mia",
                    customer_id: "cust-1",
                    child_id: "child-mia",
                    items: [
                        {
                            id: "rel-1",
                            org_id: "org-1",
                            customer_id: "cust-1",
                            customer_member_id: "member-mia",
                            person_id: "person-alex",
                            relationship_type: "aunt",
                            priority: 1,
                            status: "active",
                            operational_roles: ["emergency_contact"],
                            person: { display_name: "Alex Morgan", phone: "555-123-4567" },
                            custom_field_values: { pickup_instructions: "Call after 5 PM" },
                        },
                    ],
                },
                {
                    customer_member_id: "member-noah",
                    customer_id: "cust-1",
                    child_id: "child-noah",
                    items: [
                        {
                            id: "rel-2",
                            org_id: "org-1",
                            customer_id: "cust-1",
                            customer_member_id: "member-noah",
                            person_id: "person-alex",
                            relationship_type: "family_friend",
                            priority: 2,
                            status: "active",
                            operational_roles: ["authorized_pickup"],
                            person: { display_name: "Alex Morgan" },
                            custom_field_values: { pickup_instructions: "Photo ID required" },
                        },
                    ],
                },
            ],
        };

        const context = {
            subject: { type: "opportunity", id: "opp-1", label: "Test" },
            truth,
        } as unknown as OperationalContext;

        const mia = buildEmergencyContactsEvidenceForChild({ context, customerMemberId: "member-mia" });
        expect(mia.count).toBe(1);
        expect(mia.items[0]?.person_display_name).toBe("Alex Morgan");
        expect(mia.items[0]?.relationship_fields.relationship_type).toBe("aunt");

        const noah = buildEmergencyContactsEvidenceForChild({ context, customerMemberId: "member-noah" });
        expect(noah.count).toBe(0);

        const bags = relationshipBagsFromTruth(truth);
        expect(bags).toHaveLength(2);
    });
});
