import { describe, expect, it } from "vitest";
import {
    buildDesignPlaceholderPreviewPayload,
    previewLaunchContextFromMetadata,
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

    it("previewLaunchContextFromMetadata returns null without customer_id", () => {
        expect(previewLaunchContextFromMetadata({ form_context_mode: "existing_record" })).toBeNull();
        expect(previewLaunchContextFromMetadata(null)).toBeNull();
    });

    it("previewLaunchContextFromMetadata derives explicit launch context", () => {
        const ctx = previewLaunchContextFromMetadata({
            customer_id: "cust-1",
            opportunity_id: "opp-1",
            form_context_mode: "existing_record",
        });
        expect(ctx?.customer_id).toBe("cust-1");
        expect(ctx?.opportunity_id).toBe("opp-1");
    });
});
