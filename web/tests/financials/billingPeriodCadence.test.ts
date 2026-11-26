/**
 * A BILLING PERIOD IS A COMMERCIAL INTERVAL, AND ITS IDENTITY IS ITS BOUNDARIES.
 *
 * ── THE DEFECT THESE LOCK ─────────────────────────────────────────────────────────────────────
 *
 * Billing cadence has been configurable since the `commercial_billing_cadence` seed — weekly,
 * biweekly, monthly, annual, daily, hourly, per_session — while billing period IDENTITY was always
 * `YYYY-MM`. Because the tuition occurrence key is `cev:tuition:<assignmentId>:<periodKey>`, a
 * WEEKLY organisation billing a four-week span produced ONE charge: weeks two, three and four
 * collided with week one on the `consumption_events` unique index.
 *
 * The idempotency guarantee was working perfectly, over the wrong grain. That is what made it
 * dangerous — it looked exactly like correct deduplication, and under-billed silently.
 *
 * ── WHAT IS DELIBERATELY NOT TESTED HERE ─────────────────────────────────────────────────────
 *
 * ISO weeks. There are none. A commercial week is tiled from the organisation's own anchor, so one
 * tenant's week may run Monday–Sunday and another's Thursday–Wednesday and neither is wrong.
 */
import { describe, expect, it } from "vitest";

import { assignmentBillingPeriods } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { tuitionOccurrenceKey } from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import {
    billingPeriodDays,
    billingPeriodFor,
    billingPeriodFromKey,
    billingPeriodKeyFor,
    billingPeriodLabel,
    billingPeriodsBetween,
    isPeriodBillableCadence,
    placeInBillingPeriod,
} from "@/lib/financials/billingPeriod";

describe("identity carries the boundaries", () => {
    /*
     * MONTHLY IS UNCHANGED, EXACTLY. Every existing charge resolution key, every stored
     * `service_period`, every ledger grouping and every <input type="month"> holds `YYYY-MM`.
     * Changing it would restate history this convergence did not generate.
     */
    it("keeps YYYY-MM for monthly, and keeps what it means", () => {
        expect(billingPeriodKeyFor("monthly", "2026-09-01", "2026-09-30")).toBe("2026-09");
        const p = billingPeriodFromKey("2026-09");
        expect(p.start).toBe("2026-09-01");
        expect(p.end).toBe("2026-09-30");
        expect(p.label).toBe("September 2026");
    });

    it("carries explicit boundaries for every other cadence", () => {
        expect(billingPeriodKeyFor("weekly", "2026-09-21", "2026-09-27")).toBe("2026-09-21~2026-09-27");
        const p = billingPeriodFromKey("2026-09-21~2026-09-27");
        expect(p.start).toBe("2026-09-21");
        expect(p.end).toBe("2026-09-27");
    });

    it("parses either form without being told which", () => {
        expect(billingPeriodFromKey("2026-02").end).toBe("2026-02-28");
        expect(billingPeriodFromKey("2028-02").end, "leap year, no special case").toBe("2028-02-29");
        expect(billingPeriodFromKey("2026-12-28~2027-01-03").start).toBe("2026-12-28");
    });

    /* An unrecognised key is a FACT ABOUT THE DATA. Renaming it would hide that. */
    it("returns an unparseable key unchanged rather than guessing", () => {
        expect(billingPeriodLabel("not-a-period")).toBe("not-a-period");
        expect(billingPeriodFromKey("garbage").label).toBe("garbage");
    });
});

describe("the human label comes from the boundaries, never from the key", () => {
    it("writes a week inside one month once", () => {
        expect(billingPeriodLabel("2026-09-21~2026-09-27")).toBe("Sep 21–27, 2026");
    });

    it("names both months when the period crosses one", () => {
        expect(billingPeriodLabel("2026-09-21~2026-10-04")).toBe("Sep 21–Oct 4, 2026");
    });

    /*
     * Both years written out, because "Dec 28–Jan 3, 2027" would silently date the December end to
     * the wrong year — a period label that is wrong about when it happened.
     */
    it("writes both years when the period crosses a new year", () => {
        expect(billingPeriodLabel("2026-12-28~2027-01-03")).toBe("Dec 28, 2026–Jan 3, 2027");
    });

    it("still names a month period in the operator's words", () => {
        expect(billingPeriodLabel("2026-09")).toBe("September 2026");
    });
});

