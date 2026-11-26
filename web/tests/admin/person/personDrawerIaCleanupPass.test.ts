import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPersonDrawerQuickLinks } from "@/components/admin/entity/PersonDrawerContextPanel";
import { personDrawerShowsChildContextPanel } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { CHILD_LIFECYCLE_PREMIUM_SECTION_KEYS } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { filterPersonDrawerChildOverviewSections } from "@/lib/admin/person/personDrawerChildOperatingSections";
import { personDrawerParentOperatingOverviewSections } from "@/lib/admin/person/personDrawerOperatingOverviewSections";
import {
    resolvePersonDrawerHouseholdChildLinkState,
    resolvePersonDrawerHouseholdModel,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import {
    personDrawerHouseholdAddressHasContent,
    resolvePersonDrawerHouseholdAddressModel,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdAddress";
import {
    personDrawerHouseholdAgeLabel,
    resolvePersonDrawerChildDateOfBirth,
} from "@/lib/admin/person/personDrawerHouseholdDisplay";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";

const childProfile = resolvePersonDrawerProfileFromRecord({
    id: "c1",
    _compatibility_members: [{ relationship: "child" }],
});

const parentProfile = resolvePersonDrawerProfileFromRecord({
    id: "p1",
    _customer_persons: [{ role_type: "parent" }],
});

describe("person drawer IA cleanup pass", () => {

    it("household child link state requires person_id", () => {
        expect(resolvePersonDrawerHouseholdChildLinkState("child-1")).toBe("openable");
        expect(resolvePersonDrawerHouseholdChildLinkState(null)).toBe("unlinked");
    });

    it("household model includes age and unlinked child when person_id missing", () => {
        const model = resolvePersonDrawerHouseholdModel({
            _household_context: [{ customer_id: "c1", customer_name: "Wrigley Family" }],
            _household_child_links: [
                {
                    customer_id: "c1",
                    customer_member_id: "m-wrigley",
                    person_id: null,
                    display_name: "Wrigley",
                },
                {
                    customer_id: "c1",
                    customer_member_id: "m-2",
                    person_id: "child-2",
                    display_name: "Riley",
                    date_of_birth: "2020-06-01",
                    age_label: "5 yrs",
                    status_label: "Active",
                },
            ],
        });
        const children = model.groups[0]?.children ?? [];
        expect(children.find((c) => c.display_name === "Wrigley")?.link_state).toBe("unlinked");
        expect(children.find((c) => c.display_name === "Riley")?.age_label).toBe("5 yrs");
        expect(children.find((c) => c.display_name === "Riley")?.link_state).toBe("openable");
    });

    it("prefers customer location address over person interim fields", () => {
        const model = resolvePersonDrawerHouseholdAddressModel({
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
            address_line1: "999 Person St",
            _field_definitions: [{ field_key: "address_line1" }],
        });
        expect(model.source).toBe("customer_location");
        expect(model.address_line1).toBe("100 Main St");
        expect(personDrawerHouseholdAddressHasContent(model)).toBe(true);
    });

    it("treats person-only address fields as empty household mailing state", () => {
        const model = resolvePersonDrawerHouseholdAddressModel({
            _field_definitions: [{ field_key: "city" }],
            city: "Denver",
        });
        expect(model.source).toBe("none");
        expect(model.interim_note).toBeNull();
    });

    it("suppresses child profile section on child lifecycle overview", () => {
        const filtered = filterPersonDrawerChildOverviewSections([
            { key: "child_profile", fields: [{ key: "allergies" }] },
            { key: "medical", fields: [{ key: "medical_notes" }] },
        ]);
        expect(filtered.map((s) => s.key)).toEqual(["medical"]);
    });

    it("medical uses premium section chrome on child drawer", () => {
        expect(CHILD_LIFECYCLE_PREMIUM_SECTION_KEYS.has("medical")).toBe(true);
    });

    it("parent operating overview strips Profile, Contact, and Record Info sections", () => {
        const filtered = personDrawerParentOperatingOverviewSections([
            { key: "basic_info", title: "Profile", fields: [{ key: "first_name", label: "First name" }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "phone", label: "Phone" }] },
            { key: "record_info", title: "Record Info", fields: [{ key: "created_at", label: "Created" }] },
        ]);
        expect(filtered).toEqual([]);
    });

    it("computes child age label from date of birth", () => {
        const age = personDrawerHouseholdAgeLabel("2020-01-15");
        expect(age).toMatch(/yr|mo/);
    });

    it("resolvePersonDrawerChildDateOfBirth uses persons.date_of_birth only", () => {
        expect(resolvePersonDrawerChildDateOfBirth({ date_of_birth: "2020-06-15" })).toBe("2020-06-15");
        expect(resolvePersonDrawerChildDateOfBirth({ date_of_birth: null, metadata: { dob: "2019-03-01" } })).toBe(
            "2019-03-01"
        );
        expect(resolvePersonDrawerChildDateOfBirth(null)).toBeNull();
    });

    it("attachPersonDrawerVisibility does not select nonexistent persons.dob", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/person/attachPersonDrawerVisibility.ts"),
            "utf8"
        );
        expect(src).toContain('select("id, date_of_birth, status_key, metadata")');
        expect(src).not.toMatch(/from\("persons"\)[\s\S]{0,120}dob/);
        expect(src).not.toContain("person_drawer_household_child_meta:");
    });
});
