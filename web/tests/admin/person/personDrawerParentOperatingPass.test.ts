import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    filterPersonStatusDefinitionsForProfile,
    PERSON_CHILD_LIFECYCLE_STATUS_KEYS,
    PERSON_STATUS_PROFILE_GENERIC,
    buildPersonStatusApplicabilityMetadata,
} from "@/lib/admin/person/personStatusApplicability";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import { resolvePersonDrawerParentSummaryModel } from "@/lib/admin/person/personDrawerParentSummaryModel";
import { personDrawerOpenSeedFromContactValues } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import {
    PERSON_DRAWER_PARENT_ADDRESS_FIELD_SPECS,
    resolvePersonDrawerParentAddressFields,
} from "@/lib/admin/person/personDrawerParentAddressFields";
import { filterPersonDrawerParentOverviewSections } from "@/lib/admin/person/personDrawerParentOperatingSections";

const childLifecycleRows = PERSON_CHILD_LIFECYCLE_STATUS_KEYS.map((status_key) => ({
    status_key,
    metadata: buildPersonStatusApplicabilityMetadata(
        ["future_start", "withdrawn", "graduated"].includes(status_key) ? "child_lifecycle" : "both"
    ),
}));

describe("parent operating surface", () => {
    it("parent drawer does not show child-only statuses", () => {
        const filtered = filterPersonStatusDefinitionsForProfile(
            childLifecycleRows,
            PERSON_STATUS_PROFILE_GENERIC
        );
        expect(filtered.map((r) => r.status_key).sort()).toEqual(["active", "archived", "inactive"]);
    });

    it("parent chrome activates for guardian emphasis and not for child profile", () => {
        expect(
            personDrawerParentChromeActive(
                {
                    id: "p1",
                    _customer_persons: [{ role_type: "parent" }],
                },
                { presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS }
            )
        ).toBe(true);
        expect(
            personDrawerParentChromeActive({
                id: "p1",
                _compatibility_members: [{ relationship: "child" }],
            })
        ).toBe(false);
    });

    it("parent summary model reads communication_opt_out from record", () => {
        const model = resolvePersonDrawerParentSummaryModel({
            id: "p1",
            first_name: "Jane",
            last_name: "Doe",
            email: "jane@example.com",
            phone: "5550100",
            communication_opt_out: true,
            _field_definitions: [{ field_key: "communication_opt_out" }],
        });
        expect(model.communication_opt_out).toBe(true);
        expect(model.display_name).toContain("Jane");
    });

    it("household groups guardians and children with primary guardian flagged", () => {
        const model = resolvePersonDrawerHouseholdModel({
            id: "parent-1",
            first_name: "Jordan",
            last_name: "Murphy",
            _household_context: [{ customer_id: "c1", customer_name: "Murphy Household" }],
            _household_child_links: [
                {
                    customer_id: "c1",
                    customer_member_id: "m1",
                    person_id: "child-1",
                    display_name: "Owen Murphy",
                },
            ],
            _customer_persons: [{ customer_id: "c1", role_type: "parent", is_primary: true }],
            _household_adult_links: [
                {
                    customer_id: "c1",
                    person_id: "parent-1",
                    display_name: "Jordan Murphy",
                    role_type: "primary_contact",
                    role_label: "Primary contact",
                    is_primary: true,
                    is_household_primary_contact: true,
                },
                {
                    customer_id: "c1",
                    person_id: "ec-1",
                    display_name: "Pat Lee",
                    role_type: "emergency_contact",
                    role_label: "Emergency contact",
                    is_primary: false,
                },
            ],
            _enrollment_mirror: [],
        });
        expect(model.groups).toHaveLength(1);
        expect(model.groups[0]?.household_label).toBe("Murphy Household");
        expect(model.groups[0]?.guardians[0]?.display_name).toContain("Jordan");
        expect(model.groups[0]?.guardians[0]?.is_primary).toBe(true);
        expect(model.groups[0]?.children[0]?.display_name).toBe("Owen Murphy");
        expect(model.groups[0]?.emergency_contacts[0]?.display_name).toBe("Pat Lee");
    });

);

    it("parent IA lock suppresses profile, contact, record info, and duplicate summary fields", () => {
        const filtered = filterPersonDrawerParentOverviewSections([
            { key: "profile", fields: [{ key: "first_name" }, { key: "last_name" }] },
            { key: "contact", fields: [{ key: "email" }] },
            { key: "record_info", fields: [{ key: "id" }] },
            { key: "custom_property_fields", fields: [{ key: "employer_name" }] },
        ]);
        expect(filtered.map((s) => s.key)).toEqual([]);
    });

    it("parent address fields resolve from field_definitions", () => {
        expect(PERSON_DRAWER_PARENT_ADDRESS_FIELD_SPECS.map((s) => s.key)).toEqual([
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
        ]);
        const fields = resolvePersonDrawerParentAddressFields({
            _field_definitions: [{ field_key: "city" }, { field_key: "postal_code" }],
        });
        expect(fields.map((f) => f.key)).toEqual(["city", "postal_code"]);
    });

    it("open seed from opportunity contact uses guardian emphasis", () => {
        expect(
            personDrawerOpenSeedFromContactValues("pid", {
                first_name: "Sam",
                last_name: "Lee",
                email: "sam@example.com",
                phone: "",
                display_name: "Sam Lee",
            }, { presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS })
        ).toMatchObject({
            presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
        });
    });
});
