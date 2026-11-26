import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { personDrawerChildLeadPillLabel } from "@/lib/admin/person/personDrawerChildLeadPill";
import {
    isPersonDrawerChildSuppressedOverviewSection,
    isPersonDrawerParentSuppressedOverviewSection,
    personDrawerChildOperatingOverviewSections,
    personDrawerParentOperatingOverviewSections,
} from "@/lib/admin/person/personDrawerOperatingOverviewSections";
import {
    personDrawerHouseholdAddressHasContent,
    resolvePersonDrawerHouseholdAddressModel,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdAddress";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

describe("person drawer IA final cleanup", () => {

    it("address resolves customer location when household address rows exist", () => {
        const model = resolvePersonDrawerHouseholdAddressModel({
            _household_context: [{ customer_id: "c1", customer_name: "Wrigley Family" }],
            _household_customer_addresses: [
                {
                    customer_id: "c1",
                    location_id: "loc-1",
                    address_line1: "100 Main St",
                    address_line2: null,
                    city: "Austin",
                    state: "TX",
                    postal_code: "78701",
                    label: "Home",
                },
            ],
        });
        expect(model.source).toBe("customer_location");
        expect(personDrawerHouseholdAddressHasContent(model)).toBe(true);
    });

    it('lead pill label uses "Lead: {status}"', () => {
        expect(personDrawerChildLeadPillLabel("Contact Attempted", null)).toBe("Lead: Contact Attempted");
        expect(personDrawerChildLeadPillLabel(null, "Chen Family")).toBe("Lead: Open");
        const executive = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildHeaderExecutive.tsx"),
            "utf8"
        );
        expect(executive).toContain("personDrawerChildLeadPillLabel");
        expect(executive).not.toContain("Family Lead:");
    });

    it("household primary badge appears once when primary and primary contact", () => {
        const model = resolvePersonDrawerHouseholdModel({
            _household_context: [{ customer_id: "c1", customer_name: "Test" }],
            _household_adult_links: [
                {
                    person_id: "p1",
                    customer_id: "c1",
                    display_name: "Alex Parent",
                    role_type: "primary_contact",
                    role_label: "Guardian",
                    is_primary: true,
                },
            ],
        });
        const chips = model.groups[0]?.guardians[0]?.role_chips ?? [];
        expect(chips).toEqual(["Primary"]);
    });

    it("parent and child operating overview suppress generic sections", () => {
        const parent = personDrawerParentOperatingOverviewSections([
            { key: "basic_info", title: "Profile", fields: [{ key: "first_name", label: "First" }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "email", label: "Email" }] },
            { key: "record_info", title: "Record Info", fields: [{ key: "id", label: "ID" }] },
        ]);
        expect(parent).toEqual([]);
        expect(isPersonDrawerParentSuppressedOverviewSection({ key: "profile", title: "Profile" })).toBe(
            true
        );

        const child = personDrawerChildOperatingOverviewSections([
            { key: "child_profile", title: "Child Profile", fields: [{ key: "allergies", label: "Allergies" }] },
            { key: "basic_info", title: "Basic", fields: [{ key: "first_name", label: "First" }] },
            { key: "medical", title: "Medical", fields: [{ key: "notes", label: "Notes" }] },
        ]);
        expect(child.map((s) => s.key)).toEqual(["medical"]);
        expect(isPersonDrawerChildSuppressedOverviewSection({ key: "child_profile", title: "Child Profile" })).toBe(
            true
        );
    });
});
