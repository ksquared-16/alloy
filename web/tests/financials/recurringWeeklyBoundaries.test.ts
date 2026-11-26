/**
 * WEEKLY BILLING PERIODS TILE FROM THE AGREEMENT'S OWN ANCHOR (§E1 · §E4).
 *
 * ── WHY THIS IS DETERMINISTIC AND NOT MOUNTED ────────────────────────────────────────────────
 *
 * The boundaries are the thing under test, and they are computed by `assignmentBillingPeriods` —
 * the SAME function the generator and the preview both call, exported precisely so the two cannot
 * tile differently. Running it directly tests the authority rather than a rendering of it.
 *
 * ── WHAT WOULD BE WRONG ──────────────────────────────────────────────────────────────────────
 *
 * ISO weeks. A weekly period is "the week THIS agreement bills on", so two families that accepted
 * terms on different days legitimately sit on different week boundaries. An ISO-week implementation
 * would put every tenant on Monday and silently re-date half of them.
 *
 * Month collapsing. A weekly period that straddles a month boundary must stay one period with its
 * real start and end — `YYYY-MM` is the monthly key and is not a container for weekly periods.
 */
import { describe, expect, it } from "vitest";

import { assignmentBillingPeriods } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { billingPeriodsBetween, billingPeriodKeyFor } from "@/lib/financials/billingPeriod";

/* A real anchor: terms accepted effective Wednesday 2026-09-02. */
const TERMS = [{ effectiveStart: "2026-09-02" }];
const SEPTEMBER = { start: "2026-09-01", end: "2026-09-30" };

describe("THE GATE — weekly periods come from the anchor, not the calendar", () => {
    const weeks = assignmentBillingPeriods(TERMS, "weekly", SEPTEMBER);

    it("tiles the requested span into whole weeks", () => {
        expect(weeks.length).toBeGreaterThanOrEqual(4);
        for (const w of weeks) {
            const days = (Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`)) / 86_400_000 + 1;
            expect(days, `${w.start}→${w.end} is seven days`).toBe(7);
        }
    });

    /*
     * THE ANCHOR IS THE AGREEMENT'S. Terms effective on a Wednesday bill Wednesday-to-Tuesday, and
     * an ISO-week implementation would have produced Mondays here.
     */
    it("starts each week on the agreement's own weekday, not Monday", () => {
        const anchorDow = new Date("2026-09-02T00:00:00Z").getUTCDay();
        for (const w of weeks) {
            expect(new Date(`${w.start}T00:00:00Z`).getUTCDay(), `${w.start} shares the anchor's weekday`).toBe(anchorDow);
        }
    });

    /* A different household, a different anchor, different boundaries — and that is correct. */
    it("gives a household that accepted on another day its own boundaries", () => {
        const other = assignmentBillingPeriods([{ effectiveStart: "2026-09-04" }], "weekly", SEPTEMBER);
        expect(other[0]!.start).not.toBe(weeks[0]!.start);
        expect(new Date(`${other[0]!.start}T00:00:00Z`).getUTCDay())
            .toBe(new Date("2026-09-04T00:00:00Z").getUTCDay());
    });

    /* No overlap and no gap: each period begins the day after the previous one ends. */
    it("tiles without overlap or gaps", () => {
        for (let i = 1; i < weeks.length; i++) {
            const prevEnd = Date.parse(`${weeks[i - 1]!.end}T00:00:00Z`);
            const thisStart = Date.parse(`${weeks[i]!.start}T00:00:00Z`);
            expect(thisStart - prevEnd, `${weeks[i - 1]!.end} → ${weeks[i]!.start}`).toBe(86_400_000);
        }
    });

    /*
     * A WEEK THAT CROSSES A MONTH BOUNDARY STAYS ONE WEEK. Kept as evidence rather than avoided:
     * this is the case where a monthly-shaped implementation would split or swallow a period.
     */
    it("keeps a month-crossing week whole", () => {
        const crossing = billingPeriodsBetween("weekly", "2026-09-02", "2026-09-25", "2026-10-10")
            .filter((w) => w.start.slice(0, 7) !== w.end.slice(0, 7));
        expect(crossing.length, "September into October produces at least one straddling week").toBeGreaterThan(0);
        for (const w of crossing) {
            expect(w.start.slice(0, 7)).toBe("2026-09");
            expect(w.end.slice(0, 7)).toBe("2026-10");
            expect(billingPeriodKeyFor("weekly", w.start, w.end), "a weekly key carries both real dates").toContain("~");
        }
    });

    /*
     * AND THE KEY IS NOT YYYY-MM. Collapsing a weekly period to its month is how four obligations
     * become one; the monthly key keeps its own shape, which is the contract everything else reads.
     */
    it("keys weekly periods by their real span and monthly ones by month", () => {
        for (const w of weeks) expect(billingPeriodKeyFor("weekly", w.start, w.end)).toMatch(/^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/);
        const [month] = assignmentBillingPeriods(TERMS, "monthly", SEPTEMBER);
        expect(billingPeriodKeyFor("monthly", month!.start, month!.end)).toBe("2026-09");
    });
});

describe("THE GATE — the span is honoured, whatever the anchor (§E4)", () => {
    /* An anchor far in the past still produces the weeks of the requested span, not history. */
    it("bills only inside the requested span", () => {
        const weeks = assignmentBillingPeriods([{ effectiveStart: "2026-01-07" }], "weekly", SEPTEMBER);
        for (const w of weeks) {
            expect(w.end >= SEPTEMBER.start, `${w.start}→${w.end} reaches the span`).toBe(true);
            expect(w.start <= SEPTEMBER.end, `${w.start} starts before the span ends`).toBe(true);
        }
    });

    /* With no accepted term at all the span itself anchors the tiling — never a crash, never zero. */
    it("falls back to the span when no term names an anchor", () => {
        expect(assignmentBillingPeriods([], "weekly", SEPTEMBER).length).toBeGreaterThan(0);
    });
});
