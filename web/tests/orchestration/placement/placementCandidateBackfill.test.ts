import { describe, expect, it } from "vitest";
import { buildPlacementCandidateSeedKey } from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";

describe("placementCandidateBackfill", () => {
    it("builds deterministic seed keys", () => {
        expect(
            buildPlacementCandidateSeedKey({
                opportunityId: "opp_a",
                opportunityCustomerMemberId: "ocm_1",
                programRoomCohortKey: "infant",
                isSyntheticFallback: false,
            })
        ).toBe("pc_v1:opp_a:ocm_1:infant");

        expect(
            buildPlacementCandidateSeedKey({
                opportunityId: "opp_a",
                isSyntheticFallback: true,
                programRoomCohortKey: "infant",
            })
        ).toBe("pc_v1_synthetic:opp_a:infant");
    });
});
