import { describe, expect, it } from "vitest";
import {
    detectPlacementCandidateProjectionMismatch,
    isPlaceholderChildDisplayName,
    resolvePlacementCandidateChildDisplayName,
    resolvePlacementWaitlistChildDisplayLabel,
} from "@/lib/orchestration/placement/resolvePlacementCandidateChildDisplayName";
import { resolvePlacementCandidateCohortForQueue } from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";
import { expandOpportunityRowsToPlacementCandidateRows } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";

describe("resolvePlacementCandidateChildDisplayName", () => {
    it("prefers person first/last over stale customer_members display_name Child", () => {
        const name = resolvePlacementCandidateChildDisplayName({
            ocmMember: {
                display_name: "Child",
                persons: { first_name: "Riley", last_name: "Hayes" },
            },
        });
        expect(name).toBe("Riley Hayes");
    });

    it("treats literal Child as placeholder", () => {
        expect(isPlaceholderChildDisplayName("Child")).toBe(true);
        expect(isPlaceholderChildDisplayName("Riley")).toBe(false);
    });

    it("resolvePlacementWaitlistChildDisplayLabel avoids Child when person name exists", () => {
        expect(
            resolvePlacementWaitlistChildDisplayLabel({
                childDisplayName: "Riley Hayes",
                isSyntheticFallback: false,
            })
        ).toBe("Riley Hayes");
    });
});

describe("resolvePlacementCandidateCohortForQueue stale repair", () => {
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

    it("prefers OCM program category key over stale program_room_cohort_key (Williams-style)", () => {
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
});

describe("detectPlacementCandidateProjectionMismatch", () => {
    it("flags stale cohort and resolved child name", () => {
        const mismatch = detectPlacementCandidateProjectionMismatch({
            candidateStoredCohortKey: "infant",
            ocmCohortKey: "toddler_2_3_years",
            resolvedCohortKey: "toddler_2_3_years",
            ocmMember: { persons: { first_name: "Riley", last_name: "Hayes" } },
            candidateMember: { display_name: "Child" },
        });
        expect(mismatch.cohort_mismatch).toBe(true);
        expect(mismatch.resolved_child_display_name).toBe("Riley Hayes");
    });
});

describe("expandOpportunityRowsToPlacementCandidateRows Riley-style projection", () => {
    it("outputs resolved child + program labels from V2 candidate preview", () => {
        const { rows } = expandOpportunityRowsToPlacementCandidateRows([
            {
                id: "opp-riley",
                _customer_name: "Hayes household",
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: [
                        {
                            placement_candidate_id: "pc-riley",
                            child_display_name: "Riley Hayes",
                            program_room_cohort_key: "toddler_2_3_years",
                            program_room_group_label: "Toddler — 2–3 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["toddler_2_3_years", 100, "2024-01-01"],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                    ],
                    family_rollup: {
                        bucket: "tier_general_waitlist",
                        sort_tuple: [],
                        candidate_count: 1,
                    },
                },
            },
        ]);

        const proj = rows[0]?._placement_waitlist_row as {
            child_display_name: string;
            program_room_group_label: string;
        };
        expect(proj.child_display_name).toBe("Riley Hayes");
        expect(proj.program_room_group_label).toContain("Toddler");
    });

    it("does not surface literal Child placeholder from stale preview name", () => {
        const { rows } = expandOpportunityRowsToPlacementCandidateRows([
            {
                id: "opp-riley",
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: [
                        {
                            placement_candidate_id: "pc-riley",
                            child_display_name: "Child",
                            program_room_cohort_key: "toddler_2_3_years",
                            program_room_group_label: "Toddler — 2–3 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["toddler_2_3_years", 100, "2024-01-01"],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                    ],
                    family_rollup: { bucket: "tier_general_waitlist", sort_tuple: [], candidate_count: 1 },
                },
            },
        ]);
        const proj = rows[0]?._placement_waitlist_row as { child_display_name: string };
        expect(proj.child_display_name).toBe("Waitlisted child");
        expect(proj.child_display_name).not.toBe("Child");
    });

    it("Williams multi-child: two rows with resolved child names and drawer-aligned programs", () => {
        const { rows } = expandOpportunityRowsToPlacementCandidateRows([
            {
                id: "opp-williams",
                _customer_name: "Williams Family",
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: [
                        {
                            placement_candidate_id: "pc-riley",
                            child_display_name: "Riley Williams",
                            program_room_cohort_key: "toddler",
                            program_room_group_label: "Toddler",
                            bucket: "tier_general_waitlist",
                            sort_tuple: [],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                        {
                            placement_candidate_id: "pc-quinn",
                            child_display_name: "Quinn Williams",
                            program_room_cohort_key: "infant",
                            program_room_group_label: "Infant",
                            bucket: "tier_general_waitlist",
                            sort_tuple: [],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                    ],
                    family_rollup: {
                        bucket: "tier_general_waitlist",
                        sort_tuple: [],
                        candidate_count: 2,
                    },
                },
            },
        ]);

        expect(rows).toHaveLength(2);
        const labels = rows.map(
            (r) =>
                (r._placement_waitlist_row as { child_display_name: string; program_room_group_label: string })
        );
        expect(labels).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    child_display_name: "Riley Williams",
                    program_room_group_label: "Toddler",
                }),
                expect.objectContaining({
                    child_display_name: "Quinn Williams",
                    program_room_group_label: "Infant",
                }),
            ])
        );
    });
});

describe("filterPlacementCandidateBundlesForQueueDisplay", () => {
    it("suppresses synthetic fallback when real child candidates exist", async () => {
        const { filterPlacementCandidateBundlesForQueueDisplay } = await import(
            "@/lib/orchestration/placement/filterPlacementCandidateBundlesForQueueDisplay"
        );
        const real = {
            candidate: {
                id: "real",
                is_synthetic_fallback: false,
                program_room_cohort_key: "infant",
                program_room_group_label: "Infant",
            },
            child_display_name: "Quinn Williams",
            link_mode: "independent" as const,
            link_group: null,
            active_overrides: [],
        };
        const synthetic = {
            candidate: {
                id: "syn",
                is_synthetic_fallback: true,
                program_room_cohort_key: "infant",
                program_room_group_label: "Infant",
            },
            child_display_name: null,
            link_mode: "independent" as const,
            link_group: null,
            active_overrides: [],
        };
        const filtered = filterPlacementCandidateBundlesForQueueDisplay([synthetic as never, real as never]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.candidate.id).toBe("real");
    });
});
