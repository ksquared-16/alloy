import { describe, expect, it } from "vitest";

import {
    CRITICAL_SEVERITIES,
    healthFactLabel,
    readAllergyPayload,
    readConditionPayload,
    readImmunizationPayload,
    readMedicationPayload,
} from "@/lib/health/healthFactModel";

describe("health fact payloads — tolerant of absence, intolerant of invention", () => {
    it("returns null severity when the payload does not state one", () => {
        // The single most dangerous value this module could produce is a DEFAULT severity on an
        // allergy. A payload that says nothing about severity has none.
        expect(readAllergyPayload({ allergen: "Peanut" }).severity).toBeNull();
        expect(readConditionPayload({ condition: "Asthma" }).severity).toBeNull();
    });

    it("carries a severity that arrived from Trust rather than recomputing it", () => {
        const out = readAllergyPayload({
            allergen: "Peanut",
            severity: "life_threatening",
            reaction: "Anaphylaxis",
            treatment: "EpiPen Jr 0.15mg",
        });
        expect(out.severity).toBe("life_threatening");
        expect(out.treatment).toBe("EpiPen Jr 0.15mg");
        expect(CRITICAL_SEVERITIES).toContain(out.severity!);
    });

    it("rejects a severity outside the vocabulary instead of passing it through", () => {
        expect(readAllergyPayload({ allergen: "Peanut", severity: "VERY BAD" }).severity).toBeNull();
    });

    it("reads PRN from either spelling, because both appear in real intake", () => {
        expect(readMedicationPayload({ medication: "Albuterol", prn: true }).asNeeded).toBe(true);
        expect(readMedicationPayload({ medication: "Albuterol", as_needed: true }).asNeeded).toBe(true);
        expect(readMedicationPayload({ medication: "Albuterol" }).asNeeded).toBe(false);
    });

    it("orders immunization doses by dose number — they are ordered values of ONE fact", () => {
        const out = readImmunizationPayload({
            vaccine_key: "dtap",
            doses: [
                { administered_on: "2025-06-01", dose_number: 2 },
                { administered_on: "2025-02-01", dose_number: 1 },
                { administered_on: "2026-01-05", dose_number: 3 },
            ],
        });
        expect(out.doses.map((d) => d.doseNumber)).toEqual([1, 2, 3]);
        expect(out.doses[0]!.administeredOn).toBe("2025-02-01");
    });

    it("has no exemption concept — exemption is a Business Process requirement exception", () => {
        const out = readImmunizationPayload({ vaccine_key: "mmr", history_state: "had_disease" });
        expect(out.historyState).toBe("had_disease");
        expect(Object.keys(out)).not.toContain("exemption");
    });

    it("labels every kind without exposing storage taxonomy", () => {
        expect(healthFactLabel({ fact_kind: "allergy", payload: { allergen: "Peanut" } })).toBe("Peanut");
        expect(healthFactLabel({ fact_kind: "condition", payload: { condition: "Asthma" } })).toBe("Asthma");
        expect(healthFactLabel({ fact_kind: "medication", payload: { medication: "EpiPen" } })).toBe("EpiPen");
        expect(healthFactLabel({ fact_kind: "immunization", payload: { vaccine_key: "dtap" } })).toBe("dtap");
        // An empty payload still names its kind rather than rendering blank.
        expect(healthFactLabel({ fact_kind: "allergy", payload: {} })).toBe("Allergy");
    });
});
