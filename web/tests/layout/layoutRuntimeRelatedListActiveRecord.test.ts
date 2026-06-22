import { describe, expect, it } from "vitest";

import { buildProofChildRecord } from "@/lib/layout/runtime/buildProofChildRecord";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import {
    filterRelatedListRowsExcludingActiveRecord,
    layoutRuntimeRelatedListEmptyMessage,
    resolveLayoutRuntimeActiveRecordContext,
    stampLayoutRuntimeActiveRecordContext,
} from "@/lib/layout/runtime/layoutRuntimeRelatedListActiveRecord";
import { readLayoutRuntimeContactRepeaterRows } from "@/lib/layout/runtime/mapLayoutRuntimeContactRepeaterRows";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { LayoutItem } from "@/lib/layout/layoutV2";

const householdMembersItem: LayoutItem = {
    id: "household-members",
    kind: "related_list",
    refKey: "household_members",
    source: "household_members",
    columns: [{ refKey: "person.primary_contact_name", label: "Name", width: "medium" }],
};

const familyAdultsItem: LayoutItem = {
    id: "family-adults",
    kind: "related_list",
    refKey: "family_adults",
    source: "family_adults",
    columns: [{ refKey: "person.primary_contact_name", label: "Name", width: "medium" }],
};

const householdChildrenItem: LayoutItem = {
    id: "household-children",
    kind: "related_list",
    refKey: "household_children",
    source: "household_children",
    columns: [{ refKey: "child.name", label: "Name", width: "medium" }],
};

describe("layoutRuntimeRelatedListActiveRecord", () => {
    it("stamps person drawer active context on proof records", () => {
        const record = buildProofPersonRecord({ id: "person-viewer" });
        expect(record._layout_runtime_anchor_entity).toBe("person");
        expect(record._layout_runtime_active_person_id).toBe("person-viewer");
    });

    it("stamps child drawer active context on proof records", () => {
        const record = buildProofChildRecord({ id: "child-viewer" });
        expect(record._layout_runtime_anchor_entity).toBe("child");
        expect(record._layout_runtime_active_child_person_id).toBe("child-viewer");
    });
});

describe("person drawer household lists exclude current person", () => {
    it("filters household_members contact rows for person drawer subject", () => {
        const record = buildProofPersonRecord({
            id: "parent-1",
            _household_context: [{ customer_id: "cust-1", customer_name: "Johnson Household" }],
            _household_adult_links: [
                {
                    customer_id: "cust-1",
                    person_id: "parent-1",
                    display_name: "Jamie Johnson",
                    role_type: "parent",
                    role_label: "Parent",
                    is_primary: true,
                    is_household_primary_contact: true,
                },
                {
                    customer_id: "cust-1",
                    person_id: "parent-2",
                    display_name: "Alex Johnson",
                    role_type: "guardian",
                    role_label: "Guardian",
                    is_primary: false,
                    is_household_primary_contact: false,
                },
            ],
        });

        const rows = readLayoutRuntimeContactRepeaterRows(record, householdMembersItem);
        expect(rows.map((row) => row["person.primary_contact_name"])).toEqual(["Alex Johnson"]);
    });

    it("filters family_adults rows for child drawer subject", () => {
        const record = stampLayoutRuntimeActiveRecordContext(
            buildProofChildRecord({
                id: "child-viewer",
                family_adults: [
                    {
                        id: "child-viewer",
                        person_id: "child-viewer",
                        "person.id": "child-viewer",
                        "person.primary_contact_name": "Riley Brooks",
                        "person.household_role": "Child",
                    },
                    {
                        id: "adult-1",
                        person_id: "adult-1",
                        "person.id": "adult-1",
                        "person.primary_contact_name": "Jamie Johnson",
                        "person.household_role": "Primary contact",
                    },
                ],
            }),
            { anchorEntity: "child", entityId: "child-viewer" },
        );

        const rows = readLayoutRuntimeRepeaterRows(record, familyAdultsItem);
        expect(rows.map((row) => row["person.primary_contact_name"])).toEqual(["Jamie Johnson"]);
    });

    it("uses other-household empty language on person drawer household members", () => {
        const context = resolveLayoutRuntimeActiveRecordContext(buildProofPersonRecord(), {
            anchorEntity: "person",
            entityId: "proof-person-001",
        });
        expect(layoutRuntimeRelatedListEmptyMessage(householdMembersItem, context)).toBe(
            "No other household members on this record yet.",
        );
    });
});

