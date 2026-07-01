import { describe, expect, it } from "vitest";
import {
    assertSectionSafeToDelete,
    normalizeSectionSortOrders,
    sectionSortOrdersFromKeyOrder,
    validateFieldSectionAssignment,
    validateSectionReorder,
} from "@/lib/fields/sectionManagement";

describe("sectionManagement", () => {
    it("normalizes section sort order deterministically", () => {
        const ordered = normalizeSectionSortOrders([
            { section_key: "b", sort_order: 20 },
            { section_key: "a", sort_order: 10 },
            { section_key: "c", sort_order: 10 },
        ]);
        expect(ordered.map((s) => s.section_key)).toEqual(["a", "c", "b"]);
    });

    it("validates section reorder as full permutation", () => {
        const sections = [{ section_key: "a" }, { section_key: "b" }];
        expect(validateSectionReorder(["b", "a"], sections).ok).toBe(true);
        expect(validateSectionReorder(["b"], sections).ok).toBe(false);
        expect(validateSectionReorder(["b", "b"], sections).ok).toBe(false);
    });

    it("blocks delete when fields remain", () => {
        const r = assertSectionSafeToDelete("quote", 3);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.field_definition_count).toBe(3);
    });

    it("rejects assignment to archived section", () => {
        const r = validateFieldSectionAssignment({
            section_key: "old",
            entity_type: "opportunity",
            sections: [{ section_key: "old", entity_type: "opportunity", is_archived: true }],
        });
        expect(r.ok).toBe(false);
    });

    it("assigns contiguous sort orders from key order", () => {
        expect(sectionSortOrdersFromKeyOrder(["c", "a", "b"])).toEqual({ c: 10, a: 20, b: 30 });
    });
});
