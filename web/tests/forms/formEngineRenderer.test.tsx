import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Demo",
    sections: [{ id: "s1", field_ids: ["name", "active"] }],
    fields: [
        { id: "name", type: "text", label: "Name", required: true },
        { id: "active", type: "boolean", label: "Active" },
    ],
};

describe("FormEngineRenderer", () => {
    it("renders schema title and fields", () => {
        let payload: FormPayload = { values: { name: "Ada", active: true } };
        const html = renderToStaticMarkup(
            <FormEngineRenderer
                schema={schema}
                payload={payload}
                onChange={(p) => {
                    payload = p;
                }}
                mode="readonly"
            />
        );
        expect(html).toContain("Demo");
        expect(html).toContain("Name");
        expect(html).toContain("Ada");
    });
});
