import { describe, expect, it } from "vitest";
import {
    buildFieldValidationSummary,
    listUnmappedFieldValidationErrors,
    parseDrawerFieldPolicySaveResponse,
    violationsToFieldErrorMap,
} from "@/lib/admin/drawer/drawerSaveErrors";
import { FIELD_POLICY_VALIDATION_ERROR } from "@/lib/fields/enforceDrawerFieldPoliciesOnPatch";

describe("drawerSaveErrors", () => {
    it("parses structured violation payload", () => {
        const parsed = parseDrawerFieldPolicySaveResponse({
            error: FIELD_POLICY_VALIDATION_ERROR,
            violations: [{ field_key: "name", code: "required", message: "Name is required." }],
        });
        expect(parsed?.byFieldKey.name).toBe("Name is required.");
        expect(parsed?.violations).toHaveLength(1);
    });

    it("returns null for generic errors", () => {
        expect(parseDrawerFieldPolicySaveResponse({ error: "Not found" })).toBeNull();
    });

    it("builds field error map", () => {
        const map = violationsToFieldErrorMap([
            { field_key: "title", code: "required_on_save", message: "Title required on save." },
        ]);
        expect(map.title).toContain("Title");
    });

    it("lists unmapped field errors for global summary", () => {
        const unmapped = listUnmappedFieldValidationErrors(
            { status_key: "Required", name: "Name missing" },
            new Set(["name"]),
            { status_key: "Status", name: "Name" }
        );
        expect(unmapped).toHaveLength(1);
        expect(unmapped[0]?.field_key).toBe("status_key");
        expect(unmapped[0]?.label).toBe("Status");
    });

    it("builds multi-field summary", () => {
        const s = buildFieldValidationSummary(
            [
                { field_key: "a", code: "required", message: "A required" },
                { field_key: "b", code: "required", message: "B required" },
            ],
            { a: "Field A", b: "Field B" }
        );
        expect(s).toContain("2 fields");
    });
});
