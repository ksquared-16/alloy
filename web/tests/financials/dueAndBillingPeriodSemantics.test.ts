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

describe("Billing period — the server's interval, containing the SERVICE date", () => {
    /*
     * W7-F004. The card used to derive the period HERE from the invoice date, so a template that
     * invoiced "next billing cycle" turned a Nov 5 service into a December obligation. The period
     * is now resolved once, by the date chain the write uses, and the card only places its label.
     */
    it("shows the period the server resolved, never one derived from the invoice date", () => {
        const s = spec("tuition_monthly $400.00", [
            "Occurs 2026-11-05",
            "Billing period November 2026 · 2026-11-01 → 2026-11-30",
            "Invoice date 2026-12-01",
        ]);
        expect(s.period).toBe("November 2026");
        expect(s.period, "invoice timing cannot move the obligation").not.toBe("December 2026");
    });

    it("shows the invoice date as its own field, with the rule that produced it", () => {
        const s = spec("tuition_monthly $400.00", [
            "Billing period November 2026 · 2026-11-01 → 2026-11-30",
            "Invoice date 2026-10-25",
            "Invoice timing · 7 days before the billing period begins (organization default)",
            "Due 2026-11-01",
            "Payment terms · On the first day of the billing period (organization default)",
            "Posting · Draft until 2026-11-01 — posts automatically when the billing period begins",
        ]);
        expect(s.invoiceDate).toMatch(/Oct 25, 2026/);
        expect(s.dateRules.invoice).toBe("7 days before the billing period begins (organization default)");
        expect(s.due).toMatch(/Nov 1, 2026/);
        expect(s.dateRules.due).toBe("On the first day of the billing period (organization default)");
        expect(s.posting).toMatch(/^Draft until 2026-11-01/);
    });

    it("says why there is no period when the household has no billing calendar", () => {
        const s = spec("tuition_monthly $400.00", [
            "Billing period · This household has no usable billing calendar, so there is no billing period to bill into.",
        ]);
        expect(s.period).toMatch(/no usable billing calendar/);
    });

    it("invents no interval when the preview named none", () => {
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
