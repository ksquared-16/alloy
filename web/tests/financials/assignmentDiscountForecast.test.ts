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
        /* Every key is a `NotEligibleReason` the resolver actually returns. */
        const resolver = src("lib/financials/reductions/resolveFinancialReductions.ts");
        for (const reason of [
            "no_policy_configured", "not_enough_siblings", "rank_not_covered",
            "not_an_employee_household", "category_not_covered", "category_not_discountable",
        ]) {
            expect(resolver, `${reason} is a domain reason`).toContain(`"${reason}"`);
            expect(card, `${reason} has an operator label`).toContain(reason);
        }
    });

    it("an unmapped reason is still shown, not hidden", () => {
        const card = src(CARD);
        expect(card).toContain('REDUCTION_REASON_LABEL[reason] ?? reason.replace(/_/g, " ")');
    });

    it("the surface carries the outcome and its reason for measurement", () => {
        const card = src(CARD);
        expect(card).toContain('data-assignment-discount-forecast="true"');
        expect(card).toContain("data-forecast-outcome");
        expect(card).toContain("data-forecast-reason");
    });
});

describe("the forecast asks about a month, because reductions are monthly", () => {
    it("derives a YYYY-MM key even from a weekly commercial period", () => {
        /*
         * MEASURED: the route answered 500 "period_key must be YYYY-MM" for every weekly
         * assignment. `billingPeriodBounds` takes a month, and reductions resolve per calendar
         * month by the same doctrine that keeps `placeInBillingPeriod` monthly by default — while
         * a weekly assignment's current commercial period is `2026-09-15~2026-09-21`.
         */
        const r = src(READER);
        expect(r).toContain('periods?.current.start');
        expect(r).toContain('.slice(0, 7)');
        expect(r, "never the interval key").not.toMatch(/periods\?\.current\.key/);
    });

    it("that month is the one the application path will use", () => {
        const apply = src("lib/financials/reductions/applyFinancialReductions.ts");
        expect(apply).toContain("billingPeriodBounds(periodKey)");
        expect(src(FORECAST)).toContain("billingPeriodBounds(args.periodKey)");
    });
});
