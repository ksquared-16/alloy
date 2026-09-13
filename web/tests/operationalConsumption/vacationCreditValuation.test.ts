/**
 * SLICE 3B — valuing a vacation credit against the tuition the family agreed to.
 *
 * Unit-level because the rules under test are the SELECTION rules, and those are
 * pure: which accepted term governs a period, and what one day of it is worth.
 * The database work is proved live elsewhere; duplicating it here would slow the
 * suite without testing anything the selection owner does not already decide.
 */
import { describe, expect, it, vi } from "vitest";

import { valueVacationCredit } from "@/lib/operationalConsumption/vacationCreditValuation";

const ORG = "org-1";
const AGREEMENT = "agr-1";

type Term = {
    termId: string;
    amountCents: number;
    currencyCode: string;
    cadenceKey: string;
    effectiveStart: string;
    effectiveEnd: string | null;
};

const term = (over: Partial<Term> = {}): Term => ({
    termId: "term-1",
    amountCents: 120000,
    currencyCode: "USD",
    cadenceKey: "monthly",
    effectiveStart: "2026-01-01",
    effectiveEnd: null,
    ...over,
});

/**
 * Stand in for the canonical reader; the SELECTION under test is downstream of it.
 *
 * The builder stays chainable AFTER `.order()` and is awaitable at any point,
 * because `readAcceptedPricingTerms` adds its `.eq()` filters after ordering.
 */
function supabaseWith(terms: Term[]) {
    const rows = terms.map((t) => ({
        id: t.termId,
        term_kind: "tuition",
                    org_id: ORG,
                    enrollment_agreement_id: AGREEMENT,
                    opportunity_customer_member_id: "ocm-1",
                    amount_cents: t.amountCents,
                    currency_code: t.currencyCode,
                    cadence_key: t.cadenceKey,
                    effective_start: t.effectiveStart,
                    effective_end: t.effectiveEnd,
                    state: "accepted",
                    superseded_at: null,
                    source_entity: "tuition_option",
                    source_id: "opt-1",
                    config_version: null,
                    resolution_key: `rk-${t.termId}`,
    }));
    const builder: Record<string, unknown> = {
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return { from: () => ({ select: () => builder }) } as never;
}

const value = (terms: Term[], anchorDate = "2026-09-11") =>
    valueVacationCredit(supabaseWith(terms), { orgId: ORG, enrollmentAgreementId: AGREEMENT, anchorDate });

describe("vacation credit valuation — the agreed price, not today's catalog", () => {
    it("values one day against the accepted period tuition", async () => {
        // September has 30 days; $1,200 agreed for the month.
        const r = await value([term({ amountCents: 120000 })]);
        expect(r.resolved).toBe(true);
        if (!r.resolved) return;
        expect(r.periodKey).toBe("2026-09");
        expect(r.periodDays).toBe(30);
        expect(r.creditedDays).toBe(1);
        expect(r.acceptedPeriodAmountCents).toBe(120000);
        // 120000 * 1 / 30, through the existing proration owner.
        expect(r.amountCents).toBe(4000);
        // The audit answer: WHICH agreed term this credit reduced.
        expect(r.termId).toBe("term-1");
    });

    it("uses the period's own length, so February is not September", async () => {
        const feb = await value([term({ amountCents: 120000 })], "2026-02-10");
        expect(feb.resolved).toBe(true);
        if (!feb.resolved) return;
        expect(feb.periodDays).toBe(28);
        // A day off in February is worth more than a day off in September,
        // because the month it is taken from is shorter.
        expect(feb.amountCents).toBe(4286);
    });

    it("prefers the ACCEPTED amount even when it is not the catalog price", async () => {
        // An overridden term — deliberately not the recommendation.
        const r = await value([term({ amountCents: 99900 })]);
        expect(r.resolved).toBe(true);
        if (!r.resolved) return;
        expect(r.acceptedPeriodAmountCents).toBe(99900);
        expect(r.amountCents).toBe(3330);
    });

    it("refuses when two accepted terms cover the period", async () => {
        /*
         * The same refusal tuition generation makes. An overlap it would not bill
         * is an overlap this must not credit — otherwise the credit and the charge
         * would disagree about which price was in force for one month.
         */
        const r = await value([
            term({ termId: "a", effectiveStart: "2026-01-01" }),
            term({ termId: "b", effectiveStart: "2026-09-05" }),
        ]);
        expect(r.resolved).toBe(false);
        if (r.resolved) return;
        expect(r.reason).toBe("overlapping_terms");
    });

    it("tells a term that has not started apart from one that has ended", async () => {
        const future = await value([term({ effectiveStart: "2026-12-01" })]);
        expect(future.resolved).toBe(false);
        if (!future.resolved) expect(future.reason).toBe("term_not_yet_effective");

        const ended = await value([term({ effectiveStart: "2026-01-01", effectiveEnd: "2026-06-30" })]);
        expect(ended.resolved).toBe(false);
        if (!ended.resolved) expect(ended.reason).toBe("term_already_ended");
    });

    it("refuses when there is no accepted term at all, and never falls back to a catalog", async () => {
        const r = await value([]);
        expect(r.resolved).toBe(false);
        if (r.resolved) return;
        expect(r.reason).toBe("no_accepted_term");
        // No amount is produced by any other route.
        expect(r).not.toHaveProperty("amountCents");
    });

    it("values a boundary day the same as any other day of its period", async () => {
        const first = await value([term()], "2026-09-01");
        const last = await value([term()], "2026-09-30");
        expect(first.resolved && last.resolved).toBe(true);
        if (!first.resolved || !last.resolved) return;
        expect(first.periodKey).toBe("2026-09");
        expect(last.periodKey).toBe("2026-09");
        expect(first.amountCents).toBe(last.amountCents);
    });
});
