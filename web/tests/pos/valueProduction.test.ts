/**
 * The value-production invariant, and the controls that prove it can fail.
 *
 * A gate that only ever passes is not a gate. Each positive control deliberately strands a required
 * destination in a different way, and each must be caught.
 */
import { describe, it, expect } from "vitest";
import { assertValueProduction, valueProductionPathFor } from "@/lib/pos/packet/valueProduction";
import type { FormSchemaV1, FormField } from "@/lib/forms/schema";

const f = (over: Partial<FormField> & { id: string }): FormField =>
    ({ type: "text", label: over.id, required: false, ...over }) as FormField;

const schemaOf = (fields: FormField[]): FormSchemaV1 =>
    ({ schema_version: "v1", title: "t", fields, sections: [{ id: "s1", title: "s", field_ids: fields.map((x) => x.id) }] }) as unknown as FormSchemaV1;

describe("value production — what fills this box", () => {
    it("an asked destination is filled by the participant", () => {
        const v = valueProductionPathFor(f({ id: "a", required: true }));
        expect(v?.path).toBe("participant_interaction");
    });

    it("a signature and an upload are participant interactions, not blanks", () => {
        expect(valueProductionPathFor(f({ id: "s", type: "signature", required: true }))?.path).toBe("participant_interaction");
        expect(valueProductionPathFor(f({ id: "u", type: "file_ref", required: true }))?.path).toBe("participant_interaction");
    });

    it("an optional destination needs no mechanism", () => {
        expect(valueProductionPathFor(f({ id: "o", required: false, read_only: true }))?.path).toBe("source_requires_no_value");
    });

    it("a read-only destination bound to canonical truth is prefilled", () => {
        const v = valueProductionPathFor(f({ id: "g", required: true, read_only: true, field_source: { entity_type: "guardian", field_key: "name" } }));
        expect(v?.path).toBe("canonical_prefill");
        expect(v?.basis).toContain("person.full_name");
    });

    it("counts every path across a schema", () => {
        const r = assertValueProduction(schemaOf([
            f({ id: "a", required: true }),
            f({ id: "b", required: true, read_only: true, field_source: { entity_type: "guardian", field_key: "name" } }),
            f({ id: "c", required: false, read_only: true }),
        ]));
        expect(r.ok).toBe(true);
        expect(r.required).toBe(2);
        expect(r.byPath).toEqual({ participant_interaction: 1, canonical_prefill: 1, source_requires_no_value: 1 });
    });
});

describe("positive controls — the gate must actually fail", () => {
    it("strands a required destination that is hidden with no binding", () => {
        const r = assertValueProduction(schemaOf([f({ id: "held", label: "General health:", required: true, read_only: true })]));
        expect(r.ok).toBe(false);
        expect(r.stranded).toHaveLength(1);
        expect(r.stranded[0]!.evidence).toContain("binding=none");
    });

    it("strands a required destination bound to a key nothing resolves", () => {
        // The exact shape of a confident blank: a real-looking binding that no owner can fill.
        const r = assertValueProduction(schemaOf([
            f({ id: "x", label: "Student Age Upon Enrolling:", required: true, read_only: true, field_source: { entity_type: "child", field_key: "age_upon_enrolling" } }),
        ]));
        expect(r.ok).toBe(false);
        expect(r.stranded[0]!.label).toBe("Student Age Upon Enrolling:");
    });

    it("strands a destination whose entity is not a prefill root at all", () => {
        const r = assertValueProduction(schemaOf([
            f({ id: "y", required: true, read_only: true, field_source: { entity_type: "vendor", field_key: "name" } }),
        ]));
        expect(r.ok).toBe(false);
    });

    it("does NOT strand it once a declared mechanism covers it", () => {
        const field = f({ id: "z", label: "Dose 1", required: true, read_only: true });
        expect(assertValueProduction(schemaOf([field])).ok).toBe(false);
        expect(assertValueProduction(schemaOf([field]), { extractionFieldIds: new Set(["z"]) }).ok).toBe(true);
        expect(assertValueProduction(schemaOf([field]), { collectionFieldIds: new Set(["z"]) }).ok).toBe(true);
    });

    it("is independent of eligibility: it catches a wrongly-hidden REQUIRED question", () => {
        // Exactly the regression that hid all five signatures. Eligibility said "placed, not asked";
        // this model knows nothing about roles and still refuses it.
        const r = assertValueProduction(schemaOf([f({ id: "sig", label: "Signature1", type: "signature", required: true, read_only: true })]));
        expect(r.ok).toBe(false);
        expect(r.stranded[0]!.type).toBe("signature");
    });
});

describe("the vacuity control — a relinquished requirement is still a requirement", () => {
    it("catches a destination whose requirement was cleared to make it submittable", () => {
        // This is how the gate first passed 66 of 66 while six blanks sat on the documents: the
        // refinement clears `required` so a hidden box can submit, and a check reading the finished
        // field then reports "the source does not require a value here".
        const hidden = f({ id: "d1", label: "Today's Date:", type: "date", required: false, read_only: true });
        expect(assertValueProduction(schemaOf([hidden])).ok, "reading the finished field alone passes vacuously").toBe(true);
        const r = assertValueProduction(schemaOf([hidden]), { sourceRequiredFieldIds: new Set(["d1"]) });
        expect(r.ok).toBe(false);
        expect(r.required).toBe(1);
        expect(r.stranded[0]!.evidence).toContain("requirement relinquished");
    });

    it("still clears it once a real mechanism covers it", () => {
        const hidden = f({ id: "d2", label: "Parent Name:", required: false, read_only: true, field_source: { entity_type: "guardian", field_key: "name" } });
        const r = assertValueProduction(schemaOf([hidden]), { sourceRequiredFieldIds: new Set(["d2"]) });
        expect(r.ok).toBe(true);
        expect(r.byPath.canonical_prefill).toBe(1);
    });
});
