import { describe, expect, it } from "vitest";
import {
    buildFormPdfIdempotencyKey,
    extractSlotStringsFromPayload,
    getPayloadValueAtPath,
    parseFormPdfMappingJson,
} from "@/lib/forms/pdf/pdfMappingContract";
import type { FormPayload } from "@/lib/forms/validateSubmission";

describe("Forms PDF mapping contract", () => {
    it("parses valid pdf_mapping_json", () => {
        const raw = {
            engine: "stub_v1",
            template_key: "t1",
            slots: { a: { path: "values.x" } },
        };
        const m = parseFormPdfMappingJson(raw);
        expect(m?.template_key).toBe("t1");
        expect(m?.slots.a?.path).toBe("values.x");
    });

    it("rejects mapping with empty slots object", () => {
        expect(parseFormPdfMappingJson({ template_key: "x", slots: {} })).toBeNull();
    });

    it("extracts nested group paths and signatures", () => {
        const mapping = parseFormPdfMappingJson({
            template_key: "medication_authorization_demo_v1",
            slots: {
                med_name: { path: "groups.medications.0.values.med_name" },
                sig: { path: "signatures.guardian.typed_full_name" },
            },
        })!;
        const payload: FormPayload = {
            values: {},
            groups: {
                medications: [
                    {
                        instance_key: "i1",
                        values: { med_name: "Ibuprofen", schedule: "daily" },
                    },
                ],
            },
            signatures: {
                guardian: { kind: "typed", typed_full_name: "Taylor Morgan", acknowledged_at: "2026-05-01T00:00:00.000Z" },
            },
        };
        const slots = extractSlotStringsFromPayload(mapping, payload);
        expect(slots.med_name).toBe("Ibuprofen");
        expect(slots.sig).toBe("Taylor Morgan");
    });

    it("getPayloadValueAtPath handles meta", () => {
        const payload: FormPayload = {
            values: { k: "v" },
            meta: { z: 1 },
        };
        expect(getPayloadValueAtPath(payload, "values.k")).toBe("v");
        expect(getPayloadValueAtPath(payload, "meta.z")).toBe(1);
    });

    it("idempotency key is stable for same ids + template", () => {
        const a = buildFormPdfIdempotencyKey({
            formSubmissionId: "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
            formDefinitionVersionId: "bbbbbbbb-bbbb-4ccc-9ddd-eeeeeeeeeeee",
            templateKey: "t",
        });
        const b = buildFormPdfIdempotencyKey({
            formSubmissionId: "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
            formDefinitionVersionId: "bbbbbbbb-bbbb-4ccc-9ddd-eeeeeeeeeeee",
            templateKey: "t",
        });
        expect(a).toBe(b);
        expect(a).toContain("forms_generated_pdf:v1:");
    });
});
