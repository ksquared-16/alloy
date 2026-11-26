/**
 * W7-F050 / W7-F051 — AUTOMATIC SETTLEMENT, RESPONSIBILITY-AWARE.
 *
 * The algorithm (`planSettlementFrom`) is pure, so the Director's matrix is proven exactly here;
 * the wiring that routes every ordinary path through it — manual record, card/bank collection,
 * provider posting, Autopay — is pinned below.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { planSettlementFrom, type SettlementCandidate } from "@/lib/financials/settlement/automaticSettlement";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const DANA = "person-dana";
const ROSA = "person-rosa";
const ASOF = "2026-10-21";

const charge = (over: Partial<SettlementCandidate> & { chargeId: string; amountCents: number }): SettlementCandidate => ({
    label: over.chargeId,
    categoryKey: "tuition",
    collectibleCents: over.amountCents,
    dueDate: "2026-10-01",
    billableOn: "2026-10-01",
    status: "posted",
    reversed: false,
    shares: [],
    ...over,
});
const plan = (amountCents: number, payer: string | null, candidates: SettlementCandidate[]) =>
    planSettlementFrom({ asOf: ASOF, amountCents, payerPersonId: payer, candidates });

describe("the matrix", () => {
    it("100% responsibility: one payment settles the outstanding obligation", () => {
        const p = plan(1_000_00, DANA, [charge({ chargeId: "t", amountCents: 1_000_00, shares: [{ allocationId: "r1", partyId: DANA, remainingCents: 1_000_00 }] })]);
        expect(p.lines).toEqual([expect.objectContaining({ chargeId: "t", applyCents: 1_000_00, shareParts: [{ allocationId: "r1", cents: 1_000_00 }], accountCents: 0 })]);
        expect(p.unappliedCents).toBe(0);
        expect(p.outcome).toBe("settled");
    });

    it("split 75/25: Dana's $500 settles Dana's share only — Rosa's older charge is untouched", () => {
        const p = plan(500_00, DANA, [
            charge({ chargeId: "older-rosa-only", amountCents: 250_00, dueDate: "2026-09-01", shares: [{ allocationId: "rosa-old", partyId: ROSA, remainingCents: 250_00 }] }),
            charge({
                chargeId: "split",
                amountCents: 1_000_00,
                shares: [
                    { allocationId: "dana", partyId: DANA, remainingCents: 750_00 },
                    { allocationId: "rosa", partyId: ROSA, remainingCents: 250_00 },
                ],
            }),
        ]);
        expect(p.lines.map((l) => l.chargeId)).toEqual(["split"]);
        expect(p.lines[0]!.shareParts).toEqual([{ allocationId: "dana", cents: 500_00 }]);
        expect(p.lines[0]!.accountCents).toBe(0);
        /* Dana remaining $250 (750 − 500); Rosa remaining $250 (untouched). */
        expect(p.eligibleCents).toBe(750_00);
    });

    it("partial payment: what is left stays outstanding, nothing is unapplied", () => {
        const p = plan(500_00, null, [charge({ chargeId: "a", amountCents: 1_200_00 })]);
        expect(p.appliedCents).toBe(500_00);
        expect(p.unappliedCents).toBe(0);
        expect(p.eligibleCents).toBe(1_200_00);
    });

    it("exact payment settles every eligible obligation, oldest first", () => {
        const p = plan(1_218_00, null, [
            charge({ chargeId: "materials", amountCents: 18_00, dueDate: "2026-10-15" }),
            charge({ chargeId: "tuition", amountCents: 1_200_00, dueDate: "2026-10-01" }),
        ]);
        expect(p.lines.map((l) => [l.chargeId, l.applyCents])).toEqual([["tuition", 1_200_00], ["materials", 18_00]]);
        expect(p.unappliedCents).toBe(0);
    });

    it("overpayment: the eligible amount settles and the excess stays unapplied (prepaid on the payment)", () => {
        const p = plan(1_300_00, null, [charge({ chargeId: "a", amountCents: 1_218_00 })]);
        expect(p.appliedCents).toBe(1_218_00);
        expect(p.unappliedCents).toBe(82_00);
        expect(p.outcome).toBe("partial_left_unapplied");
    });

    it("multiple charges: past due first, then due; oldest due date; then invoice date; then id", () => {
        const p = plan(10_000_00, null, [
            charge({ chargeId: "due-today", amountCents: 1_00, dueDate: ASOF }),
            charge({ chargeId: "past-b", amountCents: 1_00, dueDate: "2026-10-05", billableOn: "2026-10-02" }),
            charge({ chargeId: "past-a", amountCents: 1_00, dueDate: "2026-10-05", billableOn: "2026-10-02" }),
            charge({ chargeId: "past-old", amountCents: 1_00, dueDate: "2026-09-01" }),
            charge({ chargeId: "past-earlier-invoice", amountCents: 1_00, dueDate: "2026-10-05", billableOn: "2026-10-01" }),
        ]);
        expect(p.lines.map((l) => [l.chargeId, l.dueClass])).toEqual([
            ["past-old", "past_due"],
            ["past-earlier-invoice", "past_due"],
            ["past-a", "past_due"],
            ["past-b", "past_due"],
            ["due-today", "due"],
        ]);
    });

    it("multiple children: the same payer's obligations across children settle without a choice", () => {
        const p = plan(300_00, DANA, [
            charge({ chargeId: "child-a", amountCents: 100_00, shares: [{ allocationId: "a", partyId: DANA, remainingCents: 100_00 }] }),
            charge({ chargeId: "child-b", amountCents: 200_00, dueDate: "2026-10-02", shares: [{ allocationId: "b", partyId: DANA, remainingCents: 200_00 }] }),
        ]);
        expect(p.lines.map((l) => [l.chargeId, l.applyCents])).toEqual([["child-a", 100_00], ["child-b", 200_00]]);
    });

    it("a future (not yet due) or Scheduled obligation is never settled early", () => {
        const p = plan(1_000_00, null, [
            charge({ chargeId: "future", amountCents: 500_00, dueDate: "2026-11-01" }),
            charge({ chargeId: "scheduled-draft", amountCents: 500_00, status: "draft", dueDate: "2026-10-01" }),
        ]);
        expect(p.lines).toEqual([]);
        expect(p.unappliedCents).toBe(1_000_00);
        expect(p.outcome).toBe("nothing_eligible");
    });

    it("unknown payer: settles only what the account owes as a whole; named shares stay for resolution", () => {
        const p = plan(1_000_00, null, [
            charge({ chargeId: "unassigned", amountCents: 100_00, shares: [{ allocationId: "u", partyId: null, remainingCents: 100_00 }] }),
            charge({ chargeId: "named", amountCents: 400_00, shares: [{ allocationId: "d", partyId: DANA, remainingCents: 400_00 }] }),
        ]);
        expect(p.lines.map((l) => [l.chargeId, l.accountCents, l.shareParts.length])).toEqual([["unassigned", 100_00, 0]]);
        expect(p.heldForPayerCents).toBe(400_00);
        expect(p.unappliedCents).toBe(900_00);
    });

    it("no eligible charge: the payment stays unapplied — receiving money is never blocked", () => {
        const p = plan(250_00, DANA, []);
        expect(p).toMatchObject({ appliedCents: 0, unappliedCents: 250_00, outcome: "nothing_eligible" });
    });

    it("an undated posted charge is not due — by the canonical due authority — and is not settled automatically", () => {
        const p = plan(50_00, null, [charge({ chargeId: "undated", amountCents: 50_00, dueDate: null, billableOn: "2026-10-10" })]);
        expect(p.lines).toEqual([]);
        expect(p.unappliedCents).toBe(50_00);
    });

    it("a named payer settles their own share first, then what the account owes — capped by the charge", () => {
        const p = plan(1_000_00, DANA, [
            charge({
                chargeId: "mixed",
                amountCents: 300_00,
                collectibleCents: 300_00,
                shares: [
                    { allocationId: "dana", partyId: DANA, remainingCents: 100_00 },
                    { allocationId: "rosa", partyId: ROSA, remainingCents: 100_00 },
                ],
            }),
        ]);
        /* $300 outstanding: Dana $100, Rosa $100, account-owned $100. Dana settles 100 + 100. */
        expect(p.lines[0]).toMatchObject({ applyCents: 200_00, accountCents: 100_00, shareParts: [{ allocationId: "dana", cents: 100_00 }] });
    });

    it("reversed charges and credits are never settled", () => {
        const p = plan(1_000_00, null, [
            charge({ chargeId: "reversed", amountCents: 100_00, reversed: true }),
            charge({ chargeId: "credit", amountCents: -50_00, collectibleCents: 0 }),
        ]);
        expect(p.lines).toEqual([]);
    });
});

