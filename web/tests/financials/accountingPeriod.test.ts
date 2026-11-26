import { describe, expect, it } from "vitest";

import {
    calendarMonthPeriods,
    findOverlappingPeriods,
    findPeriodForDate,
    fourFourFivePeriods,
} from "@/lib/financials/accountingPeriod";
import { billingPeriodForDate, placeInBillingPeriod } from "@/lib/financials/billingPeriod";

/**
 * THE TWO PERIODS MUST BE ABLE TO DISAGREE.
 *
 * A childcare organisation bills parents monthly and may close its books on a 4/4/5 calendar. If the
 * accounting period were derived from the billing month, the two could never differ — and the whole
 * reason a 4/4/5 calendar exists is that they do. These cases pin the arithmetic that makes the
 * difference real, and the case that proves the two identities do not collapse.
 */
describe("accounting period shapes", () => {
    it("generates 12 contiguous 4/4/5 periods of 4, 4 and 5 weeks", () => {
        const periods = fourFourFivePeriods({ fiscalYearStart: "2026-01-04", keyPrefix: "FY2026" });
        expect(periods).toHaveLength(12);

        const days = (p: { starts_on: string; ends_on: string }) =>
            (Date.parse(`${p.ends_on}T00:00:00Z`) - Date.parse(`${p.starts_on}T00:00:00Z`)) / 86_400_000 + 1;
        // 4/4/5 by quarter, in days: 28, 28, 35.
        expect(periods.slice(0, 3).map(days)).toEqual([28, 28, 35]);
        expect(periods.map(days).reduce((a, b) => a + b, 0)).toBe(364); // 52 whole weeks

        // Contiguous: each period starts the day after the previous one ends.
        for (let i = 1; i < periods.length; i++) {
            const prevEnd = Date.parse(`${periods[i - 1].ends_on}T00:00:00Z`);
            const start = Date.parse(`${periods[i].starts_on}T00:00:00Z`);
            expect(start - prevEnd).toBe(86_400_000);
        }
        expect(periods[0].period_key).toBe("FY2026-P01");
        expect(periods[0].starts_on).toBe("2026-01-04");
        expect(periods[0].ends_on).toBe("2026-01-31");
    });

    it("puts a 4/4/5 period boundary somewhere a month boundary is not", () => {
        const periods = fourFourFivePeriods({ fiscalYearStart: "2026-01-04" });
        // P02 runs 1 Feb–28 Feb only by coincidence of this start date; P03 is the five-week period
        // and must NOT end on a month end.
        const p03 = periods[2];
        expect(p03.starts_on).toBe("2026-03-01");
        expect(p03.ends_on).toBe("2026-04-04");
        expect(p03.ends_on.slice(0, 7)).not.toBe(p03.starts_on.slice(0, 7));
    });

    it("does not invent a 53rd week", () => {
        // 12 periods, 364 days. A 53-week fiscal year is a policy decision about which quarter
        // absorbs the extra week, and guessing puts a week of money in a period nobody chose.
        const periods = fourFourFivePeriods({ fiscalYearStart: "2026-01-04" });
        expect(periods).toHaveLength(12);
        expect(periods[11].ends_on).toBe("2027-01-02");
    });

    it("generates calendar-month periods for a fiscal year that does not start in January", () => {
        const periods = calendarMonthPeriods({ startYear: 2026, startMonth: 7, keyPrefix: "FY2027" });
        expect(periods[0]).toMatchObject({ period_key: "FY2027-P01", starts_on: "2026-07-01", ends_on: "2026-07-31" });
        expect(periods[11]).toMatchObject({ period_key: "FY2027-P12", starts_on: "2027-06-01", ends_on: "2027-06-30" });
        // February is right in a leap year without a month-length table.
        const feb = calendarMonthPeriods({ startYear: 2028, startMonth: 2 })[0];
        expect(feb.ends_on).toBe("2028-02-29");
    });

    it("finds the period covering a date, inclusive at both ends", () => {
        const periods = fourFourFivePeriods({ fiscalYearStart: "2026-01-04" });
        expect(findPeriodForDate(periods, "2026-01-04")?.period_key).toBe("FY2026-P01");
        expect(findPeriodForDate(periods, "2026-01-31")?.period_key).toBe("FY2026-P01");
        expect(findPeriodForDate(periods, "2026-02-01")?.period_key).toBe("FY2026-P02");
        // Before the calendar starts is UNAVAILABLE, not period 1.
        expect(findPeriodForDate(periods, "2026-01-03")).toBeNull();
    });

    it("detects the overlap the exclusion constraint refuses", () => {
        const clean = fourFourFivePeriods({ fiscalYearStart: "2026-01-04" });
        expect(findOverlappingPeriods(clean)).toBeNull();

        const overlapping = [
            { period_key: "P1", label: "P1", starts_on: "2026-01-01", ends_on: "2026-01-31" },
            { period_key: "P2", label: "P2", starts_on: "2026-01-31", ends_on: "2026-02-28" },
        ];
        expect(findOverlappingPeriods(overlapping)).not.toBeNull();
    });

    it("keeps the billing period and the accounting period as separate answers", () => {
        // The same service day, asked twice. Billing says "March 2026" because that is the cycle the
        // parent is billed under; the 4/4/5 calendar says P03, whose span is 1 Mar – 4 Apr. Neither
        // is derivable from the other, which is the point.
        const serviceDay = "2026-03-30";
        expect(billingPeriodForDate(serviceDay).key).toBe("2026-03");

        const accounting = fourFourFivePeriods({ fiscalYearStart: "2026-01-04" });
        const period = findPeriodForDate(accounting, serviceDay);
        expect(period?.period_key).toBe("FY2026-P03");
        expect(period?.ends_on).toBe("2026-04-04");

        // A charge serviced on 4 April bills in April and still reports in P03.
        const aprilService = "2026-04-04";
        expect(placeInBillingPeriod({ billable_on: aprilService }).key).toBe("2026-04");
        expect(findPeriodForDate(accounting, aprilService)?.period_key).toBe("FY2026-P03");
    });
});
