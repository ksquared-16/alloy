import { describe, expect, it } from "vitest";
import { buildPlacementCandidateFacts } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { evaluatePlacementCandidate } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { CHILDCARE_PLACEMENT_V2_FACT_LINK_MODE } from "@/lib/orchestration/placement/childcarePlacementFactContractV2";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import type { PlacementCandidateRow } from "@/lib/orchestration/placement/placementCandidateTypes";

const CANDIDATE: PlacementCandidateRow = {
    id: "cand_1",
    org_id: "org_1",
    opportunity_id: "opp_1",
    customer_id: "cust_1",
    opportunity_customer_member_id: "ocm_1",
    customer_member_id: "cm_1",
    person_id: "person_1",
    site_id: null,
    is_synthetic_fallback: false,
    program_room_cohort_key: "toddler_room",
    program_room_group_label: "Toddler Room",
    wait_since: "2024-06-01T12:00:00.000Z",
    start_date: "2024-09-01",
    status: "active",
    seed_key: "pc_v1:opp_1:ocm_1:toddler_room",
    metadata: null,
};

describe("placementCandidateFacts", () => {
    it("defaults link_mode to independent", () => {
        const facts = buildPlacementCandidateFacts({
            candidate: CANDIDATE,
            opportunity: {
                id: "opp_1",
                metadata: { flag_employee_household: true },
            },
        });
        expect(facts[CHILDCARE_PLACEMENT_V2_FACT_LINK_MODE]).toMatchObject({
            presence: "present",
            value: "independent",
        });
    });

    it("evaluatePlacementCandidate uses placement_candidate entity and v2 cohort key in sort", () => {
        const r = evaluatePlacementCandidate({
            candidate: CANDIDATE,
            opportunity: { id: "opp_1", metadata: {} },
            cohort: { work_unit_id: "wu_1", queue_key: "waitlisted" },
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: 1_715_176_800_000,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.snapshot.sort_tuple[0]).toBe("toddler_room");
        expect(r.value.snapshot.program_room_group_label).toBe("Toddler Room");
    });

    it("tier_boost override changes effective bucket without replacing policy eval path", () => {
        const r = evaluatePlacementCandidate({
            candidate: CANDIDATE,
            opportunity: { id: "opp_1", metadata: {} },
            cohort: { work_unit_id: "wu_1", queue_key: "waitlisted" },
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: 1_715_176_800_000,
            active_overrides: [
                {
                    id: "ov-1",
                    override_kind: "tier_boost",
                    reason: "Manual staff boost",
                    expires_at: null,
                    payload: { effective_bucket_key: "tier_staff_community" },
                },
            ],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.policy_snapshot?.bucket_key).toBe("tier_general_waitlist");
        expect(r.value.snapshot.bucket_key).toBe("tier_staff_community");
        expect(r.value.override_applied).toHaveLength(1);
    });
});
