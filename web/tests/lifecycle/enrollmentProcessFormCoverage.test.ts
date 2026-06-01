import { describe, expect, it } from "vitest";
import {
    buildFormRequirementCoverageRows,
    coverageStateForRequirement,
    extractCaptureLabelsFromSchema,
    formRelevantToOperatorStage,
} from "@/lib/lifecycle/enrollmentProcessFormCoverage";

describe("enrollmentProcessFormCoverage", () => {
    it("extracts field labels from published schema", () => {
        const labels = extractCaptureLabelsFromSchema({
            schema_version: 1,
            title: "Lead form",
            sections: [{ id: "main", field_ids: ["g_first", "g_last"] }],
            fields: [
                { id: "g_first", type: "text", label: "First Name", required: true },
                { id: "g_last", type: "text", label: "Last Name", required: true },
            ],
        });
        expect(labels).toContain("First Name");
        expect(labels).toContain("Last Name");
    });

    it("reports satisfies when captures match Person requirement fields", () => {
        expect(
            coverageStateForRequirement("Person", ["First Name", "Last Name", "Email or Phone"])
        ).toBe("satisfies");
    });

    it("reports missing when required fields absent", () => {
        expect(coverageStateForRequirement("Person", ["First Name"])).toBe("partial");
        expect(coverageStateForRequirement("Person", [])).toBe("missing");
    });

    it("reports unknown for requirements without field detail mapping", () => {
        expect(coverageStateForRequirement("Custom Object", ["Anything"])).toBe("unknown");
    });

    it("buildFormRequirementCoverageRows lists each requirement", () => {
        const rows = buildFormRequirementCoverageRows(["Person"], [], ["First Name", "Last Name", "Email or Phone"]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.state).toBe("satisfies");
    });

    it("formRelevantToOperatorStage maps enrollment lead to lead", () => {
        expect(formRelevantToOperatorStage("lead", "enrollment_lead", null)).toBe(true);
        expect(formRelevantToOperatorStage("tour", "enrollment_lead", null)).toBe(false);
    });
});