describe("child drawer household lists exclude current child", () => {
    it("filters household_children rows for child drawer subject", () => {
        const record = stampLayoutRuntimeActiveRecordContext(
            {
                id: "child-viewer",
                household_children: [
                    {
                        id: "child-viewer",
                        person_id: "child-viewer",
                        "child.id": "child-viewer",
                        "child.name": "Riley Brooks",
                    },
                    {
                        id: "child-sibling",
                        person_id: "child-sibling",
                        "child.id": "child-sibling",
                        "child.name": "Sam Johnson",
                    },
                ],
            },
            { anchorEntity: "child", entityId: "child-viewer" },
        );

        const rows = readLayoutRuntimeRepeaterRows(record, householdChildrenItem);
        expect(rows.map((row) => row["child.name"])).toEqual(["Sam Johnson"]);
    });

    it("uses other-household empty language for family adults", () => {
        const context = resolveLayoutRuntimeActiveRecordContext(buildProofChildRecord(), {
            anchorEntity: "child",
            entityId: "proof-child-001",
        });
        expect(layoutRuntimeRelatedListEmptyMessage(familyAdultsItem, context)).toBe(
            "No other household members on this record yet.",
        );
    });
});

describe("opportunity drawer household/contact lists unchanged", () => {
    it("does not exclude primary household contacts on opportunity anchor", () => {
        const record = {
            id: "opp-1",
            _layout_runtime_anchor_entity: "opportunity",
            "opportunity.primary_person_id": "person-primary",
            "person.primary_contact_name": "Jamie Johnson",
            _opportunity_persons: [
                {
                    person_id: "person-primary",
                    display_name: "Jamie Johnson",
                    role_type: "primary_contact",
                },
                {
                    person_id: "person-guardian",
                    display_name: "Alex Johnson",
                    role_type: "guardian",
                },
            ],
        };

        const rows = readLayoutRuntimeContactRepeaterRows(record, householdMembersItem);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.some((row) => row.person_id === "person-primary")).toBe(true);
    });

    it("keeps opportunity empty copy without other-language", () => {
        const context = resolveLayoutRuntimeActiveRecordContext({
            id: "opp-1",
            _layout_runtime_anchor_entity: "opportunity",
        });
        expect(layoutRuntimeRelatedListEmptyMessage(householdMembersItem, context)).toBe(
            "No household members on this record yet.",
        );
    });

    it("does not filter opportunity child enrollment rows by default", () => {
        const record = {
            id: "opp-1",
            _layout_runtime_anchor_entity: "opportunity",
            children: [
                { id: "child-1", person_id: "child-1", "child.name": "Riley Brooks" },
                { id: "child-2", person_id: "child-2", "child.name": "Sam Johnson" },
            ],
        };
        const item: LayoutItem = {
            id: "children",
            kind: "related_list",
            refKey: "children",
            source: "children",
            columns: [{ refKey: "child.name", label: "Name", width: "medium" }],
        };
        expect(readLayoutRuntimeRepeaterRows(record, item)).toHaveLength(2);
    });
});

describe("filterRelatedListRowsExcludingActiveRecord", () => {
    it("supports explicit opportunity scope when configured", () => {
        const rows = [
            { id: "child-1", person_id: "child-1", "child.name": "Riley" },
            { id: "child-2", person_id: "child-2", "child.name": "Sam" },
        ];
        const filtered = filterRelatedListRowsExcludingActiveRecord(rows, householdChildrenItem, {
            anchorEntity: "opportunity",
            activePersonId: null,
            activeChildPersonId: null,
            scopedPersonId: null,
            scopedChildPersonId: "child-1",
        });
        expect(filtered.map((row) => row.id)).toEqual(["child-2"]);
    });
});
