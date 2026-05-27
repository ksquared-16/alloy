import { describe, expect, it } from "vitest";
import {
    INTAKE_RUNTIME_VALIDATION_FORM_KEY,
    INTAKE_RUNTIME_VALIDATION_LINK_METADATA_OPPORTUNITY_INTAKE,
    INTAKE_RUNTIME_VALIDATION_LINK_METADATA_STANDARD,
    INTAKE_RUNTIME_VALIDATION_SCHEMA,
} from "@/lib/forms/seeds/intakeRuntimeValidationDemo";
import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { validateFormSchema } from "@/lib/forms/schema";

describe("intakeRuntimeValidationDemo FD-14", () => {
    it("exports a stable form key", () => {
        expect(INTAKE_RUNTIME_VALIDATION_FORM_KEY).toBe("intake_runtime_validation_v1");
    });

    it("validates the runtime validation schema", () => {
        expect(() => validateFormSchema(INTAKE_RUNTIME_VALIDATION_SCHEMA)).not.toThrow();
        const parsed = validateFormSchema(INTAKE_RUNTIME_VALIDATION_SCHEMA);
        expect(parsed.title).toBe("Intake Runtime Validation");
    });

    it("includes required checklist fields", () => {
        const ids = INTAKE_RUNTIME_VALIDATION_SCHEMA.fields.map((f) => f.id);
        expect(ids).toEqual(
            expect.arrayContaining([
                "child_first_name",
                "child_last_name",
                "child_dob",
                "guardian_name",
                "signature_guardian",
                "notes",
            ])
        );
        const sig = INTAKE_RUNTIME_VALIDATION_SCHEMA.fields.find((f) => f.id === "signature_guardian");
        expect(sig?.type).toBe("signature");
        expect(sig?.required).toBe(true);
        const dob = INTAKE_RUNTIME_VALIDATION_SCHEMA.fields.find((f) => f.id === "child_dob");
        expect(dob?.required).toBe(false);
    });

    it("defaults standard link metadata to production-safe (no auto CRM)", () => {
        const flags = parseIntakeAutoCreateFlags(INTAKE_RUNTIME_VALIDATION_LINK_METADATA_STANDARD);
        expect(flags.auto_create_opportunity).toBe(false);
        expect(flags.auto_create_person).toBe(false);
        expect(INTAKE_RUNTIME_VALIDATION_LINK_METADATA_STANDARD.lead_capture).toBe(false);
    });

    it("enables opportunity intake only on explicit opportunity metadata template", () => {
        const flags = parseIntakeAutoCreateFlags(INTAKE_RUNTIME_VALIDATION_LINK_METADATA_OPPORTUNITY_INTAKE);
        expect(flags.auto_create_opportunity).toBe(true);
        expect(INTAKE_RUNTIME_VALIDATION_LINK_METADATA_OPPORTUNITY_INTAKE.lead_capture).toBe(true);
    });
});
