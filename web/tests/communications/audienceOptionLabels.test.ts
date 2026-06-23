import { describe, expect, it } from "vitest";
import {
    filterProgramIdsForLocations,
    programOptionsForDisplay,
    statusOptionsForDisplay,
} from "@/lib/communications/v2/audienceOptionLabels";

describe("audienceOptionLabels", () => {
    it("disambiguates duplicate program labels with location context", () => {
        const programs = [
            { id: "p1", label: "Infant", location_id: "loc-a" },
            { id: "p2", label: "Infant", location_id: "loc-b" },
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
            { id: "p1", label: "Toddler", location_id: "loc-a" },
            { id: "p2", label: "Preschool", location_id: "loc-b" },
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
});
