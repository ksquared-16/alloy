import { describe, expect, it } from "vitest";
import {
    looksLikeCombinedProgramRoomCohort,
    resolvePlacementCandidateCohortForQueue,
    resolvePlacementCandidateCohortFromMember,
} from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";

describe("resolvePlacementCandidateCohortForQueue", () => {
    it("detects combined opportunity-level cohort keys", () => {
        expect(
            looksLikeCombinedProgramRoomCohort(
                "preschool_3_4_years_pre_k_4_5_years_young_toddler_18_24_months",
                "Preschool — 3–4 years · Pre-K — 4–5 years · Young Toddler — 18–24 months"
            )
        ).toBe(true);
    });

    it("repairs combined stored cohort using child DOB", () => {
        const liam = resolvePlacementCandidateCohortForQueue({
            storedKey: "preschool_3_4_years_pre_k_4_5_years_young_toddler_18_24_months",
            storedLabel: "Preschool — 3–4 years · Pre-K — 4–5 years · Young Toddler — 18–24 months",
            dateOfBirth: "2022-08-01",
        });
        const sophia = resolvePlacementCandidateCohortForQueue({
            storedKey: "preschool_3_4_years_pre_k_4_5_years_young_toddler_18_24_months",
            storedLabel: "Preschool — 3–4 years · Pre-K — 4–5 years · Young Toddler — 18–24 months",
            dateOfBirth: "2024-09-01",
        });
        const mia = resolvePlacementCandidateCohortForQueue({
            storedKey: "preschool_3_4_years_pre_k_4_5_years_young_toddler_18_24_months",
            storedLabel: "Preschool — 3–4 years · Pre-K — 4–5 years · Young Toddler — 18–24 months",
            dateOfBirth: "2022-01-15",
        });

        expect(liam.program_room_group_label).toBe("Preschool — 3–4 years");
        expect(mia.program_room_group_label).toBe("Pre-K — 4–5 years");
        expect(sophia.program_room_group_label).toBe("Young Toddler — 18–24 months");
        expect(new Set([liam.program_room_cohort_key, mia.program_room_cohort_key, sophia.program_room_cohort_key]).size).toBe(3);
    });

    it("prefers OCM toddler cohort over stale candidate infant", () => {
        const cohort = resolvePlacementCandidateCohortForQueue({
            storedKey: "infant",
            storedLabel: "Infant",
            ocmProgramRoomCohortKey: "toddler_2_3_years",
            ocmMetadata: { program_room_group_label: "Toddler — 2–3 years" },
        });
        expect(cohort.program_room_cohort_key).toBe("toddler_2_3_years");
        expect(cohort.program_room_group_label).toContain("Toddler");
    });

    it("prefers OCM program category key over stale program_room_cohort_key", () => {
        const riley = resolvePlacementCandidateCohortForQueue({
            storedKey: "infant",
            storedLabel: "Infant",
            ocmProgramRoomCohortKey: "infant",
            programKey: "toddler",
        });
        expect(riley.program_room_cohort_key).toMatch(/toddler/i);

        const quinn = resolvePlacementCandidateCohortForQueue({
            storedKey: "preschool",
            storedLabel: "Preschool",
            ocmProgramRoomCohortKey: "preschool",
            programKey: "infant",
        });
        expect(quinn.program_room_cohort_key).toMatch(/infant/i);
    });

    it("resolvePlacementCandidateCohortFromMember prefers member metadata over opportunity merge", () => {
        const out = resolvePlacementCandidateCohortFromMember({
            ocmMetadata: { program_label: "Toddler — 2–3 years" },
            dateOfBirth: null,
        });
        expect(out.program_room_group_label).toBe("Toddler — 2–3 years");
        expect(looksLikeCombinedProgramRoomCohort(out.program_room_cohort_key, out.program_room_group_label)).toBe(
            false
        );
    });
});
