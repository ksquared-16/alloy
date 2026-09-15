/**
 * LENSES FILTER; THEY DO NOT CALCULATE.
 *
 * The Accounts workspace gained an angle-selector over one account's canonical rows. The danger in
 * that is not the filtering — it is that a tab with a number beside it starts wanting to be a
 * subtotal, and a subtotal computed here would be a second financial answer with no owner. These
 * hold the classification, the filters, the "do not offer a control that does not divide anything"
 * rule, and the absence of any arithmetic on money.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    ACCOUNT_LENSES,
    HOUSEHOLD_SUBJECT,
    filterLedger,
    filterPayments,
    hasChoice,
    ledgerLensOf,
    lensCounts,
    payerOptions,
    periodOptions,
    subjectOptions,
    subjectTokenOf,
} from "@/lib/financials/workspace/accountLenses";
import type { FinancialsLedgerRow } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const row = (over: Partial<FinancialsLedgerRow>): FinancialsLedgerRow =>
    ({
        chargeId: "c1",
        date: "2026-09-01",
        periodKey: "2026-09",
        periodBasis: "billable_on",
        subjectMemberId: null,
        subjectName: null,
        categoryKey: "tuition",
        categoryLabel: "Tuition",
        description: null,
        amountCents: 10_000,
        currencyCode: "USD",
        status: "posted",
        lifecycleStatus: "posted",
        correctsChargeId: null,
        correctionKind: null,
        reversedByChargeId: null,
        offersReverse: true,
        appliedCents: 0,
        outstandingCents: 10_000,
        offersPayment: true,
        dueDate: null,
        glCode: null,
        glAccountName: null,
        source: null,
        ...over,
    }) as FinancialsLedgerRow;

describe("what kind of row this is", () => {
    it("files an ordinary charge under Charges", () => {
        expect(ledgerLensOf(row({ categoryKey: "tuition" }))).toBe("charges");
        expect(ledgerLensOf(row({ categoryKey: "registration_fee" }))).toBe("charges");
    });

    it("files a discount and an adjustment under Credits & adjustments", () => {
        expect(ledgerLensOf(row({ categoryKey: "discount" }))).toBe("credits");
        expect(ledgerLensOf(row({ categoryKey: "adjustment" }))).toBe("credits");
    });

    it("files a correction under Credits & adjustments, whatever it corrects", () => {
        expect(ledgerLensOf(row({ categoryKey: "tuition", correctsChargeId: "c0" }))).toBe("credits");
    });

    /*
     * A subsidy offset is a reduction AND a funding row. An operator asking what the agency covers
     * does not want it filed under discounts, so funding is tested first — one row, one lens.
     */
    it("files a subsidy offset under Funding rather than under Credits", () => {
        expect(ledgerLensOf(row({ categoryKey: "subsidy_offset" }))).toBe("funding");
    });

    it("keeps its funding set equal to the account reader's classification", () => {
        /*
         * The reader's FUNDING_CATEGORIES is module-private. This asserts the two agree by their
         * OBSERVABLE consequence: every key this module calls funding must also be an offset row to
         * the reader, so a category added there and not here cannot silently misfile.
         */
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts"),
            "utf8",
        );
        const declared = /const FUNDING_CATEGORIES = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1] ?? "";
        const keys = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        expect(keys.length, "the reader still declares a funding set").toBeGreaterThan(0);
        for (const key of keys) {
            expect(ledgerLensOf(row({ categoryKey: key })), `${key} is funding on both sides`).toBe("funding");
        }
    });
});

