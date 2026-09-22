/**
 * A REDUCTION IS NOT MONEY WITHOUT A REASON.
 *
 * `financial_reduction_applications` exists precisely to record the decision behind a contra-revenue
 * row — which authored policy produced it, what the number was calculated on, whether a cap bound
 * it. The reader asked for none of that, so the ledger could show that money moved and not what
 * decided it: a row read `Credit −$260.06` and an operator could see the amount and not the reason.
 *
 * These lock the MEANING, not the field names. The distinction matters because the regression that
 * produced this work was a projection dropping columns the table had stored all along — every field
 * name still existed somewhere; the operator still could not answer a parent's question.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    REDUCTION_CONCEPT_LABEL,
    reductionBasisSummary,
    reductionConcept,
    reductionProvenance,
    reductionProvenanceByChargeId,
    reductionRecurrence,
    type ReductionPolicyWindow,
} from "@/lib/financials/reductions/reductionProvenance";
import type { AccountReduction } from "@/lib/financials/reductions/readAccountReductions";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const TODAY = "2026-09-18";

const reduction = (over: Partial<AccountReduction>): AccountReduction =>
    ({
        applicationId: "app-1", kind: "policy", agreementId: "agr-1", customerMemberId: "m-ana",
        category: "credit", amountCents: -4250, currencyCode: "USD", reason: null, periodKey: "2026-09",
        createdAt: "2026-09-01", chargeId: "c-1", sourceChargeId: "c-gross", chargeStatus: "posted",
        reversedByApplicationId: null, reversesApplicationId: null,
        commercialPolicyId: "pol-1", policyKind: "sibling_discount", basis: "percentage",
        basisValue: 10, basisAmountCents: 42_500, capped: false, explanation: null,
        periodStart: "2026-09-01", periodEnd: "2026-09-30",
        ...over,
    }) as AccountReduction;

const openPolicy: ReductionPolicyWindow = { id: "pol-1", effectiveStart: "2026-01-01", effectiveEnd: null, isActive: true };

describe("THE GATE — four concepts, not one", () => {
    /*
     * The regression in operator terms: a sibling discount posted under the `credit` category read
     * "Credit". The category is how the money POSTS; it is not what the row IS.
     */
    it("calls a policy-produced reduction a Discount, not a Credit", () => {
        expect(reductionConcept(reduction({ policyKind: "sibling_discount", category: "credit" }))).toBe("discount");
        expect(reductionConcept(reduction({ policyKind: "waiver", category: "credit" }))).toBe("discount");
        expect(reductionConcept(reduction({ policyKind: "discount", category: "adjustment" }))).toBe("discount");
    });

    it("keeps a manual credit a Credit and a manual correction an Adjustment", () => {
        expect(reductionConcept(reduction({ kind: "manual", policyKind: null, category: "credit" }))).toBe("credit");
        expect(reductionConcept(reduction({ kind: "manual", policyKind: null, category: "adjustment" }))).toBe("adjustment");
    });

    /*
     * A REVERSAL IS A STATEMENT ABOUT ANOTHER ROW, and it wins over everything else. Showing it as
     * a second discount would double an account's apparent generosity.
     */
    it("names a reversal a Reversal even when the policy would have said Discount", () => {
        expect(reductionConcept(reduction({ reversesApplicationId: "app-0", policyKind: "sibling_discount" })))
            .toBe("reversal");
    });

    it("gives every concept an operator word", () => {
        expect(Object.values(REDUCTION_CONCEPT_LABEL)).toEqual(["Discount", "Credit", "Adjustment", "Reversal"]);
    });
});

describe("THE GATE — one-time versus ongoing is read, never guessed", () => {
    it("calls a manual reduction one-time, because a person decided it once", () => {
        expect(reductionRecurrence(reduction({ kind: "manual", commercialPolicyId: null }), null, TODAY)).toBe("one_time");
    });

    it("calls an active open-ended policy ongoing", () => {
        expect(reductionRecurrence(reduction({}), openPolicy, TODAY)).toBe("ongoing");
    });

    it("calls a closed window ended", () => {
        expect(reductionRecurrence(reduction({}), { ...openPolicy, effectiveEnd: "2026-08-31" }, TODAY)).toBe("ended");
        expect(reductionRecurrence(reduction({}), { ...openPolicy, isActive: false }, TODAY)).toBe("ended");
    });

    /*
     * THE HONEST ABSENCE. A policy-produced reduction whose policy cannot be found reports unknown —
     * NOT "one-time", which would be a claim the model cannot support. The label is empty so a
     * surface renders nothing rather than a guess.
     */
    it("says unknown rather than inventing one-time when the policy is not in hand", () => {
        expect(reductionRecurrence(reduction({}), null, TODAY)).toBe("unknown");
        expect(reductionProvenance(reduction({}), null, TODAY, money).recurrenceLabel).toBe("");
    });
});

