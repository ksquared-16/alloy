import { describe, expect, it } from "vitest";

import {
    billingPeriodForDate,
    billingPeriodFromKey,
    placeInBillingPeriod,
    sortBillingPeriodKeysDescending,
} from "@/lib/financials/billingPeriod";
import {
    isPostedMoney,
    pastDueFor,
    reconcileRows,
    type FinancialsLedgerRow,
} from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

function row(over: Partial<FinancialsLedgerRow>): FinancialsLedgerRow {
    return {
        chargeId: "c1",
        date: "2026-08-10",
        periodKey: "2026-08",
        periodBasis: "billable_on",
        subjectMemberId: "child-1",
        subjectName: "Certa",
        categoryKey: "fee",
        categoryLabel: "Fee",
        description: "Registration fee",
        amountCents: 7500,
        currencyCode: "USD",
        status: "posted",
        lifecycleStatus: "posted",
        correctsChargeId: null,
        correctionKind: null,
        reversedByChargeId: null,
        dueDate: null,
        glCode: null,
        glAccountName: null,
        source: "Template",
        ...over,
    };
}

describe("billing period — derived from billable_on, never a new column", () => {
    it("files a charge under its BILLABLE date, not the date it occurred", () => {
        // A field trip that happens in September but bills next cycle belongs to the cycle that
        // bills it. This is the whole reason `occurs_on` is not the period.
        const placement = placeInBillingPeriod({ occurs_on: "2026-09-18", billable_on: "2026-10-01" });
        expect(placement).toEqual({ key: "2026-10", basis: "billable_on" });
    });

    it("falls back through canonical dates and REPORTS which one placed the row", () => {
        expect(placeInBillingPeriod({ occurs_on: "2026-07-04" }).basis).toBe("occurs_on");
        expect(placeInBillingPeriod({ service_date: "2026-06-04" }).basis).toBe("service_date");
        expect(placeInBillingPeriod({ created_at: "2026-05-04T11:00:00Z" }).basis).toBe("created_at");
    });

    it("refuses to place a row it cannot date, rather than defaulting it into the current period", () => {
        expect(placeInBillingPeriod({})).toEqual({ key: null, basis: "unplaceable" });
    });

    it("ends a period on its real last day, including in February of a leap year", () => {
        expect(billingPeriodFromKey("2026-02").end).toBe("2026-02-28");
        expect(billingPeriodFromKey("2028-02").end).toBe("2028-02-29");
        expect(billingPeriodFromKey("2026-08")).toEqual({
            key: "2026-08",
            start: "2026-08-01",
            end: "2026-08-31",
            label: "August 2026",
        });
    });

    it("orders periods newest first — the order every grouped surface reads in", () => {
        expect(sortBillingPeriodKeysDescending(["2026-08", "2026-10", "2026-09", "2026-08"])).toEqual([
            "2026-10",
            "2026-09",
            "2026-08",
        ]);
        expect(billingPeriodForDate("2026-08-26").key).toBe("2026-08");
    });
});

describe("reconciliation — the total is the sum of its rows, by construction", () => {
    it("adds every owed line into responsibility, so it cannot drift from the ledger", () => {
        const out = reconcileRows(
            [
                row({ chargeId: "a", categoryKey: "tuition", amountCents: 100_000 }),
                row({ chargeId: "b", categoryKey: "fee", amountCents: 7_500 }),
                row({ chargeId: "c", categoryKey: "discount", amountCents: -10_000 }),
                row({ chargeId: "d", categoryKey: "subsidy_offset", amountCents: -25_000 }),
                row({ chargeId: "e", categoryKey: "adjustment", amountCents: -500 }),
            ],
            "2026-08",
            "2026-08-26",
        );
        expect(out.grossCents).toBe(107_500);
        expect(out.discountsCents).toBe(-10_000);
        expect(out.fundingCents).toBe(-25_000);
        expect(out.adjustmentsCents).toBe(-500);
        expect(out.responsibilityCents).toBe(72_000);
        expect(out.responsibilityCents).toBe(
            out.grossCents + out.discountsCents + out.fundingCents + out.adjustmentsCents,
        );
        expect(out.balanceCents).toBe(out.responsibilityCents - out.paymentsCents);
    });

    it("states a scheduled charge BESIDE the balance and never inside it", () => {
        const out = reconcileRows(
            [
                row({ chargeId: "a", amountCents: 7_500 }),
                row({ chargeId: "b", amountCents: 4_000, status: "draft", lifecycleStatus: "scheduled" }),
            ],
            "2026-08",
            "2026-08-26",
        );
        expect(out.responsibilityCents).toBe(7_500);
        expect(out.scheduledCents).toBe(4_000);
    });

    it("counts an unposted draft as neither owed nor scheduled — but never as nothing", () => {
        // A period holding only drafts reconciled to zero with nothing explaining where the money
        // went. A draft is not a debt; it is also not absent.
        const out = reconcileRows(
            [row({ chargeId: "a", amountCents: 2_500, status: "draft", lifecycleStatus: "draft" })],
            "2026-08",
            "2026-08-26",
        );
        expect(out.responsibilityCents).toBe(0);
        expect(out.draftCents).toBe(2_500);
    });

    it("ignores voided rows and rows from other periods", () => {
        const out = reconcileRows(
            [
                row({ chargeId: "a", amountCents: 7_500 }),
                row({ chargeId: "b", amountCents: 9_900, status: "void", lifecycleStatus: "void" }),
                row({ chargeId: "c", amountCents: 5_000, periodKey: "2026-07" }),
            ],
            "2026-08",
            "2026-08-26",
        );
        expect(out.responsibilityCents).toBe(7_500);
    });

    it("reports payments as ZERO because the platform cannot record one for an enrollment account", () => {
        // `payments.job_id` is NOT NULL and payments were never generalized to billable_source_*.
        // The card names that absence; the model must not invent a figure for it.
        const out = reconcileRows([row({ amountCents: 7_500 })], "2026-08", "2026-08-26");
        expect(out.paymentsCents).toBe(0);
        expect(out.balanceCents).toBe(out.responsibilityCents);
    });

    it("narrows to one subject and still reconciles — the filter cannot break the total", () => {
        const rows = [
            row({ chargeId: "a", subjectMemberId: "child-1", amountCents: 7_500 }),
            row({ chargeId: "b", subjectMemberId: "child-2", amountCents: 2_500 }),
        ];
        const all = reconcileRows(rows, "2026-08", "2026-08-26");
        const one = reconcileRows(rows.filter((r) => r.subjectMemberId === "child-1"), "2026-08", "2026-08-26");
        const other = reconcileRows(rows.filter((r) => r.subjectMemberId === "child-2"), "2026-08", "2026-08-26");
        expect(all.responsibilityCents).toBe(10_000);
        expect(one.responsibilityCents).toBe(7_500);
        expect(other.responsibilityCents).toBe(2_500);
        expect(one.responsibilityCents + other.responsibilityCents).toBe(all.responsibilityCents);
    });
});

