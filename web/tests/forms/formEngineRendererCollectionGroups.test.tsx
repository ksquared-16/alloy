import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { validateFormSchema } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

const childrenSchema = validateFormSchema({
    schema_version: 1,
    title: "Children form",
    sections: [{ id: "s", field_ids: ["kids"] }],
    fields: [
        {
            id: "kids",
            type: "group",
            label: "Children",
            required: false,
            repeat: { min: 0, max: 5 },
            collection_binding: {
                collection_provider_ref: "children",
                iteration_entity_type: "customer_member",
            },
            fields: [
                {
                    id: "child_first_name",
                    type: "text",
                    label: "First name",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_first_name" },
                },
            ],
        },
    ],
});

describe("FormEngineRenderer collection-bound groups", () => {
    it("renders two existing children as separate instances with values", () => {
        const payload: FormPayload = {
            values: {},
            groups: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Sam" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-1",
                            origin: "existing",
                            iteration_entity_type: "customer_member",
                        },
                    },
                    {
                        instance_key: "col:children:cm-2",
                        values: { child_first_name: "Alex" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-2",
                            origin: "existing",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        };
        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={childrenSchema} payload={payload} onChange={() => {}} mode="readonly" />,
        );
        expect(html).toContain("Children #1");
        expect(html).toContain("Children #2");
        expect(html).toContain("Sam");
        expect(html).toContain("Alex");
        expect(html).not.toContain("col:children");
        expect(html).not.toContain("provider_ref");
        expect(html).not.toContain("respondent_added");
    });

    it("does not expose collection metadata in respondent readonly view", () => {
        const payload: FormPayload = {
            values: {},
            groups: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Sam" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-1",
                            origin: "existing",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        };
        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={childrenSchema} payload={payload} onChange={() => {}} mode="readonly" variant="embed" />,
        );
        expect(html).not.toContain("customer_member");
        expect(html).not.toContain("existing");
    });

    it("shows Add item when under max in edit mode", () => {
        const payload: FormPayload = { values: {}, groups: { kids: [] } };
        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={childrenSchema} payload={payload} onChange={() => {}} mode="edit" variant="embed" />,
        );
        expect(html).toContain("Add item");
    });
});
