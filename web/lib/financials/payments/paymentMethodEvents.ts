/**
 * ONE ACCOUNT'S STORED METHODS CHANGED — told to every surface that is showing them.
 *
 * Payment methods and Autopay are SIBLING components on the Payments surface. Each reads
 * `/api/admin/financials/payment-methods` once, on mount, and neither has ever told the other
 * anything. So the operator who stored a card watched Payment methods refresh to
 * `visa •••• 4242 · Ready` while Autopay, mounted earlier and never notified, went on saying
 * "Add a usable payment method before setting up Autopay."
 *
 * Both sentences were produced correctly from the state each component held. That is what made it
 * a contradiction rather than a bug in either one: nothing was wrong with the predicate, the
 * resolver or the canonical row — the second surface simply never learned.
 *
 * Reloading the whole surface also fixed it, which is precisely why this was easy to miss in
 * testing and impossible to miss in use.
 *
 * ── WHY AN EVENT AND NOT LIFTED STATE ──
 *
 * Lifting the method list into `FinancialsCard` would put a W2 concern into a card that already
 * composes a dozen others, and would still leave every OTHER mounting of these sections
 * (Details, the account workspace) with the same staleness. The event travels to all of them and
 * keeps each section's own fetch as the single read — there is still exactly one authority, and
 * this only says WHEN to ask it again.
 */

/** Dispatched after a stored payment method is added, removed, or made default. */
export const FINANCIALS_PAYMENT_METHODS_CHANGED = "alloy:financials-payment-methods-changed" as const;

export type PaymentMethodsChangedDetail = {
    /** The account whose methods changed. A listener for another account must ignore it. */
    customerId: string;
};

export function announcePaymentMethodsChanged(customerId: string): void {
    if (typeof window === "undefined" || !customerId) return;
    window.dispatchEvent(
        new CustomEvent<PaymentMethodsChangedDetail>(FINANCIALS_PAYMENT_METHODS_CHANGED, {
            detail: { customerId },
        }),
    );
}

/**
 * Listen for changes to ONE account's methods. Returns its own unsubscribe.
 *
 * The customer filter is not an optimisation: two accounts can be open at once, and a surface that
 * refetched on somebody else's card would show a spinner for a change the operator cannot see.
 */
export function onPaymentMethodsChanged(customerId: string, handler: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const listener = (e: Event) => {
        const detail = (e as CustomEvent<PaymentMethodsChangedDetail>).detail;
        if (!detail || detail.customerId !== customerId) return;
        handler();
    };
    window.addEventListener(FINANCIALS_PAYMENT_METHODS_CHANGED, listener);
    return () => window.removeEventListener(FINANCIALS_PAYMENT_METHODS_CHANGED, listener);
}
