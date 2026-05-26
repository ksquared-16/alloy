import { describe, expect, it } from "vitest";
import { documentCompositionSchema, sortDocumentBlocks } from "@/lib/forms/documentComposition";
import { formSchemaV1Schema } from "@/lib/forms/schema";

describe("documentComposition FD-4", () => {
    it("parses block union and sorts by order", () => {
        const parsed = documentCompositionSchema.parse({
            version: 1,
            blocks: [
                { id: "b2", type: "heading", content: "Section", order: 2 },
                { id: "b1", type: "text", content: "Intro", order: 1 },
            ],
        });

        const sorted = sortDocumentBlocks(parsed.blocks);
        expect(sorted[0]?.id).toBe("b1");
        expect(sorted[1]?.id).toBe("b2");
    });

    it("allows optional document_composition on form schema v1", () => {
        const result = formSchemaV1Schema.safeParse({
            schema_version: 1,
            title: "Enrollment",
            sections: [{ id: "s1", field_ids: ["f1"] }],
            fields: [{ id: "f1", type: "text", label: "Name", required: true }],
            document_composition: {
                version: 1,
                blocks: [{ id: "h1", type: "heading", content: "Welcome" }],
            },
        });

        expect(result.success).toBe(true);
    });
});