describe("past due — real due-date semantics", () => {
    it("counts only owed, unpaid rows whose due date has passed, and ages from the OLDEST", () => {
        const out = pastDueFor(
            [
                row({ chargeId: "a", amountCents: 7_500, dueDate: "2026-08-01" }),
                row({ chargeId: "b", amountCents: 2_500, dueDate: "2026-08-20" }),
                row({ chargeId: "c", amountCents: 9_900, dueDate: "2026-08-01", status: "paid" }),
                row({ chargeId: "d", amountCents: 1_000, dueDate: "2026-09-30" }),
                row({ chargeId: "e", amountCents: 4_000, dueDate: null }),
            ],
            "2026-08-26",
        );
        expect(out).toEqual({ amountCents: 10_000, oldestDueDate: "2026-08-01", agingDays: 25 });
    });

    it("is null when nothing is overdue, rather than a zero that reads as a debt", () => {
        expect(pastDueFor([row({ dueDate: "2026-09-30" })], "2026-08-26")).toBeNull();
    });
});

/**
 * A REVERSAL IS A PAIR, and every total has to read both halves.
 *
 * The original stays exactly as posted — posted money is immutable — and the reversal stands beside
 * it. `reversed` is a derived reading of that pair, not a third kind of row, so the moment a total
 * treats it as "no longer posted" it reports one half of something that sums to zero.
 */
describe("correction lineage — a reversed charge is a pair, not a disappearance", () => {
    const original = row({
        chargeId: "orig",
        amountCents: 130_000,
        categoryKey: "tuition",
        lifecycleStatus: "reversed",
        reversedByChargeId: "rev",
    });
    const reversal = row({
        chargeId: "rev",
        amountCents: -130_000,
        categoryKey: "credit",
        lifecycleStatus: "posted",
        correctsChargeId: "orig",
        correctionKind: "reversal",
    });

    it("keeps the reversed original in the reconciliation, so the pair nets to zero", () => {
        const out = reconcileRows([original, reversal], "2026-08", "2026-08-26");
        expect(out.grossCents).toBe(130_000);
        expect(out.discountsCents).toBe(-130_000);
        expect(out.responsibilityCents).toBe(0);
        expect(out.balanceCents).toBe(0);
    });

    it("would drive responsibility NEGATIVE if the reversed original were skipped", () => {
        // The failure this guards: dropping the original leaves the credit unmatched and the ledger
        // claims the family is owed money it was only ever charged and refunded.
        const creditOnly = reconcileRows([reversal], "2026-08", "2026-08-26");
        expect(creditOnly.responsibilityCents).toBe(-130_000);
    });

    it("counts reversed money as posted money, so a period total is not the credit alone", () => {
        expect(isPostedMoney("posted")).toBe(true);
        expect(isPostedMoney("reversed")).toBe(true);
        expect(isPostedMoney("draft")).toBe(false);
        expect(isPostedMoney("scheduled")).toBe(false);
        expect(isPostedMoney("void")).toBe(false);
        const total = [original, reversal]
            .filter((r) => isPostedMoney(r.lifecycleStatus))
            .reduce((sum, r) => sum + r.amountCents, 0);
        expect(total).toBe(0);
    });

    it("reports no past due for a reversed charge — nobody owes reversed money", () => {
        // A correction copies the source's due date, so BOTH halves would otherwise qualify and the
        // card would announce an overdue balance of $0.00 for money nobody owes.
        const overdue = [
            { ...original, dueDate: "2026-08-01" },
            { ...reversal, dueDate: "2026-08-01" },
        ];
        expect(pastDueFor(overdue, "2026-08-26")).toBeNull();
    });

    it("still counts a PARTIALLY credited charge as past due, net of the credit", () => {
        // A credit is partial and legitimately reduces what is still overdue; only a reversal closes
        // the charge, so credits are not excluded with it.
        const out = pastDueFor(
            [
                row({ chargeId: "orig", amountCents: 130_000, dueDate: "2026-08-01" }),
                row({
                    chargeId: "cr",
                    amountCents: -30_000,
                    categoryKey: "credit",
                    dueDate: "2026-08-01",
                    correctsChargeId: "orig",
                    correctionKind: "credit",
                }),
            ],
            "2026-08-26",
        );
        expect(out?.amountCents).toBe(100_000);
    });
});
