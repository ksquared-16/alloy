/**
 * A chickenpox date exists only if there was chickenpox.
 *
 * `field_25` on the Oregon CIS sits in the Varicella row, under a tickbox reading "Check if child
 * had chickenpox disease", and the document prints "Date / Fecha" beneath it. It was declared
 * `derived: {kind: "execution_date"}`, so the platform stamped today into it at submission — and a
 * flattened, signed state health form asserted the child had chickenpox on their enrolment day,
 * with the tickbox above it empty.
 */

import { describe, expect, it } from "vitest";

import { applicableDocumentValues, documentFieldApplies } from "@/lib/forms/documentFieldApplies";
import { resolveFormDerivedValues } from "@/lib/forms/derived/resolveFormDerivedValues";
import { fidelityFieldValues } from "@/lib/forms/pdf/fidelityMappingContract";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/** The corrected shape of the Varicella row and the two signature dates. */
const cis = {
    title: "Oregon Certificate of Immunization Status",
    fields: [
        { id: "field_24", type: "boolean", label: "Var History", required: false },
        {
            id: "field_25",
            type: "date",
            label: "Date Fecha",
            required: false,
            visibility: { all: [{ field_id: "field_24", op: "eq", value: true }] },
        },
        { id: "field_46", type: "signature", label: "Signature1", required: false },
        {
            id: "field_47",
            type: "date",
            label: "Date Fecha",
            required: false,
            read_only: true,
            derived: { kind: "execution_date" },
            visibility: { all: [{ field_id: "field_46", op: "neq", value: null }] },
        },
        { id: "field_48", type: "signature", label: "Signature Update", required: false },
        {
            id: "field_49",
            type: "date",
            label: "Date Fecha 2",
            required: false,
            read_only: true,
            derived: { kind: "execution_date" },
            visibility: { all: [{ field_id: "field_48", op: "neq", value: null }] },
        },
    ],
    sections: [{ id: "s1", title: "Page 1", field_ids: ["field_24", "field_25", "field_46", "field_47", "field_48", "field_49"] }],
} as unknown as FormSchemaV1;

const signedOnce = { field_46: { kind: "drawn", drawn_document_id: "d1" } };

describe("the chickenpox date", () => {
    it("does not apply when the history box is not ticked", () => {
        const applies = documentFieldApplies({ schema: cis, values: {}, signatures: null });
        expect(applies("field_25")).toBe(false);
    });

    it("applies once the parent says the child had chickenpox", () => {
        const applies = documentFieldApplies({ schema: cis, values: { field_24: true }, signatures: null });
        expect(applies("field_25")).toBe(true);
    });

    it("prints nothing on the document while the condition is false, whatever the draft holds", () => {
        // A value entered and then un-ticked stays in the draft and stops printing. The document
        // says what is true now.
        const values = { field_24: false, field_25: "2024-03-02" };
        expect(applicableDocumentValues({ schema: cis, values, signatures: null })).toEqual({ field_24: false });
    });

    it("is never written by a derived writer", () => {
        // `field_25` carries no `derived` declaration at all in the corrected schema, so no clock
        // can reach it — the date belongs to the family, not to the platform.
        const derived = resolveFormDerivedValues(
            cis,
            { field_24: true },
            { executedAtIso: "2026-08-27T17:00:00Z", timeZone: "America/Los_Angeles", signatures: signedOnce },
        );
        expect(Object.keys(derived)).not.toContain("field_25");
    });
});

