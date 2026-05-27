import { describe, expect, it } from "vitest";
import { computeFamilyPlacementRollup } from "@/lib/orchestration/placement/computeFamilyPlacementRollup";

describe("computeFamilyPlacementRollup", () => {
    it("picks min tuple across independent candidates", () => {
        const r = computeFamilyPlacementRollup([
            {
                candidateId: "a",
                bucket_key: "tier_general_waitlist",
                sortTuple: ["infant", 10, "2024-06-01"],
                link_mode: "independent",
                link_group_id: null,
                link_group_member_count: 0,
            },
            {
                candidateId: "b",
                bucket_key: "tier_general_waitlist",
                sortTuple: ["infant", 10, "2024-01-01"],
                link_mode: "independent",
                link_group_id: null,
                link_group_member_count: 0,
            },
        ]);
        expect(r?.representative_candidate_id).toBe("b");
        expect(r?.sort_tuple).toEqual(["infant", 10, "2024-01-01"]);
    });

    it("strict group uses max (worst) tuple", () => {
        const r = computeFamilyPlacementRollup([
            {
                candidateId: "early",
                bucket_key: "tier_general_waitlist",
                sortTuple: ["infant", 10, "2024-01-01"],
                link_mode: "strictly_together",
                link_group_id: "g1",
                link_group_member_count: 2,
            },
            {
                candidateId: "late",
                bucket_key: "tier_general_waitlist",
                sortTuple: ["infant", 10, "2024-09-01"],
                link_mode: "strictly_together",
                link_group_id: "g1",
                link_group_member_count: 2,
            },
        ]);
        expect(r?.blocked_by_strict_link).toBe(true);
        expect(r?.representative_candidate_id).toBe("late");
    });
});
