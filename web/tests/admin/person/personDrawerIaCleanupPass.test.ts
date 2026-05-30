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
import { personDrawerHouseholdAgeLabel } from "@/lib/admin/person/personDrawerHouseholdDisplay";
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
    it("hides quick links context panel for child and parent profiles", () => {
        expect(personDrawerShowsChildContextPanel(childProfile)).toBe(false);
        expect(personDrawerShowsChildContextPanel(parentProfile)).toBe(false);
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).not.toContain("PersonDrawerContextPanel");
        expect(typeof buildPersonDrawerQuickLinks).toBe("function");
    });

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

    it("shared household section renders avatar cards and unlinked state", () => {
        const household = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerHouseholdSection.tsx"),
            "utf8"
        );
        expect(household).toContain("PersonDrawerIdentityAvatar");
        expect(household).toContain("data-person-drawer-household-child-unlinked");
        expect(household).toContain("role_chips");
        expect(household).toContain("age_label");
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

    it("documents interim person address when no household location", () => {
        const model = resolvePersonDrawerHouseholdAddressModel({
            _field_definitions: [{ field_key: "city" }],
            city: "Denver",
        });
        expect(model.source).toBe("person_interim");
        expect(model.interim_note).toContain("interim");
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

    it("employee status uses premium drawer shell on parent", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        const employee = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerEmployeeStatusSection.tsx"),
            "utf8"
        );
        expect(drawer).toContain("PersonDrawerEmployeeStatusSection");
        expect(drawer).toContain("PersonEmployeePlacementSection");
        expect(employee).toContain("data-person-drawer-employee-status");
        expect(employee).toContain("oppInqLeadSummaryShellClassName");
    });

    it("parent address component always renders section shell for parent chrome", () => {
        const address = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerHouseholdAddress.tsx"),
            "utf8"
        );
        expect(address).toContain("data-person-drawer-address-empty");
        expect(address).toContain("No household address on file");
    });

    it("parent operating overview strips Profile, Contact, and Record Info sections", () => {
        const filtered = personDrawerParentOperatingOverviewSections([
            { key: "basic_info", title: "Profile", fields: [{ key: "first_name", label: "First name" }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "phone", label: "Phone" }] },
            { key: "record_info", title: "Record Info", fields: [{ key: "created_at", label: "Created" }] },
        ]);
        expect(filtered).toEqual([]);
    });

    it("does not render parent/child module chip strip under tabs", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        const stripBlock = drawer.slice(drawer.indexOf("const drawerPostTabStrip"));
        expect(stripBlock.slice(0, 600)).not.toContain("personDrawerParentLifecycleRail");
        expect(stripBlock.slice(0, 600)).not.toContain("personDrawerChildLifecycleRail");
    });

    it("computes child age label from date of birth", () => {
        const age = personDrawerHouseholdAgeLabel("2020-01-15");
        expect(age).toMatch(/yr|mo/);
    });
});
