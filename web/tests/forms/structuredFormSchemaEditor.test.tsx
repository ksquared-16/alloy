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

describe("StructuredFormSchemaEditor OI-4B", () => {
    it("renders field cards instead of table rows", () => {
        const html = renderToStaticMarkup(
            <StructuredFormSchemaEditor schema={schemaWithFields} onChange={() => {}} />
        );

        expect(html).toContain('data-testid="structured-form-schema-editor"');
        expect(html).toContain('data-testid="form-field-authoring-list"');
        expect(html).toContain('data-testid="form-field-authoring-card-child_first_name"');
        expect(html).not.toContain("<table");
        expect(html).not.toContain("Data field");
    });

    it("shows mapped prefill label and editing controls", () => {
        const html = renderToStaticMarkup(
            <StructuredFormSchemaEditor schema={schemaWithFields} onChange={() => {}} />
        );

        expect(html).toContain("Prefills from: Child first name");
        expect(html).toContain('data-testid="form-field-label-child_first_name"');
        expect(html).toContain('data-testid="form-field-required-child_first_name"');
        expect(html).toContain('data-testid="form-field-answer-type-child_first_name"');
        expect(html).toContain('data-testid="form-field-layout-child_first_name"');
        expect(html).toContain('data-testid="form-field-move-up-child_first_name"');
        expect(html).toContain('data-testid="form-field-move-down-custom_q"');
    });

    it("renders empty state when no fields", () => {
        const emptySchema: FormSchemaV1 = {
            schema_version: 1,
            title: "New form",
            sections: [{ id: "main", title: "Section", field_ids: [] }],
            fields: [],
        };
        const html = renderToStaticMarkup(
            <StructuredFormSchemaEditor schema={emptySchema} onChange={() => {}} />
        );

        expect(html).toContain('data-testid="form-field-authoring-empty"');
        expect(html).toContain("Start by adding the first question");
        expect(html).toContain('data-testid="form-add-question"');
    });

    it("uses document-oriented section labels", () => {
        const html = renderToStaticMarkup(
            <StructuredFormSchemaEditor schema={schemaWithFields} onChange={() => {}} />
        );

        expect(html).toContain("Document title");
        expect(html).toContain("Section");
        expect(html).toContain("Add question");
    });
});
