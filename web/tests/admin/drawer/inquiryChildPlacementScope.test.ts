import { describe, expect, it } from "vitest";
import {
    buildInquiryChildCohortOptionsFromProgramItems,
    isInquiryChildPlacementProgramFieldDisabled,
    suggestCohortKeyFromProgramType,
    validateInquiryChildPlacementPatch,
} from "@/lib/admin/drawer/inquiryChildPlacementScope";

describe("inquiryChildPlacementScope", () => {
    it("requires site before program or cohort", () => {
        const r = validateInquiryChildPlacementPatch({
            location_id: null,
            program_room_cohort_key: "infant",
        });
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === "cohort_without_site")).toBe(true);
    });

    it("passes when site and cohort are set", () => {
        const r = validateInquiryChildPlacementPatch({
            location_id: "loc-1",
            program_room_cohort_key: "infant",
        });
        expect(r.ok).toBe(true);
    });

    it("disables program fields until site is selected", () => {
        expect(isInquiryChildPlacementProgramFieldDisabled(null)).toBe(true);
        expect(isInquiryChildPlacementProgramFieldDisabled("loc-1")).toBe(false);
    });

    it("builds cohort options from program option set", () => {
        const opts = buildInquiryChildCohortOptionsFromProgramItems([
            { item_key: "infant", label: "Infant" },
        ]);
        expect(opts[0]).toEqual({ cohort_key: "infant", label: "Infant" });
    });

    it("suggests cohort from program type", () => {
        expect(suggestCohortKeyFromProgramType("toddler")).toBe("toddler");
        expect(suggestCohortKeyFromProgramType("")).toBeNull();
    });
});