describe("a date beside a signature line is that signature's date", () => {
    it("is written for the signature that was made", () => {
        const derived = resolveFormDerivedValues(
            cis,
            {},
            { executedAtIso: "2026-08-27T17:00:00Z", timeZone: "America/Los_Angeles", signatures: signedOnce },
        );
        expect(derived.field_47).toBe("2026-08-27");
    });

    it("is NOT written for a signature nobody made", () => {
        // Stamping the update-signature date asserts an update that did not happen — the same class
        // of false statement as the chickenpox date, one row further down the same page.
        const derived = resolveFormDerivedValues(
            cis,
            {},
            { executedAtIso: "2026-08-27T17:00:00Z", timeZone: "America/Los_Angeles", signatures: signedOnce },
        );
        expect(Object.keys(derived)).not.toContain("field_49");
    });

    it("writes both once both signatures exist", () => {
        const derived = resolveFormDerivedValues(
            cis,
            {},
            {
                executedAtIso: "2026-08-27T17:00:00Z",
                timeZone: "America/Los_Angeles",
                signatures: { ...signedOnce, field_48: { kind: "typed", typed_full_name: "A Clinic" } },
            },
        );
        expect(derived.field_47).toBe("2026-08-27");
        expect(derived.field_49).toBe("2026-08-27");
    });
});

describe("the source-fidelity fill agrees with the schema", () => {
    const mapping = {
        engine: "fidelity_v1",
        source_sha256: "x".repeat(64),
        acro_fields: {
            "Var history": { field_id: "field_24" },
            "Date  Fecha": { field_id: "field_25" },
            "Date Fecha_2": { field_id: "field_49" },
        },
        signature_placements: [],
    } as never;

    it("omits an inapplicable box even when the payload carries a value for it", () => {
        const values = { field_24: false, field_25: "2024-03-02", field_49: "2026-08-27" };
        const applies = documentFieldApplies({ schema: cis, values, signatures: null });
        const filled = fidelityFieldValues(mapping, values, applies);
        expect(Object.keys(filled)).not.toContain("Date  Fecha");
        expect(Object.keys(filled)).not.toContain("Date Fecha_2");
    });

    it("fills every destination when no applicability is supplied — the historical behaviour", () => {
        const values = { field_25: "2024-03-02" };
        expect(Object.keys(fidelityFieldValues(mapping, values))).toContain("Date  Fecha");
    });
});

describe("an execution date is the day the artifact was executed", () => {
    /** The Exemption's shape: one signature, one unconditional signature-date. */
    const exemption = {
        title: "Oregon Nonmedical Exemption",
        fields: [
            { id: "sig", type: "signature", label: "Signature2", required: false },
            { id: "when", type: "date", label: "Date Fecha 3", required: false, read_only: true, derived: { kind: "execution_date" } },
        ],
        sections: [{ id: "s", title: "Page 2", field_ids: ["sig", "when"] }],
    } as unknown as FormSchemaV1;
    const ctx = { executedAtIso: "2026-08-27T17:00:00Z", timeZone: "America/Los_Angeles" };

    it("is not written for an artifact that asks to be signed and has not been", () => {
        // Covers an immutable version this correction may not republish, with no schema change.
        expect(resolveFormDerivedValues(exemption, {}, { ...ctx, signatures: {} })).toEqual({});
    });

    it("is written once the artifact is signed", () => {
        expect(
            resolveFormDerivedValues(exemption, {}, { ...ctx, signatures: { sig: { kind: "drawn", drawn_document_id: "d" } } }),
        ).toEqual({ when: "2026-08-27" });
    });

    it("does not gate an artifact that asks for no signature at all", () => {
        const noSig = {
            title: "Admissions",
            fields: [{ id: "when", type: "text", label: "Today's Date:", read_only: true, derived: { kind: "execution_date" } }],
            sections: [{ id: "s", title: "x", field_ids: ["when"] }],
        } as unknown as FormSchemaV1;
        expect(resolveFormDerivedValues(noSig, {}, { ...ctx, signatures: {} })).toEqual({ when: "8/27/2026" });
    });

    it("keeps the historical behaviour when the caller knows nothing about signatures", () => {
        expect(resolveFormDerivedValues(exemption, {}, ctx)).toEqual({ when: "2026-08-27" });
    });
});
