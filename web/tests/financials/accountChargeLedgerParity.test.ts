import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    accountChargeCategoryKey, accountChargeLifecycleStatus, deriveAccountChargeLedgerRows,
    reversalBySourceChargeId,
} from "@/lib/financials/account/accountChargeLedger";
import { pastDueFor, reconcileRows } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

/**
 * THE EXTRACTED OWNER, AGAINST REAL MONEY STATES.
 *
 * The deployed specimen is financially thin, so the states that matter are built as fixtures. Each
 * one is a case the Financials card already answers; the point of the matrix is that the extracted
 * reader answers it the SAME way, because both now run the same code.
 *
 * Money is the one place a wrong number is worse than no number, so every case asserts the exact
 * cents rather than a direction.
 */

const TODAY = "2026-09-21";
const PERIOD = "2026-09";

type Charge = Record<string, unknown>;
const charge = (over: Charge = {}): Charge => ({
    id: `c${Math.random().toString(36).slice(2, 9)}`,
    billable_source_type: "enrollment_agreement",
    billable_source_id: "agr-1",
    source_charge_id: null,
    charge_category: "tuition",
    status: "posted",
    amount_cents: 100_000,
    currency_code: "USD",
    billable_on: "2026-09-01",
    due_date: "2026-09-05",
    metadata: {},
    ...over,
});

const reconcile = (charges: Charge[], applied: Record<string, number> = {}) =>
    reconcileRows(deriveAccountChargeLedgerRows(charges, TODAY), PERIOD, TODAY, new Map(Object.entries(applied)));

const pastDue = (charges: Charge[], applied: Record<string, number> = {}) =>
    pastDueFor(deriveAccountChargeLedgerRows(charges, TODAY), TODAY, new Map(Object.entries(applied)));

