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

describe("FormDocumentAuthoringShell OI-4", () => {
    it("renders document framing and preview pane", () => {
        const html = renderToStaticMarkup(
            <FormDocumentAuthoringShell schema={schema} formName="Medication">
                <div data-testid="editor-slot">editor</div>
            </FormDocumentAuthoringShell>
        );

        expect(html).toContain('data-testid="form-document-authoring-shell"');
        expect(html).toContain('data-testid="form-document-preview-frame"');
        expect(html).toContain("Medication authorization");
        expect(html).toContain("Guardian information");
        expect(html).toContain("editor");
    });
});
