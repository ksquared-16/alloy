import { describe, expect, it } from "vitest";

import { stampLayoutRuntimeActiveRecordContext } from "@/lib/layout/runtime/layoutRuntimeRelatedListActiveRecord";
import {
    resolveLayoutRuntimeOpportunityRelationshipContactGroups,
    resolveLayoutRuntimeRelatedChildrenForPerson,
    resolveLayoutRuntimeScopedRelationshipContacts,
} from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";
import type { ChildScopedContactLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

const childA = "child-a";
const childB = "child-b";
const memberA = "member-a";
const memberB = "member-b";
const guardianA = "guardian-a";
const guardianB = "guardian-b";
const emergencyA = "emergency-a";
const emergencyB = "emergency-b";

function scopedLink(input: Partial<ChildScopedContactLinkRow> & Pick<ChildScopedContactLinkRow, "customer_member_id" | "display_name" | "role_type">): ChildScopedContactLinkRow {
    return {
        child_person_id: null,
        person_id: null,
        contact_id: null,
        role_label: input.role_type,
        is_primary: false,
        phone: null,
        email: null,
        sort_order: null,
        ...input,
    };
}

describe("child-scoped guardians differ per child in same household", () => {
    const householdAdults = [
        {
            person_id: guardianA,
            customer_id: "cust-1",
            display_name: "Jordan Lee",
            role_type: "guardian",
            role_label: "Guardian",
            is_primary: true,
            is_household_primary_contact: true,
        },
        {
            person_id: guardianB,
            customer_id: "cust-1",
            display_name: "Alex Johnson",
            role_type: "guardian",
            role_label: "Guardian",
            is_primary: false,
            is_household_primary_contact: false,
        },
    ];

    const childScopedLinks: ChildScopedContactLinkRow[] = [
        scopedLink({
            customer_member_id: memberA,
            child_person_id: childA,
            person_id: guardianA,
            display_name: "Jordan Lee",
            role_type: "guardian",
        }),
        scopedLink({
            customer_member_id: memberB,
            child_person_id: childB,
            person_id: guardianB,
            display_name: "Alex Johnson",
            role_type: "guardian",
        }),
    ];

    it("two children in same household can show different guardians", () => {
        const recordA = stampLayoutRuntimeActiveRecordContext(
            {
                id: childA,
                customer_member_id: memberA,
                _child_scoped_contact_links: childScopedLinks,
                _household_adult_links: householdAdults,
            },
            { anchorEntity: "child", entityId: childA },
        );
        const recordB = stampLayoutRuntimeActiveRecordContext(
            {
                id: childB,
                customer_member_id: memberB,
                _child_scoped_contact_links: childScopedLinks,
                _household_adult_links: householdAdults,
            },
            { anchorEntity: "child", entityId: childB },
        );

        expect(resolveLayoutRuntimeScopedRelationshipContacts(recordA, "guardians_for_child").map((r) => r.display_name)).toEqual([
            "Jordan Lee",
        ]);
        expect(resolveLayoutRuntimeScopedRelationshipContacts(recordB, "guardians_for_child").map((r) => r.display_name)).toEqual([
            "Alex Johnson",
        ]);
    });

    it("two children in same household can show different emergency contacts", () => {
        const emergencyLinks: ChildScopedContactLinkRow[] = [
            scopedLink({
                customer_member_id: memberA,
                child_person_id: childA,
                person_id: emergencyA,
                display_name: "Pat Lee",
                role_type: "emergency_contact",
            }),
            scopedLink({
                customer_member_id: memberB,
                child_person_id: childB,
                person_id: emergencyB,
                display_name: "Sam Walsh",
                role_type: "emergency_contact",
            }),
        ];

        const recordA = stampLayoutRuntimeActiveRecordContext(
            { id: childA, customer_member_id: memberA, _child_scoped_contact_links: emergencyLinks },
            { anchorEntity: "child", entityId: childA },
        );
        const recordB = stampLayoutRuntimeActiveRecordContext(
            { id: childB, customer_member_id: memberB, _child_scoped_contact_links: emergencyLinks },
            { anchorEntity: "child", entityId: childB },
        );

        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(recordA, "emergency_contacts_for_child").map((r) => r.display_name),
        ).toEqual(["Pat Lee"]);
        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(recordB, "emergency_contacts_for_child").map((r) => r.display_name),
        ).toEqual(["Sam Walsh"]);
    });
});

