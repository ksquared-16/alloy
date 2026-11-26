/**
 * THE ONE CALCULATION OF A FAMILY'S POSITION.
 *
 * `resolveFamilyCollectible` (one charge, four round trips) and
 * `resolveFinancialPositionCohort` (many charges, batched) now share this function. These
 * cases pin the behaviour that both of them inherit, so a workspace total and the card an
 * operator opens next cannot come apart.
 */
import { describe, expect, it } from "vitest";

import { computeCollectiblePosition, type CollectiblePositionInputs } from "@/lib/financials/subsidy/collectiblePosition";

function inputs(overrides: Partial<CollectiblePositionInputs> = {}): CollectiblePositionInputs {
    return {
        chargeId: "charge-1",
        currencyCode: "USD",
        chargeStatus: "posted",
        grossCents: 100_000,
        reductionsCents: 0,
        netCents: 100_000,
        applications: [],
        allocations: [],
        expectedFunding: [],
        claimLines: [],
        variances: [],
        ...overrides,
    };
}

describe("computeCollectiblePosition — outstanding is Thread 8's, quoted", () => {
    it("owes the posted charge when nothing has been applied", () => {
        expect(computeCollectiblePosition(inputs()).outstandingCents).toBe(100_000);
    });

    it("owes nothing on a DRAFT charge — a draft is not a debt", () => {
        expect(computeCollectiblePosition(inputs({ chargeStatus: "draft" })).outstandingCents).toBe(0);
    });

    it("takes reductions off before anything is owed", () => {
        const position = computeCollectiblePosition(inputs({ reductionsCents: -25_000, netCents: 75_000 }));
        expect(position.outstandingCents).toBe(75_000);
        expect(position.explanation.reductionsCents).toBe(-25_000);
    });

    it("counts only ACTIVE applications of POSTED payments", () => {
        const position = computeCollectiblePosition(inputs({
            applications: [
                { allocatedAmountCents: 30_000, status: "active", paymentStatus: "posted", payerEntityType: "person" },
                // Reversed: the money went back out, so it is not settling anything.
                { allocatedAmountCents: 40_000, status: "reversed", paymentStatus: "posted", payerEntityType: "person" },
                // Pending: the money has not arrived.
                { allocatedAmountCents: 20_000, status: "active", paymentStatus: "pending", payerEntityType: "person" },
            ],
        }));
        expect(position.outstandingCents).toBe(70_000);
    });

    it("tells agency money apart by WHO PAID, never by amount", () => {
        const position = computeCollectiblePosition(inputs({
            applications: [
                { allocatedAmountCents: 60_000, status: "active", paymentStatus: "posted", payerEntityType: "agency" },
                { allocatedAmountCents: 10_000, status: "active", paymentStatus: "posted", payerEntityType: "person" },
            ],
        }));
        expect(position.actualSubsidyReceivedCents).toBe(60_000);
        expect(position.outstandingCents).toBe(30_000);
    });
});

