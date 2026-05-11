import { describe, expect, it } from "vitest";
import { validateFormSchema } from "@/lib/forms/schema";
import { validateFormPayload } from "@/lib/forms/validateSubmission";

describe("static select options (admin schema)", () => {
    it("accepts select with static_options only", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "m", title: "M", field_ids: ["color"] }],
            fields: [
                {
                    id: "color",
                    type: "select",
                    label: "Color",
                    required: true,
                    static_options: [
                        { value: "r", label: "Red" },
                        { value: "b", label: "Blue" },
                    ],
                },
            ],
        });
        expect(schema.fields[0].type).toBe("select");
    });

    it("validates payload against static_options without optionValues map", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "m", title: "M", field_ids: ["color"] }],
            fields: [
                {
                    id: "color",
                    type: "select",
                    label: "Color",
                    required: true,
                    static_options: [{ value: "r", label: "Red" }],
                },
            ],
        });
        const res = validateFormPayload({
            schemaJson: schema,
            payload: { values: { color: "r" } },
            mode: "submit",
        });
        expect(res.ok).toBe(true);
    });
});
