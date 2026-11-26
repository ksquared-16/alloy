import { describe, expect, it } from "vitest";
import { classifySignatureName } from "@/lib/pos/processingCase/structure/signatureFieldName";
import { mapAcroFormFields } from "@/lib/pos/processingCase/structure/pdfAcroForm";

describe("classifySignatureName — head-noun reading", () => {
    it.each([
        ["Signature", "initial"],
        ["Signature1", "initial"],
        ["Signature2", "initial"],
        ["Signature_1", "initial"],
        ["Parent Signature", "initial"],
        ["parent_signature", "initial"],
        ["guardianSignature", "initial"],
        ["sig_parent", "initial"],
        ["Signature update", "update"],
        ["signature_updated", "update"],
        ["Signature line", "initial"],
        ["Signature II", "initial"],
    ])("%s is a signature (%s)", (name, variant) => {
        const v = classifySignatureName(name);
        expect(v.isSignature, `${name}: ${v.reason}`).toBe(true);
        expect(v.variant).toBe(variant);
    });

    it.each([
        "signature_count",
        "signature_date",
        "Signature Date",
        "signature_name",
        "signature_printed_name",
        "signature_image_url",
        "signature_type",
        "signature_status",
        "has_signature_id",
        "Date Fecha",
        "Childs last name",
    ])("%s is NOT a signature", (name) => {
        const v = classifySignatureName(name);
        expect(v.isSignature, `${name}: ${v.reason}`).toBe(false);
    });

    it("keeps the ordinal so two numbered signature lines stay distinguishable", () => {
        expect(classifySignatureName("Signature1").ordinal).toBe(1);
        expect(classifySignatureName("Signature2").ordinal).toBe(2);
        expect(classifySignatureName("Signature").ordinal).toBeUndefined();
    });

    it("never claims a signature when nothing substantive heads the name", () => {
        expect(classifySignatureName("").isSignature).toBe(false);
        expect(classifySignatureName("2").isSignature).toBe(false);
        expect(classifySignatureName("update 2").isSignature).toBe(false);
    });
});

describe("mapAcroFormFields — the real Oregon CIS signature shape", () => {
    // The three signature widgets the real Certificate of Immunization Status carries. All three
    // are /Tx (text) widgets — the form declares no /Sig at all. Before this repair, the two
    // MANDATORY ones typed as text and only the optional re-sign line typed as a signature.
    const CIS_SIGNATURE_WIDGETS = [
        { fieldName: "Signature1", fieldType: "Tx", page: 1, rect: [142, 100, 370, 118] },
        { fieldName: "Date Fecha", fieldType: "Tx", page: 1, rect: [418, 101, 595, 119] },
        { fieldName: "Signature update", fieldType: "Tx", page: 1, rect: [140, 74, 370, 92] },
        { fieldName: "Date Fecha_2", fieldType: "Tx", page: 1, rect: [418, 75, 595, 93] },
        { fieldName: "Signature2", fieldType: "Tx", page: 2, rect: [99, 24, 368, 42] },
        { fieldName: "Date Fecha_3", fieldType: "Tx", page: 2, rect: [419, 22, 596, 40] },
    ];

    it("classifies both mandatory attestations as signatures", () => {
        const byName = Object.fromEntries(mapAcroFormFields(CIS_SIGNATURE_WIDGETS, 2).fields.map((f) => [f.name, f]));
        expect(byName["Signature1"].type).toBe("signature");
        expect(byName["Signature2"].type).toBe("signature");
        expect(byName["Signature update"].type).toBe("signature");
    });

    it("keeps the update line distinguishable from the initial signatures", () => {
        const byName = Object.fromEntries(mapAcroFormFields(CIS_SIGNATURE_WIDGETS, 2).fields.map((f) => [f.name, f]));
        expect(byName["Signature1"].signature_variant).toBe("initial");
        expect(byName["Signature2"].signature_variant).toBe("initial");
        expect(byName["Signature update"].signature_variant).toBe("update");
    });

    it("leaves the dates that accompany each signature typed as dates", () => {
        const byName = Object.fromEntries(mapAcroFormFields(CIS_SIGNATURE_WIDGETS, 2).fields.map((f) => [f.name, f]));
        expect(byName["Date Fecha"].type).toBe("date");
        expect(byName["Date Fecha_2"].type).toBe("date");
        expect(byName["Date Fecha_3"].type).toBe("date");
        expect(byName["Date Fecha"].signature_variant).toBeUndefined();
    });

    it("does not start calling a signature-adjacent scalar a signature", () => {
        const fields = mapAcroFormFields(
            [
                { fieldName: "signature_count", fieldType: "Tx", page: 1, rect: [0, 0, 10, 10] },
                { fieldName: "signature_printed_name", fieldType: "Tx", page: 1, rect: [0, 20, 10, 30] },
            ],
            1
        ).fields;
        expect(fields.map((f) => f.type)).not.toContain("signature");
        expect(fields.every((f) => f.signature_variant === undefined)).toBe(true);
    });
});
