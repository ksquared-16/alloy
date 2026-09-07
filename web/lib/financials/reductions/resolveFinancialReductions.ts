/**
 * WHAT LEGITIMATE REDUCTIONS APPLY TO THIS GROSS OBLIGATION — decided, not written.
 *
 * Thread 7 made a month's gross tuition real: an accepted pricing term becomes a posted charge for
 * an amount a family agreed to. This module answers the next question without disturbing that one.
 * Gross stays gross. A reduction is a SEPARATE, separately-explainable consequence, and the net a
 * family owes is derived by the balance authority that already sums them
 * (`buildFinancialsCardVM`: gross + discounts + funding + adjustments = responsibility).
 *
 * ── WHO OWNS THE POLICY ──
 *
 * `commercial_policies` does, and this module does not re-decide it. Commercial Execution doctrine
 * is explicit — resolution-time policy types (`discount`, `sibling_discount`, `waiver`) belong to
 * Commercial, "policies modify a resolution; they never create a charge". So Commercial says WHAT
 * the reduction is; Billing says what it does to money owed. That is the same seam Thread 7 opened
 * for pricing, and it is why nothing here reads a rate.
 *
 * ── WHY STACKING IS DETERMINISTIC BY CONSTRUCTION ──
 *
 * `resolvePolicy` selects ONE winning policy per type (most-specific-wins over
 * org < location < program < offering < variant, then latest effective start). So stacking is
 * across TYPES, never within one, and the order below is total. There is no "which of the two 10%
 * policies won" question to answer, because the configuration cannot pose it.
 *
 * ── THE ARITHMETIC IS NOT INVENTED HERE ──
 *
 * Every rule is the one `lib/commercial/execution/policy/applyPolicies.ts` already runs:
 *   waiver wins over discount, outright;
 *   a percentage is taken on the line's GROSS, so multiple percentages ADD rather than compound
 *     (`recomputeNet` sums adjustments against `line.gross`, never against a running net);
 *   the aggregate reduction is clamped so net never goes below zero (`Math.max(0, …)`).
 * Re-deciding any of them here would mean a quote and an invoice could disagree about the same
 * policy, which is the whole reason one owner exists.
 *
 * Pure. No I/O, no clock, no Supabase.
 */

/** How a benefit is expressed — the authoring vocabulary of the policy registry. */
export type ReductionBasis = "percentage" | "amount";

/** The commercial policy types that reduce money owed. Ordered; see STACK_ORDER. */
export type ReductionPolicyKind = "waiver" | "sibling_discount" | "discount";

/**
 * Waiver first because it ends the question, then the relational discount, then the general one.
 * A total order is what makes an explanation reproducible a year later.
 */
export const STACK_ORDER: readonly ReductionPolicyKind[] = ["waiver", "sibling_discount", "discount"];

/** One authored policy, already narrowed to the winner for its type and scope. */
export type ReductionPolicy = {
    id: string;
    kind: ReductionPolicyKind;
    /** The authored `value` jsonb, read defensively — an unreadable policy REFUSES. */
    params: Record<string, unknown>;
    label?: string | null;
};

/** The gross consequence a reduction is measured against. */
export type GrossObligation = {
    chargeId: string;
    customerMemberId: string;
    enrollmentAgreementId: string;
    /** Positive cents. A reduction is never measured against a reduction. */
    amountCents: number;
    currencyCode: string;
    categoryKey: string;
    periodKey: string;
};

/**
 * Facts, resolved server-side from canonical sources. Never asserted by a caller: a browser that
 * could declare a family employed could grant itself a discount.
 */
export type EligibilityFacts = {
    /** 1-based rank of this child among the household's concurrently enrolled children. */
    siblingRank: number;
    /** How many of the household's children are concurrently enrolled over the period. */
    siblingCount: number;
    /** A person on this household holds an employment covering the service period. */
    employeeHousehold: boolean;
};

export type AppliedReduction = {
    policyId: string;
    policyKind: ReductionPolicyKind;
    basis: ReductionBasis;
    /** The authored number: percent for `percentage`, cents for `amount`. */
    basisValue: number;
    /** What the benefit was calculated ON — always the gross, never a running net. */
    basisAmountCents: number;
    /** NEGATIVE cents. The sign is the direction money moves, and it is stored, not inferred. */
    amountCents: number;
    /** True when a configured maximum benefit bound the amount. */
    capped: boolean;
    explanation: string;
};

