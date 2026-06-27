import { describe, expect, it } from "vitest";

import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";

/**
 * Household Card — operational evidence assembly (Use Case 1).
 *
 * Verifies the card observes the already-loaded opportunity record and assembles
 * a complete operational answer (primary contact, children, additional contacts,
 * emergency contacts, authorized pickups, billing) with NO fetch. All inputs are
 * plain record fields the Focus Panel already has.
 */

function baseRecord(): Record<string, unknown> {
    return {
        id: "opp-1",
        customer_id: "cust-1",
        updated_at: "2026-06-20T10:00:00Z",
        _customer_name: "Johnson Household",
        "person.primary_contact_name": "Sarah Johnson",
        "person.primary_phone": "555-123-4567",
        "person.primary_email": "sarah@example.com",
        "opportunity.primary_person_id": "p-sarah",
        _opportunity_persons: [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah@example.com" },
            { person_id: "p-mike", role_type: "guardian", name: "Michael Johnson", phone: "555-111-2222" },
            { person_id: "p-gran", role_type: "emergency_contact", name: "Grandma Mary", phone: "555-333-4444" },
            { person_id: "p-tom", role_type: "authorized_pickup", name: "Uncle Tom" },
            { person_id: "p-pay", role_type: "billing_contact", name: "Sarah Johnson" },
        ],
        _inquiry_children: [
            { id: "c1", display_name: "Emma Johnson", age: "6", outcome_status_label: "Enrolled" },
            { id: "c2", display_name: "Liam Johnson", age: "4" },
        ],
    };
}

describe("buildHouseholdCardEvidence", () => {
    it("assembles the operational answer from loaded record fields (no fetch)", () => {
        const ev = buildHouseholdCardEvidence(baseRecord(), "Johnson Household");

        expect(ev.householdLabel).toBe("Johnson Household");
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
        expect(ev.primaryPhone).toBe("555-123-4567");
        expect(ev.primaryEmail).toBe("sarah@example.com");
        expect(ev.childCount).toBe(2);
        expect(ev.answerLine).toContain("Sarah Johnson");
        expect(ev.answerLine).toContain("2 children");
        expect(ev.missingCriticalWarning).toBeNull();
    });

    it("classifies evidence groups by relationship role", () => {
        const ev = buildHouseholdCardEvidence(baseRecord());
        const keys = ev.groups.map((g) => g.key);

        expect(keys).toContain("primary_contact");
        expect(keys).toContain("children");
        expect(keys).toContain("household_members");
        expect(keys).toContain("emergency_contacts");
        expect(keys).toContain("authorized_pickups");
        expect(keys).toContain("billing_contact");

        expect(ev.emergencyContactCount).toBe(1);
        expect(ev.authorizedPickupCount).toBe(1);
        // Michael (guardian) is the only "additional contact"; emergency/pickup/billing are their own groups.
        // NOTE: the underlying projection treats role "parent" as a primary-contact role and excludes it
        // from the additional list — so a second guardian must carry a non-primary role to surface.
        expect(ev.additionalContactCount).toBe(1);

        const children = ev.groups.find((g) => g.key === "children");
        expect(children?.children.map((c) => c.name)).toEqual(["Emma Johnson", "Liam Johnson"]);
        expect(children?.children[0]?.status).toBe("Enrolled");
    });

    it("warns when no primary contact is on file", () => {
        const ev = buildHouseholdCardEvidence({ id: "opp-2", _inquiry_children: [] });
        expect(ev.primaryContact).toBeNull();
        expect(ev.missingCriticalWarning).toBe("No primary contact on file");
    });

    it("warns when a primary exists but no emergency contact is present", () => {
        const record = baseRecord();
        record._opportunity_persons = [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson" },
        ];
        const ev = buildHouseholdCardEvidence(record);
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
        expect(ev.emergencyContactCount).toBe(0);
        expect(ev.missingCriticalWarning).toBe("No emergency contact on file");
    });

    it("reports preferred contact method only when present (documented gap otherwise)", () => {
        const withPref = baseRecord();
        withPref["person.preferred_contact_method"] = "Text";
        expect(buildHouseholdCardEvidence(withPref).preferredContactMethod).toBe("Text");

        // Default opportunity VM has no preference field — must stay null, never invented.
        expect(buildHouseholdCardEvidence(baseRecord()).preferredContactMethod).toBeNull();
    });
});
