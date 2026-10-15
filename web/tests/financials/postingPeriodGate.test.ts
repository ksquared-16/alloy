/**
 * W7-F001 — A CHARGE IN A PERIOD THAT HAS NOT BEGUN IS NOT YET OWED.
 *
 * The RULE is proven here against dates; the PLACEMENT is proven in
 * `postChildcareChargeFuturePeriod.test.ts`, against the authority. Both matter and they fail
 * differently: a correct rule in the wrong place is the defect this closes, because the old
 * behaviour had no rule at all and every caller posted whatever it was handed.
 */
import { describe, expect, it } from "vitest";

import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    PERIOD_NOT_STARTED_GATE,
    billingPeriodHasBegun,
    periodNotStartedFacts,
    periodNotStartedMessage,
    periodNotStartedRefusal,
} from "@/lib/financials/posting/postingPeriodGate";

describe("billingPeriodHasBegun", () => {
    it("has begun on the first day of the period, not the day after", () => {
        // The period COVERS its start date. An off-by-one here would hold back a whole day of
        // ordinary billing on the first of every month.
        expect(billingPeriodHasBegun({ periodStartsOn: "2026-11-01", businessDate: "2026-11-01" })).toBe(true);
    });

    it("has not begun the day before", () => {
        expect(billingPeriodHasBegun({ periodStartsOn: "2026-11-01", businessDate: "2026-10-31" })).toBe(false);
    });

    it("has begun for any later business date", () => {
        expect(billingPeriodHasBegun({ periodStartsOn: "2026-11-01", businessDate: "2026-12-25" })).toBe(true);
    });

    it("compares across a year boundary without arithmetic", () => {
        // `yyyy-MM-dd` sorts chronologically, which is why no Date is constructed in the gate —
        // constructing one would reintroduce a timezone at the point the caller just removed it.
        expect(billingPeriodHasBegun({ periodStartsOn: "2027-01-01", businessDate: "2026-12-31" })).toBe(false);
        expect(billingPeriodHasBegun({ periodStartsOn: "2026-12-31", businessDate: "2027-01-01" })).toBe(true);
    });

    it("treats a period with no start date as begun, rather than blocking billing on a config fault", () => {
        /*
         * Deliberate. A period with no `starts_on` cannot be fixed from the charge, and refusing to
         * post because of one would stop a tenant's billing for a reason the operator cannot see.
         * The calendar gate answers only the question the calendar can answer.
         */
        expect(billingPeriodHasBegun({ periodStartsOn: null, businessDate: "2026-11-01" })).toBe(true);
        expect(billingPeriodHasBegun({ periodStartsOn: "   ", businessDate: "2026-11-01" })).toBe(true);
    });

    it("treats an unknown business date as begun rather than silently holding everything", () => {
        expect(billingPeriodHasBegun({ periodStartsOn: "2026-11-01", businessDate: "" })).toBe(true);
    });
});

describe("the refusal is recognised structurally, not by its words", () => {
    const facts = {
        chargeId: "chg-1",
        billingPeriodId: "bp-1",
        periodKey: "2026-11",
        periodStartsOn: "2026-11-01",
        businessDate: "2026-10-05",
    };

    it("round-trips the facts every caller needs", () => {
        const recovered = periodNotStartedFacts(periodNotStartedRefusal(facts));
        expect(recovered).toEqual(facts);
    });

    it("does not recognise an unrelated conflict", () => {
        const closed = new OperationalEnrollmentServiceError(
            "conflict",
            "This charge belongs to a billing period that is closed, so it cannot be posted.",
            { chargeId: "chg-1", billingPeriodStatus: "closed" },
        );
        expect(periodNotStartedFacts(closed)).toBeNull();
    });

    it("does not recognise a plain Error, however it is worded", () => {
        // The point of the marker: a message that happens to contain the words must not match.
        expect(periodNotStartedFacts(new Error("period_not_started"))).toBeNull();
        expect(periodNotStartedFacts("period has not started")).toBeNull();
        expect(periodNotStartedFacts(null)).toBeNull();
    });

    it("names the date in the operator's sentence, and does not sound like a fault", () => {
        const message = periodNotStartedMessage({ periodStartsOn: "2026-11-01" });
        expect(message).toContain("2026-11-01");
        expect(message).toContain("post on its own");
        expect(message).not.toMatch(/error|failed|refused/i);
    });

    it("carries the gate name the draft is labelled with, so the label and the refusal agree", () => {
        const refusal = periodNotStartedRefusal(facts);
        expect((refusal.details ?? {}).postingGate).toBe(PERIOD_NOT_STARTED_GATE);
        expect(PERIOD_NOT_STARTED_GATE).toBe("period_not_started");
    });
});
