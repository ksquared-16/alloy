import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { validateFormSchema } from "@/lib/forms/schema";
import {
    MEDICATION_AUTHORIZATION_DEMO_SCHEMA,
    MEDICATION_DEMO_ROUTE_ITEM_KEYS,
    MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
} from "@/lib/forms/seeds/medicationAuthorizationDemo";

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Demo",
    sections: [{ id: "s1", field_ids: ["name", "active"] }],
    fields: [
        { id: "name", type: "text", label: "Name", required: true },
        { id: "active", type: "boolean", label: "Active", required: false },
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

    it("renders select labels from optionChoicesByFieldId when provided", () => {
        const pickSchema: FormSchemaV1 = {
            schema_version: 1,
            title: "Opts",
            sections: [{ id: "s1", field_ids: ["pick"] }],
            fields: [{ id: "pick", type: "select", label: "Pick", required: false, option_set_key: "colors" }],
        };
        const html = renderToStaticMarkup(
            <FormEngineRenderer
                schema={pickSchema}
                payload={{ values: {} }}
                onChange={() => {}}
                mode="edit"
                optionChoicesByFieldId={{ pick: [{ value: "a", label: "Alpha label" }] }}
            />
        );
        expect(html).toContain("Alpha label");
        expect(html).toContain('value="a"');
    });

    it("shows Add item for required repeating group even when list is temporarily empty", () => {
        const medSchema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const payload: FormPayload = { values: {}, groups: { medications: [] } };
        const html = renderToStaticMarkup(
            <FormEngineRenderer
                schema={medSchema}
                payload={payload}
                onChange={() => {}}
                mode="edit"
                variant="embed"
                optionValuesByFieldId={{
                    schedule: MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
                    route: MEDICATION_DEMO_ROUTE_ITEM_KEYS,
                }}
            />
        );
        expect(html).toContain("Add item");
        expect(html).toContain("Add at least 1 entry");
    });

    it("medication demo shows repeating-group affordance and typed signature acknowledgement (no raw UUID stub)", () => {
        const medSchema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const payload: FormPayload = {
            ...payloadWithMinimumRepeatingGroups(medSchema),
            values: {
                authorization_acknowledgement: true,
            },
        };
        const html = renderToStaticMarkup(
            <FormEngineRenderer
                schema={medSchema}
                payload={payload}
                onChange={() => {}}
                mode="edit"
                variant="embed"
                optionValuesByFieldId={{
                    schedule: MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
                    route: MEDICATION_DEMO_ROUTE_ITEM_KEYS,
                }}
            />
        );
        expect(html).toContain("Add item");
        expect(html).toContain("Medications #1");
        expect(html).toContain("electronic signature applies");
        expect(html).not.toContain("Drawn asset UUID");
    });

    it("embed guardian email control uses type email", () => {
        const medSchema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const payload: FormPayload = payloadWithMinimumRepeatingGroups(medSchema);
        const html = renderToStaticMarkup(
            <FormEngineRenderer
                schema={medSchema}
                payload={payload}
                onChange={() => {}}
                mode="edit"
                variant="embed"
                optionValuesByFieldId={{
                    schedule: MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
                    route: MEDICATION_DEMO_ROUTE_ITEM_KEYS,
                }}
            />
        );
        expect(html).toContain('type="email"');
        expect(html).toContain("autoComplete=\"email\"");
    });

    it("shows inline validation under signature when acknowledgment missing", () => {
        const medSchema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const payload: FormPayload = {
            ...payloadWithMinimumRepeatingGroups(medSchema),
            values: {
                authorization_acknowledgement: true,
            },
            signatures: {
                signature_guardian: {
                    kind: "typed",
                    typed_full_name: "Jamie Doe",
                },
            },
        };
        const html = renderToStaticMarkup(
            <FormEngineRenderer
                schema={medSchema}
                payload={payload}
                onChange={() => {}}
                mode="edit"
                variant="embed"
                optionValuesByFieldId={{
                    schedule: MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
                    route: MEDICATION_DEMO_ROUTE_ITEM_KEYS,
                }}
                validationErrors={[
                    {
                        path: ["signatures", "signature_guardian", "acknowledged_at"],
                        message: "acknowledgment required",
                    },
                ]}
            />
        );
        expect(html).toContain("acknowledgment required");
    });
});
