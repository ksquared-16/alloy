import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const chargeLedger = vi.hoisted(() => ({ read: vi.fn(), applied: vi.fn() }));
vi.mock("@/lib/financials/account/accountChargeLedger", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    readAccountChargeLedger: chargeLedger.read,
    readAppliedByChargeId: chargeLedger.applied,
}));

import { readAccountLedgerPosition } from "@/lib/runtime/firstOrder/readAccountLedgerPosition";
import { findFirstOrderCapability } from "@/lib/runtime/firstOrder/firstOrderCapabilityRegistry";

/**
 * GATES WHERE THE READER IS DEFINED.
 *
 * The compiler suite mocks `readAccountLedgerPosition` wholesale, so nothing there exercises what
 * it does when one of its two reads fails. Three plants — A′ deriving its own balance, a failed
 * applications read becoming zero, and the capability dropping its authority requirement — all
 * stayed green across the entire compiler battery for exactly that reason. This is the same gap
 * the health supplements reader had, in the same shape: a module stubbed everywhere it is used
 * needs gates where it is defined.
 */

const OK_LEDGER = {
    state: "ok" as const,
    rows: [
        { chargeId: "c1", periodKey: "2026-09", categoryKey: "tuition", amountCents: 100_000,
          status: "posted", lifecycleStatus: "posted" as const, correctionKind: null, dueDate: "2026-09-05" },
    ],
    raw: [], billableSourceIds: ["agr-1"],
};

const call = () => readAccountLedgerPosition({} as never, {
    orgId: "o", customerId: "h1", customerMemberId: null, today: "2026-09-21",
});

describe("A PARTIAL FINANCIAL READ IS NOT MONEY", () => {
    it("both reads succeeding produces the reconciled position", async () => {
        chargeLedger.read.mockResolvedValueOnce(OK_LEDGER);
        chargeLedger.applied.mockResolvedValueOnce({ state: "ok", appliedByChargeId: new Map([["c1", 40_000]]) });
        const p = await call();
        expect(p.state).toBe("ok");
        if (p.state === "ok") {
            expect(p.periodKey).toBe("2026-09");
            expect(p.reconciliation.responsibilityCents).toBe(100_000);
            expect(p.reconciliation.balanceCents).toBe(60_000);
        }
    });

    it("A FAILED APPLICATIONS READ IS UNAVAILABLE — never a balance equal to the full responsibility", async () => {
        /*
         * The plant this exists for. Falling back to an empty applications map produces a
         * confident, specific, WRONG number: it tells a family they owe what they have already
         * paid. Money is the one place a partial read must refuse to answer.
         */
        chargeLedger.read.mockResolvedValueOnce(OK_LEDGER);
        chargeLedger.applied.mockResolvedValueOnce({ state: "unavailable", reason: "timeout" });
        const p = await call();
        expect(p.state).toBe("unavailable");
        expect(JSON.stringify(p)).not.toContain("100000");
    });

    it("A FAILED CHARGE READ IS UNAVAILABLE — never a zero balance", async () => {
        chargeLedger.read.mockResolvedValueOnce({ state: "unavailable", reason: "scan cap exceeded" });
        // Cleared here, not at suite level: the assertion below is about THIS call issuing no
        // applications read, and a shared spy carries the earlier cases' calls into it.
        chargeLedger.applied.mockClear();
        const p = await call();
        expect(p.state).toBe("unavailable");
        if (p.state === "unavailable") expect(p.reason).toContain("scan cap");
        // And the applications read is not issued for a ledger that could not be read.
        expect(chargeLedger.applied).not.toHaveBeenCalled();
    });

    it("AN EMPTY ACCOUNT IS A REAL ZERO, not a failure", async () => {
        chargeLedger.read.mockResolvedValueOnce({ ...OK_LEDGER, rows: [] });
        chargeLedger.applied.mockResolvedValueOnce({ state: "ok", appliedByChargeId: new Map() });
        const p = await call();
        expect(p.state).toBe("ok");
        if (p.state === "ok") {
            expect(p.reconciliation.balanceCents).toBe(0);
            expect(p.pastDue).toBeNull();
        }
    });
});

describe("the four ledger capabilities carry the money contract", () => {
    const KEYS = [
        "financials.billing_period_key", "financials.responsibility_cents",
        "financials.balance_cents", "financials.past_due_cents",
    ];

    it("EVERY ONE DECLARES financials_read — none bypasses the authority", () => {
        /*
         * The plant: dropping the requirement to `none`. Nothing else notices, because the
         * composer evaluates whatever the capability declares — so an unauthorized operator would
         * have been shown the family's balance and the plan would have executed the read to get
         * it.
         */
        for (const key of [...KEYS, "financials.prepaid_available_cents"]) {
            expect(findFirstOrderCapability(key)?.authorization, `${key} does not require financials_read`)
                .toBe("financials_read");
        }
    });

    it("every one declares the account_ledger prerequisite and no other", () => {
        for (const key of KEYS) {
            expect(findFirstOrderCapability(key)?.prerequisites).toEqual(["account_ledger"]);
        }
    });

    it("a FAILED position makes every one of them UNAVAILABLE, never zero", () => {
        const ctx = { subjectTruth: null, subjectRow: null, customerMemberId: null, householdId: "h1",
            accountLedger: { state: "unavailable" as const, reason: "timeout" } };
        for (const key of KEYS) {
            const f = findFirstOrderCapability(key)!.project(ctx as never);
            expect(f.state, `${key} is not unavailable on a failed read`).toBe("unavailable");
            expect(JSON.stringify(f)).not.toContain('"value":0');
        }
    });

    it("NOTHING OVERDUE IS A KNOWN ZERO, not an absence", () => {
        const ctx = { subjectTruth: null, subjectRow: null, customerMemberId: null, householdId: "h1",
            accountLedger: { state: "ok" as const, periodKey: "2026-09", pastDue: null,
                reconciliation: { grossCents: 0, discountsCents: 0, fundingCents: 0, adjustmentsCents: 0,
                    responsibilityCents: 0, paymentsCents: 0, balanceCents: 0, scheduledCents: 0, draftCents: 0 } } };
        const f = findFirstOrderCapability("financials.past_due_cents")!.project(ctx as never);
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe(0);
    });
});

describe("A′ COMPOSES OWNERS — it does not compute money", () => {
    const CODE = readFileSync(
        resolve(process.cwd(), "lib/runtime/firstOrder/readAccountLedgerPosition.ts"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it("no arithmetic over cents appears anywhere in the module", () => {
        /*
         * The first version of this gate matched `Cents` followed by an operator, and the plant
         * wrote `(s, r) => s + r.amountCents` — cents on the RIGHT of the operator. It passed. A
         * source gate that only reads one side of an expression is not a strict gate; it is one
         * that happens to catch the example its author imagined.
         */
        for (const re of [
            /\w*[Cc]ents\s*[+\-*/]/,      // cents on the left
            /[+\-*/]\s*\w*\.?\w*[Cc]ents/, // cents on the right
            /\breduce\s*\(/,               // any fold, whatever it sums
            /\bmap\s*\([^)]*[Cc]ents/,
        ]) {
            expect(CODE, `arithmetic over money found: ${re}`).not.toMatch(re);
        }
    });

    it("it calls the canonical owners, so the gate above is not passing vacuously", () => {
        expect(CODE).toContain("reconcileRows(");
        expect(CODE).toContain("pastDueFor(");
        expect(CODE).toContain("readAccountChargeLedger(");
        expect(CODE).toContain("readAppliedByChargeId(");
        expect(CODE).toContain("billingPeriodForDate(");
    });
});
