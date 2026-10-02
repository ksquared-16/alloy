import { describe, expect, it } from "vitest";

import { buildDraftSavePayload, buildMappingChangePayload } from "@/lib/pos/formDraft/buildDraftSavePayload";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const draft = {
    title: "Admissions Packet",
    generated_form_name: "Admissions Packet",
    sections: [
        { id: "s1", title: "Child Information", field_ids: ["name", "allergies", "describe"], disposition: "fields" },
        { id: "s2", title: "Consent", field_ids: ["sig"], disposition: "signature" },
    ],
    fields: [
        {
            id: "name",
            label: "Student Name",
            type: "text",
            required: true,
            confidence: "high",
            field_source: { entity_type: "customer_member", field_key: "full_name" },
            evidence: "Student Name: ____",
            page: 1,
            bbox: [1, 2, 3, 4],
            pdf_field_name: "student_name",
        },
        { id: "allergies", label: "Allergies?", type: "select", required: false, confidence: "high", options: ["Yes", "No", "None known"] },
        {
            id: "describe",
            label: "If yes, please describe",
            type: "text",
            required: false,
            confidence: "high",
            visible_when: { field_id: "allergies", op: "eq", value: "Yes" },
        },
        { id: "sig", label: "Parent signature", type: "signature", required: true, confidence: "high" },
    ],
} as unknown as StoredFormDraftPreview;

describe("changing one field does not delete the rest of the draft", () => {
    const built = buildMappingChangePayload(draft, "name", { entity_type: "person", field_key: "full_name" });

    it("applies the change asked for", () => {
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields[0]!.field_source).toEqual({ entity_type: "person", field_key: "full_name" });
    });

    it("keeps every field, in order", () => {
        if (!built.ok) return;
        expect(built.payload.fields.map((f) => f.label)).toEqual([
            "Student Name",
            "Allergies?",
            "If yes, please describe",
            "Parent signature",
        ]);
    });

    it("keeps each field in its own section — the document does not collapse into one", () => {
        if (!built.ok) return;
        expect(built.payload.fields.map((f) => f.section)).toEqual([
            "Child Information",
            "Child Information",
            "Child Information",
            "Consent",
        ]);
    });

    it("keeps an accepted condition, which would otherwise silently un-accept itself", () => {
        if (!built.ok) return;
        expect(built.payload.fields[2]!.visible_when).toEqual({ field_id: "allergies", op: "eq", value: "Yes" });
    });

    it("keeps a question's own choices, so a select does not become free text", () => {
        if (!built.ok) return;
        expect(built.payload.fields[1]!.options).toEqual(["Yes", "No", "None known"]);
    });

    it("keeps the source provenance the importer found", () => {
        if (!built.ok) return;
        expect(built.payload.fields[0]).toMatchObject({
            evidence: "Student Name: ____",
            page: 1,
            bbox: [1, 2, 3, 4],
            pdf_field_name: "student_name",
        });
    });

    it("keeps an untouched field's destination exactly as it was", () => {
        const other = buildMappingChangePayload(draft, "allergies", { entity_type: "customer_member", field_key: "allergies" });
        expect(other.ok).toBe(true);
        if (!other.ok) return;
        expect(other.payload.fields[0]!.field_source).toEqual({ entity_type: "customer_member", field_key: "full_name" });
    });

    it("keeps the operator's earlier section decisions", () => {
        if (!built.ok) return;
        expect(built.payload.section_dispositions).toEqual([
            { id: "s1", disposition: "fields" },
            { id: "s2", disposition: "signature" },
        ]);
    });
});

describe("keeping an answer with the form", () => {
    it("omits the destination rather than sending an empty one", () => {
        const built = buildMappingChangePayload(draft, "name", null);
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields[0]).not.toHaveProperty("field_source");
    });
});

describe("several edits at once", () => {
    it("applies label, requiredness and destination together", () => {
        const built = buildDraftSavePayload(
            draft,
            new Map([
                ["name", { label: "Child name", required: false }],
                ["sig", { field_source: { entity_type: "person", field_key: "signature" } }],
            ]),
        );
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields[0]).toMatchObject({ label: "Child name", required: false });
        expect(built.payload.fields[3]!.field_source).toEqual({ entity_type: "person", field_key: "signature" });
    });

    it("refuses a field that is not on the draft instead of posting a list that drops it", () => {
        expect(buildDraftSavePayload(draft, new Map([["ghost", { required: true }]]))).toEqual({
            ok: false,
            reason: "unknown_field",
        });
    });

    it("refuses an empty draft", () => {
        expect(buildDraftSavePayload({ ...draft, fields: [] } as StoredFormDraftPreview)).toEqual({
            ok: false,
            reason: "no_fields",
        });
    });
});
