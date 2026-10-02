/**
 * THE FORECAST IS A PROJECTION OF THE ENGINE, NOT A SECOND ONE.
 *
 * The discount engine was certified in Core: eligibility, sibling facts, the category veto,
 * effective dating, provenance, idempotency, posted immutability, producer independence. What was
 * missing is the operator's question — "what is expected to apply to THIS relationship" — and the
 * only safe way to answer it is with the same authority that will answer it for real later.
 *
 * A forecast that reasoned independently would be a second opinion about money, and the first time
 * it disagreed with the ledger nobody could say which was wrong.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const FORECAST = "lib/financials/reductions/forecastAssignmentReductions.ts";
const ROUTE = "app/api/admin/financials/reduction-forecast/route.ts";
/*
 * The forecast body moved out of the route into this reader so a FAMILY-grain caller could ask the
 * same question of each of a household's relationships without a second implementation existing.
 * The rules below are unchanged and are asserted where they now live; the route is still asserted
 * to DELEGATE, so none of them can be bypassed by answering in the route again.
 */
const READER = "lib/financials/reductions/readAssignmentDiscountPosition.ts";
const CARD = "components/admin/focusPanel/cards/SchedulingCard.tsx";
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the forecast uses the canonical eligibility authority", () => {
    const f = src(FORECAST);

    it("asks the three readers the application path asks", () => {
        expect(f).toContain("readPolicies");
        expect(f).toContain("resolveHouseholdEligibility");
        expect(f).toContain("resolveFinancialReductions");
    });

    it("decides no eligibility of its own", () => {
        const code = strip(f);
        expect(code, "no sibling arithmetic").not.toMatch(/siblingRank\s*[<>=]|siblingCount\s*[<>=]/);
        expect(code, "no employment test").not.toMatch(/employeeHousehold\s*===|employeeHousehold\s*\?/);
        expect(code, "no percentage maths").not.toMatch(/\*\s*0?\.\d|\/\s*100\b/);
    });

    it("filters policies by the same effective window as the application path", () => {
        const apply = src("lib/financials/reductions/applyFinancialReductions.ts");
        for (const clause of ["p.isActive", "p.effective.start <= period.end", "p.effective.end >= period.start"]) {
            expect(f, `forecast: ${clause}`).toContain(clause);
            expect(apply, `apply: ${clause}`).toContain(clause);
        }
    });
});

describe("it writes nothing", () => {
    const f = src(FORECAST);

    it("creates no reduction, charge, adjustment or ledger row", () => {
        /*
         * Asserted on stripped CODE: the header says at length that it writes none of these, and
         * a substring match fails on its own documentation — the third time in this thread a lock
         * has caught a comment instead of a statement.
         */
        const code = strip(f);
        expect(code, "no application row").not.toMatch(/financial_reduction_applications/);
        expect(code, "no write of any kind").not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
        expect(code).not.toMatch(/createChildcareDraftCharge|recalculateDraftCharge/);
    });

    it("invents no charge id that could be mistaken for a real one", () => {
        expect(f).toContain('chargeId: `forecast:');
    });

    it("the route is a read", () => {
        const r = src(ROUTE);
        expect(r).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
        expect(r).toContain("assertFinancialsReadAllowed");
    });
});

describe("the gross is the accepted term, not a recommendation", () => {
    it("forecasts against what was agreed", () => {
        const r = src(READER);
        expect(r).toContain("accepted.amountCents");
        expect(r, "an unaccepted price is not a forecast").toContain("no_accepted_term");
        expect(r, "and not the resolver's suggestion").not.toMatch(/view\.recommended\.amountCents/);
        expect(src(ROUTE), "the route delegates rather than forecasting again")
            .toContain("readAssignmentDiscountPosition");
    });

    it("uses the period the assignment is billing now", () => {
        expect(src(READER)).toContain("acceptedTermBillingPeriods");
        expect(src(ROUTE), "and the route derives no period of its own")
            .not.toContain("acceptedTermBillingPeriods");
    });
});

describe("the reasons are the domain's", () => {
    it("renders canonical reason codes, not an invented vocabulary", () => {
        const card = src(CARD);
        /*
         * The vocabulary moved into `reductionReasonLabels`, shared with the family Discount
         * surface so one canonical reason reads the same way at both grains. The rule is
         * unchanged — every label is for a reason the RESOLVER actually returns, never an
         * invented one — and is asserted where the words now live, plus the card consuming them.
         */
        const resolver = src("lib/financials/reductions/resolveFinancialReductions.ts");
        const vocab = src("lib/financials/reductions/reductionReasonLabels.ts");
        for (const reason of [
            "no_policy_configured", "not_enough_siblings", "rank_not_covered",
            "not_an_employee_household", "category_not_covered", "category_not_discountable",
        ]) {
            expect(resolver, `${reason} is a domain reason`).toContain(`"${reason}"`);
            expect(vocab, `${reason} has an operator label`).toContain(reason);
        }
        expect(card, "and the card reads that vocabulary").toContain("reductionReasonLabels");
    });

    it("an unmapped reason is still shown, not hidden", () => {
        expect(src("lib/financials/reductions/reductionReasonLabels.ts"))
            .toContain('reason.replace(/_/g, " ")');
        expect(src(CARD)).toContain("REDUCTION_REASON_LABEL[reason]");
    });

    it("the surface carries the outcome and its reason for measurement", () => {
        const card = src(CARD);
        expect(card).toContain('data-assignment-discount-forecast="true"');
        expect(card).toContain("data-forecast-outcome");
        expect(card).toContain("data-forecast-reason");
    });
});

describe("the forecast asks about the account's OWN period, not a month cut off a date", () => {
    it("uses the commercial period's own key, and never slices a month out of its start date", () => {
        /*
         * REVERSED DELIBERATELY — this test previously asserted the opposite, and recorded why:
         * "the route answered 500 `period_key must be YYYY-MM` for every weekly assignment". That
         * 500 was the defect. The test locked in the WORKAROUND — slice a month off the period's
         * start date — which made a weekly account's discounts resolve against `2026-09`, a period
         * key no persisted period carries, while its real commercial period was
         * `2026-09-15~2026-09-21`.
         *
         * `billingPeriodFromKey` reads both shapes, so there is nothing left to accommodate. The
         * key now comes from the resolved period itself.
         */
        const r = src(READER);
        /*
         * Asserted by INTENT rather than by one spelling: the reader must take the resolved period's
         * own key, and must not compose a period identity by cutting characters off a date. Pinning
         * the exact expression is how a source-text lock starts failing on a clean refactor.
         */
        expect(r, "reads the resolved current period").toContain("periods?.current");
        expect(r, "takes the period's own identity").toMatch(/period\.key|current\.key/);
        expect(r, "no month cut out of a date").not.toMatch(/slice\(0,\s*7\)/);
        expect(r, "no start date composed from a key").not.toMatch(/\$\{periodKey\}-01/);
    });

    it("that month is the one the application path will use", () => {
        const apply = src("lib/financials/reductions/applyFinancialReductions.ts");
        expect(apply).toContain("billingPeriodFromKey(periodKey)");
        expect(src(FORECAST)).toContain("billingPeriodFromKey(args.periodKey)");
    });
});
