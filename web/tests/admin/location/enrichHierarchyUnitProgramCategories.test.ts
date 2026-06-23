import { describe, expect, it } from "vitest";
import { enrichHierarchyUnitsWithProgramCategories } from "@/lib/admin/location/enrichHierarchyUnitProgramCategories";

describe("enrichHierarchyUnitsWithProgramCategories", () => {
    it("merges classroom_age_group field_values onto unit metadata.category when missing", () => {
        const locations = [
            {
                id: "room-1",
                location_type: "unit",
                metadata: { semantic_kind: "classroom" },
            },
        ];
        const enriched = enrichHierarchyUnitsWithProgramCategories(locations, [
            { entity_id: "room-1", value_text: "toddler" },
        ]);
        expect((enriched[0]?.metadata as Record<string, unknown>).category).toBe("toddler");
    });

    it("does not overwrite an existing metadata.category", () => {
        const locations = [
            {
                id: "room-1",
                location_type: "unit",
                metadata: { category: "infant" },
            },
        ];
        const enriched = enrichHierarchyUnitsWithProgramCategories(locations, [
            { entity_id: "room-1", value_text: "toddler" },
        ]);
        expect((enriched[0]?.metadata as Record<string, unknown>).category).toBe("infant");
    });
});
