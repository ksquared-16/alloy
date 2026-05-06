import { describe, expect, it } from "vitest";
import { validateFormSchema } from "@/lib/forms/schema";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { MEDICATION_AUTHORIZATION_DEMO_SCHEMA } from "@/lib/forms/seeds/medicationAuthorizationDemo";

describe("payloadWithMinimumRepeatingGroups", () => {
    it("seeds one empty row when group repeat.min is 1", () => {
        const schema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const p = payloadWithMinimumRepeatingGroups(schema);
        expect(p.groups?.medications?.length).toBe(1);
        expect(p.groups?.medications?.[0]?.instance_key.length).toBeGreaterThan(0);
        expect(p.groups?.medications?.[0]?.values).toEqual({});
    });

    it("uses repeat.min when greater than zero for optional groups", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["items"] }],
            fields: [
                {
                    id: "items",
                    type: "group",
                    label: "Items",
                    required: false,
                    repeat: { min: 2, max: 4 },
                    fields: [{ id: "n", type: "text", label: "Name", required: false }],
                },
            ],
        });
        const p = payloadWithMinimumRepeatingGroups(schema);
        expect(p.groups?.items?.length).toBe(2);
    });

    it("required group with repeat.min 0 still seeds one row", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["g"] }],
            fields: [
                {
                    id: "g",
                    type: "group",
                    label: "G",
                    required: true,
                    repeat: { min: 0, max: 3 },
                    fields: [{ id: "x", type: "text", label: "X", required: false }],
                },
            ],
        });
        const p = payloadWithMinimumRepeatingGroups(schema);
        expect(p.groups?.g?.length).toBe(1);
    });
});
