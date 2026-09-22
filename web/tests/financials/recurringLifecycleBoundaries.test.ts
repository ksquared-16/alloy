/**
 * THE THREE STATES OF AN ACCEPTED TERM, AND WHAT EACH ONE BILLS.
 *
 * The NOT-YET-EFFECTIVE boundary is proven on the running app against the real accepted terms —
 * previewing August, which both terms (effective 2026-09-01) do not cover, answers
 * `term_not_yet_effective` with `generated: 0`. ACTIVE is proven by September generating.
 *
 * ENDED cannot be shown the same way without giving a live term an `effective_end`, which would
 * damage the Human-QA commercial setup this thread exists to build. So it is proven here, on the
 * pure resolver that makes the decision — the same function the run calls, with no database between
 * the input and the answer.
 *
 * The two shapes are told APART deliberately: "not yet" and "no longer" are different things to an
 * operator, and a single `no_accepted_term` for both would hide which.
 */
import { describe, expect, it } from "vitest";

import { resolveTuitionRecurrence } from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";

const SEPTEMBER = { key: "2026-09", label: "September 2026", start: "2026-09-01", end: "2026-09-30" };

/** The weekly specimen's real shape: $185.00, weekly, effective 2026-09-01. */
const term = (over: Partial<Record<string, unknown>> = {}) =>
    ({
        termId: "19baf6ca",
        termKind: "tuition",
        cadenceKey: "monthly",
        amountCents: 145_000,
        currencyCode: "USD",
        effectiveStart: "2026-09-01",
        effectiveEnd: null,
        state: "accepted",
        ...over,
    }) as never;

const decide = (terms: unknown[], cadenceKey = "monthly") =>
    resolveTuitionRecurrence({ terms: terms as never, period: SEPTEMBER as never, cadenceKey, prorationMethod: "none" });

describe("THE GATE — a term that has not begun bills nothing", () => {
    it("says not yet effective, and names it as such", () => {
        const d = decide([term({ effectiveStart: "2026-10-01" })]);
        expect(d.kind).toBe("not_due");
        expect((d as { reason: string }).reason).toBe("term_not_yet_effective");
    });
});

describe("THE GATE — a live term bills", () => {
    it("bills the accepted amount for the period it covers", () => {
        const d = decide([term()]);
        expect(d.kind).toBe("due");
        expect((d as { amountCents: number }).amountCents).toBe(145_000);
    });

    /*
     * A term that begins mid-period COVERS it — overlap, not containment, is the rule — but with no
     * proration policy the run REFUSES rather than billing a partial month at the full price. I
     * expected "due" here and the resolver was right: charging a family for September when they
     * started on the 15th, because nobody had configured proration, is exactly the silent wrong
     * number this whole run is about.
     */
    it("refuses a partial period rather than billing it whole", () => {
        const d = decide([term({ effectiveStart: "2026-09-15" })]);
        expect(d.kind).toBe("refused");
        expect((d as { reason: string }).reason).toBeTruthy();
    });
});

describe("THE GATE — a term that has ended bills nothing after it", () => {
    it("says already ended, not 'no term'", () => {
        const d = decide([term({ effectiveStart: "2026-01-01", effectiveEnd: "2026-08-31" })]);
        expect(d.kind).toBe("not_due");
        expect((d as { reason: string }).reason).toBe("term_already_ended");
    });

    /* Ending inside the period is the same partial coverage, and gets the same honest refusal. */
    it("refuses the part-month a term ended inside, rather than billing it whole", () => {
        expect(decide([term({ effectiveEnd: "2026-09-20" })]).kind).toBe("refused");
    });

    /*
     * THE TWO ARE NEVER COLLAPSED. "Not yet" and "no longer" are different operator situations and
     * a shared reason would tell neither of them.
     */
    it("keeps the two boundaries distinguishable", () => {
        const future = decide([term({ effectiveStart: "2026-10-01" })]);
        const past = decide([term({ effectiveStart: "2026-01-01", effectiveEnd: "2026-08-31" })]);
        expect((future as { reason: string }).reason).not.toBe((past as { reason: string }).reason);
    });
});

describe("THE GATE — the run's cadence decides which terms it bills", () => {
    it("leaves a weekly term alone on a monthly run, and says why", () => {
        const d = decide([term({ cadenceKey: "weekly", amountCents: 18_500 })], "monthly");
        expect((d as { reason: string }).reason).toBe("cadence_not_billed_by_this_run");
    });

    it("bills the weekly term on a weekly run", () => {
        const d = decide([term({ cadenceKey: "weekly", amountCents: 18_500 })], "weekly");
        expect(d.kind).toBe("due");
        expect((d as { amountCents: number }).amountCents).toBe(18_500);
    });
});
