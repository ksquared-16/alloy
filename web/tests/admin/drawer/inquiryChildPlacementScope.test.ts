import { describe, expect, it } from "vitest";
import {
    buildInquiryChildRoomOptionsForSite,
    filterInquiryChildSiteLocationOptions,
    isInquiryChildPlacementProgramFieldDisabled,
    validateInquiryChildPlacementPatch,
} from "@/lib/admin/drawer/inquiryChildPlacementScope";

describe("inquiryChildPlacementScope", () => {
    const hierarchy = [
        { id: "site-north", label: "North Campus", location_type: "site", parent_location_id: null },
        { id: "site-bright", label: "BrightStart Learning Center", location_type: "site", parent_location_id: null },
        { id: "room-infant-a", label: "Infant A", location_type: "unit", parent_location_id: "site-north" },
        { id: "room-preschool-1", label: "Preschool 1", location_type: "unit", parent_location_id: "site-north" },
        { id: "room-prek", label: "Pre-K", location_type: "unit", parent_location_id: "site-bright" },
    ];

    it("requires site before program or cohort", () => {
        const r = validateInquiryChildPlacementPatch({
            location_id: null,
            program_room_cohort_key: "room-infant-a",
        });
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === "cohort_without_site")).toBe(true);
    });

    it("passes when site and cohort are set", () => {
        const r = validateInquiryChildPlacementPatch({
            location_id: "site-north",
            program_room_cohort_key: "room-infant-a",
        });
        expect(r.ok).toBe(true);
    });

    it("disables program fields until site is selected", () => {
        expect(isInquiryChildPlacementProgramFieldDisabled(null)).toBe(true);
        expect(isInquiryChildPlacementProgramFieldDisabled("site-north")).toBe(false);
    });

    it("site options exclude classrooms and include physical sites only", () => {
        const opts = filterInquiryChildSiteLocationOptions(hierarchy);
        expect(opts.map((o) => o.label)).toEqual(["BrightStart Learning Center", "North Campus"]);
        expect(opts.some((o) => o.label === "Infant A")).toBe(false);
    });

    it("room options exclude locations and respect selected site", () => {
        const northRooms = buildInquiryChildRoomOptionsForSite(hierarchy, "site-north");
        expect(northRooms.map((o) => o.label)).toEqual(["Infant A", "Preschool 1"]);
        expect(northRooms.some((o) => o.label.includes("Campus"))).toBe(false);

        const brightRooms = buildInquiryChildRoomOptionsForSite(hierarchy, "site-bright");
        expect(brightRooms.map((o) => o.label)).toEqual(["Pre-K"]);

        expect(buildInquiryChildRoomOptionsForSite(hierarchy, null)).toEqual([]);
    });
});
