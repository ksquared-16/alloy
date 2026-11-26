/**
 * W7-F053 — ACCOUNT AGING VS SETTLEMENT ELIGIBILITY, RECONCILED TO THE CENT.
 *
 * Deployed census (certification/financials/w7-f053): Certhouse read Past due $2,005 while settlement
 * for Certt was $1,860 and for the household $1,675. The $145 was NOT subsidy: the Sep 11 tuition
 * ($1,450 gross, −$145 sibling discount, $1,305 paid) owed nothing net, but Past due subtracted only
 * money applied from the GROSS. The household's further $185 is the Oct 17 tuition, Certt's named
 * share — correctly held back from a payment that names no payer.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { pastDueFor, notYetDueFor } from "@/lib/financials/account/accountDueClassification";
import { reductionMapFrom } from "@/lib/financials/account/accountChargeLedger";
import { computeCollectiblePosition } from "@/lib/financials/subsidy/collectiblePosition";
import { planSettlementFrom, type SettlementCandidate } from "@/lib/financials/settlement/automaticSettlement";

const code = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const TODAY = "2026-10-21";
const CERTT = "certt";

const row = (chargeId: string, amountCents: number, dueDate: string) =>
    ({ chargeId, amountCents, dueDate, status: "posted", lifecycleStatus: "posted", correctionKind: null }) as never;

/* Certhouse before the two W7-F050 proof payments, from the census. */
const CERTHOUSE = [
    row("tuition-sep11", 145_000, "2026-09-11"),
    row("fieldtrip-oct11", 4_000, "2026-10-11"),
    row("tuition-oct11", 145_000, "2026-10-11"),
    row("tuition-oct16", 18_500, "2026-10-16"),
    row("tuition-oct17", 18_500, "2026-10-17"),
];
const APPLIED = new Map([["tuition-sep11", 130_500]]);
const REDUCTIONS = reductionMapFrom([{ source_charge_id: "tuition-sep11", amount_cents: -14_500 }]);

const candidate = (over: Partial<SettlementCandidate> & { chargeId: string; amountCents: number; dueDate: string }): SettlementCandidate => ({
    label: over.chargeId,
    categoryKey: "tuition",
    collectibleCents: over.amountCents,
    billableOn: null,
    status: "posted",
    reversed: false,
    shares: [],
    ...over,
});

describe("Certhouse — every dollar", () => {
    it("Past due read $2,005 because the Sep 11 discount was not netted; netted it is $1,860", () => {
        expect(pastDueFor(CERTHOUSE, TODAY, APPLIED)!.amountCents).toBe(200_500);
        expect(pastDueFor(CERTHOUSE, TODAY, APPLIED, REDUCTIONS)!.amountCents).toBe(186_000);
    });

    it("netted Past due equals Certt's settlement eligibility, and the household's is that minus Certt's named share", () => {
        const candidates = [
            candidate({ chargeId: "fieldtrip-oct11", amountCents: 4_000, dueDate: "2026-10-11" }),
            candidate({ chargeId: "tuition-oct11", amountCents: 145_000, dueDate: "2026-10-11" }),
            candidate({ chargeId: "tuition-oct16", amountCents: 18_500, dueDate: "2026-10-16" }),
            candidate({ chargeId: "tuition-oct17", amountCents: 18_500, dueDate: "2026-10-17", shares: [{ allocationId: "r", partyId: CERTT, remainingCents: 18_500 }] }),
        ];
        const certt = planSettlementFrom({ asOf: TODAY, amountCents: Number.MAX_SAFE_INTEGER, payerPersonId: CERTT, candidates });
        const household = planSettlementFrom({ asOf: TODAY, amountCents: Number.MAX_SAFE_INTEGER, payerPersonId: null, candidates });
        expect(certt.eligibleCents).toBe(pastDueFor(CERTHOUSE, TODAY, APPLIED, REDUCTIONS)!.amountCents);
        expect(household.eligibleCents).toBe(167_500);
        expect(household.heldForPayerCents).toBe(18_500);
    });

    it("a fully paid discounted charge is neither past due nor not-yet-due", () => {
        const paid = [row("d", 10_000, "2026-11-01")];
        const applied = new Map([["d", 9_000]]);
        const reductions = reductionMapFrom([{ source_charge_id: "d", amount_cents: -1_000 }]);
        expect(notYetDueFor(paid, TODAY, applied)!.amountCents).toBe(1_000);
        expect(notYetDueFor(paid, TODAY, applied, reductions)).toBeNull();
    });
});

