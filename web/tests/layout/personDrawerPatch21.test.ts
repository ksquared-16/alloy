/**
 * Patch 21 — Person drawer polish: related adults grouping + connected children cards.
 */

import { describe, expect, it } from "vitest";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import { formatPersonConnectedChildMetaLine } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import {
    personOverviewCompositionHints,
    PERSON_OVERVIEW_SECTION_KEYS,
} from "@/lib/layout/runtime/personOverviewComposition";
import {
    personOverviewRelatedPeopleHasContent,
    resolvePersonOverviewHouseholdConnectedChildren,
    resolvePersonOverviewRelatedPeopleGroups,
} from "@/lib/layout/runtime/resolvePersonOverviewRelatedPeopleGroups";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";

function householdRecord() {
    return buildProofPersonRecord({
        id: "parent-1",
        _household_context: [{ customer_id: "cust-1", household_name: "Johnson Household" }],
        _household_adult_links: [
            {
                customer_id: "cust-1",
                person_id: "parent-1",
                display_name: "Jamie Johnson",
                role_type: "parent",
                role_label: "Parent",
                is_primary: true,
            },
            {
                customer_id: "cust-1",
                person_id: "parent-2",
                display_name: "Alex Johnson",
                role_type: "guardian",
                role_label: "Guardian",
            },
            {
                customer_id: "cust-1",
                person_id: "ec-1",
                display_name: "Pat Lee",
                role_type: "emergency_contact",
                role_label: "Emergency contact",
            },
            {
                customer_id: "cust-1",
                person_id: "pickup-1",
                display_name: "Sam Rivera",
                role_type: "authorized_pickup",
                role_label: "Authorized pickup",
            },
            {
                customer_id: "cust-1",
                person_id: "other-1",
                display_name: "Grandma Jo",
                role_type: "other",
                role_label: "Grandparent",
            },
        ],
    });
}

describe("personOverviewComposition hints (patch 21)", () => {
    it("enables connected children card list read-first mode", () => {
        const hints = personOverviewCompositionHints();
        expect(hints.personConnectedChildrenCardList).toBe(true);
        expect(hints.personConnectedChildrenReadFirst).toBe(true);
    });
});

describe("resolvePersonOverviewRelatedPeopleGroups", () => {
    it("groups adults by role and excludes the viewing person", () => {
        const groups = resolvePersonOverviewRelatedPeopleGroups(householdRecord());
        expect(groups.map((g) => g.key)).toEqual([
            "parents_guardians",
            "emergency_contacts",
            "authorized_pickup",
            "other_household_members",
        ]);
        expect(groups.find((g) => g.key === "parents_guardians")?.members.map((m) => m.display_name)).toEqual([
            "Alex Johnson",
        ]);
        expect(groups.find((g) => g.key === "emergency_contacts")?.members[0]?.display_name).toBe("Pat Lee");
        expect(groups.find((g) => g.key === "authorized_pickup")?.members[0]?.display_name).toBe("Sam Rivera");
        expect(groups.find((g) => g.key === "other_household_members")?.members[0]?.display_name).toBe("Grandma Jo");
    });

    it("reports empty when no related adults remain after filtering viewer", () => {
        const record = buildProofPersonRecord({
            id: "solo-1",
            _household_context: [{ customer_id: "cust-1" }],
            _household_adult_links: [
                {
                    customer_id: "cust-1",
                    person_id: "solo-1",
                    display_name: "Solo Parent",
                    role_type: "parent",
                },
            ],
        });
        expect(resolvePersonOverviewRelatedPeopleGroups(record)).toEqual([]);
        expect(personOverviewRelatedPeopleHasContent(record)).toBe(false);
    });

    it("includes connected children in household content checks", () => {
        const record = buildProofPersonRecord({
            id: "parent-1",
            _household_context: [{ customer_id: "cust-1", customer_name: "Johnson Household" }],
            _household_child_links: [
                {
                    customer_member_id: "cm-1",
                    customer_id: "cust-1",
                    person_id: "child-1",
                    display_name: "Riley Brooks",
                    age_label: "Infant",
                    status_label: "Active",
                },
            ],
        });
        const childrenGroup = resolvePersonOverviewHouseholdConnectedChildren(record);
        expect(childrenGroup?.children).toHaveLength(1);
        expect(personOverviewRelatedPeopleHasContent(record)).toBe(true);
    });
});

describe("formatPersonConnectedChildMetaLine", () => {
    it("joins only non-empty meta segments", () => {
        const record = buildProofPersonRecord();
        const children = record.household_children as Record<string, unknown>[] | undefined;
        const row = {
            ...(children?.[0] ?? {}),
            "child.status": "Active",
        };
        const columns: LayoutCollectionColumn[] = [
            { refKey: "child.date_of_birth", label: "DOB" },
            { refKey: "child.age_band", label: "Age" },
            { refKey: "child.program", label: "Program" },
            { refKey: "child.status", label: "Status" },
        ];
        const line = formatPersonConnectedChildMetaLine(row, columns);
        expect(line).toMatch(/Mar 15, 2024/);
        expect(line).toContain("Infant");
        expect(line).toContain("Active");
        expect(line).not.toContain("Program —");
    });

    it("returns empty string when all meta columns are blank", () => {
        const row = { "child.name": "Test Child" };
        const columns: LayoutCollectionColumn[] = [{ refKey: "child.program", label: "Program" }];
        expect(formatPersonConnectedChildMetaLine(row, columns)).toBe("");
    });
});

describe("person drawer default doc (patch 21)", () => {
    it("includes related_people widget in household section", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const household = doc.sections.find((s) => s.key === PERSON_OVERVIEW_SECTION_KEYS.household);
        const widgetKeys =
            household?.rows.flatMap((row) => row.columns.flatMap((col) => col.items.map((item) => item.refKey))) ??
            [];
        expect(widgetKeys).toContain("related_people");
    });
});
