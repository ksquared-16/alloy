import { describe, expect, it } from "vitest";
import { applyPlacementCandidateOverrides } from "@/lib/orchestration/placement/applyPlacementCandidateOverrides";
import { PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE } from "@/lib/orchestration/placement/placementOverridePayload";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import type { PlacementEvaluateOk } from "@/lib/orchestration/placement/placementPriorityTypes";

function policyOk(sortTuple: Array<string | number | null>, bucketKey = "tier_general_waitlist"): PlacementEvaluateOk {
    return {
        snapshot: {
            schema_version: 1,
            evaluator_version: "test",
            profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.profile_id,
            profile_revision: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.revision,
            evaluated_at_ms: 1,
            bucket_key: bucketKey,
            bucket_priority_order: 100,
            bucket_label: "Standard family",
            sort_tuple: sortTuple,
        },
        reasons: [],
        tie_breaker_trace: [],
        warnings: [],
    };
}

describe("applyPlacementCandidateOverrides", () => {
    it("returns policy snapshot unchanged when no overrides", () => {
        const policy = policyOk(["preschool", 100, 1_700_000_000_000, "pc-1"]);
        const out = applyPlacementCandidateOverrides({
            policy,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            active_overrides: [],
        });
        expect(out.effective.sort_tuple).toEqual(policy.snapshot.sort_tuple);
        expect(out.policy_snapshot.bucket_key).toBe("tier_general_waitlist");
        expect(out.applied).toHaveLength(0);
    });

    it("tier_boost changes effective bucket while preserving policy bucket", () => {
        const policy = policyOk(["preschool", 100, 1_700_000_000_000, "pc-1"]);
        const out = applyPlacementCandidateOverrides({
            policy,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            active_overrides: [
                {
                    id: "ov-1",
                    override_kind: "tier_boost",
                    reason: "Staff family",
                    expires_at: null,
                    payload: { effective_bucket_key: "tier_staff_community" },
                },
            ],
        });
        expect(out.policy_snapshot.bucket_key).toBe("tier_general_waitlist");
        expect(out.effective.bucket_key).toBe("tier_staff_community");
        expect(out.effective.bucket_priority_order).toBe(10);
        expect(out.applied[0]?.policy_bucket_key).toBe("tier_general_waitlist");
        expect(out.applied[0]?.effective_bucket_key).toBe("tier_staff_community");
    });

    it("pin inserts manual precedence before bucket order", () => {
        const policy = policyOk(["preschool", 100, 1_700_000_000_000, "pc-1"]);
        const out = applyPlacementCandidateOverrides({
            policy,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            active_overrides: [
                {
                    id: "ov-pin",
                    override_kind: "pin",
                    reason: "Hold spot",
                    expires_at: null,
                    payload: { pin_ordinal: 2 },
                },
            ],
        });
        expect(out.effective.sort_tuple[0]).toBe("preschool");
        expect(out.effective.sort_tuple[1]).toBe(2);
        expect(out.effective.sort_tuple[2]).toBe(100);
    });

    it("unpinned rows use large manual precedence constant in merge helper contract", () => {
        expect(PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE).toBeGreaterThan(999);
    });
});

describe("filterActivePlacementOverrides", () => {
    it("drops expired temporary overrides", async () => {
        const { filterActivePlacementOverrides } = await import(
            "@/lib/orchestration/placement/filterActivePlacementOverrides"
        );
        const now = Date.parse("2026-05-27T12:00:00.000Z");
        const filtered = filterActivePlacementOverrides(
            [
                {
                    id: "expired",
                    override_kind: "temporary",
                    reason: "old",
                    expires_at: "2026-05-01T00:00:00.000Z",
                    payload: { effective_bucket_key: "tier_staff_community" },
                },
                {
                    id: "active",
                    override_kind: "temporary",
                    reason: "still on",
                    expires_at: "2026-06-01T00:00:00.000Z",
                    payload: { effective_bucket_key: "tier_staff_community" },
                },
            ],
            now
        );
        expect(filtered.map((o) => o.id)).toEqual(["active"]);
    });
});
