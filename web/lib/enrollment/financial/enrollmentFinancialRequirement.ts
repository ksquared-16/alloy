/**
 * WHERE ENROLLMENT IS ALLOWED TO TALK ABOUT MONEY — and it is a very small place.
 *
 * Enrollment may say three things: whether a fee applies, which canonical charge definition it is,
 * and at what grain. Everything else — the amount, who is responsible, what a subsidy is expected to
 * cover, what is collectible now, what arrived, what is still outstanding — belongs to Financials
 * and is QUOTED here, never recomputed.
 *
 * ── WHY THIS FILE IS PURE ──
 *
 * A projection that could read the database could also decide, one convenient day, to add up
 * allocations itself. That is how a second balance is born, and a second balance is worse than no
 * balance: two surfaces then tell one family two different numbers and both cite the system. So
 * every figure arrives as an argument, produced by `resolveFamilyCollectible`, and this file does
 * arithmetic only where the arithmetic is Enrollment's own — summing per-child obligations into the
 * family total a parent will eventually be shown.
 *
 * ── WHY "SATISFIED" IS NOT "THE FAMILY PAID THE FEE" ──
 *
 * A $200 fee with $100 of expected subsidy leaves $100 currently collectible. A family that pays
 * $100 has satisfied the requirement, and Enrollment must not sit waiting for a second $100 merely
 * because the gross was $200. `currentlyCollectibleCents` is the authority, and it is Financials'
 * answer, arrived at through governed suppression that draft claims and mere authorizations do not
 * earn.
 */

/** Financials' answer for ONE obligation, quoted. Field-for-field a `CollectiblePosition` subset. */
export type QuotedCollectiblePosition = {
    readonly chargeId: string;
    readonly currencyCode: string;
    /** The charge's own lifecycle status. A draft charge owes nothing yet. */
    readonly chargeStatus: string;
    readonly grossCents: number;
    readonly appliedCents: number;
    readonly expectedSubsidyCents: number;
    readonly currentlyCollectibleCents: number;
    readonly outstandingCents: number;
    /** Signed. Negative is short-paid or denied; positive is an overpayment. */
    readonly unresolvedVarianceCents: number;
    readonly suppressionBoundBy: "claimed" | "expected" | "outstanding" | "none";
    readonly openVarianceStates: readonly string[];
};

/**
 * One obligation as Enrollment reads it, with the attribution that makes it a CHILD's or a FAMILY's.
 *
 * `subjectCustomerMemberId` is present exactly when the fee is graned per child. Losing it would
 * make two siblings' fees indistinguishable the moment they cost the same, which is the failure the
 * per-child grain exists to prevent.
 */
export type EnrollmentFeeObligation = {
    readonly requirementId: string;
    readonly chargeTemplateKey: string;
    readonly billableSource: { readonly type: "enrollment_agreement" | "customer"; readonly id: string };
    readonly subjectCustomerMemberId: string | null;
    readonly position: QuotedCollectiblePosition;
};

export type EnrollmentFinancialState =
    | "NOT_APPLICABLE"
    | "NOT_DUE"
    | "DUE"
    | "PARTIALLY_SATISFIED"
    | "PROCESSING"
    | "SATISFIED"
    | "ATTENTION_REQUIRED";

export type EnrollmentFinancialAmounts = {
    readonly currencyCode: string | null;
    readonly grossCents: number;
    readonly expectedFundingCents: number;
    readonly collectibleNowCents: number;
    readonly appliedCents: number;
    readonly outstandingCents: number;
};

export type EnrollmentFinancialRequirementProjection = {
    readonly state: EnrollmentFinancialState;
    /** True only when the state can never be satisfied by waiting — an operator must look. */
    readonly needsAttention: boolean;
    readonly amounts: EnrollmentFinancialAmounts;
    /** Per obligation, in the order given, each carrying its own child attribution. */
    readonly obligations: readonly (EnrollmentFeeObligation & { readonly state: EnrollmentFinancialState })[];
    /** One sentence, for an operator. Never a code. */
    readonly explanation: string;
};

export type ProjectEnrollmentFinancialRequirementInput = {
    /** Absent means no fee requirement is configured on the stage at all. */
    readonly configured: boolean;
    /**
     * Whether every prerequisite non-financial requirement is complete.
     *
     * A fee that is not yet due must not read as owed. The participant story is: finish the
     * paperwork, THEN the fee becomes due — so an operator launching paperwork does not, by itself,
     * put money on a family's account.
     */
    readonly due: boolean;
    /**
     * True when the configured definition resolves to no money at all.
     *
     * Financials refuses to write a zero-amount draft ("only a resolvable, positive amount can
     * become a draft"), so a $0 fee legitimately produces NO obligation. Without this flag that is
     * indistinguishable from "the charge has not been created yet", and a family would be blocked
     * forever on a fee that costs nothing.
     */
    readonly resolvesToZero: boolean;
    readonly obligations: readonly EnrollmentFeeObligation[];
};

const ZERO: EnrollmentFinancialAmounts = {
    currencyCode: null,
    grossCents: 0,
    expectedFundingCents: 0,
    collectibleNowCents: 0,
    appliedCents: 0,
    outstandingCents: 0,
};