describe("subsidy: funded responsibility is never collected from the family", () => {
    const position = (claimState: string) =>
        computeCollectiblePosition({
            chargeId: "c",
            currencyCode: "USD",
            chargeStatus: "posted",
            grossCents: 80_000,
            reductionsCents: 0,
            netCents: 80_000,
            applications: [],
            allocations: [{ assignedAmountCents: 80_000, isUnassigned: false }] as never,
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 60_000, percentBasisPoints: null }] as never,
            claimLines: [{ claimId: "k", claimedAmountCents: 60_000, claimState }] as never,
            variances: [],
        });

    it("a submitted claim suppresses the funded part; the family owes only the rest", () => {
        const p = position("submitted");
        expect(p.submittedClaimSuppressionCents).toBe(60_000);
        expect(p.currentlyCollectibleCents).toBe(20_000);
    });

    it("a denied claim stops suppressing — collectibility returns through the subsidy state, never through settlement", () => {
        const p = position("denied");
        expect(p.submittedClaimSuppressionCents).toBe(0);
        expect(p.currentlyCollectibleCents).toBe(80_000);
    });

    it("settlement applies only the family-collectible part and reports the rest as expected from funding", () => {
        const plan = planSettlementFrom({
            asOf: TODAY,
            amountCents: 80_000,
            payerPersonId: null,
            candidates: [candidate({ chargeId: "c", amountCents: 80_000, dueDate: "2026-10-01", collectibleCents: 20_000, fundingPendingCents: 60_000 })],
        });
        expect(plan.appliedCents).toBe(20_000);
        expect(plan.fundingPendingCents).toBe(60_000);
        expect(plan.unappliedCents).toBe(60_000);
    });

    it("split responsibility with funding: the payer settles their share of what is collectible, no more", () => {
        const plan = planSettlementFrom({
            asOf: TODAY,
            amountCents: 100_000,
            payerPersonId: "dana",
            candidates: [
                candidate({
                    chargeId: "c",
                    amountCents: 100_000,
                    dueDate: "2026-10-01",
                    collectibleCents: 40_000,
                    fundingPendingCents: 60_000,
                    shares: [
                        { allocationId: "dana", partyId: "dana", remainingCents: 30_000 },
                        { allocationId: "rosa", partyId: "rosa", remainingCents: 10_000 },
                    ],
                }),
            ],
        });
        expect(plan.lines[0]).toMatchObject({ applyCents: 30_000, shareParts: [{ allocationId: "dana", cents: 30_000 }] });
        expect(plan.othersShareCents).toBe(10_000);
        expect(plan.fundingPendingCents).toBe(60_000);
    });
});

describe("every surface uses the netted figure, and says what it excludes", () => {
    it("the card, the cross-household due positions and the first-order reader all pass reductions", () => {
        const vm = code("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toMatch(/vm\.pastDue = pastDueFor\(rows, today, appliedByChargeId, reductionByChargeId\);/);
        expect(vm).toMatch(/row\.outstandingCents = row\.amountCents - \(reductionByChargeId\.get\(row\.chargeId\) \?\? 0\) - row\.appliedCents;/);
        expect(code("lib/financials/account/accountDuePositions.ts")).toMatch(/pastDueFor\(rows, args\.today, applied\.appliedByChargeId, reductions\.reductionByChargeId\)/);
        expect(code("lib/runtime/firstOrder/readAccountLedgerPosition.ts")).toMatch(/pastDueFor\(ledger\.rows, today, applied\.appliedByChargeId, reductions\.state === "ok"/);
    });

    it("the summary says how much of Past due is expected from funding; the form says what it leaves out", () => {
        expect(code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts")).toMatch(/expected from funding`/);
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toContain('data-financials-settlement-excluded="true"');
        expect(card).toMatch(/owed by other responsible people/);
        expect(card).toMatch(/expected from funding \(submitted claim\)/);
    });
});
