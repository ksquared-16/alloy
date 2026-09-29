/**
 * DUENESS IS A QUESTION, NOT AN EVENT — so it gives the same answer however often it is asked.
 */
import { describe, expect, it } from "vitest";

import { enrollmentFeeIsDue } from "@/lib/enrollment/financial/enrollmentFeeDueBoundary";
import type { EnrollmentRequirementSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";

const req = (
    requirement_id: string,
    disposition: EnrollmentRequirementSufficiency["disposition"],
): EnrollmentRequirementSufficiency =>
    ({ requirement_id, disposition }) as unknown as EnrollmentRequirementSufficiency;

const due = (requirements: EnrollmentRequirementSufficiency[], financialRequirementIds: string[] = ["fee"]) =>
    enrollmentFeeIsDue({ sufficiency: { requirements }, financialRequirementIds });

describe("when the enrollment fee becomes due", () => {
    it("is not due while any other requirement still blocks", () => {
        expect(due([req("packet", "blocking"), req("fee", "blocking")])).toBe(false);
    });

    it("is due once the paperwork is satisfied", () => {
        expect(due([req("packet", "satisfied"), req("fee", "blocking")])).toBe(true);
    });

    it("counts an operator's exception as resolved", () => {
        // Somebody made a judgement call; nobody is waiting on that requirement any more.
        expect(due([req("packet", "excepted"), req("fee", "blocking")])).toBe(true);
    });

    it("does not let advisory guidance hold a fee back forever", () => {
        expect(due([req("packet", "satisfied"), req("tour", "not_blocking"), req("fee", "blocking")])).toBe(true);
    });

    /*
     * The circularity this exists to prevent: a fee that gated its own dueness would block, so not
     * everything would be resolved, so it would never come due, so it would never be satisfied.
     */
    it("never lets a fee requirement gate itself", () => {
        expect(due([req("fee", "blocking")])).toBe(true);
        expect(due([req("fee_a", "blocking"), req("fee_b", "blocking")], ["fee_a", "fee_b"])).toBe(true);
    });

    it("is due immediately on a stage that requires nothing else", () => {
        expect(due([])).toBe(true);
    });
});
