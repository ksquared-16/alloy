import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineFieldTokenText } from "@/components/forms/inline/InlineFieldTokenText";
import { resolveInlineFieldTokens } from "@/lib/forms/inlineFieldTokens";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Demo",
    sections: [{ id: "main", field_ids: ["guardian_full_name"] }],
    fields: [{ id: "guardian_full_name", type: "text", label: "Guardian full name", required: true }],
};

describe("InlineFieldTokenText", () => {
    it("renders resolved values inline", () => {
        const resolution = resolveInlineFieldTokens("I, {{guardian_full_name}}, agree.", {
            schema,
            payload: { values: { guardian_full_name: "Jamie Lee" }, groups: {}, signatures: {} },
        });
        const html = renderToStaticMarkup(<InlineFieldTokenText resolution={resolution} />);
        expect(html).toContain("Jamie Lee");
        expect(html).toContain('data-testid="inline-token-resolved-guardian_full_name"');
    });

    it("highlights missing tokens at runtime", () => {
        const resolution = resolveInlineFieldTokens("I, {{guardian_full_name}}, agree.", {
            schema,
            payload: { values: {}, groups: {}, signatures: {} },
        });
        const html = renderToStaticMarkup(<InlineFieldTokenText resolution={resolution} mode="runtime" />);
        expect(html).toContain("[Guardian full name]");
        expect(html).toContain('data-testid="inline-token-missing-guardian_full_name"');
    });
});
