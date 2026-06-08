import { describe, expect, it } from "vitest";
import { resolvePlacementCandidateSiteId } from "@/lib/orchestration/placement/resolvePlacementCandidateSiteId";

describe("resolvePlacementCandidateSiteId", () => {
    it("prefers OCM location over opportunity", () => {
        expect(
            resolvePlacementCandidateSiteId({
                ocmLocationId: "site_child",
                opportunityLocationId: "site_opp",
            })
        ).toEqual({
            site_id: "site_child",
            source: "ocm",
            used_opportunity_fallback: false,
        });
    });

    it("falls back to opportunity with diagnostic flag", () => {
        expect(
            resolvePlacementCandidateSiteId({
                ocmLocationId: null,
                opportunityLocationId: "site_opp",
            })
        ).toEqual({
            site_id: "site_opp",
            source: "opportunity",
            used_opportunity_fallback: true,
        });
    });
});
