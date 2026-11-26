import { describe, expect, it } from "vitest";
import {
    formatWorkViewBasicsSummary,
    formatWorkViewConditionsSummary,
    formatWorkViewPresentationSummary,
    formatWorkViewVisibilitySummary,
} from "@/lib/lifecycle/workViewEditorSummaries";

describe("workViewEditorSummaries", () => {
    it("formats empty filters as catch-all summary", () => {
        expect(formatWorkViewConditionsSummary([])).toBe("All work in this process");
        expect(formatWorkViewConditionsSummary(undefined)).toBe("All work in this process");
    });

    it("formats condition summary with typed field label (legacy stage resolves to Stage)", () => {
        // V3: the process-stage field is labeled "Stage" (legacy `stage` key still canonicalizes to it).
        expect(
            formatWorkViewConditionsSummary([
                { field_key: "stage", operator: "equals", value: "lead" },
            ]),
        ).toBe("Stage equals Lead");
        expect(
            formatWorkViewConditionsSummary([
                { field_key: "opportunity_stage", operator: "equals", value: "lead" },
            ]),
        ).toBe("Stage equals Lead");
    });

    it("formats presentation summary with surface defaults", () => {
        expect(formatWorkViewPresentationSummary(undefined, undefined, [])).toBe(
            "Queue: Surface default · Drawer body: Surface default",
        );
    });

    it("formats visibility summary", () => {
        expect(formatWorkViewVisibilitySummary({ visible_in_runtime: true, display_order: 2 })).toBe(
            "Visible · Order 2",
        );
    });

    it("formats basics summary from mission", () => {
        expect(formatWorkViewBasicsSummary("Follow up on tours")).toBe("Follow up on tours");
    });
});
