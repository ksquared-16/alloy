import { describe, expect, it } from "vitest";
import {
    buildOcmLifecycleBackfillRecommendations,
    classifyPlacementCandidateIntegrity,
    detectOpportunityLifecycleConflicts,
    filterApplicableOcmBackfillRecommendations,
    recommendOcmLifecycleBackfillForMissingRow,
    runOcmLifecycleStrictModeAuditFromRows,
    type OcmAuditRowInput,
} from "@/lib/opportunities/ocmLifecycleStrictModeReadiness";

describe("ocmLifecycleStrictModeReadiness recommendations", () => {
    it("missing OCM + opp waitlisted → recommend waitlisted", () => {
        const rec = recommendOcmLifecycleBackfillForMissingRow({
            ocmId: "ocm-1",
            opportunityId: "opp-1",
            opportunityStatusKey: "waitlisted",
            siblingMissingCount: 1,
            siblingTotalCount: 1,
            siblingsMixed: false,
        });
        expect(rec.kind).toBe("suggest_waitlisted");
        expect(rec.suggested_outcome_status_key).toBe("waitlisted");
    });

    it("missing OCM + ready_to_enroll → recommend offer_pending", () => {
        const rec = recommendOcmLifecycleBackfillForMissingRow({
            ocmId: "ocm-1",
            opportunityId: "opp-1",
            opportunityStatusKey: "ready_to_enroll",
            siblingMissingCount: 1,
            siblingTotalCount: 1,
            siblingsMixed: false,
        });
        expect(rec.kind).toBe("suggest_offer_pending");
        expect(rec.suggested_outcome_status_key).toBe("offer_pending");
    });

    it("mixed siblings → manual review", () => {
        const rec = recommendOcmLifecycleBackfillForMissingRow({
            ocmId: "ocm-2",
            opportunityId: "opp-1",
            opportunityStatusKey: "waitlisted",
            siblingMissingCount: 1,
            siblingTotalCount: 2,
            siblingsMixed: true,
        });
        expect(rec.kind).toBe("manual_review_mixed");
        expect(rec.suggested_outcome_status_key).toBeNull();
    });

    it("multiple missing children → manual review", () => {
        const rows: OcmAuditRowInput[] = [
            { ocm_id: "ocm-a", opportunity_id: "opp-1", outcome_status_key: null, opportunity_status_key: "waitlisted" },
            { ocm_id: "ocm-b", opportunity_id: "opp-1", outcome_status_key: null, opportunity_status_key: "waitlisted" },
        ];
        const recs = buildOcmLifecycleBackfillRecommendations(rows);
        expect(recs).toHaveLength(2);
        expect(recs.every((r) => r.kind === "manual_review_multiple_missing")).toBe(true);
    });
});

describe("classifyPlacementCandidateIntegrity", () => {
    it("candidate with waitlisted child → ok", () => {
        const row = classifyPlacementCandidateIntegrity({
            candidate_id: "pc-1",
            opportunity_id: "opp-1",
            opportunity_customer_member_id: "ocm-1",
            is_synthetic_fallback: false,
            child_outcome_status_key: "waitlisted",
            opportunity_status_key: "waitlisted",
        });
        expect(row.category).toBe("ok_waitlisted");
    });

    it("candidate with enrolled child → cleanup review", () => {
        const row = classifyPlacementCandidateIntegrity({
            candidate_id: "pc-1",
            opportunity_id: "opp-1",
            opportunity_customer_member_id: "ocm-1",
            is_synthetic_fallback: false,
            child_outcome_status_key: "enrolled",
            opportunity_status_key: "waitlisted",
        });
        expect(row.category).toBe("cleanup_review");
    });

    it("missing child lifecycle with compat opp → compat_fallback_would_block", () => {
        const row = classifyPlacementCandidateIntegrity({
            candidate_id: "pc-1",
            opportunity_id: "opp-1",
            opportunity_customer_member_id: "ocm-1",
            is_synthetic_fallback: false,
            child_outcome_status_key: null,
            opportunity_status_key: "waitlisted",
            eligibility_compat_opportunity_fallback: true,
        });
        expect(row.category).toBe("compat_fallback_would_block");
    });
});

describe("runOcmLifecycleStrictModeAuditFromRows", () => {
    it("aggregates counts and strict readiness", () => {
        const audit = runOcmLifecycleStrictModeAuditFromRows({
            orgId: "org-1",
            ocmRows: [
                {
                    ocm_id: "ocm-1",
                    opportunity_id: "opp-1",
                    outcome_status_key: "waitlisted",
                    opportunity_status_key: "waitlisted",
                },
            ],
            candidateRows: [
                {
                    candidate_id: "pc-1",
                    opportunity_id: "opp-1",
                    opportunity_customer_member_id: "ocm-1",
                    is_synthetic_fallback: false,
                    child_outcome_status_key: "waitlisted",
                    opportunity_status_key: "waitlisted",
                },
            ],
        });
        expect(audit.counts.ocm_total).toBe(1);
        expect(audit.counts.candidate_total).toBe(1);
        expect(audit.counts.candidate_by_category.ok_waitlisted).toBe(1);
        expect(audit.strict_mode_ready).toBe(true);
    });

    it("detects opportunity lifecycle conflict", () => {
        const conflicts = detectOpportunityLifecycleConflicts([
            {
                ocm_id: "ocm-1",
                opportunity_id: "opp-1",
                outcome_status_key: "enrolled",
                opportunity_status_key: "waitlisted",
            },
        ]);
        expect(conflicts.length).toBe(1);
        expect(conflicts[0]?.reason).toContain("waitlisted");
    });

    it("filterApplicableOcmBackfillRecommendations excludes manual review", () => {
        const applicable = filterApplicableOcmBackfillRecommendations([
            {
                ocm_id: "ocm-1",
                opportunity_id: "opp-1",
                current_outcome_status_key: null,
                opportunity_status_key: "waitlisted",
                suggested_outcome_status_key: "waitlisted",
                kind: "suggest_waitlisted",
                reason: "test",
            },
            {
                ocm_id: "ocm-2",
                opportunity_id: "opp-1",
                current_outcome_status_key: null,
                opportunity_status_key: "waitlisted",
                suggested_outcome_status_key: null,
                kind: "manual_review_mixed",
                reason: "test",
            },
        ]);
        expect(applicable).toHaveLength(1);
        expect(applicable[0]?.kind).toBe("suggest_waitlisted");
    });
});
