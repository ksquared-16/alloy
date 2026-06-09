import { describe, expect, it } from "vitest";

import { mergeOpportunityLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeOpportunityLayoutRuntimeWidgetRecord";

describe("mergeOpportunityLayoutRuntimeWidgetRecord children overlay", () => {
    it("overlays VM inquiry children when layout record children are empty", () => {
        const merged = mergeOpportunityLayoutRuntimeWidgetRecord(
            { id: "opp-1", children: [], enrollment_children: [] },
            {
                _inquiry_children: [
                    {
                        id: "row-1",
                        customer_member_id: "cm-1",
                        person_id: "person-1",
                        display_name: "Alex Johnson",
                    },
                ],
            },
        );
        const children = merged.children as Array<Record<string, unknown>>;
        expect(children.length).toBe(1);
        expect(children[0]?.["child.name"]).toBe("Alex Johnson");
        const enrollment = merged.enrollment_children as Array<Record<string, unknown>>;
        expect(enrollment[0]?.["child.id"]).toBe("person-1");
    });

    it("overlays VM inquiry children when layout rows exist but lack display names", () => {
        const merged = mergeOpportunityLayoutRuntimeWidgetRecord(
            {
                id: "opp-1",
                children: [{ id: "placeholder", "child.name": "", "child.id": "" }],
                enrollment_children: [{ id: "placeholder", "child.name": "", "child.id": "" }],
            },
            {
                _inquiry_children: [
                    {
                        id: "row-1",
                        customer_member_id: "cm-1",
                        person_id: "person-1",
                        display_name: "Alex Johnson",
                    },
                ],
            },
        );
        const children = merged.children as Array<Record<string, unknown>>;
        expect(children[0]?.["child.name"]).toBe("Alex Johnson");
        expect(merged["child.name"]).toBe("Alex Johnson");
    });

    it("does not shrink layout children when layout already has more rows", () => {
        const layoutChild = { id: "a", "child.name": "Existing", "child.id": "p1" };
        const merged = mergeOpportunityLayoutRuntimeWidgetRecord(
            { id: "opp-1", children: [layoutChild], enrollment_children: [layoutChild] },
            { _inquiry_children: [] },
        );
        const children = merged.children as Array<Record<string, unknown>>;
        expect(children[0]?.["child.name"]).toBe("Existing");
    });
});