describe("periods tile from the organisation's anchor", () => {
    it("puts a day in the weekly period its own agreement anchors", () => {
        // Anchored Monday 2026-09-21: the week is Mon–Sun.
        const p = billingPeriodFor("weekly", "2026-09-21", "2026-09-24");
        expect(p.start).toBe("2026-09-21");
        expect(p.end).toBe("2026-09-27");
    });

    /* A DIFFERENT AGREEMENT, A DIFFERENT WEEK — and both are right. */
    it("gives a differently anchored agreement a different week for the same day", () => {
        const p = billingPeriodFor("weekly", "2026-09-24", "2026-09-24");
        expect(p.start).toBe("2026-09-24");
        expect(p.end).toBe("2026-09-30");
    });

    /* A date BEFORE the anchor must land in a period, not outside every period. */
    it("tiles backwards from the anchor", () => {
        const p = billingPeriodFor("weekly", "2026-09-21", "2026-09-15");
        expect(p.start).toBe("2026-09-14");
        expect(p.end).toBe("2026-09-20");
    });

    it("tiles biweekly on a fourteen-day stride", () => {
        const p = billingPeriodFor("biweekly", "2026-09-21", "2026-09-30");
        expect(p.start).toBe("2026-09-21");
        expect(p.end).toBe("2026-10-04");
        expect(billingPeriodDays(p)).toBe(14);
    });

    /* MONTHLY IGNORES THE ANCHOR DELIBERATELY: a monthly commercial period IS the calendar month. */
    it("ignores the anchor for monthly, because the month is the period", () => {
        expect(billingPeriodFor("monthly", "2026-09-21", "2026-09-24").key).toBe("2026-09");
        expect(billingPeriodFor("monthly", "2026-09-03", "2026-09-24").key).toBe("2026-09");
    });

    it("tiles annually on the anniversary", () => {
        const p = billingPeriodFor("annual", "2026-09-01", "2027-03-04");
        expect(p.start).toBe("2026-09-01");
        expect(p.end).toBe("2027-08-31");
    });
});

