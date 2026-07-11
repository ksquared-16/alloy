import { describe, expect, it } from "vitest";
import {
    buildDesignPlaceholderPreviewPayload,
} from "@/lib/forms/preview/formPreviewOrchestration";
import { validateFormSchema } from "@/lib/forms/schema";

const schema = validateFormSchema({
    schema_version: 1,
    title: "T",
    sections: [{ id: "s", field_ids: ["kids"] }],
    fields: [
        {
            id: "kids",
            type: "group",
            label: "Children",
            required: true,
            repeat: { min: 1, max: 3 },
            collection_binding: {
                collection_provider_ref: "children",
                iteration_entity_type: "customer_member",
            },
            fields: [
                {
                    id: "child_first_name",
                    type: "text",
                    label: "First",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_first_name" },
                },
            ],
        },
    ],
});

describe("form preview orchestration", () => {
    it("design placeholder does not fabricate canonical collection items", () => {
        const result = buildDesignPlaceholderPreviewPayload(schema);
        expect(result.mode).toBe("design_placeholder");
        expect(result.diagnostics?.placeholder).toBe(true);
        const rows = result.payload.groups?.kids ?? [];
        expect(rows.every((r) => !r.collection?.item_id)).toBe(true);
        expect(result.payload.meta?.preview_mode).toBe("design_placeholder");
    });

    it("design placeholder may show min repeat structure only", () => {
        const rows = buildDesignPlaceholderPreviewPayload(schema).payload.groups?.kids ?? [];
        expect(rows.length).toBeGreaterThanOrEqual(1);
    });
});
