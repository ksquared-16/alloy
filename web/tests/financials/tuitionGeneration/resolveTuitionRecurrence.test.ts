/**
 * WHAT A PERIOD OWES, AND THE TWO CASES WHERE THE HONEST ANSWER IS "I WILL NOT GUESS".
 *
 * The money in these cases is never computed. It comes from the accepted term, because an accepted
 * term may be an OVERRIDE — a price a family agreed to that is deliberately not the recommendation —
 * and a generator that priced from the catalog would bill them the rate they did not agree to.
 */
import { describe, expect, it } from "vitest";

import {
    resolveTuitionRecurrence,
    tuitionOccurrenceKey,
    type ProrationMethod,
} from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import type { AcceptedPricingTerm } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";

function term(over: Partial<AcceptedPricingTerm> = {}): AcceptedPricingTerm {
    return {
        termId: "term-1",
        opportunityCustomerMemberId: "ocm-1",
        customerMemberId: "cm-1",
        enrollmentAgreementId: "agr-1",
        termKind: "tuition",
        amountCents: 168_000,
        currencyCode: "USD",
        cadenceKey: "monthly",
        effectiveStart: "2026-01-01",
        effectiveEnd: null,
        source: { entity: "commercial_tuition_rates", id: "rate-1" },
        variantId: "var-1",
        offeringId: "off-1",
        programKey: "toddler",
        locationId: "loc-1",
        payerType: "private_pay",
        state: "accepted",
        overrideReason: null,
        recommendedSourceId: "rate-1",
        configVersion: "cfg-1",
        resolutionKey: "res-1",
        acceptedBy: "user-1",
        acceptedAt: "2026-01-01T00:00:00.000Z",
        ...over,
    };
}

function resolve(terms: AcceptedPricingTerm[], periodKey: string, proration?: ProrationMethod) {
    return resolveTuitionRecurrence({ terms, periodKey, prorationMethod: proration ?? null });
}

