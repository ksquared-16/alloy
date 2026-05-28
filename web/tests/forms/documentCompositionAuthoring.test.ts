import { describe, expect, it } from "vitest";
import {
    buildDefaultDocumentComposition,
    resolveDocumentComposition,
    syncCompositionWithSchemaFields,
} from "@/lib/forms/documentCompositionAuthoring";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { formSchemaV1Schema } from "@/lib/forms/schema";

const childEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_first_name")!;

const baseSchema: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment intake",
    sections: [{ id: "main", title: "Family details", field_ids: ["child_first_name"] }],
    fields: [formFieldFromRegistryEntry(childEntry, {})],
};

describe("documentCompositionAuthoring FD-8/FD-9", () => {
    it("builds default composition with heading, field region, and signature placeholder", () => {
        const composition = buildDefaultDocumentComposition(baseSchema);

        expect(composition.version).toBe(1);
        expect(composition.blocks.some((b) => b.type === "heading" && b.content === "Enrollment intake")).toBe(true);
        expect(composition.blocks.some((b) => b.type === "field_region" && b.field_ids.includes("child_first_name"))).toBe(
            true
        );
        expect(composition.blocks.some((b) => b.type === "image")).toBe(true);
        expect(composition.blocks.some((b) => b.type === "signature")).toBe(true);
    });

    it("syncs new fields into primary field region", () => {
        const composition = buildDefaultDocumentComposition(baseSchema);
        const extended: FormSchemaV1 = {
            ...baseSchema,
            sections: [{ id: "main", title: "Family details", field_ids: ["child_first_name", "custom_q"] }],
            fields: [
                ...baseSchema.fields,
                {
                    id: "custom_q",
                    type: "text",
                    label: "Notes",
                    required: false,
                    field_source: { entity_type: "custom", field_key: "unmapped" },
                },
            ],
        };

        const synced = syncCompositionWithSchemaFields(extended, composition);
        const region = synced.blocks.find((b) => b.type === "field_region");
        expect(region?.type === "field_region" && region.field_ids).toContain("custom_q");
    });

    it("resolveDocumentComposition returns default when schema has no composition", () => {
        const resolved = resolveDocumentComposition(baseSchema);
        expect(resolved.blocks.length).toBeGreaterThan(0);
        expect(baseSchema.document_composition).toBeUndefined();
    });

    it("suppresses duplicate section heading when section title matches form title", () => {
        const schema: FormSchemaV1 = {
            ...baseSchema,
            title: "Contact Us for More Details",
            sections: [{ id: "main", title: "Contact Us for More Details", field_ids: ["child_first_name"] }],
        };
        const composition = buildDefaultDocumentComposition(schema);
        const h2Blocks = composition.blocks.filter(
            (b) => b.type === "heading" && b.level === "h2" && b.content === "Contact Us for More Details"
        );
        expect(h2Blocks.length).toBe(0);
        const region = composition.blocks.find((b) => b.type === "field_region");
        expect(region?.type === "field_region" && region.title).toBeUndefined();
    });

    it("persists field_region in schema v1 parsing", () => {
        const composition = buildDefaultDocumentComposition(baseSchema);
        const parsed = formSchemaV1Schema.safeParse({
            ...baseSchema,
            document_composition: composition,
        });
        expect(parsed.success).toBe(true);
    });
});