export type NotEligibleReason =
    | "no_policy_configured"
    | "not_enough_siblings"
    | "rank_not_covered"
    | "not_an_employee_household"
    | "category_not_covered";

export type RefusalReason =
    | "unreadable_basis"
    | "unreadable_value"
    | "percentage_out_of_range"
    | "negative_gross";

export type ReductionDecision =
    | {
          kind: "applied";
          reductions: AppliedReduction[];
          /** Negative: the sum of every reduction, after the floor. */
          totalCents: number;
          netCents: number;
          /** True when the floor bound the aggregate — the family owes zero, never less. */
          floored: boolean;
      }
    | { kind: "not_eligible"; reason: NotEligibleReason }
    | { kind: "refused"; reason: RefusalReason; detail: string; policyId: string | null };

/**
 * The identity of "this policy, applied to this gross charge".
 *
 * Keyed on the CHARGE, which is already period- and child-specific, so the same policy cannot apply
 * twice to one obligation while a distinct eligible period gets its own application for free. This
 * is the same reasoning that anchored Thread 7's occurrence key on the assignment and the period
 * rather than on the term.
 */
export function reductionKey(policyId: string, chargeId: string): string {
    return `fred:${policyId}:${chargeId}`;
}

function num(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
}

function readBasis(params: Record<string, unknown>): ReductionBasis | null {
    const raw = typeof params.basis === "string" ? params.basis.trim() : "";
    return raw === "percentage" || raw === "amount" ? raw : null;
}

/** `applies_to` is authored as tuition | fees | all; absent means everything. */
function coversCategory(params: Record<string, unknown>, categoryKey: string): boolean {
    const raw = typeof params.applies_to === "string" ? params.applies_to.trim() : "";
    if (raw === "" || raw === "all") return true;
    if (raw === "tuition") return categoryKey === "tuition";
    if (raw === "fees") return categoryKey !== "tuition";
    return true;
}

/** Positive cents to subtract, before caps. Mirrors `computeDiscountCents` exactly. */
function benefitCents(basis: ReductionBasis, value: number, grossCents: number): number {
    const raw = basis === "percentage" ? (grossCents * value) / 100 : value;
    return Math.min(Math.max(0, Math.round(raw)), grossCents);
}

/**
 * Is this household's child eligible for this policy, and for how much?
 *
 * Returns a refusal rather than a guess when the configuration cannot be read: a policy that says
 * "percentage" with no readable number is an authoring mistake, and quietly treating it as zero
 * would bill the family in full while the operator believed a discount was live.
 */
function evaluateOne(
    policy: ReductionPolicy,
    gross: GrossObligation,
    facts: EligibilityFacts,
): AppliedReduction | { skip: NotEligibleReason } | { refuse: RefusalReason; detail: string } {
    if (!coversCategory(policy.params, gross.categoryKey)) return { skip: "category_not_covered" };

    // ── A WAIVER IS NOT A PERCENTAGE. It removes the charge, and says so in one place.
    if (policy.kind === "waiver") {
        return {
            policyId: policy.id,
            policyKind: "waiver",
            basis: "amount",
            basisValue: gross.amountCents,
            basisAmountCents: gross.amountCents,
            amountCents: -gross.amountCents,
            capped: false,
            explanation: `Waived in full under ${policy.label ?? "a waiver policy"}.`,
        };
    }

    if (policy.kind === "sibling_discount") {
        const minSiblings = num(policy.params.min_siblings) ?? 2;
        if (facts.siblingCount < minSiblings) return { skip: "not_enough_siblings" };
        const rankRule = typeof policy.params.applies_to_rank === "string" ? policy.params.applies_to_rank : "subsequent";
        // "subsequent" means the discount starts at the Nth child, where N is the configured
        // minimum — the first child pays full tuition, which is what a sibling discount MEANS.
        if (rankRule !== "all" && facts.siblingRank < minSiblings) return { skip: "rank_not_covered" };
    }

    if (policy.kind === "discount") {
        // Employee eligibility is a CONFIGURED requirement, not a hard-coded discount type. The
        // shared policy substrate stays free of childcare vocabulary; the tenant expresses "staff
        // families" and the server proves it from `employments`.
        const requires = typeof policy.params.requires === "string" ? policy.params.requires.trim() : "";
        if (requires === "employee_household" && !facts.employeeHousehold) {
            return { skip: "not_an_employee_household" };
        }
    }

    const basis = readBasis(policy.params);
    if (!basis) return { refuse: "unreadable_basis", detail: `policy ${policy.id} has no readable basis` };
    const value = num(policy.params.value);
    if (value == null) return { refuse: "unreadable_value", detail: `policy ${policy.id} has no readable value` };
    if (basis === "percentage" && (value < 0 || value > 100)) {
        return { refuse: "percentage_out_of_range", detail: `policy ${policy.id} percentage ${value}` };
    }

    const raw = benefitCents(basis, value, gross.amountCents);
    const cap = num(policy.params.max_benefit_cents);
    const capped = cap != null && cap >= 0 && raw > cap;
    const amount = capped ? cap! : raw;
    const shown = basis === "percentage" ? `${value}%` : `$${(value / 100).toFixed(2)}`;
    return {
        policyId: policy.id,
        policyKind: policy.kind,
        basis,
        basisValue: value,
        basisAmountCents: gross.amountCents,
        amountCents: -amount,
        capped,
        explanation:
            `${policy.label ?? policy.kind} · ${shown} of $${(gross.amountCents / 100).toFixed(2)}`
            + (capped ? `, capped at $${(amount / 100).toFixed(2)}` : ""),
    };
}