describe("one authority, every ordinary path", () => {
    it("manual record with no charge records to the household and settles automatically", () => {
        const actions = code("lib/adminV2/actions/definitions/financialPaymentActions.ts");
        expect(actions).toMatch(/billableSourceType: "customer",\s*billableSourceId: t\(payload\.customer_id\)/);
        expect(actions).toMatch(/const settled = await settlePayment\(supabase as SupabaseClient, \{\s*orgId: ctx\.orgId,\s*paymentId: recorded\.payment\.id,/);
        expect(actions).toMatch(/settlement_changed_since_preview: expected != null/);
    });

    it("the preview is the same planSettlement Confirm reruns", () => {
        const actions = code("lib/adminV2/actions/definitions/financialPaymentActions.ts");
        expect(actions).toMatch(/const plan = await planSettlement\(supabase as SupabaseClient, \{\s*orgId: ctx\.orgId,\s*householdId: t\(payload\?\.customer_id\),/);
        expect(actions).toMatch(/after: \{\s*applied_cents: plan\.appliedCents,/);
    });

    it("an account-level card/bank collection is capped at the payer's eligible amount and settles when it posts", () => {
        const attempt = code("lib/financials/payments/collectionAttempt.ts");
        expect(attempt).toMatch(/collectible = \{ currentlyCollectibleCents: plan\.eligibleCents/);
        const posting = code("lib/financials/payments/canonicalPosting.ts");
        expect(posting).toMatch(/const settled = await settlePayment\(supabase, \{ orgId: attempt\.org_id, paymentId: recorded\.payment\.id, actorUserId: null \}\);/);
    });

    it("Autopay collects ONE amount — the payer's eligible responsibility — after their own prepaid settles", () => {
        const handler = code("lib/financials/payments/autopayHandler.ts");
        expect(handler).toMatch(/await \(deps\.applyOwnPrepaid \?\? settlePayersAvailableReceipts\)\(supabase, \{/);
        expect(handler).toMatch(/customerId: arrangement\.customerId,\s*requestedAmountCents: collectible\.totalCents,\s*payerPersonId: arrangement\.payerEntityId,/);
        expect(handler).not.toMatch(/for \(const charge of collectible\.charges\)/);
        const collectible = code("lib/financials/payments/autopayCollectible.ts");
        expect(collectible).toMatch(/totalCents: plan\.eligibleCents/);
    });

    it("payment method does not change settlement: every recorded tender takes the same automatic path", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toMatch(/const automatic = tabbed && payAllocation === "automatic" && Boolean\(settleAccountId\);/);
        expect(card).not.toMatch(/if \(payMethod === "money_order"\)/);
    });
});

describe("accounting guardrail", () => {
    it("settlement writes allocations and attributions only — never a charge, its GL, or revenue", () => {
        const settle = code("lib/financials/settlement/settlePayment.ts");
        expect(settle).not.toMatch(/from\("charges"\)\.(update|insert|upsert)/);
        expect(settle).not.toMatch(/gl_account|gl_journal|revenue/);
        expect(settle).toMatch(/applyPaymentToCharge\(/);
        expect(settle).toMatch(/attributePaymentToResponsibility\(/);
        const plan = code("lib/financials/settlement/automaticSettlement.ts");
        expect(plan).not.toMatch(/\.(update|insert|upsert)\(/);
    });
});

describe("the Payment form", () => {
    const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
    it("ordinary payments choose no charge: Application reads Automatic with the calculated settlement", () => {
        expect(card).toMatch(/data-financials-payment-application="automatic"/);
        expect(card).toMatch(/<p className="alloy-os-financials__settlement-mode">Automatic<\/p>/);
        expect(card).toMatch(/\{payAllocation === "charge" \? \(/);
    });
    it("Change allocation is the exception, with a filterable list", () => {
        expect(card).toMatch(/data-financials-payment-allocation="change"/);
        expect(card).toContain('placeholder="Filter by charge, child, date or amount"');
    });
    it("Payment Details states it was applied automatically, and what remains", () => {
        expect(card).toMatch(/\{receipt\.settledAutomatically \? "Applied automatically" : "Applied to"\}/);
        expect(card).toContain('testId: "remaining-unapplied"');
    });
});
