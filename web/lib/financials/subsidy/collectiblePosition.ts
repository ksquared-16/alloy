/**
 * THE COLLECTIBLE POSITION, AS ARITHMETIC — one charge, no I/O, one copy.
 *
 * `resolveFamilyCollectible` composed Threads 6, 8, 9 and 10 into the figure an operator is
 * shown for one family, and it did the reading and the reasoning in the same function. That was
 * correct while one charge at a time was the only question anyone asked.
 *
 * The Financials workspace asks a second one: what is the position across every household in
 * scope? Answering it by calling the per-charge resolver in a loop is four round trips per
 * charge, and answering it with its own totals is worse — it would make the workspace a SECOND
 * authority on outstanding, subsidy suppression and collectible-now, free to disagree with the
 * card the operator opens next.
 *
 * So the arithmetic moved here, unchanged, and both callers use it: the per-charge resolver
 * reads for one charge, the cohort projection reads for many, and neither computes anything.
 * There is one calculation of a family's position in this platform, and this is it.
 *
 * Pure. Every input is a fact somebody else owns:
 *   · gross / reductions / net .......... Thread 10, via `resolveAllocatableNet`
 *   · applications of posted payments ... Thread 8, the outstanding predicate
 *   · responsibility allocations ........ Thread 6
 *   · expected funding .................. Thread 6's seam, Thread 9's provenance
 *   · claim lines and claim states ...... Thread 9
 *   · open variances .................... Thread 9
 */

/** Claim states in which a claim has been sent and may therefore suppress collection. */
export const SUPPRESSING_CLAIM_STATES = ["submitted", "accepted"] as const;

export type CollectiblePosition = {
    chargeId: string;
    currencyCode: string;
    /** Thread 8's answer: the posted charge less active applications of posted payments. */
    outstandingCents: number;
    /** Thread 6: what named parties were made responsible for, plus anything still unassigned. */
    assignedResponsibilityCents: number;
    unassignedResponsibilityCents: number;
    /** Thread 6 expected funding attributable to this obligation. Never money. */
    expectedSubsidyCents: number;
    /** The bounded, governed suppression — submitted claims only. */
    submittedClaimSuppressionCents: number;
    /** Agency money that actually arrived and was applied to this charge. */
    actualSubsidyReceivedCents: number;
    /** Signed. Negative is short-paid or denied; positive is an overpayment. */
    unresolvedVarianceCents: number;
    /** outstanding − suppression, never below zero. */
    currentlyCollectibleCents: number;
    /** Every figure above, with the row that produced it, so an operator can be told why. */
    explanation: {
        grossCents: number;
        reductionsCents: number;
        netCents: number;
        /*
         * WHAT MONEY ALREADY SATISFIED. This was computed here all along — `outstandingCents` is
         * posted gross minus exactly this — and then discarded, so every surface could say what a
         * family still owes and none could say what had already been paid. An operator asked "why
         * is this the balance?" could be shown the answer's two halves only by subtracting them
         * back out, which is how a presentation layer starts doing money arithmetic of its own.
         *
         * Counted applications only: an application whose payment cannot be shown to have settled
         * has not satisfied anything, and is excluded here for the same reason it is excluded from
         * the balance above.
         */
        appliedCents: number;
        suppressionBoundBy: "claimed" | "expected" | "outstanding" | "none";
        submittedClaimIds: string[];
        openVarianceStates: string[];
    };
};

/** One active application of a payment, with the payment facts the arithmetic depends on. */
export type CollectibleApplicationInput = {
    allocatedAmountCents: number;
    /** `payment_allocations.status` — anything but `active` has been reversed. */
    status: string | null;
    /** The PAYMENT's status. Only a posted payment has arrived. */
    paymentStatus: string | null;
    /** `agency` is how subsidy money is told apart — by who paid, never by amount. */
    payerEntityType: string | null;
};

export type CollectibleAllocationInput = {
    assignedAmountCents: number;
    isUnassigned: boolean;
};

export type CollectibleFundingInput = {
    basis: string | null;
    expectedAmountCents: number | null;
    percentBasisPoints: number | null;
};

export type CollectibleClaimLineInput = {
    claimId: string;
    claimedAmountCents: number;
    /** The state of the claim this line belongs to, or null when the claim is unknown. */
    claimState: string | null;
};

export type CollectibleVarianceInput = {
    varianceCents: number;
    state: string;
    /** Null means nobody has decided what to do about it yet. */
    resolutionKind: string | null;
};

export type CollectiblePositionInputs = {
    chargeId: string;
    currencyCode: string;
    /** The charge's own status. A draft charge owes nothing yet. */
    chargeStatus: string;
    grossCents: number;
    /** Signed, and negative when reductions exist — Thread 10 stores the direction. */
    reductionsCents: number;
    netCents: number;
    applications: readonly CollectibleApplicationInput[];
    allocations: readonly CollectibleAllocationInput[];
    expectedFunding: readonly CollectibleFundingInput[];
    claimLines: readonly CollectibleClaimLineInput[];
    variances: readonly CollectibleVarianceInput[];
};

