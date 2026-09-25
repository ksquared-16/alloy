/**
 * WHAT ENROLLMENT IS ALLOWED TO CONCLUDE ABOUT MONEY.
 *
 * These assert the projection's semantics, not Financials' arithmetic: every figure is handed in as
 * Financials produced it, and what is under test is which of the seven states Enrollment reads out
 * of them — and, just as importantly, which ones it must NOT read.
 */
import { describe, expect, it } from "vitest";

import {
    projectEnrollmentFinancialRequirement,
    stateForObligation,
    type EnrollmentFeeObligation,
    type QuotedCollectiblePosition,
} from "@/lib/enrollment/financial/enrollmentFinancialRequirement";

const position = (over: Partial<QuotedCollectiblePosition> = {}): QuotedCollectiblePosition => ({
    chargeId: "chg-1",
    currencyCode: "USD",
    chargeStatus: "posted",
    grossCents: 20000,
    appliedCents: 0,
    expectedSubsidyCents: 0,
    currentlyCollectibleCents: 20000,
    outstandingCents: 20000,
    unresolvedVarianceCents: 0,
    suppressionBoundBy: "none",
    openVarianceStates: [],
    ...over,
});

const obligation = (over: Partial<EnrollmentFeeObligation> = {}): EnrollmentFeeObligation => ({
    requirementId: "req-fee",
    chargeTemplateKey: "registration_fee",
    billableSource: { type: "customer", id: "cust-1" },
    subjectCustomerMemberId: null,
    position: position(),
    ...over,
});

describe("one obligation's state", () => {
    it("is DUE when money is collectible and none has arrived", () => {
        expect(stateForObligation(position())).toBe("DUE");
    });

    it("is PARTIALLY_SATISFIED once some money has arrived", () => {
        expect(stateForObligation(position({ appliedCents: 5000, currentlyCollectibleCents: 15000 }))).toBe(
            "PARTIALLY_SATISFIED",
        );
    });

    it("is SATISFIED when nothing is collectible and nothing is suppressing it", () => {
        expect(
            stateForObligation(position({ appliedCents: 20000, currentlyCollectibleCents: 0, outstandingCents: 0 })),
        ).toBe("SATISFIED");
    });

    it("is NOT_DUE while the charge is still a draft, because a draft owes nothing", () => {
        expect(stateForObligation(position({ chargeStatus: "draft" }))).toBe("NOT_DUE");
    });

    /*
     * The distinction this case exists for: collectible is zero BOTH when money arrived and when a
     * governed claim is suppressing the balance. Calling the second SATISFIED would tell a family it
     * is finished before the agency has paid.
     */
    it("is PROCESSING when a submitted claim suppresses a balance that is still outstanding", () => {
        expect(
            stateForObligation(
                position({ currentlyCollectibleCents: 0, outstandingCents: 20000, suppressionBoundBy: "claimed" }),
            ),
        ).toBe("PROCESSING");
    });

    it("is ATTENTION_REQUIRED on an unresolved variance, however the money looks", () => {
        // Short-paid: patience never fixes this, so it must not read as PROCESSING or DUE.
        expect(
            stateForObligation(
                position({ currentlyCollectibleCents: 0, unresolvedVarianceCents: -5000, suppressionBoundBy: "claimed" }),
            ),
        ).toBe("ATTENTION_REQUIRED");
        expect(stateForObligation(position({ openVarianceStates: ["open"] }))).toBe("ATTENTION_REQUIRED");
    });
});

describe("a child withdraws after the fee posted", () => {
    /*
     * Measured on the real stack: the reversal posts as its OWN charge row referencing the original,
     * and the database refuses a second one. The original charge therefore keeps reporting its own
     * outstanding balance, because that is what a per-charge reading says — netting happens across a
     * cohort. Without reading the lineage, a withdrawn child's fee stays owed forever and the
     * withdrawal can never complete.
     */
    it("stops blocking once Financials has reversed it", () => {
        expect(stateForObligation(position(), "chg-reversal")).toBe("SATISFIED");
    });

    it("drops out of the family total without deleting anything", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            obligations: [
                obligation({
                    subjectCustomerMemberId: "emma",
                    position: position({ chargeId: "chg-emma" }),
                    reversedByChargeId: "chg-emma-reversal",
                }),
                obligation({ subjectCustomerMemberId: "liam", position: position({ chargeId: "chg-liam" }) }),
            ],
        });
        // Only Liam's $200 is owed; Emma's reversed fee contributes nothing.
        expect(p.amounts.grossCents).toBe(20000);
        expect(p.amounts.collectibleNowCents).toBe(20000);
        expect(p.state).toBe("DUE");
        // Both obligations are still REPORTED — the history is not hidden.
        expect(p.obligations).toHaveLength(2);
        expect(p.obligations[0].state).toBe("SATISFIED");
        expect(p.obligations[0].reversedByChargeId).toBe("chg-emma-reversal");
    });

    it("converges to SATISFIED when every obligation is reversed", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            obligations: [obligation({ reversedByChargeId: "chg-rev" })],
        });
        expect(p.state).toBe("SATISFIED");
        expect(p.amounts.collectibleNowCents).toBe(0);
    });
});

