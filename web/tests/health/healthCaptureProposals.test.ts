/**
 * Medical capture a form DECLARES — the official immunization grid, a signed consent, insurance rows —
 * becomes Processing proposals in Medical's own words. Pure: nothing here writes.
 */
import { describe, expect, it } from "vitest";

import { parseHealthCaptureDeclaration } from "@/lib/health/healthCaptureDeclaration";
import { adaptHealthCaptureToProposals, reportedDoseDate } from "@/lib/health/healthCaptureProposals";
import { consentTextSha256 } from "@/lib/pos/processingCase/commit/executeMedicalConsentProposalCommit";
import { healthFactIdentityKey, readHealthFactRow } from "@/lib/health/healthFactFormMembers";
import { classifyCollectionProvider } from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const schema = {
    title: "CIS + release",
    sections: [],
    fields: [
        { id: "imm_dtap_dose_1", type: "date", label: "DTaP 1" },
        { id: "imm_dtap_dose_2", type: "date", label: "DTaP 2" },
        { id: "imm_mmr_dose_1", type: "date", label: "MMR 1" },
        { id: "imm_had_chickenpox", type: "boolean", label: "Had chickenpox" },
        { id: "mr_authorization", type: "text_block", label: "Authorization", content: "I authorize Lil' Sunshine to discuss my child's medical condition." },
        { id: "mr_signature", type: "signature", label: "Signature" },
        { id: "mr_signature_2", type: "signature", label: "Second signature" },
    ],
} as unknown as FormSchemaV1;

const decl = parseHealthCaptureDeclaration({
    health_capture: {
        immunization_grid: {
            vaccines: [
                { vaccine_key: "dtap", dose_field_ids: ["imm_dtap_dose_1", "imm_dtap_dose_2"] },
                { vaccine_key: "mmr", dose_field_ids: ["imm_mmr_dose_1"] },
                { vaccine_key: "not_a_vaccine", dose_field_ids: ["x"] },
            ],
            history: [{ vaccine_key: "varicella", field_id: "imm_had_chickenpox", state: "had_disease" }],
        },
        medical_consent: { consent_kind: "medical_records_release", text_field_ids: ["mr_authorization"], signature_field_ids: ["mr_signature", "mr_signature_2"] },
    },
})!;
const ctx = { formSubmissionId: "sub-1", formDefinitionVersionId: "ver-1" };