describe("PART 4 — account ledger semantic parity across money states", () => {
    it("NO CHARGES — a real zero, and not past due", () => {
        const r = reconcile([]);
        expect(r.responsibilityCents).toBe(0);
        expect(r.balanceCents).toBe(0);
        expect(pastDue([])).toBeNull();
    });

    it("ONE OPEN CHARGE — owed in full", () => {
        const c = charge({ id: "c1" });
        const r = reconcile([c]);
        expect(r.grossCents).toBe(100_000);
        expect(r.responsibilityCents).toBe(100_000);
        expect(r.paymentsCents).toBe(0);
        expect(r.balanceCents).toBe(100_000);
    });

    it("PARTIALLY PAID — the balance is the residual, and it is still past due for the residual", () => {
        const c = charge({ id: "c1", due_date: "2026-08-01" });
        const r = reconcile([c], { c1: 40_000 });
        expect(r.responsibilityCents).toBe(100_000);
        expect(r.paymentsCents).toBe(40_000);
        expect(r.balanceCents).toBe(60_000);
        const pd = pastDue([c], { c1: 40_000 });
        expect(pd?.amountCents, "past due is the residual, not the face amount").toBe(60_000);
        expect(pd?.oldestDueDate).toBe("2026-08-01");
    });

    it("FULLY PAID — balance zero, and NOT past due", () => {
        const c = charge({ id: "c1", due_date: "2026-08-01" });
        const r = reconcile([c], { c1: 100_000 });
        expect(r.balanceCents).toBe(0);
        expect(pastDue([c], { c1: 100_000 }), "a paid charge is not overdue").toBeNull();
    });

    it("PAST DUE — aging is measured from the OLDEST overdue obligation", () => {
        const a = charge({ id: "a", due_date: "2026-07-15", amount_cents: 30_000 });
        const b = charge({ id: "b", due_date: "2026-09-01", amount_cents: 20_000 });
        const pd = pastDue([a, b]);
        expect(pd?.amountCents).toBe(50_000);
        expect(pd?.oldestDueDate).toBe("2026-07-15");
        expect(pd?.agingDays).toBe(68);
    });

    it("A FUTURE DUE DATE IS NOT PAST DUE", () => {
        expect(pastDue([charge({ id: "c1", due_date: "2026-12-01" })])).toBeNull();
    });

    it("REDUCTION / CREDIT — discounts reduce responsibility, and the credit is not itself collectible", () => {
        const tuition = charge({ id: "t", amount_cents: 100_000 });
        const credit = charge({ id: "d", charge_category: "discount", amount_cents: -25_000, due_date: "2026-08-01" });
        const r = reconcile([tuition, credit]);
        expect(r.grossCents).toBe(100_000);
        expect(r.discountsCents).toBe(-25_000);
        expect(r.responsibilityCents, "responsibility is the sum of every owed line").toBe(75_000);
        // A negative row is KEPT in past due — it is what reduces the overdue total.
        const pd = pastDue([charge({ id: "t", amount_cents: 100_000, due_date: "2026-08-01" }), credit]);
        expect(pd?.amountCents).toBe(75_000);
    });

    it("REVERSAL — the original and its reversal both stay in the ledger and net to zero", () => {
        const original = charge({ id: "o", amount_cents: 100_000 });
        const reversal = charge({
            id: "r", amount_cents: -100_000, source_charge_id: "o", metadata: { correction_kind: "reversal" },
        });
        const rows = deriveAccountChargeLedgerRows([original, reversal], TODAY);
        expect(rows.find((x) => x.chargeId === "o")!.lifecycleStatus,
            "a reversed original is projected reversed, not posted").toBe("reversed");
        const r = reconcile([original, reversal]);
        expect(r.responsibilityCents, "the pair nets to zero; skipping the original would drive it negative").toBe(0);
        expect(pastDue([
            charge({ id: "o", amount_cents: 100_000, due_date: "2026-08-01" }),
            charge({ id: "r", amount_cents: -100_000, source_charge_id: "o", due_date: "2026-08-01", metadata: { correction_kind: "reversal" } }),
        ]), "neither a reversed charge nor its reversal is overdue").toBeNull();
    });

    it("A VOIDED REVERSAL DOES NOT REVERSE — the index's predicate, quoted", () => {
        const original = charge({ id: "o" });
        const voided = charge({ id: "r", source_charge_id: "o", status: "void", metadata: { correction_kind: "reversal" } });
        expect(reversalBySourceChargeId([original, voided]).size).toBe(0);
        expect(deriveAccountChargeLedgerRows([original, voided], TODAY).find((x) => x.chargeId === "o")!.lifecycleStatus)
            .toBe("posted");
    });

    it("MULTIPLE OBLIGATIONS across subjects sum into one account position", () => {
        const rows = [
            charge({ id: "a", billable_source_id: "agr-1", amount_cents: 100_000 }),
            charge({ id: "b", billable_source_id: "agr-2", amount_cents: 80_000 }),
            charge({ id: "c", billable_source_type: "customer", billable_source_id: "cust-1", charge_category: "registration_fee", amount_cents: 5_000 }),
        ];
        const r = reconcile(rows, { a: 100_000 });
        expect(r.responsibilityCents).toBe(185_000);
        expect(r.paymentsCents).toBe(100_000);
        expect(r.balanceCents).toBe(85_000);
    });

    it("PERIOD BOUNDARY — a charge outside the period is not in this period's reconciliation", () => {
        const inPeriod = charge({ id: "i", billable_on: "2026-09-30" });
        const nextPeriod = charge({ id: "n", billable_on: "2026-10-01" });
        const rows = deriveAccountChargeLedgerRows([inPeriod, nextPeriod], TODAY);
        expect(rows.find((x) => x.chargeId === "i")!.periodKey).toBe("2026-09");
        expect(rows.find((x) => x.chargeId === "n")!.periodKey).toBe("2026-10");
        expect(reconcile([inPeriod, nextPeriod]).responsibilityCents).toBe(100_000);
        // Past due is ACCOUNT-WIDE, not period-scoped: an overdue March charge is still overdue.
        expect(pastDue([charge({ id: "m", billable_on: "2026-03-01", due_date: "2026-03-05", amount_cents: 7_000 })])?.amountCents)
            .toBe(7_000);
    });

    it("SCHEDULED and DRAFT are stated beside the balance, never inside it", () => {
        const scheduled = charge({ id: "s", status: "draft", billable_on: "2026-12-01" });
        const draft = charge({ id: "d", status: "draft", billable_on: "2026-09-01" });
        expect(accountChargeLifecycleStatus(scheduled, null, TODAY)).toBe("scheduled");
        expect(accountChargeLifecycleStatus(draft, null, TODAY)).toBe("draft");
        const r = reconcile([draft]);
        expect(r.draftCents).toBe(100_000);
        expect(r.responsibilityCents, "a draft is not a debt").toBe(0);
        expect(r.balanceCents).toBe(0);
    });

    it("the category falls back the way the card's did — charge_category, then charge_type", () => {
        expect(accountChargeCategoryKey({ charge_category: "tuition", charge_type: "x" })).toBe("tuition");
        expect(accountChargeCategoryKey({ charge_type: "late_fee" })).toBe("late_fee");
        expect(accountChargeCategoryKey({})).toBe("one_time");
    });
});

describe("ONE OWNER — legacy Financials and A′ share the implementation", () => {
    const VM = readFileSync(
        resolve(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts"), "utf8");
    const A_PRIME = readFileSync(
        resolve(process.cwd(), "lib/runtime/firstOrder/readAccountLedgerPosition.ts"), "utf8");

    it("the card consumes the extracted derivations rather than repeating them", () => {
        expect(VM).toContain("deriveAccountChargeLedgerRows");
        expect(VM).toContain("reversalBySourceChargeId");
        // The inline lifecycle ladder the card used to own must be gone, not duplicated.
        expect(VM).not.toMatch(/billableOn && billableOn > today\s*\n\s*\?\s*"scheduled"/);
    });

    it("A′ COMPUTES NO MONEY — it composes owners", () => {
        /*
         * If this module ever does arithmetic over cents, the extraction has failed and A′ has a
         * second financial definition beside the card's. It may name figures; it may not derive
         * them.
         */
        const code = A_PRIME.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(code).not.toMatch(/[+\-*/]=\s*\w*[Cc]ents/);
        expect(code).not.toMatch(/Cents\s*[+\-*/]\s*/);
        expect(code).toContain("reconcileRows(");
        expect(code).toContain("pastDueFor(");
    });

    it("the reconciliation contract is the narrow one, so both row shapes reach one function", () => {
        expect(VM).toContain("rows: readonly AccountChargeLedgerRow[]");
    });
});