/**
 * Every reduction that legitimately applies to one gross obligation, in a total order.
 *
 * `policies` must already be the winners for their types — one per kind — because that is what
 * `resolvePolicy` returns and what makes this deterministic. A second policy of the same kind is
 * REFUSED rather than ranked here, because ranking it would be this module inventing a precedence
 * the configuration never expressed.
 */
export function resolveFinancialReductions(args: {
    gross: GrossObligation;
    policies: readonly ReductionPolicy[];
    facts: EligibilityFacts;
}): ReductionDecision {
    const { gross, policies, facts } = args;
    if (gross.amountCents <= 0) {
        return { kind: "refused", reason: "negative_gross", detail: `gross ${gross.amountCents}`, policyId: null };
    }

    const applied: AppliedReduction[] = [];
    let sawAny = false;
    /*
     * WHY THE REDUCTION DID NOT APPLY IS THE ANSWER, not a category. "Not enough siblings" and
     * "this policy does not cover fees" send an operator to two different places, and collapsing
     * them into one reason sends them to neither.
     */
    let firstSkip: NotEligibleReason | null = null;

    for (const kind of STACK_ORDER) {
        const forKind = policies.filter((p) => p.kind === kind);
        if (forKind.length === 0) continue;
        sawAny = true;
        if (forKind.length > 1) {
            return {
                kind: "refused",
                reason: "unreadable_basis",
                detail: `${forKind.length} active ${kind} policies for one scope; the winner is not expressed`,
                policyId: forKind[0]!.id,
            };
        }
        const result = evaluateOne(forKind[0]!, gross, facts);
        if ("refuse" in result) {
            return { kind: "refused", reason: result.refuse, detail: result.detail, policyId: forKind[0]!.id };
        }
        if ("skip" in result) {
            firstSkip = firstSkip ?? result.skip;
            continue;
        }
        applied.push(result);
        // A waiver ends the question: there is nothing left of the charge for a discount to reduce,
        // and stacking anything onto zero would drive the family's balance negative.
        if (kind === "waiver") break;
    }

    if (applied.length === 0) {
        return { kind: "not_eligible", reason: sawAny ? (firstSkip ?? "category_not_covered") : "no_policy_configured" };
    }

    const rawTotal = applied.reduce((acc, r) => acc + r.amountCents, 0);
    const floored = gross.amountCents + rawTotal < 0;
    const totalCents = floored ? -gross.amountCents : rawTotal;
    if (floored) {
        // The FLOOR IS THE AGGREGATE'S, and it is recorded on the last line rather than spread
        // across all of them: an operator reading the ledger must see which reduction was trimmed,
        // not a set of amounts that no policy would reproduce.
        const excess = totalCents - rawTotal;
        const last = applied[applied.length - 1]!;
        applied[applied.length - 1] = {
            ...last,
            amountCents: last.amountCents + excess,
            capped: true,
            explanation: `${last.explanation}, reduced so the balance is not driven below zero`,
        };
    }

    return { kind: "applied", reductions: applied, totalCents, netCents: gross.amountCents + totalCents, floored };
}
