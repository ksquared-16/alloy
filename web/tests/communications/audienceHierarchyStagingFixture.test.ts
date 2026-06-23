import { describe, expect, it } from "vitest";
import {
    parseProgramOptionRowsFromApi,
    stagingAudienceHierarchyFixture,
    unitMatchesProgramCategoryRow,
} from "@/lib/communications/v2/audienceHierarchy";
import {
    programOptionsForDisplay,
    resolveRoomsForProgramCategoryRow,
    roomAudienceBuilderState,
} from "@/lib/communications/v2/audienceOptionLabels";
import { enrichHierarchyUnitsWithProgramCategories } from "@/lib/admin/location/enrichHierarchyUnitProgramCategories";

describe("staging audience hierarchy fixture", () => {
    const { hierarchy, programCategories } = stagingAudienceHierarchyFixture();

    it("scopes program categories to site locations only", () => {
        const rows = parseProgramOptionRowsFromApi(
            [
                ...programCategories,
                { id: "bad", label: "Infant", location_id: "room-north-toddler-a", key: "infant" },
            ],
            hierarchy
        );
        expect(rows.some((r) => r.location_id === "room-north-toddler-a")).toBe(false);
        expect(rows.some((r) => r.location_id === "site-north")).toBe(true);
    });

    it("dedupes program names for one selected school", () => {
        const locs = new Map([
            ["site-north", "North Campus"],
            ["site-south", "South Campus"],
        ]);
        const display = programOptionsForDisplay(programCategories, locs, ["site-north"]);
        expect(display.map((o) => o.label)).toEqual(["Infant", "Pre-K", "Preschool", "School Age", "Toddler"]);
    });

    it("resolves toddler rooms when unit metadata.category matches program key", () => {
        const toddler = programCategories.find((p) => p.id === "cat-n-toddler")!;
        expect(resolveRoomsForProgramCategoryRow(hierarchy, "site-north", toddler).map((o) => o.label)).toEqual([
            "Toddler Room A",
        ]);
    });

    it("resolves rooms after field_values enrichment supplies missing metadata.category", () => {
        const enrichedHierarchy = enrichHierarchyUnitsWithProgramCategories(hierarchy, [
            { entity_id: "room-north-toddler-b", value_text: "toddler" },
        ]) as typeof hierarchy;
        const toddler = programCategories.find((p) => p.id === "cat-n-toddler")!;
        const rooms = resolveRoomsForProgramCategoryRow(enrichedHierarchy, "site-north", toddler);
        expect(rooms.map((o) => o.label)).toEqual(["Toddler Room A", "Toddler Room B"]);
    });

    it("matches program category by label token when metadata stores display label", () => {
        const row = {
            id: "room-x",
            label: "Room X",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { category: "Pre-K" },
        };
        const program = programCategories.find((p) => p.key === "pre_k")!;
        expect(unitMatchesProgramCategoryRow(row, program)).toBe(true);
    });

    it("reports classrooms present but unmatched separately from none configured", () => {
        const locs = new Map([["site-north", "North Campus"]]);
        const state = roomAudienceBuilderState(hierarchy, programCategories, ["site-north"], ["cat-n-infant"], locs);
        expect(state.enabled).toBe(false);
        expect(state.helper).toBe("No classrooms match Infant at North Campus.");
    });
});
