import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { emptyPayload } from "@/components/forms/engine/formEnginePayload";
import { patchSchemaComposition } from "@/lib/forms/documentCompositionAuthoring";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const baseSchema: FormSchemaV1 = {
    schema_version: 1,
    title: "Medication Authorization",
    sections: [{ id: "main", field_ids: ["guardian_full_name", "child_first_name"] }],
    fields: [
        { id: "guardian_full_name", type: "text", label: "Guardian full name", required: true },
        { id: "child_first_name", type: "text", label: "Child first name", required: true },
    ],
};

describe("FormEngineRenderer inline field tokens FD-15", () => {
    it("renders document composition text with resolved inline tokens", () => {
        const schema = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                {
                    id: "intro",
                    type: "text",
                    content: "I, {{guardian_full_name}}, authorize {{child_first_name}}.",
                    order: 0,
                },
                {
                    id: "region",
                    type: "field_region",
                    field_ids: ["guardian_full_name", "child_first_name"],
                    order: 1,
                },
            ],
        });

        const payload = {
            ...emptyPayload(),
            values: {
                guardian_full_name: "Jamie Lee",
                child_first_name: "Avery",
            },
        };

        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={schema} payload={payload} onChange={() => {}} mode="edit" />
        );

        expect(html).toContain('data-testid="form-composition-text-intro"');
        expect(html).toContain("Jamie Lee");
        expect(html).toContain("Avery");
        expect(html).not.toContain("{{guardian_full_name}}");
    });

    it("shows missing token placeholders while editing", () => {
        const schema = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                {
                    id: "intro",
                    type: "text",
                    content: "I, {{guardian_full_name}}, authorize care.",
                    order: 0,
                },
            ],
        });

        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={schema} payload={emptyPayload()} onChange={() => {}} mode="edit" />
        );

        expect(html).toContain("[Guardian full name]");
        expect(html).toContain('data-testid="inline-token-missing-guardian_full_name"');
    });

    it("shows review warnings for missing required inline tokens in readonly mode", () => {
        const schema = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                {
                    id: "intro",
                    type: "text",
                    content: "I, {{guardian_full_name}}, authorize care.",
                    order: 0,
                },
            ],
        });

        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={schema} payload={emptyPayload()} onChange={() => {}} mode="readonly" />
        );

        expect(html).toContain('data-testid="form-inline-token-warnings"');
        expect(html).toContain("Required field missing");
    });

    it("uses legacy section rendering when document composition is absent", () => {
        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={baseSchema} payload={emptyPayload()} onChange={() => {}} mode="edit" />
        );
        expect(html).not.toContain('data-testid="form-composition-text-');
        expect(html).toContain("Guardian full name");
    });
});