export function computeCollectiblePosition(inputs: CollectiblePositionInputs): CollectiblePosition {
    /*
     * ── OUTSTANDING IS THREAD 8'S, QUOTED ───────────────────────────────────────────────────
     *
     * A charge owes its own amount less every ACTIVE application of a POSTED payment. That
     * predicate is `buildFinancialsCardVM`'s and `jobPaymentBalances`'s, quoted rather than
     * re-derived, so the card and this cannot answer the same question differently. A draft
     * charge owes nothing yet; a pending payment has not arrived.
     */
    let appliedCents = 0;
    let actualSubsidyReceivedCents = 0;
    for (const application of inputs.applications) {
        if ((application.status ?? "active") !== "active") continue;
        if (application.paymentStatus !== "posted") continue;
        const amount = Number(application.allocatedAmountCents) || 0;
        appliedCents += amount;
        // AGENCY MONEY IS TOLD APART BY WHO PAID IT — the payer identity Thread 6 taught the
        // payment path to record. Never by guessing from the amount.
        if ((application.payerEntityType ?? "") === "agency") actualSubsidyReceivedCents += amount;
    }

    const postedGross = inputs.chargeStatus === "posted" ? inputs.grossCents + inputs.reductionsCents : 0;
    const outstandingCents = Math.max(0, postedGross - appliedCents);

    // ── RESPONSIBILITY (Thread 6) ───────────────────────────────────────────────────────────
    const assignedResponsibilityCents = inputs.allocations
        .filter((a) => !a.isUnassigned)
        .reduce((acc, a) => acc + Number(a.assignedAmountCents), 0);
    const unassignedResponsibilityCents = inputs.allocations
        .filter((a) => a.isUnassigned)
        .reduce((acc, a) => acc + Number(a.assignedAmountCents), 0);

    // ── EXPECTED SUBSIDY (Thread 6's seam, with Thread 9's provenance) ──────────────────────
    const expectedSubsidyCents = inputs.expectedFunding.reduce((acc, f) => {
        if (f.basis === "fixed_amount") return acc + Number(f.expectedAmountCents ?? 0);
        // A percentage of the NET, the same convention every other percentage in Financials uses.
        return acc + Math.floor((inputs.netCents * Number(f.percentBasisPoints ?? 0)) / 10_000);
    }, 0);

    // ── WHAT WAS ACTUALLY CLAIMED, ON CLAIMS THAT WERE ACTUALLY SENT ────────────────────────
    const submittedLines = inputs.claimLines.filter((l) =>
        (SUPPRESSING_CLAIM_STATES as readonly string[]).includes(l.claimState ?? ""),
    );
    const claimedCents = submittedLines.reduce((acc, l) => acc + Number(l.claimedAmountCents), 0);
    const submittedClaimIds = [...new Set(submittedLines.map((l) => l.claimId))];

    /*
     * SUPPRESSION IS ABOUT MONEY STILL EXPECTED TO ARRIVE, not money that already did.
     *
     * Once the agency has paid, its payment reduced outstanding through Thread 8 and the claim has
     * done its job — continuing to suppress would hide the family's own copay behind a claim that is
     * already settled, and the family would be asked for nothing at all. So what has been received
     * is taken off the claim before it bounds anything.
     */
    const stillExpectedFromAgencyCents = Math.max(0, claimedCents - actualSubsidyReceivedCents);

    /*
     * THE SMALLEST OF THE THREE. Each bound removes a specific lie — claiming more than was expected,
     * expecting more than was claimed, or suppressing money the family no longer owes — and the one
     * that bound the answer is reported so an operator can be told which.
     */
    const bounds: Array<{ kind: CollectiblePosition["explanation"]["suppressionBoundBy"]; value: number }> = [
        { kind: "claimed", value: stillExpectedFromAgencyCents },
        { kind: "expected", value: Math.max(0, expectedSubsidyCents - actualSubsidyReceivedCents) },
        { kind: "outstanding", value: outstandingCents },
    ];
    const winner = bounds.reduce((lowest, candidate) => (candidate.value < lowest.value ? candidate : lowest));
    const submittedClaimSuppressionCents = submittedLines.length === 0 ? 0 : Math.max(0, winner.value);

    // ── UNRESOLVED VARIANCE — reported beside the figure, never folded into it ──────────────
    const openVariances = inputs.variances.filter((v) => v.resolutionKind == null);
    const unresolvedVarianceCents = openVariances.reduce((acc, v) => acc + Number(v.varianceCents), 0);

    return {
        chargeId: inputs.chargeId,
        currencyCode: inputs.currencyCode,
        outstandingCents,
        assignedResponsibilityCents,
        unassignedResponsibilityCents,
        expectedSubsidyCents,
        submittedClaimSuppressionCents,
        actualSubsidyReceivedCents,
        unresolvedVarianceCents,
        currentlyCollectibleCents: Math.max(0, outstandingCents - submittedClaimSuppressionCents),
        explanation: {
            grossCents: inputs.grossCents,
            reductionsCents: inputs.reductionsCents,
            netCents: inputs.netCents,
            appliedCents,
            suppressionBoundBy: submittedLines.length === 0 ? "none" : winner.kind,
            submittedClaimIds,
            openVarianceStates: [...new Set(openVariances.map((v) => v.state))],
        },
    };
}