/** The state of ONE obligation. The family's state is derived from these, never independently. */
export function stateForObligation(position: QuotedCollectiblePosition): EnrollmentFinancialState {
    /*
     * A VARIANCE IS A PERSON'S PROBLEM, NOT A WAITING GAME.
     *
     * An agency short-paid or denied, and nobody has decided what happens next. No amount of
     * patience resolves that, so it must never read as PROCESSING — which says "money is on its
     * way" — nor as DUE, which would ask a family for money an agency may still owe.
     */
    if (position.unresolvedVarianceCents !== 0 || position.openVarianceStates.length > 0) {
        return "ATTENTION_REQUIRED";
    }

    // A draft charge owes nothing yet — Financials' own rule, quoted.
    if (position.chargeStatus === "draft") return "NOT_DUE";

    if (position.currentlyCollectibleCents > 0) {
        return position.appliedCents > 0 ? "PARTIALLY_SATISFIED" : "DUE";
    }

    /*
     * Collectible is zero, and there are two ways to get there.
     *
     * Money ARRIVED, or a governed submitted claim is suppressing the balance while an agency pays.
     * Calling the second one SATISFIED would tell a family it is finished when the money has not
     * moved; calling it DUE would ask them for money their agency has already claimed.
     */
    if (position.suppressionBoundBy === "claimed" && position.outstandingCents > 0) return "PROCESSING";
    return "SATISFIED";
}

/** Ranked worst-first: a family is only as settled as its least settled obligation. */
const SEVERITY: readonly EnrollmentFinancialState[] = [
    "ATTENTION_REQUIRED",
    "DUE",
    "PARTIALLY_SATISFIED",
    "PROCESSING",
    "NOT_DUE",
    "SATISFIED",
];

function worst(states: readonly EnrollmentFinancialState[]): EnrollmentFinancialState {
    for (const candidate of SEVERITY) if (states.includes(candidate)) return candidate;
    return "SATISFIED";
}

function sum(obligations: readonly EnrollmentFeeObligation[]): EnrollmentFinancialAmounts {
    return obligations.reduce<EnrollmentFinancialAmounts>(
        (acc, o) => ({
            currencyCode: acc.currencyCode ?? o.position.currencyCode,
            grossCents: acc.grossCents + o.position.grossCents,
            expectedFundingCents: acc.expectedFundingCents + o.position.expectedSubsidyCents,
            collectibleNowCents: acc.collectibleNowCents + o.position.currentlyCollectibleCents,
            appliedCents: acc.appliedCents + o.position.appliedCents,
            outstandingCents: acc.outstandingCents + o.position.outstandingCents,
        }),
        ZERO,
    );
}

function explain(state: EnrollmentFinancialState, amounts: EnrollmentFinancialAmounts, count: number): string {
    const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    switch (state) {
        case "NOT_APPLICABLE":
            return "No enrollment fee is configured for this stage.";
        case "NOT_DUE":
            return "The enrollment fee is not due until the remaining paperwork is complete.";
        case "DUE":
            return `${money(amounts.collectibleNowCents)} is currently collectible across ${count} obligation${count === 1 ? "" : "s"}.`;
        case "PARTIALLY_SATISFIED":
            return `${money(amounts.appliedCents)} received; ${money(amounts.collectibleNowCents)} still collectible.`;
        case "PROCESSING":
            return "A submitted funding claim covers the balance while the agency pays.";
        case "SATISFIED":
            return amounts.grossCents === 0
                ? "The configured enrollment fee resolves to no charge."
                : "The enrollment fee has been satisfied.";
        case "ATTENTION_REQUIRED":
            return "A funding variance is unresolved — somebody needs to decide what happens next.";
    }
}

/**
 * Project the financial requirement from canonical Financials output. Read-only, and pure.
 */
export function projectEnrollmentFinancialRequirement(
    input: ProjectEnrollmentFinancialRequirementInput,
): EnrollmentFinancialRequirementProjection {
    if (!input.configured) {
        return {
            state: "NOT_APPLICABLE",
            needsAttention: false,
            amounts: ZERO,
            obligations: [],
            explanation: explain("NOT_APPLICABLE", ZERO, 0),
        };
    }

    /*
     * A FEE THAT COSTS NOTHING CANNOT BE OWED.
     *
     * Checked before dueness on purpose: "not due yet, and also free" is a distinction with no
     * consequence for anyone, and reporting NOT_DUE would leave a requirement that never resolves
     * hanging over a family that owes nothing.
     */
    if (input.resolvesToZero && input.obligations.length === 0) {
        return {
            state: "SATISFIED",
            needsAttention: false,
            amounts: ZERO,
            obligations: [],
            explanation: explain("SATISFIED", ZERO, 0),
        };
    }

    if (!input.due && input.obligations.length === 0) {
        return {
            state: "NOT_DUE",
            needsAttention: false,
            amounts: ZERO,
            obligations: [],
            explanation: explain("NOT_DUE", ZERO, 0),
        };
    }

    const obligations = input.obligations.map((o) => ({ ...o, state: stateForObligation(o.position) }));
    const state = worst(obligations.map((o) => o.state));
    const amounts = sum(input.obligations);

    return {
        state,
        needsAttention: state === "ATTENTION_REQUIRED",
        amounts,
        obligations,
        explanation: explain(state, amounts, obligations.length),
    };
}
