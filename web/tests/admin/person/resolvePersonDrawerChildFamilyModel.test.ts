import { describe, expect, it } from "vitest";
import { resolvePersonDrawerChildFamilyModel } from "@/lib/admin/person/resolvePersonDrawerChildFamilyModel";

describe("resolvePersonDrawerChildFamilyModel", () => {
    it("orders household hierarchy: parents/guardians, siblings via UI, emergency contacts", () => {
        const model = resolvePersonDrawerChildFamilyModel({
            _household_context: [{ customer_name: "Foster household" }],
            _household_adult_links: [
                {
                    person_id: "olivia",
                    customer_id: "cust-1",
                    display_name: "Olivia Foster",
                    role_type: "guardian",
                    role_label: "Guardian",
                    is_primary: true,
                },
                {
                    person_id: "grace",
                    customer_id: "cust-1",
                    display_name: "Grace Walsh",
                    role_type: "parent",
                    role_label: "Parent",
                    is_primary: false,
                },
                {
                    person_id: "jordan",
                    customer_id: "cust-1",
                    display_name: "Jordan Foster",
                    role_type: "guardian",
                    role_label: "Guardian",
                    is_primary: false,
                },
                {
                    person_id: "aunt",
                    customer_id: "cust-1",
                    display_name: "Pat Walsh",
                    role_type: "emergency_contact",
                    role_label: "Emergency contact",
                    is_primary: false,
                },
            ],
        });

        expect(model.household_label).toBe("Foster household");
        expect(model.parents_guardians.map((a) => a.display_name)).toEqual([
            "Olivia Foster",
            "Grace Walsh",
            "Jordan Foster",
        ]);
        expect(model.emergency_contacts.map((a) => a.display_name)).toEqual(["Pat Walsh"]);
        expect(model.other_household_adults).toHaveLength(0);
    });

    it("puts non-caregiver household roles under other household adults", () => {
        const model = resolvePersonDrawerChildFamilyModel({
            _household_adult_links: [
                {
                    person_id: "p1",
                    customer_id: "c1",
                    display_name: "Primary Parent",
                    role_type: "parent",
                    role_label: "Parent",
                    is_primary: true,
                },
                {
                    person_id: "p2",
                    customer_id: "c1",
                    display_name: "Billing Contact",
                    role_type: "billing_contact",
                    role_label: "Billing",
                    is_primary: false,
                },
            ],
        });

        expect(model.parents_guardians.map((a) => a.display_name)).toEqual(["Primary Parent"]);
        expect(model.other_household_adults.map((a) => a.display_name)).toEqual(["Billing Contact"]);
    });
});
