import { describe, expect, it } from "vitest";

import { M1_HEALTH_FIELD_KEYS } from "@/lib/health/migration/healthGrainM1";
import {
    AUTHORABLE_FORM_SYSTEM_FIELDS,
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    SYSTEM_FIELD_BY_ID,
    isDeprecatedSystemField,
} from "@/lib/forms/systemFieldRegistry";

describe("M1 / D-H1 — health binds to the child, and only once", () => {
    it("no shipped health system field is bound to the enrollment grain any more", () => {
        // The defect: a child's allergy belonged to an enrolment episode, so it did not follow them
        // into next year's re-enrolment.
        for (const key of M1_HEALTH_FIELD_KEYS) {
            const entry = SYSTEM_FIELD_BY_ID.get(key);
            expect(entry, `${key} missing from the registry`).toBeTruthy();
            expect(entry!.entity_type).not.toBe("enrollment");
            expect(entry!.entity_type).toBe("child");
        }
    });

    it("allergy_notes points at the SAME destination as the child profile field — one owner", () => {
        // `health.allergy_notes` and `child.allergies` both claiming to be the answer is exactly the
        // "two durable owners" the Director's decision forbids.
        expect(SYSTEM_FIELD_BY_ID.get("allergy_notes")!.crm_mapping_key).toBe("child.allergies");
    });

    it("medication_flag is deprecated rather than migrated", () => {
        // "This child takes medication" is derivable from the medication facts. Keeping the boolean
        // would be a second answer that stops updating the moment a medication is added or ended.
        expect(isDeprecatedSystemField("medication_flag")).toBe(true);
        expect(SYSTEM_FIELD_BY_ID.get("medication_flag")!.deprecated_reason).toMatch(/person_health_facts/);
    });

    it("a deprecated field still RESOLVES but is never offered for new authoring", () => {
        // Removing it would break a form that already binds it; offering it would let an operator
        // recreate the duplicate owner it was retired for.
        expect(OPERATIONAL_FORM_SYSTEM_FIELDS.some((f) => f.id === "medication_flag")).toBe(true);
        expect(AUTHORABLE_FORM_SYSTEM_FIELDS.some((f) => f.id === "medication_flag")).toBe(false);
        // allergy_notes is re-grained, not retired — it stays authorable.
        expect(AUTHORABLE_FORM_SYSTEM_FIELDS.some((f) => f.id === "allergy_notes")).toBe(true);
    });
});
