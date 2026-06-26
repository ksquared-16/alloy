import { describe, expect, it } from "vitest";
import {
    formatWorkViewBasicsSummary,
    formatWorkViewConditionsSummary,
    formatWorkViewPresentationSummary,
    formatWorkViewVisibilitySummary,
} from "@/lib/lifecycle/workViewEditorSummaries";

describe("workViewEditorSummaries", () => {
    it("formats condition summary for stage equals lead", () => {
        expect(
            formatWorkViewConditionsSummary([
                { field_key: "stage", operator: "equals", value: "lead" },
            ]),
        ).toBe("Stage equals Lead");
    });

    it("formats presentation summary with surface defaults", () => {
        expect(formatWorkViewPresentationSummary(undefined, undefined, [])).toBe(
            "Queue: Surface default · Focus Panel: Surface default",
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
