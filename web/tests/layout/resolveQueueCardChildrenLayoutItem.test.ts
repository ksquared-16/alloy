import { describe, expect, it } from "vitest";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import { resolveQueueCardChildrenRepeaterItem } from "@/lib/layout/runtime/resolveQueueCardChildrenLayoutItem";

function scalarQueueDocV9Shape(): { zoneItems: LayoutItem[] } {
    const childLink = {
        position: "left" as const,
        icon: "child" as const,
        action: { type: "open_drawer" as const, entity: "child" as const, idPath: "child.id" },
    };
    const zoneItems: LayoutItem[] = [
        {
            id: "q-child-first",
            kind: "field",
            refKey: "child.first_name",
            label: "First Name",
            renderHint: "text",
            metadata: { zone: "body.children" },
            adornment: childLink,
        },
        {
            id: "q-child-last",
            kind: "field",
            refKey: "child.last_name",
            label: "Last Name",
            renderHint: "text",
            metadata: { zone: "body.children" },
        },
    ];
    return { zoneItems };
}

describe("resolveQueueCardChildrenRepeaterItem", () => {
    it("returns explicit related_list when present", () => {
        const doc = buildLeadQueueDefaultDoc();
        const zoneItems = doc.sections[0]!.rows[0]!.columns[0]!.items.filter(
            (item) => (item.metadata as { zone?: string } | undefined)?.zone === "body.children",
        );
        const record = {
            id: "opp-1",
            children: [{ "child.name": "Alex Johnson", "child.id": "p1" }],
        };
        const item = resolveQueueCardChildrenRepeaterItem(zoneItems, record);
        expect(item?.kind).toBe("related_list");
        expect(item?.columns?.[0]?.refKey).toBe("child.name");
    });

    it("fills empty related_list columns from scalar child fields in the same zone", () => {
        const childLink = {
            position: "left" as const,
            icon: "child" as const,
            action: { type: "open_drawer" as const, entity: "child" as const, idPath: "child.id" },
        };
        const zoneItems: LayoutItem[] = [
            {
                id: "q-children-list",
                kind: "related_list",
                refKey: "children",
                source: "children",
                displayMode: "rows",
                related: { entityType: "child" },
                columns: [],
                metadata: { zone: "body.children" },
            },
            {
                id: "q-child-first",
                kind: "field",
                refKey: "child.first_name",
                label: "First Name",
                renderHint: "text",
                metadata: { zone: "body.children" },
                adornment: childLink,
            },
            {
                id: "q-child-last",
                kind: "field",
                refKey: "child.last_name",
                label: "Last Name",
                renderHint: "text",
                metadata: { zone: "body.children" },
            },
        ];
        const record = {
            id: "opp-1",
            children: [
                {
                    "child.first_name": "Jim",
                    "child.last_name": "Pat",
                    "child.name": "Jim Pat",
                    "child.id": "person-1",
                },
            ],
        };
        const item = resolveQueueCardChildrenRepeaterItem(zoneItems, record);
        expect(item?.columns?.map((c) => c.refKey)).toEqual(["child.first_name", "child.last_name"]);
        expect(item?.columns?.[0]?.adornment?.action?.entity).toBe("child");
    });

    it("infers columns from row shape when related_list has no columns and no scalar fields", () => {
        const zoneItems: LayoutItem[] = [
            {
                id: "q-children-list",
                kind: "related_list",
                refKey: "children",
                source: "children",
                displayMode: "rows",
                related: { entityType: "child" },
                columns: [],
                metadata: { zone: "body.children" },
            },
        ];
        const record = {
            id: "opp-1",
            children: [{ "child.name": "Jim Pat", "child.id": "person-1" }],
        };
        const item = resolveQueueCardChildrenRepeaterItem(zoneItems, record);
        expect(item?.columns?.[0]?.refKey).toBe("child.name");
    });

    it("synthesizes related_list from scalar child.* fields (published queue v9 shape)", () => {
        const { zoneItems } = scalarQueueDocV9Shape();
        const record = {
            id: "opp-1",
            children: [
                {
                    "child.first_name": "Jim",
                    "child.last_name": "Pat",
                    "child.name": "Jim Pat",
                    "child.id": "person-1",
                },
                {
                    "child.first_name": "Alex",
                    "child.last_name": "Johnson",
                    "child.name": "Alex Johnson",
                    "child.id": "person-2",
                },
            ],
        };
        const item = resolveQueueCardChildrenRepeaterItem(zoneItems, record);
        expect(item?.kind).toBe("related_list");
        expect(item?.columns?.map((c) => c.refKey)).toEqual(["child.first_name", "child.last_name"]);
    });
});
