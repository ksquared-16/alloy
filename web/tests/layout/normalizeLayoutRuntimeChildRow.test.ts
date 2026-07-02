import { describe, expect, it } from "vitest";
import {
    normalizeLayoutRuntimeChildRow,
    normalizeLayoutRuntimeChildRows,
} from "@/lib/layout/runtime/normalizeLayoutRuntimeChildRow";

describe("normalizeLayoutRuntimeChildRow", () => {
    it("maps nested child object to flat child.* refKeys", () => {
        const row = normalizeLayoutRuntimeChildRow(
            {
                id: "cm-1",
                customer_member_id: "cm-1",
                child: {
                    id: "person-1",
                    first_name: "Jim",
                    last_name: "Pat",
                    display_name: "Jim Pat",
                },
            },
            0,
        );
        expect(row?.["child.first_name"]).toBe("Jim");
        expect(row?.["child.last_name"]).toBe("Pat");
        expect(row?.["child.name"]).toBe("Jim Pat");
        expect(row?.["child.id"]).toBe("person-1");
    });

    it("maps flat child.* keys without nested object", () => {
        const row = normalizeLayoutRuntimeChildRow(
            {
                id: "row-1",
                "child.first_name": "Alex",
                "child.last_name": "Johnson",
                "child.id": "p1",
            },
            0,
        );
        expect(row?.["child.first_name"]).toBe("Alex");
        expect(row?.["child.name"]).toBe("Alex Johnson");
    });

    it("flags name-only flat rows for downstream enrichment", () => {
        const row = normalizeLayoutRuntimeChildRow(
            { "child.name": "Jim Pat", id: "child-row-0" },
            0,
        );
        expect(row?.["child.name"]).toBe("Jim Pat");
        expect(row?.person_id).toBe("");
        expect(row?.["child.id"]).toBe("");
        expect(row?._layout_runtime_child_id_source).toBe("name_only_pending_enrichment");
    });

    it("normalizes VM inquiry block shape", () => {
        const rows = normalizeLayoutRuntimeChildRows([
            {
                id: "ocm-1",
                customer_member_id: "cm-1",
                person_id: "person-1",
                first_name: "Jim",
                last_name: "Pat",
                display_name: "Jim Pat",
                program_category_id: "cat-infant",
            },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["child.first_name"]).toBe("Jim");
        expect(rows[0]?.["inquiry_child.program_category_id"]).toBe("cat-infant");
    });
});
