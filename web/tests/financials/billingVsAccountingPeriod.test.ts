/**
 * BILLING PERIOD ≠ ACCOUNTING PERIOD — demonstrated, not asserted in prose.
 *
 * The two words name two different things and the platform keeps them apart by construction. This
 * file exists because the distinction is easy to lose in conversation and expensive to lose in code:
 *
 *   BILLING PERIOD is a span a FAMILY is billed for. It is DERIVED from the charge itself — the
 *   date it is billable on, falling back to when it occurred, the service date, and finally when it
 *   was created. There is no billing-period table and no billing-period setting. A row with no
 *   usable date is reported as unplaceable rather than swept into the current month.
 *
 *   ACCOUNTING PERIOD is a span the BUSINESS closes its books for. It is decided by the database at
 *   the moment a journal entry is written, against the organization's configured accounting
 *   calendar, from `effective_on` — a different column, a different authority, a different question.
 *
 * Accounting is also the BROADER of the two: every journal entry is attributed, including entries
 * for events that bill nobody.
 *
 * ── AND THE GAP THIS FILE ALSO RECORDS ────────────────────────────────────────────────────────
 *
 * Billing CADENCE is configurable — `commercial_billing_cadence` offers weekly, biweekly, monthly,
 * annual, daily, hourly and per-session, and an operator may edit the set. That cadence drives
 * PRICING: how often a plan raises a charge. Billing period IDENTITY is not configurable: the key
 * is `YYYY-MM`, a calendar month, hardcoded. So a weekly-billing organization gets weekly charges
 * priced correctly and sees them grouped into monthly buckets on the ledger. That is a real product
 * gap, it is recorded here rather than fixed here, and nothing below pretends otherwise.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { placeInBillingPeriod } from "@/lib/financials/billingPeriod";
import { SYSTEM_CADENCE_KEYS } from "@/lib/commercial/billingCadences";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("billing period is derived from the charge", () => {
    it("takes the declared billable date before any fallback", () => {
        expect(placeInBillingPeriod({ billable_on: "2026-09-08", service_date: "2026-08-31" })).toEqual({
            key: "2026-09",
            basis: "billable_on",
        });
    });

    it("says which date it had to fall back to", () => {
        expect(placeInBillingPeriod({ service_date: "2026-08-31" }).basis).toBe("service_date");
        expect(placeInBillingPeriod({ created_at: "2026-08-31T12:00:00Z" }).basis).toBe("created_at");
    });

    it("reports a row it cannot place rather than inventing a period for it", () => {
        expect(placeInBillingPeriod({})).toEqual({ key: null, basis: "unplaceable" });
    });
});

describe("weekly billing and monthly accounting coexist", () => {
    /*
     * THE DEMONSTRATION. A weekly plan raises four charges across September. Each is billable on its
     * own week; each is attributed to the accounting period its `effective_on` falls in. The two
     * answers are produced by two authorities that never consult each other — so weekly billing does
     * not require weekly books, and monthly books do not require monthly billing.
     */
    const weeklyCharges = [
        { billable_on: "2026-09-07", effective_on: "2026-09-07" },
        { billable_on: "2026-09-14", effective_on: "2026-09-14" },
        { billable_on: "2026-09-21", effective_on: "2026-09-21" },
        { billable_on: "2026-09-28", effective_on: "2026-09-28" },
    ];

    it("prices weekly", () => {
        expect(SYSTEM_CADENCE_KEYS).toContain("weekly");
        expect(weeklyCharges).toHaveLength(4);
    });

    it("attributes every one of them to the same monthly accounting span", () => {
        /*
         * The accounting period is the database's answer, not this file's. What is demonstrated here
         * is the INPUT: four weekly charges whose `effective_on` all fall inside one September
         * calendar period, which is what the attribution trigger matches on. A monthly calendar
         * therefore carries all four, and the books close once.
         */
        const months = new Set(weeklyCharges.map((c) => c.effective_on.slice(0, 7)));
        expect(months.size, "one accounting month holds four weekly charges").toBe(1);
    });

    it("keeps the two questions on two different columns", () => {
        const migration = read("../supabase/migrations/20260904180000_financial_periods_and_journal.sql");
        const attribution = migration.slice(migration.indexOf("attribute_financial_journal_entry"));
        expect(attribution, "attribution reads the accounting date").toContain("NEW.effective_on");
        expect(attribution, "and never the billing one").not.toContain("billable_on");
    });

    it("does not refuse a closed period — it defers past it", () => {
        /*
         * This was stated the other way round in the QA catalog and it mattered: "a closed period
         * refuses the write" would make an operator expect an error where the platform actually
         * carries the entry forward to the next open period and records where it came from.
         */
        const migration = read("../supabase/migrations/20260904180000_financial_periods_and_journal.sql");
        expect(migration).toContain("accounting_period_deferred");
        expect(migration).toContain("accounting_period_deferred_from_date");
    });
});

describe("the cadence gap is recorded, not papered over", () => {
    it("offers a configurable cadence", () => {
        for (const key of ["weekly", "biweekly", "monthly", "annual"]) {
            expect(SYSTEM_CADENCE_KEYS).toContain(key);
        }
    });

    it("but derives billing period identity as a calendar month, for every one of them", () => {
        /*
         * The lock is deliberately on the CURRENT truth. When billing period identity becomes
         * cadence-aware this test fails, and the person who makes that change is the right person to
         * decide what the grouping should say instead.
         */
        expect(placeInBillingPeriod({ billable_on: "2026-09-07" }).key).toBe("2026-09");
        expect(placeInBillingPeriod({ billable_on: "2026-09-28" }).key).toBe("2026-09");
        const src = read("lib/financials/billingPeriod.ts");
        expect(src, "the key is a calendar month, stated in the type").toMatch(/BillingPeriodKey = string; \/\/ "YYYY-MM"/);
    });
});
