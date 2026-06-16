import { describe, expect, it } from "vitest";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";

describe("evaluateLayoutCondition", () => {
    it("treats placeholder dashes as empty for exists conditions", () => {
        expect(
            evaluateLayoutCondition(
                { "opportunity.tour_date": "—" },
                { type: "exists", path: "opportunity.tour_date" },
            ),
        ).toBe(false);
        expect(
            evaluateLayoutCondition(
                { "opportunity.tour_date": "-" },
                { type: "exists", path: "opportunity.tour_date" },
            ),
        ).toBe(false);
        expect(
            evaluateLayoutCondition(
                { "opportunity.tour_date": "" },
                { type: "exists", path: "opportunity.tour_date" },
            ),
        ).toBe(false);
    });

    it("passes exists when tour date has a real value", () => {
        expect(
            evaluateLayoutCondition(
                { "opportunity.tour_date": "06-12-2026" },
                { type: "exists", path: "opportunity.tour_date" },
            ),
        ).toBe(true);
    });

    it("evaluates count_gt against array paths", () => {
        expect(
            evaluateLayoutCondition(
                { children: [{ id: "1" }, { id: "2" }] },
                { type: "count_gt", path: "children", value: "1" },
            ),
        ).toBe(true);
        expect(
            evaluateLayoutCondition(
                { children: [{ id: "1" }] },
                { type: "count_gt", path: "children", value: "1" },
            ),
        ).toBe(false);
    });
});
