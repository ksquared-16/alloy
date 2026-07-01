import { describe, expect, it } from "vitest";
import {
    resolveLayoutRuntimeChildPersonId,
    resolveLayoutRuntimeLinkedEntityId,
    resolveLayoutRuntimePersonIdForOpen,
} from "@/lib/layout/runtime/resolveLayoutRuntimeLinkedEntityId";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import { mapVmInquiryChildrenToLayoutRuntimeRows } from "@/lib/layout/runtime/mapLayoutRuntimeChildrenRows";

describe("resolveLayoutRuntimeLinkedEntityId", () => {
    it("resolves child person id from child.id", () => {
        expect(
            resolveLayoutRuntimeChildPersonId({
                "child.id": "person-2",
                "child.name": "Alex",
            }),
        ).toBe("person-2");
    });

    it("resolves child person id from inquiry children when row only has customer_member_id", () => {
        const anchor = {
            id: "opp-1",
            _inquiry_children: [
                { id: "ocm-1", customer_member_id: "cm-1", person_id: "person-1", display_name: "Jim Pat" },
            ],
        };
        expect(
            resolveLayoutRuntimeChildPersonId(
                { customer_member_id: "cm-1", id: "child-row-0", "child.name": "Jim Pat" },
                undefined,
                undefined,
                anchor,
            ),
        ).toBe("person-1");
    });

    it("rejects synthetic child-row fallback ids as drawer targets", () => {
        expect(
            resolveLayoutRuntimeChildPersonId({ id: "child-row-0", "child.name": "Alex" }),
        ).toBeNull();
    });

    it("resolves person id from opportunity.primary_person_id on anchor record", () => {
        const anchor = {
            id: "opp-1",
            "person.primary_contact_name": "Jordan",
            "opportunity.primary_person_id": "person-parent",
        };
        expect(
            resolveLayoutRuntimePersonIdForOpen(anchor, undefined, "opportunity.primary_person_id"),
        ).toBe("person-parent");
    });

    it("routes adornment actions through entity-specific resolvers", () => {
        const anchor = {
            id: "opp-1",
            "opportunity.primary_person_id": "person-parent",
            children: [{ "child.id": "child-1", "child.name": "Jim Pat" }],
        };
        const row = anchor.children[0] as Record<string, unknown>;

        expect(
            resolveLayoutRuntimeLinkedEntityId(
                { type: "open_drawer", entity: "child", idPath: "child.id" },
                { anchorRecord: anchor, rowRecord: row, refKey: "child.name" },
            ),
        ).toBe("child-1");

        expect(
            resolveLayoutRuntimeLinkedEntityId(
                { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" },
                { anchorRecord: anchor, refKey: "person.primary_contact_name" },
            ),
        ).toBe("person-parent");
    });

    it("assigns unique react keys for inquiry child rows", () => {
        const rows = mapVmInquiryChildrenToLayoutRuntimeRows([
            {
                id: "ocm-a",
                ocm_id: "ocm-a",
                customer_member_id: "cm-a",
                person_id: "p-a",
                display_name: "Alex Kelly",
                first_name: "Alex",
                last_name: "Kelly",
            },
            {
                id: "ocm-b",
                ocm_id: "ocm-b",
                customer_member_id: "cm-b",
                person_id: "p-b",
                display_name: "Sam Lee",
                first_name: "Sam",
                last_name: "Lee",
            },
        ]);
        expect(rows.length).toBe(2);
        const keys = rows.map((row, i) => layoutRuntimeRepeaterRowReactKey(row, i, "children"));
        expect(new Set(keys).size).toBe(2);
    });
});
