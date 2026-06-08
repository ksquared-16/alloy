import { describe, expect, it } from "vitest";
import {
    normalizeSortOrdersInSection,
    validateFieldPlacementBatch,
} from "@/lib/fields/fieldPlacementBatch";

const sections = [
    { section_key: "inquiry", entity_type: "opportunity", is_archived: false },
    { section_key: "retired", entity_type: "opportunity", is_archived: true },
];

const fields = [
    {
        id: "f1",
        entity_type: "opportunity",
        field_key: "notes",
        section_key: "inquiry",
        sort_order: 10,
        is_system: false,
    },
    {
        id: "f2",
        entity_type: "opportunity",
        field_key: "source",
        section_key: "inquiry",
        sort_order: 20,
        is_system: false,
    },
];

describe("validateFieldPlacementBatch", () => {
    it("accepts valid section_key and sort_order updates", () => {
        const r = validateFieldPlacementBatch(
            {
                entity_type: "opportunity",
                updates: [{ id: "f1", section_key: "inquiry", sort_order: 30 }],
            },
            fields,
            sections
        );
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.normalized[0]).toEqual({ id: "f1", section_key: "inquiry", sort_order: 30 });
        }
    });

    it("rejects archived section", () => {
        const r = validateFieldPlacementBatch(
            { entity_type: "opportunity", updates: [{ id: "f1", section_key: "retired" }] },
            fields,
            sections
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/archived/i);
    });

    it("rejects unknown field id", () => {
        const r = validateFieldPlacementBatch(
            { entity_type: "opportunity", updates: [{ id: "missing" }] },
            fields,
            sections
        );
        expect(r.ok).toBe(false);
    });

    it("normalizes sort order gaps in section", () => {
        expect(normalizeSortOrdersInSection(["f2", "f1"])).toEqual({ f2: 10, f1: 20 });
    });
});
