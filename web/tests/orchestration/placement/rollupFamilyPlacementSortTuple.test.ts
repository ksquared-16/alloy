import { describe, expect, it } from "vitest";
import { evaluatePlacementCandidate } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { pickFamilyRollupSortTuple } from "@/lib/orchestration/placement/rollupFamilyPlacementSortTuple";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import type { PlacementCandidateRow } from "@/lib/orchestration/placement/placementCandidateTypes";

function candidate(id: string, waitSince: string, cohort: string): PlacementCandidateRow {
    return {
        id,
        org_id: "org",
        opportunity_id: "opp",
        customer_id: null,
        opportunity_customer_member_id: `ocm_${id}`,
        customer_member_id: null,
        person_id: null,
        site_id: null,
        is_synthetic_fallback: false,
        program_room_cohort_key: cohort,
        program_room_group_label: cohort,
        wait_since: waitSince,
        start_date: null,
        status: "active",
        seed_key: null,
        metadata: null,
    };
}

describe("rollupFamilyPlacementSortTuple", () => {
    it("picks earlier wait_since within same cohort", () => {
        const c1 = candidate("a", "2024-01-01T00:00:00.000Z", "infant");
        const c2 = candidate("b", "2024-06-01T00:00:00.000Z", "infant");
        const cohort = { work_unit_id: "wu", queue_key: "waitlisted" };
        const now = 1_715_176_800_000;

        const e1 = evaluatePlacementCandidate({
            candidate: c1,
            opportunity: { id: "opp", metadata: {} },
            cohort,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: now,
        });
        const e2 = evaluatePlacementCandidate({
            candidate: c2,
            opportunity: { id: "opp", metadata: {} },
            cohort,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: now,
        });
        expect(e1.ok && e2.ok).toBe(true);
        if (!e1.ok || !e2.ok) return;

        const rollup = pickFamilyRollupSortTuple([
            { candidateId: c1.id, sortTuple: e1.value.snapshot.sort_tuple },
            { candidateId: c2.id, sortTuple: e2.value.snapshot.sort_tuple },
        ]);
        expect(rollup).toEqual(e1.value.snapshot.sort_tuple);
    });
});
