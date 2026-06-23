import { describe, expect, it } from "vitest";
import {
    filterProgramIdsForLocations,
    programOptionsForDisplay,
    roomAudienceBuilderState,
    statusOptionsForDisplay,
} from "@/lib/communications/v2/audienceOptionLabels";

describe("audienceOptionLabels", () => {
    it("disambiguates duplicate program labels with location context", () => {
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
        const state = roomAudienceBuilderState(hierarchy, programs, ["loc-a"], ["p1"]);
        expect(state.enabled).toBe(true);
        expect(state.options).toEqual([{ id: "room-1", label: "Infant A" }]);
    });
});
