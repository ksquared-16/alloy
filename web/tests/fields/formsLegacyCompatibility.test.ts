import { describe, expect, it } from "vitest";
import {
    FORMS_LEGACY_COMPATIBILITY_MATRIX,
    formsLegacyCompatibilityEntry,
} from "@/lib/fields/formsLegacyCompatibility";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

describe("formsLegacyCompatibility", () => {
    it("classifies every operational system field id", () => {
        expect(FORMS_LEGACY_COMPATIBILITY_MATRIX.length).toBe(OPERATIONAL_FORM_SYSTEM_FIELDS.length);
        for (const entry of OPERATIONAL_FORM_SYSTEM_FIELDS) {
            expect(formsLegacyCompatibilityEntry(entry.id)).toBeDefined();
        }
    });

    it("marks signature artifact as legacy load-only", () => {
        const entry = formsLegacyCompatibilityEntry("enrollment_acknowledgement_signature");
        expect(entry?.classification).toBe("legacy_load_only");
        expect(entry?.appearsInNewPickers).toBe(false);
        expect(entry?.publishes).toBe(true);
    });

    it("maps guardian_email as alias to canonical person.email", () => {
        const entry = formsLegacyCompatibilityEntry("guardian_email");
        expect(entry?.classification).toBe("alias_to_canonical");
        expect(entry?.canonicalRef).toMatchObject({ entity_type: "person", field_key: "email" });
    });
});
