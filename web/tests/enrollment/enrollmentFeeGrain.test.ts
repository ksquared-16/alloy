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
            { source: { type: "customer", id: "cust-wright" }, subjectCustomerMemberId: null },
        ]);
    });

    it("per child is one obligation per child, each against its own agreement", () => {
        const sources = billableSourcesForScope({ ...WRIGHT, scope: "each_child" });
        expect(sources).toEqual([
            { source: { type: "enrollment_agreement", id: "agr-emma" }, subjectCustomerMemberId: "emma" },
            { source: { type: "enrollment_agreement", id: "agr-liam" }, subjectCustomerMemberId: "liam" },
        ]);
    });

    it("two children never collapse into one obligation, even at the same price", () => {
        // Identical fees are exactly when a lost attribution stops being visible.
        const sources = billableSourcesForScope({ ...WRIGHT, scope: "each_child" });
        expect(sources).toHaveLength(2);
        expect(new Set(sources.map((s) => s.source.id)).size).toBe(2);
    });

    /*
     * A child with no agreement is SKIPPED, never charged to the household instead.
     *
     * Falling back to the family would satisfy the requirement with a charge nobody can attribute,
     * and would do it silently. An unsatisfied requirement is visible and fixable.
     */
    it("skips a child that has no agreement rather than charging the family", () => {
        const sources = billableSourcesForScope({
            customerId: "cust-wright",
            enrollingChildren: [
                { customerMemberId: "emma", agreementId: "agr-emma" },
                { customerMemberId: "noah", agreementId: null },
            ],
            scope: "each_child",
        });
        expect(sources).toHaveLength(1);
        expect(sources[0].subjectCustomerMemberId).toBe("emma");
        expect(sources.some((s) => s.source.type === "customer")).toBe(false);
    });

    it("per family ignores how many children are enrolling", () => {
        const one = billableSourcesForScope({ ...WRIGHT, enrollingChildren: [WRIGHT.enrollingChildren[0]], scope: "record" });
        const two = billableSourcesForScope({ ...WRIGHT, scope: "record" });
        expect(one).toEqual(two);
    });
});
