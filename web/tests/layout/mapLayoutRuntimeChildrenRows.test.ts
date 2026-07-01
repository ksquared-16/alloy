import { describe, expect, it } from "vitest";

import { resolveOpportunityLayoutRuntimeChildrenRows } from "@/lib/layout/runtime/mapLayoutRuntimeChildrenRows";

describe("resolveOpportunityLayoutRuntimeChildrenRows", () => {
    it("merges inquiry enrollment onto household rows when both are present", () => {
        const rows = resolveOpportunityLayoutRuntimeChildrenRows({
            _inquiry_children: [
                {
                    id: "row-1",
                    customer_member_id: "cm-1",
                    person_id: "person-child-1",
                    display_name: "Alex Johnson",
                    desired_program_label: "Preschool",
                },
            ],
            _household_children: [
                {
                    id: "cm-1",
                    person_id: "person-child-1",
                    display_name: "Alex Johnson",
                },
                {
                    id: "cm-2",
                    person_id: "person-child-2",
                    display_name: "Sam Lee",
                    status_label: "Active",
                },
            ],
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]?.["child.name"]).toBe("Alex Johnson");
        expect(rows[0]?.["child.program"]).toBe("Preschool");
        expect(rows[0]?._layout_runtime_child_source).toBe("household_with_enrollment");
        expect(rows[1]?.["child.name"]).toBe("Sam Lee");
        expect(rows[1]?._layout_runtime_child_source).toBe("household_only");
    });

    it("falls back to household _children when inquiry rows are empty", () => {
        const rows = resolveOpportunityLayoutRuntimeChildrenRows({
            _inquiry_children: [],
            _children: [
                {
                    id: "cm-2",
                    person_id: "person-child-2",
                    display_name: "Sam Lee",
                    status_label: "Active",
                },
            ],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["child.name"]).toBe("Sam Lee");
        expect(rows[0]?.["child.id"]).toBe("person-child-2");
        expect(rows[0]?._layout_runtime_child_source).toBe("household_only");
    });
});
