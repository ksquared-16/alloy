import { describe, expect, it } from "vitest";
import {
    filterProgramIdsForLocations,
    programOptionsForDisplay,
    resolveRoomsForProgramCategoryRow,
    roomAudienceBuilderState,
    siteLocationOptionsFromHierarchy,
    statusOptionsForDisplay,
} from "@/lib/communications/v2/audienceOptionLabels";

describe("audienceOptionLabels", () => {
    it("site locations include only physical schools, not unit/classroom rows", () => {
        const hierarchy = [
            { id: "site-north", label: "North Campus", location_type: "site", parent_location_id: null, is_active: true },
            { id: "room-infant-a", label: "Infant A", location_type: "unit", parent_location_id: "site-north", is_active: true },
            { id: "room-toddler", label: "Toddler Room", location_type: "unit", parent_location_id: "site-north", is_active: true },
        ];
        expect(siteLocationOptionsFromHierarchy(hierarchy)).toEqual([{ id: "site-north", label: "North Campus" }]);
    });

    it("disambiguates duplicate program labels with location context when multiple sites are in scope", () => {
        const programs = [
            { id: "p1", label: "Infant", location_id: "loc-a", key: "infant" },
            { id: "p2", label: "Infant", location_id: "loc-b", key: "infant" },
        ];
        const locs = new Map([
            ["loc-a", "North Campus"],
            ["loc-b", "South Campus"],
        ]);
        const out = programOptionsForDisplay(programs, locs, []);
        expect(out).toEqual([
            { id: "p1", label: "Infant · North Campus" },
            { id: "p2", label: "Infant · South Campus" },
        ]);
    });

    it("dedupes duplicate program labels for a single selected location", () => {
        const programs = [
            { id: "p1", label: "Toddler", location_id: "loc-a", key: "toddler" },
            { id: "p2", label: "Toddler", location_id: "loc-a", key: "toddler" },
            { id: "p3", label: "Preschool", location_id: "loc-a", key: "preschool" },
        ];
        const locs = new Map([["loc-a", "North Campus"]]);
        expect(programOptionsForDisplay(programs, locs, ["loc-a"])).toEqual([
            { id: "p3", label: "Preschool" },
            { id: "p1", label: "Toddler" },
        ]);
    });

    it("program options exclude rows missing location_id", () => {
        const programs = [
            { id: "p1", label: "Infant", location_id: "site-a", key: "infant" },
            { id: "p2", label: "Infant", location_id: "", key: "infant" },
        ];
        const locs = new Map([["site-a", "North Campus"]]);
        expect(programOptionsForDisplay(programs, locs, [])).toEqual([{ id: "p1", label: "Infant" }]);
    });

    it("filters programs when locations are selected", () => {
        const programs = [
            { id: "p1", label: "Toddler", location_id: "loc-a", key: "toddler" },
            { id: "p2", label: "Preschool", location_id: "loc-b", key: "preschool" },
        ];
        expect(filterProgramIdsForLocations(["p1", "p2"], programs, ["loc-a"])).toEqual(["p1"]);
    });

    it("dedupes duplicate status labels using status_key", () => {
        const out = statusOptionsForDisplay([
            { status_key: "active", label: "Active" },
            { status_key: "active_copy", label: "Active" },
        ]);
        expect(out).toEqual([
            { id: "active", label: "Active (active)" },
            { id: "active_copy", label: "Active (active_copy)" },
        ]);
    });

    it("enables room options when hierarchy has units for one location and program", () => {
        const hierarchy = [
            {
                id: "room-1",
                label: "Infant A",
                location_type: "unit",
                parent_location_id: "loc-a",
                is_active: true,
                metadata: { category: "infant" },
            },
        ];
        const programs = [{ id: "p1", label: "Infant", location_id: "loc-a", key: "infant" }];
        const locs = new Map([["loc-a", "North Campus"]]);
        const state = roomAudienceBuilderState(hierarchy, programs, ["loc-a"], ["p1"], locs);
        expect(state.enabled).toBe(true);
        expect(state.options).toEqual([{ id: "room-1", label: "Infant A" }]);
    });

    it("resolves rooms when unit metadata stores program category id instead of key", () => {
        const hierarchy = [
            {
                id: "room-toddler",
                label: "Toddler Room",
                location_type: "unit",
                parent_location_id: "loc-a",
                is_active: true,
                metadata: { category: "cat-toddler-id" },
            },
        ];
        const programs = [{ id: "cat-toddler-id", label: "Toddler", location_id: "loc-a", key: "toddler" }];
        expect(resolveRoomsForProgramCategoryRow(hierarchy, "loc-a", programs[0])).toEqual([
            { id: "room-toddler", label: "Toddler Room" },
        ]);
    });

    it("shows a precise empty reason when no classrooms exist for location and program", () => {
        const hierarchy = [
            {
                id: "site-a",
                label: "North Campus",
                location_type: "site",
                parent_location_id: null,
                is_active: true,
            },
        ];
        const programs = [{ id: "p1", label: "Toddler", location_id: "loc-a", key: "toddler" }];
        const locs = new Map([["loc-a", "North Campus"]]);
        const state = roomAudienceBuilderState(hierarchy, programs, ["loc-a"], ["p1"], locs);
        expect(state.enabled).toBe(false);
        expect(state.helper).toBe("No classrooms are configured for North Campus → Toddler.");
    });
});
