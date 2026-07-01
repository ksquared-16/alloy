import { describe, expect, it } from "vitest";
import {
    buildInlineFieldValueMap,
    collectInlineFieldTokenWarnings,
    insertInlineFieldToken,
    listInlineTokenEligibleFields,
    parseInlineFieldTokenKeys,
    resolveInlineFieldTokens,
    validateInlineFieldTokenKeys,
} from "@/lib/forms/inlineFieldTokens";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Authorization",
    sections: [{ id: "main", field_ids: ["guardian_full_name", "child_first_name", "child_last_name", "notes"] }],
    fields: [
        { id: "guardian_full_name", type: "text", label: "Guardian full name", required: true },
        { id: "child_first_name", type: "text", label: "Child first name", required: true },
        { id: "child_last_name", type: "text", label: "Child last name", required: false },
        { id: "notes", type: "text", label: "Notes", required: false },
        {
            id: "medications",
            type: "group",
            label: "Medications",
            required: true,
            fields: [{ id: "med_name", type: "text", label: "Medication", required: true }],
        },
    ],
    document_composition: {
        version: 1,
        blocks: [
            {
                id: "auth-text",
                type: "text",
                content:
                    "I, {{guardian_full_name}}, authorize {{child_first_name}} {{child_last_name}} to receive medication.",
                format: "plain",
            },
        ],
    },
};

describe("inlineFieldTokens FD-15", () => {
    it("parses flat token keys in order", () => {
        expect(parseInlineFieldTokenKeys("Hi {{child_first_name}} and {{guardian_full_name}}")).toEqual([
            "child_first_name",
            "guardian_full_name",
        ]);
    });

    it("lists top-level eligible fields excluding groups", () => {
        const eligible = listInlineTokenEligibleFields(schema);
        expect(eligible.map((f) => f.id)).toEqual([
            "guardian_full_name",
            "child_first_name",
            "child_last_name",
            "notes",
        ]);
    });

    it("inserts token at selection", () => {
        const { nextContent, nextCursor } = insertInlineFieldToken("I, ", "guardian_full_name", 4, 4);
        expect(nextContent).toBe("I, {{guardian_full_name}}");
        expect(nextCursor).toBe(4 + "{{guardian_full_name}}".length);
    });

    it("validates unknown keys", () => {
        const result = validateInlineFieldTokenKeys("{{unknown_key}} and {{child_first_name}}", [
            "child_first_name",
            "guardian_full_name",
        ]);
        expect(result.unknownKeys).toEqual(["unknown_key"]);
        expect(result.validKeys).toEqual(["child_first_name"]);
    });

    it("resolves tokens from submitted values", () => {
        const payload: FormPayload = {
            values: {
                guardian_full_name: "Jamie Lee",
                child_first_name: "Avery",
                child_last_name: "Lee",
            },
            groups: {},
            signatures: {},
        };
        const resolution = resolveInlineFieldTokens(
            "I, {{guardian_full_name}}, authorize {{child_first_name}} {{child_last_name}}.",
            { schema, payload }
        );
        expect(resolution.plainText).toBe("I, Jamie Lee, authorize Avery Lee.");
        expect(resolution.missingKeys).toEqual([]);
        expect(resolution.unknownKeys).toEqual([]);
    });

    it("marks missing required tokens without erasing them", () => {
        const payload: FormPayload = { values: {}, groups: {}, signatures: {} };
        const resolution = resolveInlineFieldTokens("I, {{guardian_full_name}}, authorize {{child_first_name}}.", {
            schema,
            payload,
        });
        expect(resolution.missingRequiredKeys).toEqual(["guardian_full_name", "child_first_name"]);
        expect(resolution.plainText).toContain("[Guardian full name]");
        expect(resolution.plainText).toContain("[Child first name]");
        const tokenSegments = resolution.segments.filter((s) => s.kind === "token");
        expect(tokenSegments.every((s) => s.status === "missing")).toBe(true);
    });

    it("flags unknown field keys", () => {
        const resolution = resolveInlineFieldTokens("Hello {{not_a_field}}", { schema, payload: { values: {}, groups: {}, signatures: {} } });
        expect(resolution.unknownKeys).toEqual(["not_a_field"]);
        expect(resolution.segments.some((s) => s.kind === "token" && s.status === "unknown")).toBe(true);
    });

    it("builds value map with select labels", () => {
        const selectSchema: FormSchemaV1 = {
            ...schema,
            fields: [{ id: "program", type: "select", label: "Program", required: true, static_options: [{ value: "infant", label: "Infant room" }] }],
            sections: [{ id: "main", field_ids: ["program"] }],
        };
        const map = buildInlineFieldValueMap({
            schema: selectSchema,
            payload: { values: { program: "infant" }, groups: {}, signatures: {} },
            optionChoicesByFieldId: { program: [{ value: "infant", label: "Infant room" }] },
        });
        expect(map.program).toBe("Infant room");
    });

    it("collects review warnings from document composition text blocks", () => {
        const payload: FormPayload = { values: {}, groups: {}, signatures: {} };
        const warnings = collectInlineFieldTokenWarnings(schema, payload);
        expect(warnings.length).toBe(1);
        expect(warnings[0]?.warnings.some((w) => w.includes("Guardian full name"))).toBe(true);
    });

    it("leaves plain text without tokens unchanged", () => {
        const resolution = resolveInlineFieldTokens("No tokens here.", { schema });
        expect(resolution.plainText).toBe("No tokens here.");
        expect(resolution.segments).toEqual([{ kind: "text", text: "No tokens here." }]);
    });
});
