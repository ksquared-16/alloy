/**
 * WHAT THIS REDUCTION IS, AND WHY IT EXISTS — one reading, for every surface that shows one.
 *
 * ── THE PROBLEM THIS SOLVES ───────────────────────────────────────────────────────────────────
 *
 * The ledger could show that money moved and not what decided it. A row read `Credit −$260.06`,
 * and `financial_reduction_applications` — the table that exists precisely so a reduction is not
 * money without a reason — was never asked for the policy, the basis or the cap. An operator could
 * see the amount and not the decision.
 *
 * ── WHY A SHARED FORMATTER AND NOT TWO ───────────────────────────────────────────────────────
 *
 * Focus Panel Details and Workspace Accounts must not disagree about what a reduction IS. Different
 * layouts are fine; two answers to "is this a discount or a credit" are not. So the reading lives
 * here, both surfaces import it, and neither is able to form a private opinion.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────────────────────
 *
 * It infers nothing. Every value is a stored column or a documented absence: where the model does
 * not know, this says so rather than guessing from an amount or a GL code. A reduction whose
 * policy was deleted, or a manual one that never had a policy, reports `unknown` recurrence — not
 * "one-time", which would be a claim.
 */

import type { AccountReduction } from "@/lib/financials/reductions/readAccountReductions";

/**
 * The operator's word for this row.
 *
 * FOUR CONCEPTS, NOT ONE. They share infrastructure — every reduction is a charge row in a
 * contra-revenue category — and sharing infrastructure is not the same as being the same thing. A
 * discount is a price decision under a policy; a credit is money owed back; an adjustment is a
 * correction to an established position; a reversal undoes a specific earlier one. Collapsing them
 * into "adjustment" because the plumbing matches is how an operator loses the ability to answer a
 * parent's question.
 */
export type ReductionConcept = "discount" | "credit" | "adjustment" | "reversal";

export const REDUCTION_CONCEPT_LABEL: Record<ReductionConcept, string> = {
    discount: "Discount",
    credit: "Credit",
    adjustment: "Adjustment",
    reversal: "Reversal",
};

/**
 * Which of the four this reduction is.
 *
 * ORDER IS THE ARGUMENT. A reversal is named first because it is a statement about ANOTHER row and
 * that is the most important thing about it — a reversal of a discount is not a second discount,
 * and showing it as one would double the apparent generosity of an account.
 *
 * Then policy: `policy_kind` is the canonical answer to "did an authored discount policy produce
 * this", and `sibling_discount` and `waiver` are both discounts in the operator's language even
 * though they are different policies.
 *
 * Only then the charge category, which is where a manual credit or adjustment is decided.
 */
export function reductionConcept(r: Pick<AccountReduction,
    "reversesApplicationId" | "policyKind" | "kind" | "category">): ReductionConcept {
    if (r.reversesApplicationId) return "reversal";
    if (r.policyKind === "discount" || r.policyKind === "sibling_discount" || r.policyKind === "waiver") {
        return "discount";
    }
    if (r.category === "discount") return "discount";
    if (r.category === "credit") return "credit";
    return "adjustment";
}

/**
 * ── ONE-TIME OR ONGOING ──────────────────────────────────────────────────────────────────────
 *
 * The distinction is REAL and canonical, and it lives on the policy: `commercial_policies` carries
 * `effective_start`, `effective_end` and `is_active`, so a policy with an open-ended window that is
 * still active recurs, and one whose window has closed does not.
 *
 * It is NOT on the application, and that is correct — an application is one event. So this needs
 * the policy beside the application, and when the caller cannot supply one the honest answer is
 * `unknown`. A manual reduction has no policy at all and is `one_time` by construction: a person
 * decided it once.
 */
export type ReductionRecurrence = "one_time" | "ongoing" | "ended" | "unknown";

export const RECURRENCE_LABEL: Record<ReductionRecurrence, string> = {
    one_time: "One-time",
    ongoing: "Ongoing",
    ended: "Ended",
    unknown: "",
};

export type ReductionPolicyWindow = {
    id: string;
    effectiveStart: string | null;
    effectiveEnd: string | null;
    isActive: boolean;
};

export function reductionRecurrence(
    r: Pick<AccountReduction, "kind" | "commercialPolicyId">,
    policy: ReductionPolicyWindow | null | undefined,
    today: string,
): ReductionRecurrence {
    // A person decided it once; there is no rule to recur.
    if (r.kind === "manual") return "one_time";
    // Policy-produced but the policy is not in hand — say so rather than guess.
    if (!r.commercialPolicyId || !policy) return "unknown";
    if (!policy.isActive) return "ended";
    if (policy.effectiveEnd && policy.effectiveEnd < today) return "ended";
    return "ongoing";
}

/**
 * HOW THE NUMBER WAS REACHED, in one short phrase — "10% of $425.00", "Fixed amount", "Capped".
 *
 * Returns null when the basis was not recorded, because an empty phrase is better than an invented
 * one. This is the line that lets a parent's "why is my bill this number" be answered from the
 * screen instead of from a migration comment.
 */