describe("child drawer excludes active child and shows guardians", () => {
    it("excludes active child but shows correct guardians", () => {
        const record = stampLayoutRuntimeActiveRecordContext(
            {
                id: childA,
                customer_member_id: memberA,
                _child_scoped_contact_links: [
                    scopedLink({
                        customer_member_id: memberA,
                        child_person_id: childA,
                        person_id: childA,
                        display_name: "Riley Brooks",
                        role_type: "child",
                    }),
                    scopedLink({
                        customer_member_id: memberA,
                        child_person_id: childA,
                        person_id: guardianA,
                        display_name: "Jordan Lee",
                        role_type: "guardian",
                        is_primary: true,
                    }),
                ],
            },
            { anchorEntity: "child", entityId: childA },
        );

        const guardians = resolveLayoutRuntimeScopedRelationshipContacts(record, "guardians_for_child");
        expect(guardians.map((g) => g.display_name)).toEqual(["Jordan Lee"]);
        expect(guardians.some((g) => g.person_id === childA)).toBe(false);
    });
});

describe("person drawer related children for person", () => {
    it("shows only children linked to that person with per-child contacts", () => {
        const parentId = "parent-1";
        const record = {
            id: parentId,
            _person_relationships: [
                {
                    from_person_id: parentId,
                    to_person_id: childA,
                    relationship_type: "parent",
                    _other_person_id: childA,
                    _other_person_name: "Riley Brooks",
                },
            ],
            _household_child_links: [
                {
                    customer_member_id: memberA,
                    person_id: childA,
                    display_name: "Riley Brooks",
                    customer_id: "cust-1",
                },
                {
                    customer_member_id: memberB,
                    person_id: childB,
                    display_name: "Sam Johnson",
                    customer_id: "cust-1",
                },
            ],
            _child_scoped_contact_links: [
                scopedLink({
                    customer_member_id: memberA,
                    child_person_id: childA,
                    person_id: emergencyA,
                    display_name: "Pat Lee",
                    role_type: "emergency_contact",
                }),
            ],
        };

        const groups = resolveLayoutRuntimeRelatedChildrenForPerson(record);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.title).toBe("Riley Brooks");
        expect(groups[0]?.contacts.map((c) => c.display_name)).toEqual(["Pat Lee"]);
    });
});

describe("opportunity drawer multi-child grouping", () => {
    it("does not flatten contacts into one ambiguous list", () => {
        const record = {
            id: "opp-1",
            _layout_runtime_anchor_entity: "opportunity",
            children: [
                {
                    id: childA,
                    person_id: childA,
                    customer_member_id: memberA,
                    "child.name": "Riley Brooks",
                },
                {
                    id: childB,
                    person_id: childB,
                    customer_member_id: memberB,
                    "child.name": "Sam Johnson",
                },
            ],
            _child_scoped_contact_links: [
                scopedLink({
                    customer_member_id: memberA,
                    child_person_id: childA,
                    person_id: guardianA,
                    display_name: "Jordan Lee",
                    role_type: "guardian",
                }),
                scopedLink({
                    customer_member_id: memberB,
                    child_person_id: childB,
                    person_id: guardianB,
                    display_name: "Alex Johnson",
                    role_type: "guardian",
                }),
            ],
        };

        const groups = resolveLayoutRuntimeOpportunityRelationshipContactGroups(record, "guardians_for_child");
        expect(groups).toHaveLength(2);
        expect(groups.map((g) => g.title)).toEqual(["Riley Brooks", "Sam Johnson"]);
        expect(groups[0]?.contacts.map((c) => c.display_name)).toEqual(["Jordan Lee"]);
        expect(groups[1]?.contacts.map((c) => c.display_name)).toEqual(["Alex Johnson"]);
    });
});
