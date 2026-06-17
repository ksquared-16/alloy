import { describe, expect, it } from "vitest";
import { deriveAgeFromDateOfBirth } from "@/lib/fields/derived/ageFromDateOfBirth";
import { resolveDerivedFieldDisplay } from "@/lib/fields/derived/resolveDerivedFieldDisplay";
import { buildHouseholdReviewWarnings } from "@/lib/intake/review/intakeReviewWarnings";

describe("deriveAgeFromDateOfBirth", () => {
    it("formats years and months for operator display", () => {
        const result = deriveAgeFromDateOfBirth("2024-06-06", new Date("2026-06-17"));
        expect(result?.display).toBe("2 yrs 0 mos");
        expect(result?.value).toEqual({ years: 2, months: 0 });
    });
});

describe("resolveDerivedFieldDisplay", () => {
    it("resolves create_lead child_age from child_date_of_birth binding", () => {
        const result = resolveDerivedFieldDisplay({
            target_key: "child_age",
            values: { child_date_of_birth: "2024-06-06" },
            asOfDate: new Date("2026-06-17"),
        });
        expect(result?.display).toBe("2 yrs 0 mos");
    });
});

describe("buildHouseholdReviewWarnings", () => {
    it("emits specific parent and child commit warnings", () => {
        const warnings = buildHouseholdReviewWarnings({
            parents: [{ candidate_id: "p1" }, { candidate_id: "p2" }] as never,
            children: [{ candidate_id: "c1" }, { candidate_id: "c2" }] as never,
            has_address: true,
            action_has_address_field: false,
        });
        expect(warnings.some((w) => w.message.includes("2 parents/guardians detected"))).toBe(true);
        expect(warnings.some((w) => w.message.includes("2 children detected"))).toBe(true);
        expect(warnings.some((w) => w.message.includes("no address field"))).toBe(true);
    });

    it("emits invalid phone warning when present", () => {
        const warnings = buildHouseholdReviewWarnings({
            parents: [{ candidate_id: "p1" }] as never,
            children: [],
            has_address: false,
            has_invalid_phone: true,
            invalid_phone_value: "987988899",
        });
        expect(warnings.some((w) => w.code === "invalid_phone")).toBe(true);
        expect(warnings.some((w) => w.message.includes("987988899"))).toBe(true);
    });
});
