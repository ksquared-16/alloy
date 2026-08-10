import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildOpportunityFamilyContactRows,
    sortOpportunityFamilyContactRows,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import { applyHouseholdPrimaryContactToRecord } from "@/lib/admin/person/applyHouseholdPrimaryContactToRecord";
import { resolvePersonDrawerOperatingBackLink } from "@/lib/admin/person/personDrawerBackLink";
import { resolveChildHouseholdCardLines } from "@/lib/admin/person/personDrawerLocationCategoryOwnership";
import { PERSON_DRAWER_UNLINKED_CHILD_TOOLTIP } from "@/lib/admin/person/personDrawerHouseholdUnlinkedChild";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import { HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE } from "@/lib/admin/person/householdPrimaryContact";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("person drawer ownership final pass", () => {
    it("household child row shows program and location from enrollment mirror", () => {
        const record = {
            id: "child-1",
            _household_context: [{ customer_id: "cust-1", customer_name: "Mitchell" }],
            _household_child_links: [
                {
                    customer_member_id: "m-mia",
                    customer_id: "cust-1",
                    person_id: "child-mia",
                    display_name: "Mia Mitchell",
                    age_label: "3 yrs",
                },
            ],
            _household_adult_links: [],
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Lead",
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-mia",
                    child_display_name: "Mia Mitchell",
                    location_id: "loc-north",
                    location_label: "North Campus",
                    program_label: "Preschool",
                    room_label: "Room 3",
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        };
        const child = resolvePersonDrawerHouseholdModel(record, { viewing_person_id: "child-1" }).groups[0]
            ?.children[0];
        expect(child?.program_label).toBe("Preschool");
        expect(child?.location_label).toBe("North Campus");
        expect(child?.room_label).toBe("Room 3");
        const lines = resolveChildHouseholdCardLines(child!);
        expect(lines.age_line).toBeNull();
        expect(lines.placement_line).toBe("3 yrs · Preschool · North Campus");
        expect(lines.classroom_line).toBe("Room 3");
    });

    it("attachPersonDrawerVisibility loads mirror for household child member ids", () => {
        const src = read("lib/admin/person/attachPersonDrawerVisibility.ts");
        expect(src).toContain("buildPersonEnrollmentMirrorRowsForMemberIds");
        expect(src).toContain("extraHouseholdMemberIds");
    });

    it("unlinked child row is not openable and documents fix path", () => {
        const record = {
            id: "parent-1",
            _household_context: [{ customer_id: "cust-1", customer_name: "Test" }],
            _household_child_links: [
                {
                    customer_member_id: "m-unlinked",
                    customer_id: "cust-1",
                    person_id: null,
                    display_name: "Unnamed child",
                },
            ],
            _household_adult_links: [],
            _enrollment_mirror: [],
        };
        const child = resolvePersonDrawerHouseholdModel(record).groups[0]?.children[0];
        expect(child?.link_state).toBe("unlinked");
        expect(child?.person_id).toBeNull();

        const householdSection = read("components/admin/entity/PersonDrawerHouseholdSection.tsx");
        expect(householdSection).toContain("PERSON_DRAWER_UNLINKED_CHILD_TOOLTIP");
        expect(read("lib/admin/person/personDrawerHouseholdUnlinkedChild.ts")).toContain(
            PERSON_DRAWER_UNLINKED_CHILD_TOOLTIP
        );
        expect(read("lib/admin/person/personDrawerHouseholdUnlinkedChild.ts")).toContain(
            "customer_members.person_id"
        );
        expect(householdSection).toContain('aria-disabled="true"');
    });

    it("excludes viewing parent from guardians and viewing child from children", () => {
        const record = {
            id: "kevin-1",
            _household_context: [{ customer_id: "cust-1", customer_name: "Mitchell" }],
            _household_adult_links: [
                {
                    person_id: "kevin-1",
                    customer_id: "cust-1",
                    display_name: "Kevin Mitchell",
                    role_type: "parent",
                    is_primary: false,
                    is_household_primary_contact: false,
                },
                {
                    person_id: "kelly-1",
                    customer_id: "cust-1",
                    display_name: "Kelly Mitchell",
                    role_type: "guardian",
                    is_primary: true,
                    is_household_primary_contact: true,
                },
            ],
            _household_child_links: [
                {
                    customer_member_id: "m-mia",
                    customer_id: "cust-1",
                    person_id: "mia-1",
                    display_name: "Mia Mitchell",
                },
                {
                    customer_member_id: "m-sophia",
                    customer_id: "cust-1",
                    person_id: "sophia-1",
                    display_name: "Sophia Mitchell",
                },
            ],
            _enrollment_mirror: [],
        };

        const parentView = resolvePersonDrawerHouseholdModel(record, { viewing_person_id: "kevin-1" });
        expect(parentView.groups[0]?.guardians.map((g) => g.person_id)).toEqual(["kelly-1"]);
        expect(parentView.groups[0]?.children).toHaveLength(2);

        const childView = resolvePersonDrawerHouseholdModel(record, { viewing_person_id: "mia-1" });
        expect(childView.groups[0]?.children.map((c) => c.person_id)).toEqual(["sophia-1"]);
    });

    it("opportunity family contacts merge household guardians without duplicating primary", () => {
        const record = {
            customer_id: "cust-1",
            primary_person_id: "kelly-1",
            _opportunity_persons: [
                {
                    id: "op-1",
                    person_id: "kelly-1",
                    role_type: "primary_contact",
                    name: "Kelly Mitchell",
                },
            ],
            _customer_persons: [
                {
                    customer_id: "cust-1",
                    person_id: "kelly-1",
                    role_type: "primary_contact",
                    is_primary: true,
                    name: "Kelly Mitchell",
                },
                {
                    customer_id: "cust-1",
                    person_id: "kevin-1",
                    role_type: "guardian",
                    is_primary: false,
                    name: "Kevin Mitchell",
                },
            ],
        };

        const additional = sortOpportunityFamilyContactRows(
            buildOpportunityFamilyContactRows(record),
            "kelly-1"
        );
        expect(additional.map((r) => r.person_id)).toEqual(["kevin-1"]);
    });

    it("primary contact patch dispatches queue refresh hook", () => {
        expect(read("lib/admin/person/patchHouseholdPrimaryContact.ts")).toContain(
            "dispatchHouseholdPrimaryContactChanged"
        );
        expect(read("lib/admin/person/dispatchHouseholdPrimaryContactChanged.ts")).toContain(
            "household_primary_contact"
        );
        expect(read("lib/admin/opportunityQueueRefreshEvent.ts")).toContain("household_primary_contact");
        expect(read("lib/admin/person/setHouseholdPrimaryContact.ts")).toContain("opportunity_ids");
    });

    it("applyHouseholdPrimaryContactToRecord updates adult links", () => {
        const record = {
            _household_adult_links: [
                {
                    person_id: "a",
                    customer_id: "c1",
                    is_primary: true,
                    is_household_primary_contact: true,
                    role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
                },
                {
                    person_id: "b",
                    customer_id: "c1",
                    is_primary: false,
                    is_household_primary_contact: false,
                    role_type: "parent",
                },
            ],
        };
        const next = applyHouseholdPrimaryContactToRecord(record, "c1", "b");
        const links = next._household_adult_links as { person_id: string; is_household_primary_contact: boolean }[];
        expect(links.find((l) => l.person_id === "b")?.is_household_primary_contact).toBe(true);
    });

    it("operating drawer section suppression remains for parent and child", () => {
        expect(read("lib/admin/person/personDrawerParentOperatingSections.ts")).toContain('"medical"');
        expect(read("lib/admin/person/personDrawerChildOperatingSections.ts")).toContain('"child_profile"');
    });
});
