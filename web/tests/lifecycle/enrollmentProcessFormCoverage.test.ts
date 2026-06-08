import { describe, expect, it } from "vitest";
import {
    buildFormFieldRuleCoverageRows,
    buildFormRequirementCoverageRows,
    coverageStateForFieldRule,
    coverageStateForRequirement,
    extractCaptureLabelsFromSchema,
    extractCaptureTokensFromSchema,
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
            coverageStateForRequirement("Person", ["First Name", "Last Name", "Email", "Phone"])
        ).toBe("satisfies");
    });

    it("reports partial when some person fields absent", () => {
        expect(coverageStateForRequirement("Person", ["First Name"])).toBe("partial");
    });

    it("reports unknown for requirements without field detail mapping", () => {
        expect(coverageStateForRequirement("Custom Object", ["Anything"])).toBe("unknown");
    });

    it("buildFormRequirementCoverageRows lists each requirement", () => {
        const rows = buildFormRequirementCoverageRows(["Person"], [], ["First Name", "Last Name", "Email"]);
        expect(rows[0]?.state).toBe("partial");
    });

    it("formRelevantToOperatorStage maps enrollment lead to lead", () => {
        expect(formRelevantToOperatorStage("lead", "enrollment_lead", null)).toBe(true);
        expect(formRelevantToOperatorStage("tour", "enrollment_lead", null)).toBe(false);
    });

    it("field rule coverage matches guardian form labels to person requirements", () => {
        const capture = extractCaptureTokensFromSchema({
            schema_version: 1,
            title: "Lead form",
            sections: [{ id: "main", field_ids: ["g_first", "g_last", "g_email"] }],
            fields: [
                { id: "g_first", type: "text", label: "Guardian first name", required: true },
                { id: "g_last", type: "text", label: "Guardian last name", required: true },
                { id: "g_email", type: "text", label: "Guardian email", required: true },
            ],
        });
        const { rows, summary } = buildFormFieldRuleCoverageRows(
            {
                required_rule_ids: ["person:first_name", "person:last_name", "person:email"],
                recommended_rule_ids: [],
            },
            capture
        );
        expect(summary).toBe("complete");
        expect(rows.every((r) => r.state === "satisfies")).toBe(true);
    });

    it("field rule coverage is partial when email missing", () => {
        const capture = extractCaptureTokensFromSchema({
            schema_version: 1,
            title: "Lead form",
            sections: [{ id: "main", field_ids: ["g_first"] }],
            fields: [{ id: "g_first", type: "text", label: "Guardian first name", required: true }],
        });
        const { summary } = buildFormFieldRuleCoverageRows(
            {
                required_rule_ids: ["person:first_name", "person:email"],
                recommended_rule_ids: [],
            },
            capture
        );
        expect(summary).toBe("partial");
    });

    it("custom field rule coverage is unknown when mapping is fuzzy", () => {
        const capture = extractCaptureTokensFromSchema({
            schema_version: 1,
            title: "Lead form",
            sections: [{ id: "main", field_ids: ["x"] }],
            fields: [{ id: "x", type: "text", label: "Unrelated", required: true }],
        });
        expect(coverageStateForFieldRule("custom:person:preferred_language", capture)).toBe("unknown");
    });
});
