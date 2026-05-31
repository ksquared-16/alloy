import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentCompositionPreview } from "@/components/admin/forms/documentComposition/DocumentCompositionPreview";
import { patchSchemaComposition } from "@/lib/forms/documentCompositionAuthoring";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const baseSchema: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [{ id: "main", title: "Details", field_ids: ["f1", "f2", "f3"] }],
    fields: [
        { id: "f1", type: "text", label: "First", required: true },
        { id: "f2", type: "text", label: "Second", required: false },
        { id: "f3", type: "text", label: "Third", required: false },
    ],
};

describe("DocumentCompositionPreview FD-12", () => {
    it("reflects one-column field region layout", () => {
        const html = renderToStaticMarkup(<DocumentCompositionPreview schema={baseSchema} />);
        expect(html).toContain('data-testid="document-composition-preview"');
        expect(html).toContain('data-testid="document-composition-preview-canvas"');
        expect(html).toContain('data-layout="one_column"');
        expect(html).toContain("grid-cols-1");
    });

    it("updates preview when two-column layout is set in local schema state", () => {
        const composition = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "h1", type: "heading", content: "Enrollment", level: "h1", order: 0 },
                {
                    id: "region",
                    type: "field_region",
                    title: "Details",
                    layout: "two_column",
                    field_ids: ["f1", "f2", "f3"],
                    order: 1,
                },
            ],
        });

        const html = renderToStaticMarkup(<DocumentCompositionPreview schema={composition} />);
        expect(html).toContain('data-layout="two_column"');
        expect(html).toContain("grid-cols-2");
    });

    it("updates preview when three-column layout is set in local schema state", () => {
        const composition = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                {
                    id: "region",
                    type: "field_region",
                    layout: "three_column",
                    field_ids: ["f1", "f2", "f3"],
                    order: 0,
                },
            ],
        });

        const html = renderToStaticMarkup(<DocumentCompositionPreview schema={composition} />);
        expect(html).toContain('data-layout="three_column"');
        expect(html).toContain("grid-cols-3");
    });

    it("renders multiple sections with interactive field controls", () => {
        const composition = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "r1", type: "field_region", layout: "one_column", title: "Primary", field_ids: ["f1", "f2"], order: 0 },
                { id: "r2", type: "field_region", layout: "one_column", title: "Secondary", field_ids: ["f3"], order: 1 },
            ],
        });

        const html = renderToStaticMarkup(
            <DocumentCompositionPreview
                schema={composition}
                selectedFieldId="f2"
                regionOptions={[
                    { id: "r1", label: "Primary" },
                    { id: "r2", label: "Secondary" },
                ]}
            />
        );

        expect(html).toContain('data-testid="preview-field-region-r1"');
        expect(html).toContain('data-testid="preview-field-region-r2"');
        expect(html).toContain('data-testid="preview-field-controls-f2"');
        expect(html).toContain('data-testid="preview-field-up-f2"');
        expect(html).toContain('data-testid="preview-field-down-f2"');
        expect(html).toContain('data-testid="preview-field-move-section-f2"');
    });
});
