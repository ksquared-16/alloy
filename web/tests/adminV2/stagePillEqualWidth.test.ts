import { describe, expect, it } from "vitest";
import { computeEqualStagePillGrid } from "@/lib/workspace/stagePillEqualWidth";

describe("stagePillEqualWidth", () => {
    it("uses longest label to size every pill column equally", () => {
        const grid = computeEqualStagePillGrid([
            "New Leads",
            "Qualification",
            "Enrolling",
        ]);
        expect(grid.pillCount).toBe(3);
        expect(grid.gridTemplateColumns).toContain("repeat(3,");
        expect(grid.gridTemplateColumns).toContain("ch");
    });
});
