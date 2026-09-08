/**
 * What legitimately reduces a gross obligation — and what refuses rather than guessing.
 *
 * The arithmetic here is not this thread's invention: it is the one Commercial Execution already
 * runs in `applyPolicies.ts`. These cases exist so that a quote and an invoice cannot come to
 * different conclusions about the same authored policy.
 */
import { describe, expect, it } from "vitest";

import {
    reductionKey,
    resolveFinancialReductions,
    type EligibilityFacts,
    type GrossObligation,
    type ReductionPolicy,
} from "@/lib/financials/reductions/resolveFinancialReductions";

const GROSS: GrossObligation = {
    chargeId: "charge-1",
    customerMemberId: "child-1",
    enrollmentAgreementId: "agreement-1",
    amountCents: 100_000,
    currencyCode: "USD",
    categoryKey: "tuition",
    periodKey: "2026-09",
};

const ALONE: EligibilityFacts = { siblingRank: 1, siblingCount: 1, employeeHousehold: false };
const SECOND_CHILD: EligibilityFacts = { siblingRank: 2, siblingCount: 2, employeeHousehold: false };

function policy(over: Partial<ReductionPolicy> & { kind: ReductionPolicy["kind"] }): ReductionPolicy {
    return { id: `p-${over.kind}`, params: {}, label: over.kind, ...over };
}

