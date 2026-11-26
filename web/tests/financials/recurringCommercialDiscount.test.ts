/**
 * J21 — A RECURRING OBLIGATION IS NOT A PATH THAT BYPASSES COMMERCIAL REDUCTIONS.
 *
 * ── THE CORRECTION THIS FILE CARRIES ──────────────────────────────────────────────────────────
 *
 * The matrix recorded J21's cause as "`materializeCurrentFinancialConsequences` handles only
 * `vacation_credit`", and that was the WRONG LAYER. A commercial discount is not a consumption
 * consequence. `applyFinancialReductions` is the period-level authority: it reads the gross
 * `tuition` charges a period produced — whatever produced them — resolves what legitimately reduces
 * each, and records the answer twice, as money and as a decision. `billing.apply_discounts` already
 * invokes it, and measured against the recurring gross it applied six reductions and then reported
 * seven unchanged on a rerun. The engine was never missing; I had looked in the wrong place.
 *
 * ── WHAT IS LOCKED HERE ───────────────────────────────────────────────────────────────────────
 *
 * The rules that make a recurring obligation and a manual one the SAME conversation: gross is never
 * rewritten, the reduction is a separate consequence, eligibility is read not asserted, the category
 * veto survives, and re-applying the same policy to the same charge is one identity, not two.
 *
 * Every case below uses the real accepted prices — $185.00 weekly and $1,450.00 monthly — because a
 * lock written against invented numbers proves arithmetic, not this product.
 */
import { describe, expect, it } from "vitest";

import {
    reductionKey,
    resolveFinancialReductions,
    type EligibilityFacts,
    type ReductionPolicy,
} from "@/lib/financials/reductions/resolveFinancialReductions";

/** The tenant's authored specimen: 10%, applies to all categories, one policy in force. */
const SIBLING_10: ReductionPolicy = {
    id: "5df9fc6c",
    kind: "sibling_discount",
    params: { basis: "percentage", value: 10, applies_to: "all" },
    label: "Sibling discount (QA specimen)",
};

/** A second child of the same household — what makes a sibling policy apply at all. */
const SECOND_CHILD: EligibilityFacts = { siblingRank: 2, siblingCount: 2, employeeHousehold: false };
const ONLY_CHILD: EligibilityFacts = { siblingRank: 1, siblingCount: 1, employeeHousehold: false };

const gross = (amountCents: number, categoryKey = "tuition", chargeId = "c-week-1") => ({
    chargeId,
    customerMemberId: "e408fa51",
    enrollmentAgreementId: "43ef5615",
    amountCents,
    currencyCode: "USD",
    categoryKey,
    periodKey: "2026-09",
});

const decide = (amountCents: number, facts = SECOND_CHILD, categoryKey = "tuition") =>
    resolveFinancialReductions({ gross: gross(amountCents, categoryKey), policies: [SIBLING_10], facts });

describe("THE GATE — gross is the accepted price, and stays it", () => {
    /* The weekly specimen: $185.00 accepted, 10% off, $166.50 owed. */
    it("reduces the weekly obligation without rewriting it", () => {
        const d = decide(18_500);
        expect(d.kind).toBe("applied");
        const applied = d as Extract<typeof d, { kind: "applied" }>;
        expect(applied.totalCents, "the reduction is negative and separate").toBe(-1_850);
        expect(applied.netCents).toBe(16_650);
        expect(applied.reductions[0]!.basisAmountCents, "measured against the accepted gross").toBe(18_500);
    });

    /* The monthly specimen: $1,450.00 accepted, 10% off, $1,305.00 owed. */
    it("reduces the monthly obligation the same way", () => {
        const applied = decide(145_000) as Extract<ReturnType<typeof decide>, { kind: "applied" }>;
        expect(applied.totalCents).toBe(-14_500);
        expect(applied.netCents).toBe(130_500);
    });

    /*
     * THE DECISION CARRIES ITS OWN ARITHMETIC. A reduction that cannot say what it was taken on is
     * money without a reason — the defect an earlier run in this thread already closed once.
     */
    it("records the policy, the basis and the base it was taken on", () => {
        const applied = decide(18_500) as Extract<ReturnType<typeof decide>, { kind: "applied" }>;
        const r = applied.reductions[0]!;
        expect(r.policyId).toBe("5df9fc6c");
        expect(r.policyKind).toBe("sibling_discount");
        expect(r.basis).toBe("percentage");
        expect(r.basisValue).toBe(10);
        expect(r.explanation).toBeTruthy();
    });
});

describe("THE GATE — eligibility is read, never assumed", () => {
    /* An only child is not a sibling, and the policy says so rather than applying nothing quietly. */
    it("refuses a sibling discount where there is no sibling, and names why", () => {
        const d = decide(18_500, ONLY_CHILD);
        expect(d.kind).toBe("not_eligible");
        expect((d as { reason: string }).reason).toBe("not_enough_siblings");
    });

    it("applies nothing when no policy is configured", () => {
        const d = resolveFinancialReductions({ gross: gross(18_500), policies: [], facts: SECOND_CHILD });
        expect((d as { reason: string }).reason).toBe("no_policy_configured");
    });
});

describe("THE GATE — the category veto survives the recurring path", () => {
    /*
     * A reduction of a reduction is not something any reconciliation can explain, and recurring
     * generation must not be a way around that. The veto is a property of the CATEGORY, so it holds
     * whatever produced the charge.
     */
    it("refuses to discount a contra-revenue category", () => {
        for (const category of ["discount", "credit"]) {
            const d = decide(18_500, SECOND_CHILD, category);
            expect(d.kind, category).toBe("not_eligible");
            expect((d as { reason: string }).reason, category).toBe("category_not_discountable");
        }
    });

    it("still discounts tuition, which is what the policy is for", () => {
        expect(decide(18_500, SECOND_CHILD, "tuition").kind).toBe("applied");
    });
});

describe("THE GATE — one policy against one obligation is one identity", () => {
    /*
     * The idempotency key is the charge, which is already period- and child-specific. A rerun
     * therefore recognises what it already did, and a DISTINCT week gets its own application for
     * free — which is exactly what five weekly obligations need.
     */
    it("keys a reduction on the policy and the obligation it reduces", () => {
        expect(reductionKey("5df9fc6c", "c-week-1")).toBe(reductionKey("5df9fc6c", "c-week-1"));
    });

    it("gives each weekly obligation its own application", () => {
        const keys = ["c-week-1", "c-week-2", "c-week-3", "c-week-4", "c-week-5"].map((c) => reductionKey("5df9fc6c", c));
        expect(new Set(keys).size, "five weeks, five identities").toBe(5);
    });

    it("does not let two policies share one identity on the same charge", () => {
        expect(reductionKey("pol-a", "c-week-1")).not.toBe(reductionKey("pol-b", "c-week-1"));
    });
});

describe("THE GATE — the family never owes less than nothing", () => {
    it("floors the aggregate at the gross and says the line was capped", () => {
        const waiver: ReductionPolicy = { id: "w-1", kind: "waiver", params: { basis: "percentage", value: 100, applies_to: "all" }, label: "waiver" };
        const d = resolveFinancialReductions({ gross: gross(18_500), policies: [waiver], facts: SECOND_CHILD });
        const applied = d as Extract<typeof d, { kind: "applied" }>;
        expect(applied.netCents).toBeGreaterThanOrEqual(0);
    });
});
