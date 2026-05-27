import { describe, expect, it } from "vitest";
import {
    expandOpportunityRowsToPlacementCandidateRows,
    placementCandidateQueueRowId,
} from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";

describe("expandOpportunityRowsToPlacementCandidateRows", () => {
    const oppId = "opp-hayes";
    const baseOpp = {
        id: oppId,
        name: "Hayes Family",
        _customer_name: "Hayes household",
        _primary_contact_line: "Jordan Hayes",
    };

    it("fans out multi-child opportunity into separate candidate rows", () => {
        const { rows, expanded_candidate_row_count } = expandOpportunityRowsToPlacementCandidateRows([
            {
                ...baseOpp,
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: [
                        {
                            placement_candidate_id: "pc-liam",
                            child_display_name: "Liam Hayes",
                            program_room_cohort_key: "preschool_3_4",
                            program_room_group_label: "Preschool — 3–4 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["preschool_3_4", 100],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                        {
                            placement_candidate_id: "pc-sophia",
                            child_display_name: "Sophia Hayes",
                            program_room_cohort_key: "young_toddler",
                            program_room_group_label: "Young Toddler — 18–24 months",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["young_toddler", 100],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                    ],
                    family_rollup: { bucket: "tier_general_waitlist", sort_tuple: [], candidate_count: 2 },
                },
            },
        ]);

        expect(expanded_candidate_row_count).toBe(2);
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.id)).toEqual([
            placementCandidateQueueRowId(oppId, "pc-liam"),
            placementCandidateQueueRowId(oppId, "pc-sophia"),
        ]);
        expect(rows.every((r) => r.opportunity_id === oppId)).toBe(true);

        const liam = rows[0]!._placement_waitlist_row as {
            program_room_cohort_key: string;
            sibling_context: { sibling_candidate_count: number };
        };
        const sophia = rows[1]!._placement_waitlist_row as { program_room_cohort_key: string };
        expect(liam.program_room_cohort_key).toBe("preschool_3_4");
        expect(sophia.program_room_cohort_key).toBe("young_toddler");
        expect(liam.sibling_context.sibling_candidate_count).toBe(1);
    });

    it("passes through V1 fallback opportunity row unchanged", () => {
        const { rows, opportunity_row_count } = expandOpportunityRowsToPlacementCandidateRows([
            {
                id: "opp-x",
                _placement_priority_v2: {
                    evaluated: true,
                    fallback_to_v1: true,
                    candidates: [],
                },
            },
        ]);
        expect(opportunity_row_count).toBe(1);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe("opp-x");
        expect(rows[0]!._placement_waitlist_row).toBeUndefined();
    });

    it("passes through rows without placement payload", () => {
        const { rows } = expandOpportunityRowsToPlacementCandidateRows([{ id: "opp-y", name: "Y" }]);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe("opp-y");
    });

    it("fans out Hayes-style three-child family into three cohort rows and strips opportunity preview fields", () => {
        const { rows, expanded_candidate_row_count } = expandOpportunityRowsToPlacementCandidateRows([
            {
                ...baseOpp,
                name: "Hayes Family",
                _crm_compact_children: [{ name: "Liam" }, { name: "Mia" }, { name: "Sophia" }],
                _requested_program: "Preschool · Pre-K · Young Toddler",
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: [
                        {
                            placement_candidate_id: "pc-liam",
                            child_display_name: "Liam Hayes",
                            program_room_cohort_key: "preschool_3_4_years",
                            program_room_group_label: "Preschool — 3–4 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["preschool_3_4_years", 1],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                        {
                            placement_candidate_id: "pc-mia",
                            child_display_name: "Mia Hayes",
                            program_room_cohort_key: "pre_k_4_5_years",
                            program_room_group_label: "Pre-K — 4–5 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["pre_k_4_5_years", 2],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                        {
                            placement_candidate_id: "pc-sophia",
                            child_display_name: "Sophia Hayes",
                            program_room_cohort_key: "young_toddler_18_24_months",
                            program_room_group_label: "Young Toddler — 18–24 months",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["young_toddler_18_24_months", 3],
                            link_mode: "independent",
                            active_override_kinds: [],
                        },
                    ],
                    family_rollup: {
                        bucket: "tier_general_waitlist",
                        sort_tuple: [
                            "preschool_3_4_years_pre_k_4_5_years_young_toddler_18_24_months",
                            99,
                        ],
                        candidate_count: 3,
                    },
                },
            },
        ]);

        expect(expanded_candidate_row_count).toBe(3);
        const cohortKeys = rows.map(
            (r) =>
                (r._placement_waitlist_row as { program_room_cohort_key: string }).program_room_cohort_key
        );
        expect(new Set(cohortKeys).size).toBe(3);
        expect(cohortKeys).not.toContain(
            "preschool_3_4_years_pre_k_4_5_years_young_toddler_18_24_months"
        );

        for (const r of rows) {
            expect(r._placement_priority_v2).toBeUndefined();
            expect(r._crm_compact_children).toBeUndefined();
            expect(r._requested_program).toBeUndefined();
            const proj = r._placement_waitlist_row as {
                program_room_group_label: string;
                child_display_name: string;
            };
            expect(proj.program_room_group_label).not.toMatch(/_/);
            expect(proj.child_display_name).toMatch(/Hayes$/);
        }
    });
});
