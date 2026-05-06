import { describe, expect, it } from "vitest";
import { validateFormSchema } from "@/lib/forms/schema";
import { parseFormPdfMappingJson } from "@/lib/forms/pdf/pdfMappingContract";
import {
    MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA,
    MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING,
    MEDICATION_AUTHORIZATION_DEMO_SCHEMA,
} from "@/lib/forms/seeds/medicationAuthorizationDemo";

describe("Medication authorization demo seed", () => {
    it("schema validates under Forms Engine V1 parser", () => {
        const s = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        expect(s.title).toContain("Medication Authorization");
        expect(s.fields.some((f) => f.type === "group" && f.id === "medications")).toBe(true);
        expect(s.fields.some((f) => f.type === "signature")).toBe(true);
    });

    it("pdf_mapping_json parses", () => {
        const m = parseFormPdfMappingJson(MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING);
        expect(m?.template_key).toBe("medication_authorization_demo_v1");
        expect(m?.slots.med_name?.path).toContain("medications");
    });

    it("definition metadata flags demo-only posture", () => {
        expect(MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA.demo).toBe(true);
        expect(MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA.compliance_status).toBe("example_only");
        expect(MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA.not_official_state_form).toBe(true);
    });
});