export function reductionBasisSummary(
    r: Pick<AccountReduction, "basis" | "basisValue" | "basisAmountCents" | "capped">,
    money: (cents: number) => string,
): string | null {
    const parts: string[] = [];
    if (r.basis === "percentage" && r.basisValue != null) {
        parts.push(
            r.basisAmountCents != null
                ? `${r.basisValue}% of ${money(r.basisAmountCents)}`
                : `${r.basisValue}%`,
        );
    } else if (r.basis === "amount" && r.basisValue != null) {
        parts.push(`Fixed ${money(r.basisValue)}`);
    }
    if (r.capped) parts.push("capped");
    return parts.length ? parts.join(" · ") : null;
}

/** Everything a surface needs to state a reduction honestly, derived once. */
export type ReductionProvenance = {
    applicationId: string;
    concept: ReductionConcept;
    conceptLabel: string;
    recurrence: ReductionRecurrence;
    recurrenceLabel: string;
    /** `policy` or `manual` — whether an authored rule or a person decided it. */
    decidedBy: string;
    basisSummary: string | null;
    /** The reason a manual reduction gave, or the explanation a policy application wrote. */
    explanation: string | null;
    /** The obligation this reduction is ABOUT, where it names one. */
    sourceChargeId: string | null;
    /** Household grain when null — the same doctrine the whole subject model keeps. */
    customerMemberId: string | null;
    periodKey: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    createdAt: string | null;
    /** Set once reversed; and, on a reversal, the application it undoes. */
    reversedByApplicationId: string | null;
    reversesApplicationId: string | null;
    policyId: string | null;
};

export function reductionProvenance(
    r: AccountReduction,
    policy: ReductionPolicyWindow | null | undefined,
    today: string,
    money: (cents: number) => string,
): ReductionProvenance {
    const concept = reductionConcept(r);
    const recurrence = reductionRecurrence(r, policy, today);
    return {
        applicationId: r.applicationId,
        concept,
        conceptLabel: REDUCTION_CONCEPT_LABEL[concept],
        recurrence,
        recurrenceLabel: RECURRENCE_LABEL[recurrence],
        decidedBy: r.kind,
        basisSummary: reductionBasisSummary(r, money),
        // A policy application explains itself; a manual one gives a reason. Either is the sentence.
        explanation: r.explanation ?? r.reason ?? null,
        sourceChargeId: r.sourceChargeId,
        customerMemberId: r.customerMemberId,
        periodKey: r.periodKey,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        createdAt: r.createdAt,
        reversedByApplicationId: r.reversedByApplicationId,
        reversesApplicationId: r.reversesApplicationId,
        policyId: r.commercialPolicyId,
    };
}

/** Provenance by the CHARGE the reduction wrote, which is how a ledger row finds its own. */
export function reductionProvenanceByChargeId(
    reductions: readonly AccountReduction[],
    policies: ReadonlyMap<string, ReductionPolicyWindow>,
    today: string,
    money: (cents: number) => string,
): Map<string, ReductionProvenance> {
    const out = new Map<string, ReductionProvenance>();
    for (const r of reductions) {
        if (!r.chargeId) continue;
        out.set(r.chargeId, reductionProvenance(r, r.commercialPolicyId ? policies.get(r.commercialPolicyId) : null, today, money));
    }
    return out;
}

/**
 * WHAT A LEDGER ROW IS CALLED — one answer, for both deep surfaces.
 *
 * ── THE MISREADING THIS ENDS ─────────────────────────────────────────────────────────────────
 *
 * A charge-level REVERSAL is written as a correction charge in a contra-revenue category, and it
 * carries no `financial_reduction_application` — it is not a reduction, it undoes a charge. Both
 * surfaces fell through to the category label and called it `Credit`. A parent asking "why was I
 * credited?" was being shown a reversal, and an operator reconciling the account could not tell a
 * refund of goodwill from an entry that should never have stood.
 *
 * ── ORDER IS THE ARGUMENT ────────────────────────────────────────────────────────────────────
 *
 * Correction lineage wins, because `correction_kind` is the canonical record of what the writer
 * INTENDED and is the most specific thing known about the row. Then reduction provenance, which
 * already distinguishes its own four concepts. Only then the charge category, which is how the
 * money POSTS and was never meant to name the transaction.
 *
 * Nothing is fabricated to achieve this: no reduction application is created merely to label a row.
 */
export function financialRowConceptLabel(input: {
    /** `reversal` | `credit` | `replacement`, from the correction's own metadata. */
    correctionKind?: string | null;
    /** The reduction's concept, where this row IS a reduction. */
    reductionConceptLabel?: string | null;
    /** The category's label — the last resort, and the one that was misleading. */
    categoryLabel: string;
}): string {
    const correction = (input.correctionKind ?? "").trim().toLowerCase();
    if (correction === "reversal") return "Reversal";
    if (correction === "replacement") return "Replacement";
    if (correction === "credit") return "Credit";
    return input.reductionConceptLabel || input.categoryLabel;
}
