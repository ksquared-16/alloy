import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { collectLayoutItems } from "@/lib/layout/runtime/classifyLayoutItemBinding";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";

describe("readLayoutRuntimeRepeaterRows", () => {
    it("reads children when source is enrollment_children but record only has children", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const item = collectLayoutItems(doc).find((i) => i.kind === "related_list" && i.refKey === "children")!;
        const enrollmentItem = { ...item, refKey: "enrollment_children", source: "enrollment_children" };
        const record = {
            id: "opp-1",
            children: [{ id: "c1", "child.id": "p1", "child.name": "Alex Johnson" }],
        };
        const rows = readLayoutRuntimeRepeaterRows(record, enrollmentItem);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["child.name"]).toBe("Alex Johnson");
    });

    it("maps VM-shaped _inquiry_children when configured source misses", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const item = collectLayoutItems(doc).find((i) => i.kind === "related_list" && i.refKey === "children")!;
        const record = {
            id: "opp-1",
            children: [],
            enrollment_children: [],
            _inquiry_children: [
                {
                    id: "ocm-1",
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    first_name: "Jim",
                    last_name: "Pat",
                    display_name: "Jim Pat",
                },
            ],
        };
        const rows = readLayoutRuntimeRepeaterRows(record, item);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["child.name"]).toBe("Jim Pat");
        expect(rows[0]?.["child.first_name"]).toBe("Jim");
        expect(rows[0]?.["child.id"]).toBe("person-1");
    });

    it("resolves v10 list displayMode columns from normalized rows", () => {
        const item = {
            id: "children-list",
            kind: "related_list" as const,
            refKey: "children",
            source: "children",
            displayMode: "list" as const,
            columns: [
                { refKey: "child.first_name", label: "First Name" },
                { refKey: "child.last_name", label: "Last Name" },
            ],
        };
        const record = {
            id: "opp-1",
            _inquiry_children: [{ first_name: "Jim", last_name: "Pat", person_id: "p1" }],
        };
        const rows = readLayoutRuntimeRepeaterRows(record, item);
        expect(rows[0]?.["child.first_name"]).toBe("Jim");
        expect(rows[0]?.["child.last_name"]).toBe("Pat");
    });

    it("backfills person_id on name-only children rows from anchor _inquiry_children", () => {
        const item = {
            id: "children-list",
            kind: "related_list" as const,
            refKey: "children",
            source: "children",
        };
        const record = {
            id: "opp-1",
            children: [{ "child.name": "Jim Pat", "child.display_name": "Jim Pat", id: "child-row-0" }],
            _inquiry_children: [
                {
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    first_name: "Jim",
                    last_name: "Pat",
                    display_name: "Jim Pat",
                },
            ],
        };
        const rows = readLayoutRuntimeRepeaterRows(record, item);
        expect(rows[0]?.person_id).toBe("person-1");
        expect(rows[0]?.["child.id"]).toBe("person-1");
        expect(rows[0]?._layout_runtime_child_mapper_source).toBe("anchor._inquiry_children");
        expect(rows[0]?._layout_runtime_child_collection_key).toBe("children");
    });
});
