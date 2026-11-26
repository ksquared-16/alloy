import { describe, expect, it } from "vitest";
import {
    buildEmergencyContactFieldRows,
    resolveEmergencyContactFieldValue,
} from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/emergencyContactsFieldRuntime";
import type { EmergencyContactEvidenceItem } from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/buildEmergencyContactsEvidence";

const item: EmergencyContactEvidenceItem = {
    relationship_id: "rel-1",
    person_id: "person-alex",
    person_display_name: "Alex Morgan",
    operational_roles: ["emergency_contact"],
    relationship_type_label: "Aunt",
    person_fields: { email: "alex@example.com", phone: "555-1234" },
    relationship_fields: { pickup_instructions: "Call after 5 PM", relationship_type: "aunt" },
    customer_member_id: "member-mia",
    child_id: "child-mia",
    operational_role_labels: ["Emergency Contact"],
    priority: 1,
    status: "active",
};

describe("emergencyContactsFieldRuntime", () => {
    it("resolves person and relationship provider refs", () => {
        expect(resolveEmergencyContactFieldValue("person.email", item)).toBe("alex@example.com");
        expect(resolveEmergencyContactFieldValue("person_child_relationship.relationship_type", item)).toBe("Aunt");
        expect(resolveEmergencyContactFieldValue("person_child_relationship.pickup_instructions", item)).toBe(
            "Call after 5 PM",
        );
    });

    it("builds field rows from configured keys", () => {
        const rows = buildEmergencyContactFieldRows({
            item,
            fieldKeys: ["person.email", "person_child_relationship.pickup_instructions"],
            config: null,
            groupKey: "emergency_contacts",
            canEditPerson: true,
            canEditRelationship: true,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.cells).toHaveLength(2);
    });
});
