/**
 * WHAT "PER FAMILY" AND "PER CHILD" ACTUALLY PRODUCE.
 *
 * The grain decision is the whole of what Enrollment contributes to a charge — Financials does the
 * rest — so it is worth asserting literally: how many obligations, against which billable source,
 * carrying whose attribution.
 *
 * The vocabulary is NOT new. `RequirementScope` already had `record` and `each_child`, which is why
 * no `per_family | per_enrolling_child` enum was invented for this.
 */
import { describe, expect, it } from "vitest";

import { billableSourcesForScope } from "@/lib/enrollment/financial/resolveEnrollmentFeeObligations";

const WRIGHT = {
    customerId: "cust-wright",
    enrollingChildren: [
        { customerMemberId: "emma", agreementId: "agr-emma" },
        { customerMemberId: "liam", agreementId: "agr-liam" },
    ],
};

describe("fee grain", () => {
    it("per family is exactly one obligation, against the household", () => {
        const sources = billableSourcesForScope({ ...WRIGHT, scope: "record" });
        expect(sources).toEqual([
            { source: { type: "customer", id: "cust-wright" }, subjectCustomerMemberId: null, legacyAgreementId: null },
        ]);
    });

    /*
     * PER CHILD (Director decision, H3-2): one obligation per enrolling child, owed when the child's
     * paperwork is done — before any agreement need exist. The household is the billable source (the
     * payer); the child is the charge's subject. The agreement, when there is one, is carried only to
     * recognise a fee an earlier path wrote against it.
     */
    it("per child is one obligation per child, against the household with the child as subject", () => {
        const sources = billableSourcesForScope({ ...WRIGHT, scope: "each_child" });
        expect(sources).toEqual([
            { source: { type: "customer", id: "cust-wright" }, subjectCustomerMemberId: "emma", legacyAgreementId: "agr-emma" },
            { source: { type: "customer", id: "cust-wright" }, subjectCustomerMemberId: "liam", legacyAgreementId: "agr-liam" },
        ]);
    });

    it("two children never collapse into one obligation, even at the same price", () => {
        // Identical fees are exactly when a lost attribution stops being visible: siblings share the
        // payer, so it is the SUBJECT that keeps them two obligations.
        const sources = billableSourcesForScope({ ...WRIGHT, scope: "each_child" });
        expect(sources).toHaveLength(2);
        expect(new Set(sources.map((s) => s.subjectCustomerMemberId)).size).toBe(2);
    });

    /*
     * A child with no agreement is still owed its fee — and still attributed to that child, never
     * folded into an anonymous household charge.
     */
    it("a child without an agreement is still one obligation, attributed to that child", () => {
        const sources = billableSourcesForScope({
            customerId: "cust-wright",
            enrollingChildren: [
                { customerMemberId: "emma", agreementId: "agr-emma" },
                { customerMemberId: "noah", agreementId: null },
            ],
            scope: "each_child",
        });
        expect(sources).toHaveLength(2);
        expect(sources.find((s) => s.subjectCustomerMemberId === "noah")).toEqual({
            source: { type: "customer", id: "cust-wright" },
            subjectCustomerMemberId: "noah",
            legacyAgreementId: null,
        });
    });

    it("per family ignores how many children are enrolling", () => {
        const one = billableSourcesForScope({ ...WRIGHT, enrollingChildren: [WRIGHT.enrollingChildren[0]], scope: "record" });
        const two = billableSourcesForScope({ ...WRIGHT, scope: "record" });
        expect(one).toEqual(two);
    });
});