describe("filtering", () => {
    const rows = [
        row({ chargeId: "t1", categoryKey: "tuition", subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" }),
        row({ chargeId: "t2", categoryKey: "tuition", subjectMemberId: "m-rio", subjectName: "Rio", periodKey: "2026-09" }),
        row({ chargeId: "d1", categoryKey: "discount", subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" }),
        row({ chargeId: "s1", categoryKey: "subsidy_offset", subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-08" }),
        row({ chargeId: "r1", categoryKey: "registration_fee", subjectMemberId: null, periodKey: "2026-08" }),
    ];

    it("shows everything under All", () => {
        expect(filterLedger(rows, { lens: "all", subject: null, periodKey: null })).toHaveLength(5);
    });

    it("narrows to one lens", () => {
        expect(filterLedger(rows, { lens: "charges", subject: null, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["t1", "t2", "r1"]);
        expect(filterLedger(rows, { lens: "credits", subject: null, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["d1"]);
        expect(filterLedger(rows, { lens: "funding", subject: null, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["s1"]);
    });

    it("narrows to one child, and files a household row under Household", () => {
        expect(filterLedger(rows, { lens: "all", subject: "m-ana", periodKey: null }).map((r) => r.chargeId))
            .toEqual(["t1", "d1", "s1"]);
        expect(filterLedger(rows, { lens: "all", subject: HOUSEHOLD_SUBJECT, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["r1"]);
        expect(subjectTokenOf(rows[4])).toBe(HOUSEHOLD_SUBJECT);
    });

    it("narrows to one billing period", () => {
        expect(filterLedger(rows, { lens: "all", subject: null, periodKey: "2026-08" }).map((r) => r.chargeId))
            .toEqual(["s1", "r1"]);
    });

    it("combines lens, child and period", () => {
        expect(filterLedger(rows, { lens: "funding", subject: "m-ana", periodKey: "2026-08" }).map((r) => r.chargeId))
            .toEqual(["s1"]);
    });

    /* The payments lens reads receipts, not the ledger. It must never show obligations. */
    it("shows no ledger rows under the Payments lens", () => {
        expect(filterLedger(rows, { lens: "payments", subject: null, periodKey: null })).toEqual([]);
    });

    it("narrows payments by who actually paid", () => {
        const payments = [
            { paymentId: "p1", payerLabel: "Dana Alvarez" },
            { paymentId: "p2", payerLabel: "Rosa Alvarez" },
            { paymentId: "p3", payerLabel: null },
        ];
        expect(filterPayments(payments, { payerLabel: null })).toHaveLength(3);
        expect(filterPayments(payments, { payerLabel: "Rosa Alvarez" }).map((p) => p.paymentId)).toEqual(["p2"]);
    });

    it("counts rows per lens, never cents", () => {
        const counts = lensCounts(rows, [{ paymentId: "p1" }], { subject: null, periodKey: null });
        expect(counts).toEqual({ all: 5, charges: 3, credits: 1, funding: 1, payments: 1 });
        const forAna = lensCounts(rows, [{ paymentId: "p1" }], { subject: "m-ana", periodKey: null });
        expect(forAna.all).toBe(3);
        expect(forAna.charges).toBe(1);
    });
});

describe("a control is offered only when it divides something", () => {
    it("reports no choice for a single child, a single period or a single payer", () => {
        const one = [row({ subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" })];
        expect(hasChoice(subjectOptions(one))).toBe(false);
        expect(hasChoice(periodOptions(one))).toBe(false);
        expect(hasChoice(payerOptions([{ paymentId: "p1", payerLabel: "Dana" }]))).toBe(false);
    });

    it("reports a choice once there are two", () => {
        const two = [
            row({ subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" }),
            row({ subjectMemberId: "m-rio", subjectName: "Rio", periodKey: "2026-08" }),
        ];
        expect(hasChoice(subjectOptions(two))).toBe(true);
        expect(hasChoice(periodOptions(two))).toBe(true);
    });

    it("puts Household last and children in name order", () => {
        const rows = [
            row({ subjectMemberId: null }),
            row({ subjectMemberId: "m-rio", subjectName: "Rio" }),
            row({ subjectMemberId: "m-ana", subjectName: "Ana" }),
        ];
        expect(subjectOptions(rows).map((o) => o.label)).toEqual(["Ana", "Rio", "Household"]);
    });

    it("puts the newest billing period first", () => {
        const rows = [row({ periodKey: "2026-07" }), row({ periodKey: "2026-09" }), row({ periodKey: "2026-08" })];
        expect(periodOptions(rows).map((o) => o.value)).toEqual(["2026-09", "2026-08", "2026-07"]);
    });

    it("ignores an unnamed payer rather than offering a blank choice", () => {
        expect(payerOptions([{ paymentId: "p1", payerLabel: null }, { paymentId: "p2", payerLabel: "  " }]))
            .toEqual([]);
    });
});

describe("no second financial answer", () => {
    it("does no arithmetic on money at all", () => {
        const src = readFileSync(join(process.cwd(), "lib/financials/workspace/accountLenses.ts"), "utf8");
        /* Every lens is a subset or a count of rows. Cents are carried, never combined. */
        expect(src).not.toMatch(/amountCents\s*[+\-*/]/);
        expect(src).not.toMatch(/[+\-*/]=\s*\w*[Cc]ents/);
        expect(src).not.toMatch(/reduce\(/);
        expect(src).not.toContain("outstandingCents");
    });

    it("names every lens exactly once", () => {
        expect(new Set(ACCOUNT_LENSES).size).toBe(ACCOUNT_LENSES.length);
    });
});
