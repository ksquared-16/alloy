import { describe, expect, it } from "vitest";
import { applyRecentFormToSteps, trimLeadingEmptyStepRows } from "@/lib/admin/forms/packetStepRecentFormPlacement";

describe("applyRecentFormToSteps", () => {
    it("fills the first empty row instead of appending", () => {
        const next = applyRecentFormToSteps([{ form_definition_id: "", step_label: "" }], "form-a");
        expect(next).toEqual([{ form_definition_id: "form-a", step_label: "" }]);
    });

    it("fills first empty when multiple leading empties would exist", () => {
        const next = applyRecentFormToSteps(
            [
                { form_definition_id: "", step_label: "" },
                { form_definition_id: "", step_label: "" },
            ],
            "x"
        );
        expect(next[0]?.form_definition_id).toBe("x");
        expect(next.length).toBe(2);
    });

    it("appends when all rows have a form", () => {
        const next = applyRecentFormToSteps(
            [
                { form_definition_id: "a", step_label: "" },
                { form_definition_id: "b", step_label: "" },
            ],
            "c"
        );
        expect(next.map((s) => s.form_definition_id)).toEqual(["a", "b", "c"]);
    });

    it("trims leading blank rows after assign", () => {
        const next = applyRecentFormToSteps(
            [
                { form_definition_id: "", step_label: "" },
                { form_definition_id: "b", step_label: "" },
            ],
            "a"
        );
        expect(next.map((s) => s.form_definition_id)).toEqual(["a", "b"]);
    });
});

describe("trimLeadingEmptyStepRows", () => {
    it("returns one empty row when all empty", () => {
        expect(trimLeadingEmptyStepRows([{ form_definition_id: "", step_label: "" }])).toEqual([
            { form_definition_id: "", step_label: "" },
        ]);
    });
});
