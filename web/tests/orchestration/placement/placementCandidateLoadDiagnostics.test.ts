import { describe, expect, it } from "vitest";
import {
    resolvePlacementCandidateLoadDiagnostics,
    resolvePlacementSiteLoadSource,
    shouldShowPlacementPriorityReasonShort,
} from "@/lib/orchestration/placement/placementCandidateLoadDiagnostics";

describe("placementCandidateLoadDiagnostics", () => {
    it("classifies OCM site match", () => {
        expect(
            resolvePlacementSiteLoadSource({
                candidateSiteId: "site_a",
                ocmLocationId: "site_a",
                opportunityLocationId: "site_b",
            })
        ).toBe("ocm");
    });

    it("classifies opportunity fallback from metadata warning", () => {
        expect(
            resolvePlacementSiteLoadSource({
                candidateSiteId: "site_b",
                ocmLocationId: null,
                opportunityLocationId: "site_b",
                candidateMetadata: { site_resolution_warning: "opportunity_location_fallback" },
            })
        ).toBe("opportunity_fallback");
    });

    it("resolves load diagnostics bundle", () => {
        const d = resolvePlacementCandidateLoadDiagnostics({
            candidateSiteId: "site_a",
            storedCohortKey: "infant",
            ocmLocationId: "site_a",
            ocmCohortKey: "infant",
            householdContextLoaded: true,
        });
        expect(d.site_source).toBe("ocm");
        expect(d.cohort_source).toBe("ocm");
        expect(d.household_fact_source).toBe("record_join");
    });

    it("suppresses priority reason when household facts are metadata-only", () => {
        expect(
            shouldShowPlacementPriorityReasonShort({
                evaluatorUsesCandidateFacts: true,
                householdFactSource: "metadata_fallback",
            })
        ).toBe(false);
        expect(
            shouldShowPlacementPriorityReasonShort({
                evaluatorUsesCandidateFacts: true,
                householdFactSource: "record_join",
            })
        ).toBe(true);
    });
});
