import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentCompositionEditor } from "@/components/admin/forms/documentComposition/DocumentCompositionEditor";
import { patchSchemaComposition } from "@/lib/forms/documentCompositionAuthoring";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const childEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_first_name")!;

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment intake",
    sections: [{ id: "main", title: "Family details", field_ids: ["child_first_name"] }],
    fields: [formFieldFromRegistryEntry(childEntry, {})],
};

const multiSectionSchema = patchSchemaComposition(schema, {
    version: 1,
    blocks: [
        { id: "h1", type: "heading", content: "Enrollment intake", level: "h1", order: 0 },
        { id: "r1", type: "field_region", title: "Family details", field_ids: ["child_first_name"], order: 1 },
        { id: "r2", type: "field_region", title: "Additional", field_ids: [], order: 2 },
    ],
});

describe("DocumentCompositionEditor FD-8 / FD-13", () => {
    it("renders composition workspace with field region and block cards", () => {
        const html = renderToStaticMarkup(<DocumentCompositionEditor schema={schema} onChange={() => {}} />);

        expect(html).toContain('data-testid="document-composition-editor"');
        expect(html).toContain('data-testid="document-field-region-doc-field-region-main"');
        expect(html).toContain('data-testid="document-block-card-heading-doc-heading"');
        expect(html).toContain('data-testid="document-block-card-image-brand-logo"');
        expect(html).toContain('data-testid="document-block-card-signature-doc-signature-placeholder"');
        expect(html).toContain('data-testid="form-field-authoring-card-child_first_name"');
        expect(html).toContain('data-testid="document-composition-add-blocks"');
    });

    it("renders compact field rows and add-section control", () => {
        const html = renderToStaticMarkup(<DocumentCompositionEditor schema={schema} onChange={() => {}} />);

        expect(html).toContain('data-testid="document-add-section"');
        expect(html).toContain('data-testid="form-field-label-child_first_name"');
        expect(html).toContain('data-testid="form-field-answer-type-child_first_name"');
        expect(html).toContain('data-testid="form-field-advanced-toggle-child_first_name"');
    });

    it("renders multiple sections with section controls", () => {
        const html = renderToStaticMarkup(
            <DocumentCompositionEditor schema={multiSectionSchema} onChange={() => {}} />
        );

        expect(html).toContain('data-testid="document-field-region-r1"');
        expect(html).toContain('data-testid="document-field-region-r2"');
        expect(html).toContain('data-testid="document-section-move-up-r2"');
        expect(html).toContain('data-testid="document-section-remove-r2"');
        expect(html).toContain('data-testid="document-add-question-r1"');
    });

    it("keeps editor field rows single-column regardless of section layout", () => {
        const twoColSchema = patchSchemaComposition(schema, {
            version: 1,
            blocks: [
                {
                    id: "r1",
                    type: "field_region",
                    title: "Wide section",
                    layout: "three_column",
                    field_ids: ["child_first_name"],
                    order: 0,
                },
            ],
        });

        const html = renderToStaticMarkup(<DocumentCompositionEditor schema={twoColSchema} onChange={() => {}} />);

        expect(html).toContain('data-testid="document-field-region-editor-r1"');
        expect(html).not.toMatch(/document-field-region-editor-r1[^>]*grid-cols/);
        expect(html).not.toContain("sm:grid-cols-3");
    });
});