describe("health capture → proposals", () => {
    it("drops unknown vaccines and malformed declarations rather than guessing", () => {
        expect(decl.immunization_grid!.vaccines.map((v) => v.vaccine_key)).toEqual(["dtap", "mmr"]);
        expect(parseHealthCaptureDeclaration({ health_capture: { medical_consent: { consent_kind: "anything", signature_field_ids: ["s"] } } })).toBeNull();
        expect(parseHealthCaptureDeclaration({})).toBeNull();
    });

    it("one REPORTED immunization proposal per vaccine with dose dates; history alone is enough", () => {
        const cols = adaptHealthCaptureToProposals(schema, { values: { imm_dtap_dose_1: "2023-06-12", imm_dtap_dose_2: "08/12/2023", imm_mmr_dose_1: "", imm_had_chickenpox: true } }, decl, ctx);
        const imm = cols.find((c) => c.collection_provider_ref === "health.immunizations")!;
        expect(imm.instances.map((i) => i.instance_key)).toEqual(["dtap", "varicella"]);
        const dtap = imm.instances[0]!;
        expect(dtap.execution_kind).toBe("health_fact");
        expect(dtap.health_fact_intent).toMatchObject({ fact_kind: "immunization", payload: { vaccine_key: "dtap", reported: true, doses: [{ administered_on: "2023-06-12", dose_number: 1 }, { administered_on: "2023-08-12", dose_number: 2 }] } });
        expect(imm.instances[1]!.health_fact_intent!.payload).toMatchObject({ vaccine_key: "varicella", history_state: "had_disease", doses: [] });
    });

    it("Tdap is its own vaccine, never folded into DTaP; an empty Tdap row proposes nothing", () => {
        const tdapDecl = parseHealthCaptureDeclaration({ health_capture: { immunization_grid: { vaccines: [
            { vaccine_key: "dtap", dose_field_ids: ["imm_dtap_dose_1"] },
            { vaccine_key: "tdap", dose_field_ids: ["imm_tdap_dose_1"] },
        ] } } })!;
        expect(tdapDecl.immunization_grid!.vaccines.map((v) => v.vaccine_key)).toEqual(["dtap", "tdap"]);
        const withTdap = adaptHealthCaptureToProposals(schema, { values: { imm_dtap_dose_1: "2023-06-12", imm_tdap_dose_1: "2025-09-01" } }, tdapDecl, ctx)[0]!;
        expect(withTdap.instances.map((i) => [i.instance_key, (i.health_fact_intent!.payload as { doses: unknown[] }).doses.length])).toEqual([["dtap", 1], ["tdap", 1]]);
        const emptyTdap = adaptHealthCaptureToProposals(schema, { values: { imm_dtap_dose_1: "2023-06-12", imm_tdap_dose_1: "" } }, tdapDecl, ctx)[0]!;
        expect(emptyTdap.instances.map((i) => i.instance_key)).toEqual(["dtap"]);
    });

    it("a typed non-date is never turned into a dose", () => {
        expect(reportedDoseDate("last spring")).toBeNull();
        expect(reportedDoseDate("2023-06-12T00:00:00Z")).toBe("2023-06-12");
    });

    it("a consent is valid only when signed; an unshown second signature is not required", () => {
        const signed = adaptHealthCaptureToProposals(schema, { values: {}, signatures: { mr_signature: { kind: "drawn", typed_full_name: "Pat Rivers", acknowledged_at: "2026-10-21T10:00:00Z" } } }, decl, ctx);
        const c = signed.find((x) => x.collection_provider_ref === "medical.consents")!.instances[0]!;
        expect(c.execution_kind).toBe("medical_consent");
        expect(c.status).toBe("valid");
        expect(c.medical_consent_intent).toMatchObject({ consent_kind: "medical_records_release", signed: true, signed_by_name: "Pat Rivers", signed_at: "2026-10-21T10:00:00Z" });
        const unsigned = adaptHealthCaptureToProposals(schema, { values: {} }, decl, ctx).find((x) => x.collection_provider_ref === "medical.consents")!.instances[0]!;
        expect(unsigned.status).toBe("incomplete");
        expect(unsigned.medical_consent_intent!.signed).toBe(false);
    });

    it("the authorized text is hashed exactly; a changed sentence is a different text", () => {
        const a = consentTextSha256(schema.fields, ["mr_authorization"]);
        const edited = (schema.fields as FormField[]).map((f) => (f.id === "mr_authorization" ? { ...f, content: "I authorize something else." } : f)) as FormField[];
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(consentTextSha256(edited, ["mr_authorization"])).not.toBe(a);
        expect(consentTextSha256(schema.fields, ["missing"])).toBeNull();
    });

    it("insurance rows read in Medical's words; one coverage is provider + policy", () => {
        expect(classifyCollectionProvider("health.insurance")).toBe("health_fact");
        const lines = [
            { id: "ins__provider", type: "text", label: "Insurance company" },
            { id: "ins__policy_number", type: "text", label: "Policy number" },
            { id: "ins__subscriber_name", type: "text", label: "Policy holder" },
        ] as FormField[];
        const r = readHealthFactRow("insurance", lines, { ins__provider: "Pacific Health Plan", ins__policy_number: "PHP-4410-22", ins__subscriber_name: "Pat Rivers" });
        expect(r.payload).toEqual({ provider: "Pacific Health Plan", policy_number: "PHP-4410-22", subscriber_name: "Pat Rivers" });
        expect(r.missing_required).toEqual([]);
        expect(healthFactIdentityKey("insurance", { provider: "Pacific Health Plan", policy_number: "php-4410-22" })).toBe(healthFactIdentityKey("insurance", { provider: " pacific  health plan", policy_number: "PHP-4410-22" }));
        expect(readHealthFactRow("insurance", lines, { ins__policy_number: "X" }).missing_required).toEqual(["provider"]);
    });
});
