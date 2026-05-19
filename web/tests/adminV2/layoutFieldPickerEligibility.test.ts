import { describe, expect, it } from "vitest";
import { isEligibleForLayoutFieldPicker } from "@/lib/adminV2/layouts/layoutFieldPickerEligibility";

describe("isEligibleForLayoutFieldPicker", () => {
    it("includes drawer-visible system fields not shown on Fields settings", () => {
        expect(
            isEligibleForLayoutFieldPicker("opportunity", {
                field_key: "pipeline_stage",
                is_active: true,
                is_visible_in_drawer: true,
            })
        ).toBe(true);
    });

    it("excludes always-hidden keys, inactive, and drawer-hidden fields", () => {
        expect(isEligibleForLayoutFieldPicker("opportunity", { field_key: "org_id" })).toBe(false);
        expect(
            isEligibleForLayoutFieldPicker("opportunity", {
                field_key: "customer_notes",
                is_active: false,
            })
        ).toBe(false);
        expect(
            isEligibleForLayoutFieldPicker("opportunity", {
                field_key: "customer_notes",
                is_visible_in_drawer: false,
            })
        ).toBe(false);
    });
});
