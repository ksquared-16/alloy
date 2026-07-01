import { describe, expect, it } from "vitest";
import {
    ORG_PROGRAM_CATEGORY_KEYS,
    resolveOrgProgramCategoryForWaitlist,
} from "@/lib/orchestration/placement/orgProgramCategory";

describe("orgProgramCategory", () => {
    it("maps org-level cohort keys directly", () => {
        expect(resolveOrgProgramCategoryForWaitlist({ cohortKey: "infant", cohortLabel: "Infant" })).toEqual({
            categoryKey: "infant",
            categoryLabel: "Infant",
        });
        expect(resolveOrgProgramCategoryForWaitlist({ cohortKey: "preschool", cohortLabel: "Preschool" })).toEqual({
            categoryKey: "preschool",
            categoryLabel: "Preschool",
        });
    });

    it("rolls Young Toddler into Toddler org category", () => {
        const r = resolveOrgProgramCategoryForWaitlist({
            cohortLabel: "Young Toddler — 18–24 months",
        });
        expect(r.categoryKey).toBe("toddler");
        expect(r.categoryLabel).toBe("Toddler");
    });

    it("maps detailed age-band labels to org category without room granularity", () => {
        expect(
            resolveOrgProgramCategoryForWaitlist({ cohortLabel: "Pre-K — 4–5 years" }).categoryKey
        ).toBe("pre_k");
        expect(
            resolveOrgProgramCategoryForWaitlist({ cohortLabel: "Preschool — 3–4 years" }).categoryKey
        ).toBe("preschool");
    });

    it("maps location-level room names to org category", () => {
        expect(resolveOrgProgramCategoryForWaitlist({ cohortLabel: "Toddler A" }).categoryKey).toBe("toddler");
        expect(resolveOrgProgramCategoryForWaitlist({ cohortLabel: "Infant B" }).categoryKey).toBe("infant");
        expect(resolveOrgProgramCategoryForWaitlist({ cohortLabel: "Preschool 1" }).categoryKey).toBe("preschool");
        expect(resolveOrgProgramCategoryForWaitlist({ cohortLabel: "Toddler Room" }).categoryKey).toBe("toddler");
    });

    it("returns unspecified for unknown labels", () => {
        expect(resolveOrgProgramCategoryForWaitlist({ cohortKey: null, cohortLabel: null }).categoryKey).toBe(
            ORG_PROGRAM_CATEGORY_KEYS.unspecified
        );
    });
});