describe("an obligation Financials created but cannot position", () => {
    /*
     * Not hypothetical, and measured on the real stack: a per-family fee posts against a `customer`
     * billable source, which `writeTemplateDraftCharge` accepts by design, and then
     * `resolveAllocatableNet` refuses it — "Only an enrolment-backed charge carries responsibility."
     */
    it("needs an operator rather than defaulting either way", () => {
        expect(stateForObligation(null)).toBe("ATTENTION_REQUIRED");
    });

    it("contributes no amount to a total Enrollment would show a family", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            obligations: [
                obligation({ position: null, positionUnavailableReason: "Only an enrolment-backed charge carries responsibility." }),
            ],
        });
        expect(p.state).toBe("ATTENTION_REQUIRED");
        expect(p.amounts.grossCents).toBe(0);
        // The obligation is still REPORTED — suppressing it would hide posted money.
        expect(p.obligations).toHaveLength(1);
        expect(p.obligations[0].positionUnavailableReason).toContain("enrolment-backed");
    });
});

describe("a charge definition that names nothing", () => {
    /*
     * A misspelled key and a genuinely free fee look identical from outside and mean opposite
     * things. Collapsing them once made `material_fee` (for a template named `materials_fee`) read
     * as SATISFIED — telling a family it was finished because its fee could not be priced.
     */
    it("is ATTENTION_REQUIRED, never SATISFIED", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            definitionUnresolved: true,
            obligations: [],
        });
        expect(p.state).toBe("ATTENTION_REQUIRED");
        expect(p.needsAttention).toBe(true);
    });

    it("stays distinguishable from a fee that genuinely costs nothing", () => {
        const free = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: true,
            obligations: [],
        });
        expect(free.state).toBe("SATISFIED");
    });
});

describe("the requirement as Enrollment reads it", () => {
    it("is NOT_APPLICABLE when no fee is configured", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: false,
            due: true,
            resolvesToZero: false,
            obligations: [],
        });
        expect(p.state).toBe("NOT_APPLICABLE");
        expect(p.amounts.grossCents).toBe(0);
        expect(p.obligations).toHaveLength(0);
    });

    it("is SATISFIED when the configured fee resolves to nothing", () => {
        // Financials refuses to write a zero-amount draft, so there is no obligation to point at.
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: true,
            obligations: [],
        });
        expect(p.state).toBe("SATISFIED");
        expect(p.amounts.grossCents).toBe(0);
        expect(p.explanation).toContain("no charge");
    });

    it("is NOT_DUE before the paperwork that precedes it is finished", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: false,
            resolvesToZero: false,
            obligations: [],
        });
        expect(p.state).toBe("NOT_DUE");
    });

    /*
     * THE FUNDING LAW, WHICH IS THE WHOLE POINT.
     *
     * Gross $200, expected subsidy $100, so $100 is collectible. A family that pays $100 is done,
     * and Enrollment must not wait for a second $100 merely because the gross was $200.
     */
    it("is SATISFIED when the family pays what is COLLECTIBLE, not what is gross", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            obligations: [
                obligation({
                    position: position({
                        grossCents: 20000,
                        expectedSubsidyCents: 10000,
                        appliedCents: 10000,
                        currentlyCollectibleCents: 0,
                        outstandingCents: 0,
                    }),
                }),
            ],
        });
        expect(p.state).toBe("SATISFIED");
        expect(p.amounts.grossCents).toBe(20000);
        expect(p.amounts.expectedFundingCents).toBe(10000);
        expect(p.amounts.collectibleNowCents).toBe(0);
        expect(p.amounts.appliedCents).toBe(10000);
    });

    it("sums two children into a family position while keeping each child's attribution", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            obligations: [
                obligation({
                    subjectCustomerMemberId: "emma",
                    billableSource: { type: "enrollment_agreement", id: "agr-emma" },
                    position: position({ chargeId: "chg-emma", grossCents: 15000, currentlyCollectibleCents: 15000, outstandingCents: 15000 }),
                }),
                obligation({
                    subjectCustomerMemberId: "liam",
                    billableSource: { type: "enrollment_agreement", id: "agr-liam" },
                    position: position({ chargeId: "chg-liam", grossCents: 10000, currentlyCollectibleCents: 10000, outstandingCents: 10000 }),
                }),
            ],
        });
        expect(p.amounts.grossCents).toBe(25000);
        expect(p.amounts.collectibleNowCents).toBe(25000);
        expect(p.obligations.map((o) => o.subjectCustomerMemberId)).toEqual(["emma", "liam"]);
        // Two obligations, never merged into one — the attribution IS the per-child grain.
        expect(new Set(p.obligations.map((o) => o.position?.chargeId)).size).toBe(2);
    });

    it("is only as settled as its least settled child", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            obligations: [
                obligation({
                    subjectCustomerMemberId: "emma",
                    position: position({ appliedCents: 15000, currentlyCollectibleCents: 0, outstandingCents: 0 }),
                }),
                obligation({ subjectCustomerMemberId: "liam", position: position() }),
            ],
        });
        expect(p.obligations.map((o) => o.state)).toEqual(["SATISFIED", "DUE"]);
        expect(p.state).toBe("DUE");
    });

    it("raises a variance on one child above everything else", () => {
        const p = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: false,
            obligations: [
                obligation({ position: position({ appliedCents: 20000, currentlyCollectibleCents: 0, outstandingCents: 0 }) }),
                obligation({ position: position({ unresolvedVarianceCents: -5000 }) }),
            ],
        });
        expect(p.state).toBe("ATTENTION_REQUIRED");
        expect(p.needsAttention).toBe(true);
    });
});
