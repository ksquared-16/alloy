import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StructuredFormSchemaEditor from "@/components/admin/forms/StructuredFormSchemaEditor";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const childEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_first_name")!;
const customField = {
    id: "custom_q",
    type: "text" as const,
    label: "Notes",
    required: false,
    field_source: { entity_type: "custom", field_key: "unmapped" },
};

const schemaWithFields: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment intake",
    sections: [{ id: "main", title: "Family details", field_ids: ["child_first_name", "custom_q"] }],
    fields: [formFieldFromRegistryEntry(childEntry, {}), customField],
};

describe("StructuredFormSchemaEditor FD-8", () => {
    it("renders field cards inside composition field region", () => {
        const html = renderToStaticMarkup(
            <StructuredFormSchemaEditor schema={schemaWithFields} onChange={() => {}} />
        );

        expect(html).toContain('data-testid="document-composition-editor"');
        expect(html).toContain('data-testid="form-field-authoring-card-child_first_name"');
        expect(html).not.toContain("<table");
        expect(html).not.toContain("Data field");
    });

    it("shows prefill mode and editing controls on field cards", () => {
        const html = renderToStaticMarkup(
            <StructuredFormSchemaEditor schema={schemaWithFields} onChange={() => {}} />
        );

        expect(html).toContain("Editable after prefill");
        expect(html).toContain('data-testid="form-field-label-child_first_name"');
        expect(html).toContain('data-testid="form-add-question"');
        expect(html).toContain("Instruction text");
    });

    it("renders empty field region message when no fields", () => {
        const emptySchema: FormSchemaV1 = {
            schema_version: 1,
            title: "New form",
            sections: [{ id: "main", title: "Section", field_ids: [] }],
            fields: [],
        };
        const html = renderToStaticMarkup(
            <StructuredFormSchemaEditor schema={emptySchema} onChange={() => {}} />
        );

        expect(html).toContain("No questions in this section yet");
        expect(html).toContain('data-testid="form-add-question"');
    });
});