describe("resolveTuitionRecurrence — what a service period owes", () => {
    it("bills the accepted amount, not a recomputed one", () => {
        const d = resolve([term({ amountCents: 99_000, state: "overridden" })], "2026-03");
        expect(d.kind).toBe("due");
        if (d.kind !== "due") return;
        // An OVERRIDDEN term at 99,000 bills 99,000 — the whole point of the accepted term being
        // authoritative is that a deliberately different price survives into billing.
        expect(d.amountCents).toBe(99_000);
        expect(d.currencyCode).toBe("USD");
        expect(d.term.state).toBe("overridden");
        expect(d.coverage).toEqual({ coveredDays: 31, periodDays: 31, partial: false });
        expect(d.serviceDate).toBe("2026-03-01");
    });

    it("knows how long a month is, February included", () => {
        const d = resolve([term()], "2028-02");
        expect(d.kind === "due" && d.coverage.periodDays).toBe(29);
    });

    // ── EFFECTIVE DATING ─────────────────────────────────────────────────────────────────────

    it("does not bill a future term early", () => {
        const d = resolve([term({ effectiveStart: "2026-09-01" })], "2026-06");
        expect(d.kind).toBe("not_due");
        expect(d.kind === "not_due" && d.reason).toBe("term_not_yet_effective");
    });

    it("does not bill an ended term late", () => {
        const d = resolve([term({ effectiveEnd: "2026-05-31" })], "2026-06");
        expect(d.kind === "not_due" && d.reason).toBe("term_already_ended");
    });

    it("bills each period under the term effective for THAT period", () => {
        const terms = [
            term({ termId: "old", amountCents: 168_000, effectiveStart: "2026-01-01", effectiveEnd: "2026-06-30" }),
            term({ termId: "new", amountCents: 181_000, effectiveStart: "2026-07-01" }),
        ];
        const june = resolve(terms, "2026-06");
        const july = resolve(terms, "2026-07");
        expect(june.kind === "due" && june.term.termId).toBe("old");
        expect(june.kind === "due" && june.amountCents).toBe(168_000);
        expect(july.kind === "due" && july.term.termId).toBe("new");
        expect(july.kind === "due" && july.amountCents).toBe(181_000);
    });

    it("bills nothing when no term has been accepted", () => {
        expect(resolve([], "2026-06").kind).toBe("not_due");
        expect(resolve([], "2026-06")).toMatchObject({ reason: "no_accepted_term" });
    });

    it("leaves another cadence to the run that bills it", () => {
        const d = resolve([term({ cadenceKey: "weekly" })], "2026-06");
        expect(d.kind === "not_due" && d.reason).toBe("cadence_not_billed_by_this_run");
    });

    it("leaves a non-tuition term alone", () => {
        const d = resolve([term({ termKind: "fee" })], "2026-06");
        expect(d.kind).toBe("not_due");
    });

    // ── THE TWO REFUSALS ─────────────────────────────────────────────────────────────────────

    /*
     * TWO TERMS OVER ONE PERIOD cannot be billed without inventing a rule, and either invention —
     * charging both, or silently choosing — is worse than saying so.
     */
    it("refuses rather than double-billing when two terms cover one period", () => {
        const terms = [
            term({ termId: "a", effectiveStart: "2026-01-01" }),
            term({ termId: "b", effectiveStart: "2026-06-15" }),
        ];
        const d = resolve(terms, "2026-06", "daily");
        expect(d.kind).toBe("refused");
        if (d.kind !== "refused") return;
        expect(d.reason).toBe("overlapping_terms");
        expect(d.detail).toContain("Supersede one of them");
    });

    /*
     * A PART MONTH IS NOT SILENTLY A WHOLE ONE. What a fortnight costs is a policy decision, and an
     * organisation that has not configured one has not made it.
     */
    it("refuses a partial period when no proration policy is configured", () => {
        const d = resolve([term({ effectiveStart: "2026-06-15" })], "2026-06");
        expect(d.kind).toBe("refused");
        if (d.kind !== "refused") return;
        expect(d.reason).toBe("proration_policy_required");
        expect(d.detail).toContain("16 of 30 days");
    });

    it("reports the coverage, and leaves the arithmetic to the configured method", () => {
        const d = resolve([term({ effectiveStart: "2026-06-15" })], "2026-06", "daily");
        expect(d.kind).toBe("due");
        if (d.kind !== "due") return;
        expect(d.coverage).toEqual({ coveredDays: 16, periodDays: 30, partial: true });
        expect(d.prorationMethod).toBe("daily");
        // The term's amount is reported untouched; the caller applies the method.
        expect(d.amountCents).toBe(168_000);
        expect(d.serviceDate).toBe("2026-06-15");
    });

    it("treats a term ending mid-period as partial too", () => {
        const d = resolve([term({ effectiveEnd: "2026-06-10" })], "2026-06", "calendar_day");
        expect(d.kind === "due" && d.coverage).toEqual({ coveredDays: 10, periodDays: 30, partial: true });
    });

    // ── THE OCCURRENCE'S NAME ────────────────────────────────────────────────────────────────

    /*
     * The key is what the database converges on. It carries the TERM, not only the assignment: a
     * superseded term and its successor are different agreements, and a period billed under one is
     * not the period billed under the other.
     */
    it("names one occurrence per term per period", () => {
        expect(tuitionOccurrenceKey("term-1", "2026-06")).toBe("cev:tuition:term-1:2026-06");
        expect(tuitionOccurrenceKey("term-1", "2026-06")).toBe(tuitionOccurrenceKey("term-1", "2026-06"));
        expect(tuitionOccurrenceKey("term-1", "2026-07")).not.toBe(tuitionOccurrenceKey("term-1", "2026-06"));
        expect(tuitionOccurrenceKey("term-2", "2026-06")).not.toBe(tuitionOccurrenceKey("term-1", "2026-06"));
    });
});
