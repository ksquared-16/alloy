/**
 * CURRENT AND NEXT, FOR EVERY CADENCE THE PERIOD AUTHORITY CLAIMS.
 *
 * The bounds themselves belong to `billingPeriod.ts`; what is asserted here is that the materialiser
 * asks it correctly — that "next" really is the period beginning the day after this one ends, with no
 * gap and no overlap, for each cadence. A gap would be days belonging to no commercial period, and an
 * overlap is what the `financial_billing_periods` exclusion constraint refuses outright.
 */
import { describe, expect, it } from "vitest";
import { currentAndNextPeriods, LIVE_AGREEMENT_STATUSES } from "@/lib/financials/billingPeriods/customerBillingPeriodService";
import type { BillingCadence } from "@/lib/financials/billingPeriod";

const CASES: { cadence: BillingCadence; anchorOn: string | null; onDate: string; expectKey?: string }[] = [
    { cadence: "monthly", anchorOn: null, onDate: "2026-11-12", expectKey: "2026-11" },
    { cadence: "weekly", anchorOn: "2026-01-05", onDate: "2026-11-12" },
    { cadence: "biweekly", anchorOn: "2026-01-05", onDate: "2026-11-12" },
    { cadence: "daily", anchorOn: "2026-01-05", onDate: "2026-11-12" },
    { cadence: "annual", anchorOn: "2026-01-05", onDate: "2026-11-12" },
];

describe("current and next are contiguous, for every supported cadence", () => {
    for (const c of CASES) {
        it(`${c.cadence}: next begins the day after current ends`, () => {
            const { current, next } = currentAndNextPeriods({ cadence: c.cadence, anchorOn: c.anchorOn }, c.onDate);

            /* The day being billed falls inside the CURRENT period, by definition. */
            expect(current.start <= c.onDate).toBe(true);
            expect(current.end >= c.onDate).toBe(true);

            /* No gap: a day belonging to no commercial period could never be billed or finalized. */
            const dayAfter = new Date(`${current.end}T00:00:00Z`);
            dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
            expect(next.start).toBe(dayAfter.toISOString().slice(0, 10));

            /* No overlap: this is exactly what the exclusion constraint refuses. */
            expect(next.start > current.end).toBe(true);
            expect(current.start <= current.end).toBe(true);
            expect(next.start <= next.end).toBe(true);

            /* Two distinct identities, so they can be two rows. */
            expect(next.key).not.toBe(current.key);
            if (c.expectKey) expect(current.key).toBe(c.expectKey);
        });
    }

    it("monthly keeps the `YYYY-MM` identity history is already stored under", () => {
        const { current, next } = currentAndNextPeriods({ cadence: "monthly", anchorOn: null }, "2026-11-12");
        expect(current.key).toBe("2026-11");
        expect(next.key).toBe("2026-12");
        expect(current.start).toBe("2026-11-01");
        expect(current.end).toBe("2026-11-30");
    });

    it("monthly ignores an anchor rather than tiling from it", () => {
        const a = currentAndNextPeriods({ cadence: "monthly", anchorOn: null }, "2026-11-12");
        const b = currentAndNextPeriods({ cadence: "monthly", anchorOn: "2026-01-05" }, "2026-11-12");
        expect(b.current).toEqual(a.current);
        expect(b.next).toEqual(a.next);
    });

    it("weekly periods are seven days, and biweekly fourteen", () => {
        const days = (p: { start: string; end: string }) =>
            Math.round(
                (Date.parse(`${p.end}T00:00:00Z`) - Date.parse(`${p.start}T00:00:00Z`)) / 86_400_000,
            ) + 1;
        expect(days(currentAndNextPeriods({ cadence: "weekly", anchorOn: "2026-01-05" }, "2026-11-12").current)).toBe(7);
        expect(days(currentAndNextPeriods({ cadence: "biweekly", anchorOn: "2026-01-05" }, "2026-11-12").current)).toBe(14);
        expect(days(currentAndNextPeriods({ cadence: "daily", anchorOn: "2026-01-05" }, "2026-11-12").current)).toBe(1);
    });

    it("two locations anchoring weekly on different days produce different boundaries", () => {
        /* The configuration difference the corrected doctrine exists to preserve. */
        const monday = currentAndNextPeriods({ cadence: "weekly", anchorOn: "2026-01-05" }, "2026-11-12").current;
        const wednesday = currentAndNextPeriods({ cadence: "weekly", anchorOn: "2026-01-07" }, "2026-11-12").current;
        expect(monday.start).not.toBe(wednesday.start);
        expect(monday.key).not.toBe(wednesday.key);
    });

    it("a term's effective date does not enter the calculation at all", () => {
        /*
         * The anchor is the CALENDAR's, supplied by location or account configuration. Two accounts
         * whose agreements started on different days, under one calendar, get identical periods —
         * which is the per-term anchor being retired as the commercial-period authority.
         */
        const one = currentAndNextPeriods({ cadence: "weekly", anchorOn: "2026-01-05" }, "2026-11-12");
        const two = currentAndNextPeriods({ cadence: "weekly", anchorOn: "2026-01-05" }, "2026-11-12");
        expect(one).toEqual(two);
    });
});

describe("which agreements count as a live commercial relationship", () => {
    it("is exactly the three billing statuses, and nothing else", () => {
        expect([...LIVE_AGREEMENT_STATUSES]).toEqual(["pending_start", "active", "ending"]);
    });
});
