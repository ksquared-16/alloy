/**
 * THREAD 8C SLICE 2 — what a collection's state MEANS to an operator.
 *
 * The provider's vocabulary and the operator's are not the same, and the gap widened when ACH
 * arrived. `requires_action` meant one thing while every collection was a card — finish the bank's
 * challenge now — and means something else entirely when the provider is waiting on microdeposits
 * that take days. `processing` was a second on a card and is a multi-day state on a bank debit.
 *
 * ── WHY THIS IS A MODULE AND NOT COPY IN A COMPONENT ──
 *
 * The dangerous words are the ones that mean money. "Received" must be reachable only from
 * canonical recognition, and no arrangement of provider states may produce it — a component that
 * decides that inline will eventually decide it differently somewhere else. Deciding it once, here,
 * is what makes `processing ≠ paid` a property of the system rather than of a template.
 */

export type CollectionRail = "card" | "ach";

export type CollectionLifecycleState =
    /** Chosen but not yet asked for. */
    | "selected"
    /** The provider needs the payer to do something before it can proceed. */
    | "action_required"
    /** Specifically: the bank account is not verified yet. Days, not seconds. */
    | "verification_required"
    /** Asked, accepted, not settled. NOT money. */
    | "processing"
    /** The provider says it has the money; Financials has not recorded it yet. */
    | "finalizing"
    /** Canonical recognition happened. This is the only state that means money. */
    | "received"
    /** It failed before anything was recognised. No receipt exists. */
    | "failed"
    /** Recognised money the provider later took back. */
    | "returned"
    /** Withdrawn before it completed. */
    | "canceled";

export type LifecycleInput = {
    rail: CollectionRail;
    /** `payment_collection_attempts.processor_state`. */
    processorState: string;
    /** `payment_collection_attempts.provider_action_type`, when the provider named one. */
    providerActionType?: string | null;
    /** Whether Thread 8 has a receipt for this attempt. The only source of "received". */
    canonicallyRecognized: boolean;
    /** Whether a provider-initiated reversal has been recognised against that receipt. */
    providerReversed?: boolean;
};

/**
 * The one place a collection's state becomes a word.
 *
 * Order matters: a return outranks a receipt, and a receipt outranks anything the provider is still
 * doing, because money that arrived and then left is not "processing".
 */
export function collectionLifecycle(input: LifecycleInput): CollectionLifecycleState {
    if (input.providerReversed) return "returned";
    if (input.canonicallyRecognized) return "received";

    switch (input.processorState) {
        case "succeeded":
            /*
             * The provider has it and Financials has not recorded it yet. Named separately because
             * an operator told "failed" here would chase money that is not lost, and one told
             * "received" would be told a lie that only becomes true later.
             */
            return "finalizing";
        case "processing":
            return "processing";
        case "requires_action":
            // ACH's microdeposit wait is not a challenge anyone can complete right now.
            return input.providerActionType === "verify_with_microdeposits"
                ? "verification_required"
                : "action_required";
        case "requires_payment_method":
            /*
             * Two very different situations share this provider state: nothing has been supplied
             * yet, and a supplied method was refused. The attempt's own history tells them apart —
             * an ACH debit that came back `account_closed` has been tried and failed, while a fresh
             * intent simply has not been used. The failure detail is what distinguishes them, so a
             * caller that has one passes it and gets `failed`.
             */
            return "selected";
        case "failed":
            return "failed";
        case "canceled":
            return "canceled";
        case "initiated":
        default:
            return "selected";
    }
}

/** Operator-facing words. Never a provider status, never an internal enum. */
export function lifecycleLabel(state: CollectionLifecycleState, rail: CollectionRail): string {
    switch (state) {
        case "verification_required":
            return "Verification required";
        case "action_required":
            return "Action required";
        case "processing":
            return rail === "ach"
                // True without promising a date: ACH settlement is days and Alloy does not know which.
                ? "Processing — bank payments take a few days to settle"
                : "Processing";
        case "finalizing":
            return "Payment received — finalizing";
        case "received":
            return "Received";
        case "failed":
            return "Failed";
        case "returned":
            return "Returned by the bank";
        case "canceled":
            return "Canceled";
        case "selected":
        default:
            return rail === "ach" ? "Bank account selected" : "Card selected";
    }
}

/**
 * Whether this state means money exists in Thread 8.
 *
 * Exactly one state does. Everything the provider is still doing answers false, which is the
 * property the financial boundary depends on.
 */
export function meansSettledCash(state: CollectionLifecycleState): boolean {
    return state === "received";
}

/**
 * WHAT AN OPERATOR READS ABOUT A COLLECTION IN PROGRESS (Payments V1 · W3).
 *
 * Two short lines: what is happening, and what it is happening to. Both are composed HERE rather
 * than in a component, so the Focus Panel, the workspace and any future surface say the same thing —
 * and so no component is tempted to ask the provider for display metadata it can read off the
 * canonical Payment Method Reference.
 *
 * ── THE DATE IS A PROJECTION AND READS LIKE ONE ──
 *
 * "Processing · Expected Sep 24" says when the money is expected. It never says "Received", because
 * the only thing that means money is canonical recognition. When the provider offered no date the
 * line simply omits it — an absent expectation is not a reason to invent one, and the ACH label
 * already says settlement takes a few days without promising which.
 */
export function collectionPresentation(input: {
    state: CollectionLifecycleState;
    rail: CollectionRail;
    /** `payment_collection_attempts.expected_settlement_on`. Projection only. */
    expectedSettlementOn?: string | null;
    /** Safe display from the canonical Payment Method Reference. Never a provider reference. */
    methodBrand?: string | null;
    methodLast4?: string | null;
}): { statusLine: string; methodLine: string | null } {
    const base = lifecycleLabel(input.state, input.rail);

    /*
     * A date is only meaningful while the money is still on its way. Once it is received, returned,
     * failed or canceled, what was once expected is a distraction from what happened.
     */
    const dateIsUseful = input.state === "processing" || input.state === "finalizing";
    const expected = dateIsUseful ? formatExpected(input.expectedSettlementOn) : null;

    const statusLine = expected
        ? `${input.rail === "ach" ? "Processing" : base} · Expected ${expected}`
        : base;

    const name = input.methodBrand?.trim() || null;
    const last4 = input.methodLast4?.trim() || null;
    const methodLine = name || last4
        ? `${name ?? (input.rail === "ach" ? "Bank account" : "Card")}${last4 ? ` •••• ${last4}` : ""}`
        : null;

    return { statusLine, methodLine };
}

/** `2026-09-24` → `Sep 24`. Parsed as a plain day, never shifted by the reader's timezone. */
function formatExpected(value?: string | null): string | null {
    const raw = (value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y, m, d] = raw.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (!months[m - 1] || !Number.isFinite(d) || !Number.isFinite(y)) return null;
    return `${months[m - 1]} ${d}`;
}
