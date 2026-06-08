import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormDocumentAuthoringShell } from "@/components/forms/workspace/FormDocumentAuthoringShell";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Medication authorization",
    sections: [{ id: "main", title: "Guardian information", field_ids: ["q1"] }],
    fields: [{ id: "q1", type: "text", label: "Child name", required: true }],
};

describe("FormDocumentAuthoringShell FD-12 / FD-14.5", () => {
    it("renders composition editor and live preview pane", () => {
        const html = renderToStaticMarkup(
            <FormDocumentAuthoringShell schema={schema} formName="Medication authorization" onChange={() => {}} />
        );

        expect(html).toContain('data-testid="form-document-authoring-shell"');
        expect(html).toContain('data-testid="form-document-preview-frame"');
        expect(html).toContain('data-testid="document-composition-preview"');
        expect(html).toContain('data-testid="document-composition-preview-canvas"');
        expect(html).toContain("Medication authorization");
    });

    it("allocates a wider preview column on desktop", () => {
        const html = renderToStaticMarkup(
            <FormDocumentAuthoringShell schema={schema} formName="Medication authorization" onChange={() => {}} />
        );

        expect(html).toContain("minmax(420px,520px)");
        expect(html).toContain("lg:sticky");
        expect(html).toContain("lg:max-h-[calc(100vh-2rem)]");
    });
});
