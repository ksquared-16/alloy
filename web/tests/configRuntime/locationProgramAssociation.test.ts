import { describe, expect, it } from "vitest";
import {
    publishedProgramsForAssignment,
    slugifyProgramKey,
} from "@/lib/programs/locationProgramAssociation";

describe("locationProgramAssociation", () => {
    it("slugifies stable Program keys", () => {
        expect(slugifyProgramKey("Pre-School A")).toBe("pre_school_a");
        expect(slugifyProgramKey("  Infant Care  ")).toBe("infant_care");
    });

    it("lists only published non-retired Programs for Location assignment", () => {
        const rows = publishedProgramsForAssignment([
            {
                id: "p1",
                key: "preschool",
                lifecycleStatus: "active",
                draft: { label: "Draft name" },
                latestPublication: {
                    id: "pub-1",
                    revision: { label: "Preschool", programKey: "preschool" },
                },
            },
            {
                id: "p2",
                key: "draft_only",
                lifecycleStatus: "active",
                draft: { label: "Not published" },
                latestPublication: null,
            },
            {
                id: "p3",
                key: "retired",
                lifecycleStatus: "retired",
                latestPublication: { id: "pub-3", revision: { label: "Retired" } },
            },
        ]);
        expect(rows).toEqual([
            {
                id: "p1",
                key: "preschool",
                label: "Preschool",
                publicationId: "pub-1",
            },
        ]);
    });
});