describe("computeCollectiblePosition — suppression is bounded three ways", () => {
    const submitted = (cents: number) => [{ claimId: "claim-1", claimedAmountCents: cents, claimState: "submitted" }];

    it("suppresses nothing without a submitted claim, however much was expected", () => {
        const position = computeCollectiblePosition(inputs({
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 80_000, percentBasisPoints: null }],
            claimLines: [{ claimId: "claim-1", claimedAmountCents: 80_000, claimState: "draft" }],
        }));
        expect(position.submittedClaimSuppressionCents).toBe(0);
        expect(position.currentlyCollectibleCents).toBe(100_000);
        expect(position.explanation.suppressionBoundBy).toBe("none");
    });

    it("is bound by what was CLAIMED when the claim asks for less than was expected", () => {
        const position = computeCollectiblePosition(inputs({
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 80_000, percentBasisPoints: null }],
            claimLines: submitted(60_000),
        }));
        expect(position.submittedClaimSuppressionCents).toBe(60_000);
        expect(position.explanation.suppressionBoundBy).toBe("claimed");
        expect(position.currentlyCollectibleCents).toBe(40_000);
    });

    it("is bound by what was EXPECTED when the claim asks for more", () => {
        const position = computeCollectiblePosition(inputs({
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 40_000, percentBasisPoints: null }],
            claimLines: submitted(90_000),
        }));
        expect(position.submittedClaimSuppressionCents).toBe(40_000);
        expect(position.explanation.suppressionBoundBy).toBe("expected");
    });

    it("is bound by OUTSTANDING — a family is never suppressed below what it still owes", () => {
        const position = computeCollectiblePosition(inputs({
            applications: [{ allocatedAmountCents: 90_000, status: "active", paymentStatus: "posted", payerEntityType: "person" }],
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 80_000, percentBasisPoints: null }],
            claimLines: submitted(80_000),
        }));
        expect(position.outstandingCents).toBe(10_000);
        expect(position.submittedClaimSuppressionCents).toBe(10_000);
        expect(position.explanation.suppressionBoundBy).toBe("outstanding");
        expect(position.currentlyCollectibleCents).toBe(0);
    });

    it("stops suppressing once the agency has actually paid", () => {
        // The claim did its job: the agency's payment already reduced outstanding through Thread 8.
        // Continuing to suppress would hide the family's own copay behind a settled claim.
        const position = computeCollectiblePosition(inputs({
            applications: [{ allocatedAmountCents: 80_000, status: "active", paymentStatus: "posted", payerEntityType: "agency" }],
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 80_000, percentBasisPoints: null }],
            claimLines: submitted(80_000),
        }));
        expect(position.outstandingCents).toBe(20_000);
        expect(position.submittedClaimSuppressionCents).toBe(0);
        expect(position.currentlyCollectibleCents).toBe(20_000);
    });

    it("computes percentage funding against the NET, not the gross", () => {
        const position = computeCollectiblePosition(inputs({
            reductionsCents: -20_000,
            netCents: 80_000,
            expectedFunding: [{ basis: "percent", expectedAmountCents: null, percentBasisPoints: 5_000 }],
            claimLines: submitted(100_000),
        }));
        expect(position.expectedSubsidyCents).toBe(40_000);
        expect(position.submittedClaimSuppressionCents).toBe(40_000);
    });
});

describe("computeCollectiblePosition — a shortfall is a decision, not a bill", () => {
    it("reports an unresolved variance BESIDE the collectible figure and never inside it", () => {
        const position = computeCollectiblePosition(inputs({
            applications: [{ allocatedAmountCents: 82_500, status: "active", paymentStatus: "posted", payerEntityType: "agency" }],
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 90_000, percentBasisPoints: null }],
            claimLines: [{ claimId: "claim-1", claimedAmountCents: 90_000, claimState: "accepted" }],
            variances: [{ varianceCents: -7_500, state: "open", resolutionKind: null }],
        }));
        expect(position.unresolvedVarianceCents).toBe(-7_500);
        // The family's figure did not quietly rise to cover the agency's shortfall.
        expect(position.currentlyCollectibleCents).toBe(10_000);
        expect(position.explanation.openVarianceStates).toEqual(["open"]);
    });

    it("ignores a variance somebody has already decided about", () => {
        const position = computeCollectiblePosition(inputs({
            variances: [{ varianceCents: -7_500, state: "resolved", resolutionKind: "written_off" }],
        }));
        expect(position.unresolvedVarianceCents).toBe(0);
        expect(position.explanation.openVarianceStates).toEqual([]);
    });
});

describe("computeCollectiblePosition — responsibility is reported, never invented", () => {
    it("keeps unassigned money in the open instead of attributing it to somebody", () => {
        const position = computeCollectiblePosition(inputs({
            allocations: [
                { assignedAmountCents: 70_000, isUnassigned: false },
                { assignedAmountCents: 30_000, isUnassigned: true },
            ],
        }));
        expect(position.assignedResponsibilityCents).toBe(70_000);
        expect(position.unassignedResponsibilityCents).toBe(30_000);
    });
});
