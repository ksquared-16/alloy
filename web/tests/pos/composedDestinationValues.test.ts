import { describe, expect, it } from "vitest";

import { fidelityFieldValues, parseFidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";
import { buildFidelityMappingFromDraft } from "@/lib/pos/processingCase/formDraft/buildFidelityMappingFromDraft";

/**
 * ONE PRINTED BOX CAN HOLD MORE THAN ONE FACT.
 *
 * Paper asks for "Emergency Contact Name" in a single box. The record keeps a first name and a last
 * name, because that is what a name is to a record. `fidelity_v1` mapped one widget to one field, so
 * the paperwork printed "Dana" and silently dropped "Reyes".
 *
 * The fix is presentation, not truth. Inventing an `emergency_contact_full_name` fact would let a
 * document's stationery decide the shape of business truth — and the canonical registry deliberately
 * holds no person-level full_name for that reason.
 */

const SOURCE = { sourceDocumentId: "3f1d9f1e-0c5a-4a1e-9b7c-2f0f6a1d4e77", sourceSha256: "a".repeat(64) };

const mapping = (acro: Record<string, unknown>) => ({
    engine: "fidelity_v1" as const,
    source_document_id: SOURCE.sourceDocumentId,
    source_sha256: SOURCE.sourceSha256,
    acro_fields: acro,
    signature_placements: [],
});

describe("a destination composes the fields it shows", () => {
    it("prints both halves of a name into the one box the source drew", () => {
        const m = parseFidelityPdfMapping(mapping({ emergency_contact_name: { field_id: "f1", compose_with: ["f2"] } }))!;
        expect(fidelityFieldValues(m, { f1: "Dana", f2: "Reyes" })).toEqual({ emergency_contact_name: "Dana Reyes" });
    });

    it("prints what is known when a part is missing, rather than a gap", () => {
        // A contact with no surname on file prints "Dana", not "Dana " — what a hand-filled box shows.
        const m = parseFidelityPdfMapping(mapping({ emergency_contact_name: { field_id: "f1", compose_with: ["f2"] } }))!;
        expect(fidelityFieldValues(m, { f1: "Dana" })).toEqual({ emergency_contact_name: "Dana" });
        expect(fidelityFieldValues(m, { f2: "Reyes" })).toEqual({ emergency_contact_name: "Reyes" });
    });

    it("leaves the box blank when nothing is known", () => {
        const m = parseFidelityPdfMapping(mapping({ emergency_contact_name: { field_id: "f1", compose_with: ["f2"] } }))!;
        expect(fidelityFieldValues(m, {})).toEqual({});
        expect(fidelityFieldValues(m, { f1: "   " })).toEqual({});
    });

    it("is generic — the same shape composes an address line", () => {
        // Not emergency-contact logic: any destination whose source drew one box for several facts.
        const m = parseFidelityPdfMapping(
            mapping({ home_address_line: { field_id: "street", compose_with: ["city", "zip"], compose_separator: ", " } }),
        )!;
        expect(fidelityFieldValues(m, { street: "144 Alder Way", city: "Portland", zip: "97204" })).toEqual({
            home_address_line: "144 Alder Way, Portland, 97204",
        });
    });

    it("leaves a direct binding exactly as it was", () => {
        const m = parseFidelityPdfMapping(mapping({ child_dob: { field_id: "d", date_format: "mm/dd/yyyy" } }))!;
        // Composition is additive: a destination without it still formats its single value.
        expect(fidelityFieldValues(m, { d: "2022-04-12" })).toEqual({ child_dob: "04/12/2022" });
    });

    it("accepts no expression, formula or operator-authored code", () => {
        // The directive is an ordered list of field ids and a separator. Nothing is evaluated.
        expect(parseFidelityPdfMapping(mapping({ x: { field_id: "a", compose_with: "a + b" } }))).toBeNull();
        expect(parseFidelityPdfMapping(mapping({ x: { field_id: "a", template: "{a} {b}" } }))).toBeNull();
    });
});

describe("discovery composes it, so an administrator configures nothing", () => {
    it("folds every question that came from one widget back into that widget", () => {
        /*
         * Review splits a source's single "Emergency Contact Name" into a first and a last name, and
         * both halves keep the provenance of the box they came from — so they arrive here together.
         * Draft order is document order, so the parts join in the order the form asks for them.
         */
        const draft = {
            source_document_id: SOURCE.sourceDocumentId,
            title: "Northwind",
            fields: [
                { id: "f_first", label: "Emergency contact first name", type: "text", required: false, confidence: "high", evidence: "pdf_field", pdf_field_name: "emergency_contact_name", page: 1 },
                { id: "f_last", label: "Emergency contact last name", type: "text", required: false, confidence: "high", evidence: "pdf_field", pdf_field_name: "emergency_contact_name", page: 1 },
                { id: "f_phone", label: "Emergency Contact Phone", type: "text", required: false, confidence: "high", evidence: "pdf_field", pdf_field_name: "emergency_contact_phone", page: 1 },
            ],
            sections: [{ id: "s1", title: "Form fields", field_ids: ["f_first", "f_last", "f_phone"] }],
        } as never;

        const m = buildFidelityMappingFromDraft(draft, SOURCE)!;
        expect(m.acro_fields.emergency_contact_name).toEqual({ field_id: "f_first", compose_with: ["f_last"] });
        // A box that holds one fact is untouched.
        expect(m.acro_fields.emergency_contact_phone).toEqual({ field_id: "f_phone" });
        expect(parseFidelityPdfMapping(m)).not.toBeNull();
        expect(fidelityFieldValues(m, { f_first: "Dana", f_last: "Reyes", f_phone: "503-555-0199" })).toEqual({
            emergency_contact_name: "Dana Reyes",
            emergency_contact_phone: "503-555-0199",
        });
    });
});
