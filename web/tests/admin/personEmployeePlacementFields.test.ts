import { describe, expect, it } from "vitest";
import {
    buildPersonEmployeePlacementPatch,
    parsePersonEmployeePlacementPatchBody,
    readPersonEmployeePlacementValues,
} from "@/lib/admin/personEmployeePlacementFields";

describe("personEmployeePlacementFields", () => {
    it("reads employee values from person record", () => {
        expect(
            readPersonEmployeePlacementValues({
                is_employee: true,
                employee_id: " E-12 ",
                employee_source: "manual",
            })
        ).toEqual({
            is_employee: true,
            employee_id: "E-12",
            employee_source: "manual",
        });
    });

    it("builds patch and clears employee_id when employee unchecked", () => {
        const patch = buildPersonEmployeePlacementPatch(
            { is_employee: false, employee_id: "", employee_source: "" },
            { is_employee: true, employee_id: "E-1", employee_source: "manual" }
        );
        expect(patch).toEqual({
            is_employee: false,
            employee_id: null,
            employee_source: null,
        });
    });

    it("parses PATCH body with validation", () => {
        expect(parsePersonEmployeePlacementPatchBody({ is_employee: true, employee_id: "E-99" })).toEqual({
            ok: true,
            updates: { is_employee: true, employee_id: "E-99" },
        });
        expect(parsePersonEmployeePlacementPatchBody({ is_employee: false })).toEqual({
            ok: true,
            updates: { is_employee: false, employee_id: null },
        });
        expect(parsePersonEmployeePlacementPatchBody({ is_employee: "yes" })).toEqual({
            ok: false,
            error: "is_employee must be a boolean",
        });
    });
});