describe("resolveFinancialReductions", () => {
    it("reduces nothing when the tenant has authored nothing", () => {
        const d = resolveFinancialReductions({ gross: GROSS, policies: [], facts: ALONE });
        expect(d.kind).toBe("not_eligible");
        expect(d.kind === "not_eligible" && d.reason).toBe("no_policy_configured");
    });

    // ── SIBLING: RELATIONAL, AND THE FIRST CHILD PAYS FULL ────────────────────────────────────

    it("does not discount an only child", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [policy({ kind: "sibling_discount", params: { basis: "percentage", value: 15 } })],
            facts: ALONE,
        });
        expect(d.kind === "not_eligible" && d.reason).toBe("not_enough_siblings");
    });

    it("does not discount the FIRST of two children, and does discount the second", () => {
        const p = [policy({ kind: "sibling_discount", params: { basis: "percentage", value: 15 } })];
        const first = resolveFinancialReductions({
            gross: GROSS,
            policies: p,
            facts: { siblingRank: 1, siblingCount: 2, employeeHousehold: false },
        });
        expect(first.kind === "not_eligible" && first.reason).toBe("rank_not_covered");

        const second = resolveFinancialReductions({ gross: GROSS, policies: p, facts: SECOND_CHILD });
        expect(second.kind).toBe("applied");
        if (second.kind !== "applied") return;
        expect(second.reductions[0]!.amountCents).toBe(-15_000);
        expect(second.netCents).toBe(85_000);
        // The basis is stored, so the number can be re-derived a year from now.
        expect(second.reductions[0]!.basisAmountCents).toBe(100_000);
    });

    it("honours `applies_to_rank: all` when the tenant authored it", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({
                    kind: "sibling_discount",
                    params: { basis: "percentage", value: 10, applies_to_rank: "all" },
                }),
            ],
            facts: { siblingRank: 1, siblingCount: 2, employeeHousehold: false },
        });
        expect(d.kind === "applied" && d.netCents).toBe(90_000);
    });

    // ── EMPLOYEE ELIGIBILITY IS CONFIGURED, AND PROVEN, NEVER ASSERTED ───────────────────────

    it("withholds an employee-gated discount from a household with no employment", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({ kind: "discount", params: { basis: "amount", value: 5_000, requires: "employee_household" } }),
            ],
            facts: ALONE,
        });
        expect(d.kind === "not_eligible" && d.reason).toBe("not_an_employee_household");
    });

    it("grants it when the canonical employment fact is present", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({ kind: "discount", params: { basis: "amount", value: 5_000, requires: "employee_household" } }),
            ],
            facts: { ...ALONE, employeeHousehold: true },
        });
        expect(d.kind === "applied" && d.netCents).toBe(95_000);
    });

    // ── STACKING: ACROSS TYPES, ADDITIVE, NEVER COMPOUNDING ──────────────────────────────────

    it("stacks a percentage and a fixed amount deterministically", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({ kind: "discount", params: { basis: "amount", value: 5_000 } }),
                policy({ kind: "sibling_discount", params: { basis: "percentage", value: 15 } }),
            ],
            facts: SECOND_CHILD,
        });
        expect(d.kind).toBe("applied");
        if (d.kind !== "applied") return;
        // Sibling first, then the general discount — the order is the stack's, not the caller's.
        expect(d.reductions.map((r) => r.policyKind)).toEqual(["sibling_discount", "discount"]);
        expect(d.netCents).toBe(80_000);
    });

    it("takes every percentage on GROSS, so two never compound", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({ kind: "sibling_discount", params: { basis: "percentage", value: 10 } }),
                policy({ kind: "discount", params: { basis: "percentage", value: 10 } }),
            ],
            facts: SECOND_CHILD,
        });
        // 20,000 off — not 19,000, which is what compounding would produce.
        expect(d.kind === "applied" && d.netCents).toBe(80_000);
    });

    it("lets a waiver end the question rather than stack onto zero", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({ kind: "waiver", params: {} }),
                policy({ kind: "sibling_discount", params: { basis: "percentage", value: 15 } }),
            ],
            facts: SECOND_CHILD,
        });
        expect(d.kind).toBe("applied");
        if (d.kind !== "applied") return;
        expect(d.reductions).toHaveLength(1);
        expect(d.reductions[0]!.policyKind).toBe("waiver");
        expect(d.netCents).toBe(0);
    });

    // ── CAPS AND THE FLOOR ───────────────────────────────────────────────────────────────────

    it("bounds a benefit at the configured maximum", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({ kind: "discount", params: { basis: "percentage", value: 50, max_benefit_cents: 10_000 } }),
            ],
            facts: ALONE,
        });
        expect(d.kind).toBe("applied");
        if (d.kind !== "applied") return;
        expect(d.reductions[0]!.amountCents).toBe(-10_000);
        expect(d.reductions[0]!.capped).toBe(true);
    });

    it("never drives the balance below zero, and says which line was trimmed", () => {
        const d = resolveFinancialReductions({
            gross: { ...GROSS, amountCents: 10_000 },
            policies: [
                policy({ kind: "sibling_discount", params: { basis: "amount", value: 8_000 } }),
                policy({ kind: "discount", params: { basis: "amount", value: 8_000 } }),
            ],
            facts: SECOND_CHILD,
        });
        expect(d.kind).toBe("applied");
        if (d.kind !== "applied") return;
        expect(d.floored).toBe(true);
        expect(d.netCents).toBe(0);
        expect(d.totalCents).toBe(-10_000);
        expect(d.reductions[1]!.explanation).toContain("below zero");
    });

    // ── AMBIGUITY REFUSES ────────────────────────────────────────────────────────────────────

    it("refuses two active policies of one kind rather than ranking them itself", () => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [
                policy({ id: "a", kind: "discount", params: { basis: "percentage", value: 10 } }),
                policy({ id: "b", kind: "discount", params: { basis: "percentage", value: 20 } }),
            ],
            facts: ALONE,
        });
        expect(d.kind).toBe("refused");
        expect(d.kind === "refused" && d.detail).toContain("not expressed");
    });

    it.each([
        [{ value: 10 }, "unreadable_basis"],
        [{ basis: "percentage" }, "unreadable_value"],
        [{ basis: "percentage", value: 140 }, "percentage_out_of_range"],
    ])("refuses unreadable configuration %j", (params, reason) => {
        const d = resolveFinancialReductions({
            gross: GROSS,
            policies: [policy({ kind: "discount", params })],
            facts: ALONE,
        });
        expect(d.kind).toBe("refused");
        expect(d.kind === "refused" && d.reason).toBe(reason);
    });

    it("does not measure a reduction against a reduction", () => {
        const d = resolveFinancialReductions({
            gross: { ...GROSS, amountCents: -5_000 },
            policies: [policy({ kind: "discount", params: { basis: "percentage", value: 10 } })],
            facts: ALONE,
        });
        expect(d.kind === "refused" && d.reason).toBe("negative_gross");
    });

    it("skips a charge the policy does not cover", () => {
        const d = resolveFinancialReductions({
            gross: { ...GROSS, categoryKey: "fee" },
            policies: [policy({ kind: "discount", params: { basis: "percentage", value: 10, applies_to: "tuition" } })],
            facts: ALONE,
        });
        expect(d.kind === "not_eligible" && d.reason).toBe("category_not_covered");
    });

    // ── IDENTITY ─────────────────────────────────────────────────────────────────────────────

    it("keys an application on the policy and the gross charge", () => {
        // The charge is already child- and period-specific, so one key says both "not twice for
        // this obligation" and "yes for the next eligible period".
        expect(reductionKey("p-1", "charge-9")).toBe("fred:p-1:charge-9");
        expect(reductionKey("p-1", "charge-9")).not.toBe(reductionKey("p-1", "charge-10"));
    });
});
