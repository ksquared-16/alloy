/**
 * DUE AND BILLING PERIOD SAY WHAT IS TRUE, OR SAY THEY DO NOT KNOW.
 *
 * Measured on deployed staging before this: the command said "Due — Configured policy" on every
 * charge, while `charges.due_date` is populated on 37 of 125 rows (33 of them after `billable_on`);
 * and it rendered "Billing period — Oct 1, 2026", which is the INVOICE DATE under the label of an
 * interval. `resolveDueDate` and `billingPeriodFor` already existed and are the only authorities;
 * nothing here is a second engine.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { adaptAddChargeSpecimen } from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import { ADD_CHARGE_SPECIMEN } from "@/lib/cardLab/cardLabFixtures";

const base = {
    template: ADD_CHARGE_SPECIMEN.template,
    subjectLabel: "Household",
    amount: "",
    note: "",
    period: "October 2026",
    balanceCents: 1_800,
    currency: "USD",
};
const spec = (previewSummary: string | null, previewChanges: string[] = []) =>
    adaptAddChargeSpecimen({ ...base, previewSummary, previewChanges });

describe("Due — three different answers, never a mechanism", () => {
    it("states the resolved date when the organisation's terms produced one", () => {
        const s = spec("tuition_monthly $400.00", ["Billable 2026-10-01", "Due 2026-10-15"]);
        expect(s.due).toMatch(/15/);
        expect(s.due).not.toBe("Configured policy");
        expect(s.due).not.toBe("No due date");
    });

    it("says there is no due date when the preview answered and no terms applied", () => {
        /* `resolveDueDate` returns null deliberately for "no rule configured". */
        const s = spec("tuition_monthly $400.00", ["Billable 2026-10-01"]);
        expect(s.due).toBe("No due date");
    });

    it("says NOT YET KNOWN while the preview has not answered", () => {
        const s = spec(null, []);
        expect(s.due, "an em dash, never a zero and never a claim").toBe("—");
    });

    it("never says 'Configured policy' in any state", () => {
        for (const s of [spec(null), spec("x $1.00"), spec("x $1.00", ["Due 2026-11-01"])]) {
            expect(s.due).not.toBe("Configured policy");
        }
    });
});

describe("Billing period — an interval, derived canonically", () => {
    it("derives the period CONTAINING the billable date, not the date itself", () => {
        const s = spec("tuition_monthly $400.00", ["Billable 2026-10-01"]);
        expect(s.period, "the business interval").toBe("October 2026");
        expect(s.period, "not the invoice date wearing a period's label").not.toMatch(/Oct 1, 2026/);
    });

    it("places a charge in its OWN period, not the account's current one", () => {
        /* A scheduled charge billable in December belongs to December, whatever month is open. */
        const s = spec("tuition_monthly $400.00", ["Billable 2026-12-03"]);
        expect(s.period).toBe("December 2026");
        expect(s.period).not.toBe(base.period);
    });

    it("invents no interval when no billable date resolved", () => {
        const s = spec("tuition_monthly $400.00", []);
        expect(s.period, "falls back to the account's own period label").toBe("October 2026");
    });
});

describe("the preview reports the due date it already resolved", () => {
    const action = readFileSync(
        path.join(process.cwd(), "lib/adminV2/actions/definitions/financialChargeActions.ts"),
        "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    it("reports intent.dueDate rather than recomputing one", () => {
        expect(/intent\.dueDate \? `Due \$\{intent\.dueDate\}` : null/.test(action)).toBe(true);
    });

    it("and the card reads it rather than hardcoding a phrase", () => {
        const adapter = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts"),
            "utf8",
        ).replace(/\/\*[\s\S]*?\*\//g, "");
        expect(adapter).not.toMatch(/due:\s*"Configured policy"/);
        expect(adapter).toMatch(/line\("due"\)/);
    });
});
