import { describe, expect, it } from "vitest";
import {
    extractCollectionSubmissionEnvelope,
} from "@/lib/forms/collection/formsCollectionSubmissionValidation";
import { openProcessingCaseFromSource } from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import type { ProcessingCaseDeps } from "@/lib/pos/processingCase/types";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema } from "@/lib/forms/schema";

describe("Processing case ingestion preservation boundary", () => {
    it("submission envelope survives validateFormPayload and remains grouped per instance", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
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
                            label: "First",
                            required: false,
                            field_source: { entity_type: "child", field_key: "child_first_name" },
                        },
                    ],
                },
            ],
        });

        const payload = {
            values: {},
            groups: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Sam" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-1",
                            origin: "existing" as const,
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
            meta: {},
        };

        const validated = validateFormPayload({ schemaJson: schema, payload, mode: "submit" });
        expect(validated.ok).toBe(true);
        if (!validated.ok) return;

        const envelope = extractCollectionSubmissionEnvelope(validated.payload);
        const stamped = {
            ...validated.payload,
            meta: { ...((validated.payload.meta ?? {}) as Record<string, unknown>), collection_submission_envelope: envelope },
        };

        expect(stamped.meta.collection_submission_envelope).toBeDefined();
        const rows = (stamped.meta.collection_submission_envelope as Record<string, unknown>).kids as Array<{
            origin: string;
            item_id: string | null;
            values: Record<string, unknown>;
        }>;
        expect(rows[0]?.origin).toBe("existing");
        expect(rows[0]?.item_id).toBe("cm-1");
        expect(rows[0]?.values.child_first_name).toBe("Sam");
    });

    it("openProcessingCaseFromSource references submission only — payload not flattened at case open", async () => {
        const inserted: unknown[] = [];
        const deps: ProcessingCaseDeps = {
            findCaseIdByPrimarySource: async () => null,
            insertCase: async () => {
                const row = { id: "case-1" };
                inserted.push(row);
                return row;
            },
            insertSource: async (args) => {
                inserted.push(args);
            },
        };

        await openProcessingCaseFromSource(deps, {
            orgId: "org-1",
            sourceKind: "form_submission",
            sourceId: "sub-1",
        });

        expect(inserted.some((x) => (x as { sourceId?: string }).sourceId === "sub-1")).toBe(true);
        expect(JSON.stringify(inserted)).not.toContain("collection_submission_envelope");
    });
});
