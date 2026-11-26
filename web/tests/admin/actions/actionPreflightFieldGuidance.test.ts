import { describe, expect, it } from "vitest";
import { resolveActionPreflightFieldGuidance } from "@/lib/admin/actions/actionPreflightFieldGuidance";

describe("actionPreflightFieldGuidance", () => {
    it("maps enrollment field keys to inquiry children focus", () => {
        expect(resolveActionPreflightFieldGuidance("start_date")).toEqual({
            kind: "inquiry_children",
            field: "start_date",
        });
        expect(resolveActionPreflightFieldGuidance("inquiry_children")).toEqual({
            kind: "inquiry_children",
            field: null,
        });
    });

    it("maps tour outcome to tour outcome modal", () => {
        expect(resolveActionPreflightFieldGuidance("outcome", "record_tour_outcome")).toEqual({
            kind: "tour_outcome_modal",
        });
    });

    it("maps tour schedule fields to schedule modal", () => {
        expect(resolveActionPreflightFieldGuidance("tour_date", "schedule_tour")).toEqual({
            kind: "tour_schedule_modal",
        });
    });
});
