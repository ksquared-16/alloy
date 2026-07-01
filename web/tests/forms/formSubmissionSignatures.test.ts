import { describe, expect, it } from "vitest";
import { validateFormSchema } from "@/lib/forms/schema";
import { collectSignaturesFromPayload } from "@/lib/forms/signatures/collectSignaturesFromPayload";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { MEDICATION_AUTHORIZATION_DEMO_SCHEMA } from "@/lib/forms/seeds/medicationAuthorizationDemo";

describe("Form submission signatures collection", () => {
    const schema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);

    it("collects top-level typed signatures", () => {
        const payload: FormPayload = {
            values: { authorization_acknowledgement: true },
            signatures: {
                signature_guardian: {
                    kind: "typed",
                    typed_full_name: "Alex Rivera",
                    acknowledged_at: "2026-05-06T12:00:00.000Z",
                },
            },
        };
        const collected = collectSignaturesFromPayload(schema, payload);
        expect(collected).toHaveLength(1);
        expect(collected[0]?.field_id).toBe("signature_guardian");
        expect(collected[0]?.instance_key).toBe("");
        expect(collected[0]?.signature.kind).toBe("typed");
        expect(collected[0]?.signature.typed_full_name).toBe("Alex Rivera");
    });

    it("collects drawn signatures with document id", () => {
        const demoSigSchema = validateFormSchema({
            schema_version: 1,
            title: "S",
            sections: [{ id: "s1", field_ids: ["sig_field"] }],
            fields: [
                {
                    id: "sig_field",
                    type: "signature",
                    label: "Sign here",
                    required: true,
                },
            ],
        });
        const docId = "cccccccc-cccc-4ccc-9ccc-cccccccccccc";
        const payload: FormPayload = {
            values: {},
            signatures: {
                sig_field: { kind: "drawn", drawn_document_id: docId, acknowledged_at: "2026-05-06T12:00:00.000Z" },
            },
        };
        const collected = collectSignaturesFromPayload(demoSigSchema, payload);
        expect(collected).toHaveLength(1);
        expect(collected[0]?.signature.kind).toBe("drawn");
        expect(collected[0]?.signature.drawn_document_id).toBe(docId);
    });

    it("collects nested repeatable signatures with instance_key", () => {
        const nested = validateFormSchema({
            schema_version: 1,
            title: "Nested",
            sections: [{ id: "s1", field_ids: ["outer"] }],
            fields: [
                {
                    id: "outer",
                    type: "group",
                    label: "Outer",
                    fields: [
                        {
                            id: "inner_sig",
                            type: "signature",
                            label: "Inner sign",
                            required: false,
                        },
                    ],
                },
            ],
        });
        const payload: FormPayload = {
            values: {},
            groups: {
                outer: [
                    {
                        instance_key: "row-a",
                        values: {},
                        signatures: {
                            inner_sig: {
                                kind: "typed",
                                typed_full_name: "Nominee A",
                                acknowledged_at: "2026-05-06T12:00:00.000Z",
                            },
                        },
                    },
                ],
            },
        };
        const collected = collectSignaturesFromPayload(nested, payload);
        expect(collected).toHaveLength(1);
        expect(collected[0]?.instance_key).toBe("row-a");
        expect(collected[0]?.field_id).toBe("inner_sig");
    });
});
