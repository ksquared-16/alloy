import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentCompositionPreview } from "@/components/admin/forms/documentComposition/DocumentCompositionPreview";
import { patchSchemaComposition } from "@/lib/forms/documentCompositionAuthoring";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const baseSchema: FormSchemaV1 = {
    schema_version: 1,
    title: "Authorization",
    sections: [{ id: "main", field_ids: ["guardian_full_name"] }],
    fields: [{ id: "guardian_full_name", type: "text", label: "Guardian full name", required: true }],
};

describe("DocumentCompositionPreview inline tokens FD-15", () => {
    it("shows authoring chips for inline field tokens in text blocks", () => {
        const schema = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                {
                    id: "t1",
                    type: "text",
                    content: "I, {{guardian_full_name}}, agree.",
                    format: "plain",
                    order: 0,
                },
            ],
        });

        const html = renderToStaticMarkup(<DocumentCompositionPreview schema={schema} />);
        expect(html).toContain('data-testid="preview-text-t1"');
        expect(html).toContain('data-testid="inline-token-missing-guardian_full_name"');
        expect(html).toContain("Guardian full name");
    });
});
