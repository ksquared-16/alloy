import { describe, expect, it, vi } from "vitest";
import { loadPublishedFormEnvelope } from "@/lib/public/forms/loadPublishedFormEnvelope";

describe("loadPublishedFormEnvelope (packet / link version policy)", () => {
    it("resolves latest published when pinned id is null", async () => {
        const from = vi.fn((table: string) => {
            if (table === "form_definitions") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { id: "fd1", key: "k", name: "N", kind: "center" },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "form_definition_versions") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    order: () => ({
                                        limit: () => ({
                                            maybeSingle: async () => ({
                                                data: {
                                                    id: "v-latest",
                                                    schema_json: {
                                                        schema_version: 1,
                                                        title: "Hi",
                                                        sections: [{ id: "s", field_ids: ["a"] }],
                                                        fields: [{ id: "a", type: "text", label: "A" }],
                                                    },
                                                    pdf_mapping_json: null,
                                                },
                                                error: null,
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        });

        const env = await loadPublishedFormEnvelope(
            { from } as unknown as Parameters<typeof loadPublishedFormEnvelope>[0],
            "org1",
            "fd1",
            null
        );
        expect(env?.formDefinitionVersionId).toBe("v-latest");
        expect((env?.schemaJson as { title?: string })?.title).toBe("Hi");
    });
});