describe("THE GATE — how the number was reached survives projection", () => {
    it("states a percentage against what it was taken on", () => {
        expect(reductionBasisSummary(reduction({}), money)).toBe("10% of $425.00");
    });

    it("states a fixed amount, and says when a cap bound it", () => {
        expect(reductionBasisSummary(reduction({ basis: "amount", basisValue: 5_000, capped: true }), money))
            .toBe("Fixed $50.00 · capped");
    });

    /* An unrecorded basis is silence. An invented phrase would be worse than none. */
    it("says nothing when the basis was not recorded", () => {
        expect(reductionBasisSummary(reduction({ basis: null, basisValue: null, capped: false }), money)).toBeNull();
    });
});

describe("THE GATE — grain and lineage survive", () => {
    it("keeps the child a reduction names", () => {
        expect(reductionProvenance(reduction({ customerMemberId: "m-ana" }), openPolicy, TODAY, money).customerMemberId)
            .toBe("m-ana");
    });

    /* Household grain is null and stays null — no child is invented for account money. */
    it("does not invent a child for household-grain money", () => {
        expect(reductionProvenance(reduction({ customerMemberId: null }), openPolicy, TODAY, money).customerMemberId)
            .toBeNull();
    });

    it("keeps the obligation the reduction is about, and both reversal links", () => {
        const p = reductionProvenance(
            reduction({ sourceChargeId: "c-gross", reversedByApplicationId: "app-9" }), openPolicy, TODAY, money);
        expect(p.sourceChargeId).toBe("c-gross");
        expect(p.reversedByApplicationId).toBe("app-9");
    });

    /* A ledger row finds its own provenance by the charge the application wrote. */
    it("indexes provenance by the charge that reaches the ledger", () => {
        const byCharge = reductionProvenanceByChargeId(
            [reduction({ chargeId: "c-1" }), reduction({ applicationId: "app-2", chargeId: null })],
            new Map([["pol-1", openPolicy]]), TODAY, money);
        expect([...byCharge.keys()]).toEqual(["c-1"]);
        expect(byCharge.get("c-1")!.concept).toBe("discount");
        expect(byCharge.get("c-1")!.recurrenceLabel).toBe("Ongoing");
    });
});

describe("THE GATE — the provenance is actually read, and both surfaces state it", () => {
    const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

    /*
     * THE ORIGINAL DEFECT. Every one of these is a column the table has always stored, and the
     * select asked for none of them — which is how the decision behind the money went missing while
     * every field name still existed.
     */
    it("selects the decision columns, not only the amount", () => {
        const reader = src("lib/financials/reductions/readAccountReductions.ts");
        /*
         * SCOPED TO THE SELECT, and the first draft of this was NOT — it searched the whole file, so
         * the column names still matched from the field MAPPING below the query. Planting the
         * original defect (dropping them from the select) left it green. A lock that survives its
         * own regression is worse than no lock, because it is believed.
         */
        const call = reader.slice(reader.indexOf(".select("), reader.indexOf(".eq(\"org_id\""));
        expect(call.length, "the select call is findable").toBeGreaterThan(20);
        for (const col of ["commercial_policy_id", "policy_kind", "basis", "basis_value", "basis_amount_cents", "capped", "explanation"]) {
            expect(call, `the SELECT asks for ${col}`).toContain(col);
        }
    });

    it("reads the policy window, which is what makes ongoing a fact", () => {
        const vm = src("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toContain("commercial_policies");
        expect(vm).toMatch(/effective_start.*effective_end.*is_active/);
    });

    /* One meaning on both surfaces: a semantic fork is the thing the convergence forbids. */
    it("has both deep surfaces state the concept from the same projected field", () => {
        expect(src("components/operationalCards/FinancialsDetailCard.tsx"))
            .toContain("e.reduction?.conceptLabel");
        expect(src("app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx"))
            .toContain("reductionOf(row)?.conceptLabel");
    });

    /* Summary stays aggregate — deep provenance must not climb back onto the compact card. */
    it("keeps the Summary card free of reduction provenance", () => {
        const compact = src("components/operationalCards/FinancialsCard.tsx");
        for (const f of ["conceptLabel", "basisSummary", "recurrenceLabel"]) {
            expect(compact, `Summary does not render ${f}`).not.toContain(f);
        }
    });
});