describe("THE GATE — a span contains as many commercial periods as the cadence says", () => {
    const september = { from: "2026-09-01", to: "2026-09-30" };

    /*
     * THE HEADLINE PROOF. Four weekly periods overlap a representative four-week span, so a weekly
     * organisation gets FOUR obligations where it used to get one.
     */
    it("gives a weekly organisation one period per week, not one per month", () => {
        const periods = billingPeriodsBetween("weekly", "2026-09-07", "2026-09-07", "2026-10-04");
        expect(periods).toHaveLength(4);
        expect(periods.map((p) => p.key)).toEqual([
            "2026-09-07~2026-09-13",
            "2026-09-14~2026-09-20",
            "2026-09-21~2026-09-27",
            "2026-09-28~2026-10-04",
        ]);
        expect(periods.map((p) => p.label)).toEqual([
            "Sep 7–13, 2026",
            "Sep 14–20, 2026",
            "Sep 21–27, 2026",
            "Sep 28–Oct 4, 2026",
        ]);
    });

    /* EVERY IDENTITY DISTINCT is what makes the idempotency layers protect the right grain. */
    it("gives every weekly period its own identity", () => {
        const keys = billingPeriodsBetween("weekly", "2026-09-07", september.from, september.to).map((p) => p.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("gives a biweekly organisation the right boundaries and count", () => {
        const periods = billingPeriodsBetween("biweekly", "2026-09-21", "2026-09-21", "2026-10-18");
        expect(periods).toHaveLength(2);
        expect(periods[0]!.key).toBe("2026-09-21~2026-10-04");
        expect(periods[1]!.key).toBe("2026-10-05~2026-10-18");
    });

    /* MONTHLY BEHAVIOUR IS PRESERVED — the regression this convergence must not cause. */
    it("gives a monthly organisation exactly one period for a month", () => {
        const periods = billingPeriodsBetween("monthly", "2026-09-01", september.from, september.to);
        expect(periods).toHaveLength(1);
        expect(periods[0]!.key).toBe("2026-09");
    });

    it("includes a period that only overlaps the span at its edge", () => {
        // Anchored 2026-09-28, the week runs into October but starts inside September.
        const periods = billingPeriodsBetween("weekly", "2026-09-28", september.from, september.to);
        expect(periods.at(-1)!.end).toBe("2026-10-04");
    });

    it("returns nothing for an inverted span rather than spinning", () => {
        expect(billingPeriodsBetween("weekly", "2026-09-01", "2026-09-30", "2026-09-01")).toEqual([]);
    });
});

describe("usage-priced cadences have no interval", () => {
    /*
     * `hourly` and `per_session` price a UNIT OF USAGE. Asking them for period boundaries is a
     * category error, and inventing a month for them would bill a family for a period nobody agreed
     * to — so callers ask first rather than assuming.
     */
    it("tells a caller which cadences define a period", () => {
        for (const c of ["daily", "weekly", "biweekly", "monthly", "annual"]) {
            expect(isPeriodBillableCadence(c), `${c} defines an interval`).toBe(true);
        }
        for (const c of ["hourly", "per_session", "", "nonsense"]) {
            expect(isPeriodBillableCadence(c), `${c} does not`).toBe(false);
        }
    });
});

describe("placing an existing row", () => {
    /*
     * MONTHLY BY DEFAULT, deliberately. Every existing caller groups by calendar month and must keep
     * doing so: a ledger that silently regrouped would restate history it did not generate.
     */
    it("groups by calendar month when no grain is supplied", () => {
        expect(placeInBillingPeriod({ billable_on: "2026-09-24" })).toEqual({
            key: "2026-09",
            basis: "billable_on",
        });
    });

    it("groups on the commercial boundaries when the caller knows them", () => {
        expect(
            placeInBillingPeriod({ billable_on: "2026-09-24" }, { cadence: "weekly", anchor: "2026-09-21" }),
        ).toEqual({ key: "2026-09-21~2026-09-27", basis: "billable_on" });
    });

    it("still reports a row it cannot place, rather than dropping it into the current period", () => {
        expect(placeInBillingPeriod({}).basis).toBe("unplaceable");
        expect(placeInBillingPeriod({}).key).toBeNull();
    });

    /* The fallback chain is ordered by AUTHORITY, and the basis is reported either way. */
    it("keeps the authority-ordered fallback chain under a commercial grain", () => {
        const grain = { cadence: "weekly" as const, anchor: "2026-09-21" };
        expect(placeInBillingPeriod({ occurs_on: "2026-09-24" }, grain).basis).toBe("occurs_on");
        expect(placeInBillingPeriod({ service_date: "2026-09-24" }, grain).basis).toBe("service_date");
        expect(placeInBillingPeriod({ created_at: "2026-09-24T10:00:00Z" }, grain).basis).toBe("created_at");
    });
});

/**
 * THE DEFECT ITSELF, AT THE GRAIN IT OCCURRED.
 *
 * The period authority being right is necessary and not sufficient: the collision happened where the
 * occurrence key was built. `cev:tuition:<assignmentId>:<periodKey>` is UNIQUE on
 * `consumption_events (org_id, idempotency_key)`, so if four weeks share one period key the database
 * correctly refuses three of them and the family is under-billed in silence.
 */
describe("THE GATE — occurrence identity is per commercial period", () => {
    const terms = [{ effectiveStart: "2026-09-07" }];
    const span = { start: "2026-09-01", end: "2026-09-30" };

    it("builds four DISTINCT occurrence keys for a weekly four-week span", () => {
        const periods = assignmentBillingPeriods(terms, "weekly", { start: "2026-09-07", end: "2026-10-04" });
        const keys = periods.map((p) => tuitionOccurrenceKey("assign-1", p.key));
        expect(keys).toHaveLength(4);
        expect(new Set(keys).size, "four weeks, four identities").toBe(4);
        expect(keys[0]).toBe("cev:tuition:assign-1:2026-09-07~2026-09-13");
        expect(keys[3]).toBe("cev:tuition:assign-1:2026-09-28~2026-10-04");
    });

    /*
     * THE REGRESSION THIS REPLACES. Under the old grain every week of September produced
     * `cev:tuition:assign-1:2026-09` — one key, so one charge, and three silent collisions.
     */
    it("no longer collapses a weekly span onto a single month key", () => {
        const periods = assignmentBillingPeriods(terms, "weekly", { start: "2026-09-07", end: "2026-10-04" });
        const keys = periods.map((p) => tuitionOccurrenceKey("assign-1", p.key));
        expect(keys.every((k) => k === "cev:tuition:assign-1:2026-09")).toBe(false);
        expect(keys).not.toContain("cev:tuition:assign-1:2026-09");
    });

    /* RERUN: the same span produces the same identities, so the database dedupes and nothing doubles. */
    it("produces identical identities on a rerun, which is what makes retry safe", () => {
        const once = assignmentBillingPeriods(terms, "weekly", span).map((p) => tuitionOccurrenceKey("a", p.key));
        const twice = assignmentBillingPeriods(terms, "weekly", span).map((p) => tuitionOccurrenceKey("a", p.key));
        expect(twice).toEqual(once);
    });

    /* MONTHLY IDENTITY IS BYTE-FOR-BYTE WHAT IT WAS — no stored key is restated. */
    it("keeps the monthly occurrence key exactly as it was", () => {
        const periods = assignmentBillingPeriods([{ effectiveStart: "2026-09-03" }], "monthly", span);
        expect(periods.map((p) => tuitionOccurrenceKey("assign-1", p.key))).toEqual([
            "cev:tuition:assign-1:2026-09",
        ]);
    });

    /* TWO CHILDREN, TWO ASSIGNMENTS: independent obligations per period, never one shared row. */
    it("keeps multi-child obligations independent within a period", () => {
        const [week] = assignmentBillingPeriods(terms, "weekly", { start: "2026-09-07", end: "2026-09-13" });
        expect(tuitionOccurrenceKey("wrigley", week!.key)).not.toBe(tuitionOccurrenceKey("lennon", week!.key));
    });

    /* An anchor before the span still bills the span, not the anchor's own week. */
    it("bills the requested span even when the agreement anchors earlier", () => {
        const periods = assignmentBillingPeriods([{ effectiveStart: "2026-01-05" }], "weekly", {
            start: "2026-09-07",
            end: "2026-09-20",
        });
        expect(periods).toHaveLength(2);
        expect(periods[0]!.start).toBe("2026-09-07");
    });
});
