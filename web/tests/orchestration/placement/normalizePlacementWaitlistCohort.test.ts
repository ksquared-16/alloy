import { describe, expect, it } from "vitest";
import {
    cohortKeyLooksLikeRawSlug,
    normalizePlacementWaitlistCohort,
} from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";

describe("normalizePlacementWaitlistCohort", () => {
    it("slugifies cohort keys and preserves human labels", () => {
        const out = normalizePlacementWaitlistCohort(
            "preschool_3_4_years",
            "Preschool — 3–4 years"
        );
        expect(out.cohortKey).toBe("preschool_3_4_years");
        expect(out.cohortLabel).toBe("Preschool — 3–4 years");
    });

    it("does not use raw combined slug as human label", () => {
        const combined =
            "preschool_3_4_years_pre_k_4_5_years_young_toddler_18_24_months";
        const out = normalizePlacementWaitlistCohort(combined, combined);
        expect(out.cohortKey).toBe(combined);
        expect(out.cohortLabel).not.toBe(combined);
        expect(out.cohortLabel).not.toMatch(/^[a-z0-9_]+$/);
    });

    it("normalizes toddler key variants consistently", () => {
        const a = normalizePlacementWaitlistCohort("Toddler", "Toddler");
        const b = normalizePlacementWaitlistCohort("toddler", "Toddler");
        expect(a.cohortKey).toBe(b.cohortKey);
    });
});
