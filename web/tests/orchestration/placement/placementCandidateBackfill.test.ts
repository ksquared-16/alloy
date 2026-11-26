import { describe, expect, it } from "vitest";
import {
    __testing,
    buildPlacementCandidateSeedKey,
    type PlacementCandidateBackfillCounts,
} from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";

const { buildCandidateRowsForOpportunity } = __testing;

function emptyCounts(): PlacementCandidateBackfillCounts {
    return {
        opportunities_scanned: 0,
        real_candidates_proposed: 0,
        synthetic_candidates_proposed: 0,
        real_candidates_created: 0,
        synthetic_candidates_created: 0,
        skipped_existing: 0,
        skipped_not_waitlist: 0,
        skipped_ineligible_child: 0,
        skipped_synthetic_opp_only_strict: 0,
        compat_opportunity_fallback: 0,
        errors: 0,
    };
}

const baseOpp = {
    id: "opp_a",
    customer_id: "cust_a",
    location_id: "site_a",
    status_key: "waitlisted",
    created_at: "2026-01-01T00:00:00.000Z",
    metadata: {},
};

function ocmRow(id: string, outcome: string | null) {
    return {
        id,
        customer_member_id: `cm_${id}`,
        outcome_status_key: outcome,
        start_date: null,
        program_category_id: null as string | null,
        program_key: null as string | null,
        location_id: null as string | null,
        program_room_cohort_key: null as string | null,
        metadata: {},
        customer_members: {
            person_id: `person_${id}`,
            display_name: `Child ${id}`,
            metadata: {},
            persons: { date_of_birth: "2024-01-01" },
        },
    };
}

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

    it("creates candidates only for waitlisted children when siblings differ", () => {
        const counts = emptyCounts();
        const rows = buildCandidateRowsForOpportunity(
            baseOpp,
            [ocmRow("ocm_wait", "waitlisted"), ocmRow("ocm_enrolled", "enrolled")],
            "org_a",
            false,
            { strictEligibility: false, counts }
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.opportunity_customer_member_id).toBe("ocm_wait");
        expect(rows[0]?.metadata.eligibility_reason).toBe("waitlisted");
        expect(counts.skipped_ineligible_child).toBe(1);
    });

    it("compat mode allows missing OCM status when opportunity is waitlist-relevant", () => {
        const counts = emptyCounts();
        const rows = buildCandidateRowsForOpportunity(
            baseOpp,
            [ocmRow("ocm_missing", null)],
            "org_a",
            false,
            { strictEligibility: false, counts }
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.metadata.eligibility_reason).toBe("compat_opportunity_status");
        expect(rows[0]?.metadata.eligibility_compat_opportunity_fallback).toBe(true);
        expect(counts.compat_opportunity_fallback).toBe(1);
    });

    it("strict mode skips ineligible children and opp-only synthetic fan-out", () => {
        const counts = emptyCounts();
        const mixed = buildCandidateRowsForOpportunity(
            baseOpp,
            [ocmRow("ocm_wait", "waitlisted"), ocmRow("ocm_offer", "offer_pending")],
            "org_a",
            false,
            { strictEligibility: true, counts }
        );
        expect(mixed).toHaveLength(1);
        expect(counts.skipped_ineligible_child).toBe(1);

        const countsSynthetic = emptyCounts();
        const synthetic = buildCandidateRowsForOpportunity(baseOpp, [], "org_a", false, {
            strictEligibility: true,
            counts: countsSynthetic,
        });
        expect(synthetic).toHaveLength(0);
        expect(countsSynthetic.skipped_synthetic_opp_only_strict).toBe(1);
    });

    it("prefers OCM location_id over opportunity location_id for site_id", () => {
        const counts = emptyCounts();
        const row = ocmRow("ocm_wait", "waitlisted");
        row.location_id = "site_child";
        const rows = buildCandidateRowsForOpportunity(
            baseOpp,
            [row],
            "org_a",
            false,
            { strictEligibility: false, counts }
        );
        expect(rows[0]?.site_id).toBe("site_child");
        expect(rows[0]?.metadata.site_resolution).toMatchObject({
            source: "ocm",
            used_opportunity_fallback: false,
        });
    });

    it("records opportunity fallback in metadata when OCM site is missing", () => {
        const counts = emptyCounts();
        const rows = buildCandidateRowsForOpportunity(
            baseOpp,
            [ocmRow("ocm_wait", "waitlisted")],
            "org_a",
            false,
            { strictEligibility: false, counts }
        );
        expect(rows[0]?.site_id).toBe("site_a");
        expect(rows[0]?.metadata.site_resolution_warning).toBe("opportunity_location_fallback");
    });

    it("does not delete or mutate existing candidates (planning only)", () => {
        const counts = emptyCounts();
        const rows = buildCandidateRowsForOpportunity(
            baseOpp,
            [ocmRow("ocm_enrolled", "enrolled")],
            "org_a",
            false,
            { strictEligibility: false, counts }
        );
        expect(rows).toHaveLength(0);
        expect(counts.skipped_ineligible_child).toBe(1);
    });
});
