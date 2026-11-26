/**
 * WHICH COMMERCIAL PERIOD AN ASSIGNMENT IS IN — derived, and refused where it cannot be known.
 *
 * The Assignment Tuition card owns the accepted cadence and could not state a period, so three
 * operator questions went unanswered on the one surface that should know them. The answer had to
 * live beside the other period functions: a component working out its own boundaries would be a
 * second period model, and this domain's whole doctrine is that a billing period is DERIVED from
 * the accepted term, the cadence and the agreement anchor.
 *
 * What is locked here is mostly the REFUSALS. A surface that fabricates a period for an assignment
 * with no commercial cadence is worse than one that says nothing.
 */
import { describe, expect, it } from "vitest";

import { acceptedTermBillingPeriods } from "@/lib/financials/billingPeriod";

const weekly = { cadenceKey: "weekly", effectiveStart: "2026-09-01", effectiveEnd: null };
const monthly = { cadenceKey: "monthly", effectiveStart: "2026-09-01", effectiveEnd: null };

describe("THE GATE — the period comes from the accepted term", () => {
    /* Weekly tiles from the AGREEMENT ANCHOR, not from the calendar week. */
    it("tiles weekly from the anchor and names the next one", () => {
        const p = acceptedTermBillingPeriods(weekly, "2026-09-24")!;
        expect(p.current.start).toBe("2026-09-22");
        expect(p.current.end).toBe("2026-09-28");
        expect(p.next.start).toBe("2026-09-29");
        expect(p.next.end).toBe("2026-10-05");
    });

    /* A week that crosses a month boundary stays ONE commercial period. */
    it("keeps a cross-month week whole", () => {
        const p = acceptedTermBillingPeriods(weekly, "2026-09-30")!;
        expect(p.current.start).toBe("2026-09-29");
        expect(p.current.end).toBe("2026-10-05");
    });

    it("gives monthly the canonical month period", () => {
        const p = acceptedTermBillingPeriods(monthly, "2026-09-18")!;
        expect(p.current.key).toBe("2026-09");
        expect(p.next.key).toBe("2026-10");
    });

    /*
     * A TERM THAT HAS NOT BEGUN STATES ITS FIRST PERIOD. Describing a period the term does not
     * cover would be a claim about money nobody has agreed to yet.
     */
    it("states the first period for a term that starts later", () => {
        const p = acceptedTermBillingPeriods(monthly, "2026-08-15")!;
        expect(p.current.key).toBe("2026-09");
    });
});

describe("THE GATE — it refuses rather than fabricating", () => {
    it("answers nothing without an accepted term", () => {
        expect(acceptedTermBillingPeriods(null, "2026-09-18")).toBeNull();
        expect(acceptedTermBillingPeriods(undefined, "2026-09-18")).toBeNull();
    });

    it("answers nothing without an anchor", () => {
        expect(acceptedTermBillingPeriods({ cadenceKey: "weekly", effectiveStart: null }, "2026-09-18")).toBeNull();
    });

    /* A usage-priced cadence has no interval to state — the same refusal generation gives. */
    it("answers nothing for a cadence with no interval", () => {
        for (const cadenceKey of ["per_session", "hourly_usage", "", "nonsense"]) {
            expect(acceptedTermBillingPeriods({ cadenceKey, effectiveStart: "2026-09-01" }, "2026-09-18"), cadenceKey).toBeNull();
        }
    });

    /* An ended term describes no current period, and must not imply one. */
    it("answers nothing once the term has ended", () => {
        expect(
            acceptedTermBillingPeriods({ ...monthly, effectiveEnd: "2026-08-31" }, "2026-09-18"),
        ).toBeNull();
    });

    /* A term ending later still states its period — it is live today. */
    it("still answers while the term is live", () => {
        expect(acceptedTermBillingPeriods({ ...monthly, effectiveEnd: "2026-12-31" }, "2026-09-18")).not.toBeNull();
    });
});
