import {
    billingPeriodFor,
    billingRecurrenceFor,
    isPeriodBillableCadence,
    type BillingCadence,
    type BillingPeriod,
} from "@/lib/financials/billingPeriod";

/**
 * WHAT COMMERCIAL PERIOD DOES THIS FREQUENCY CREATE?
 *
 * A configuration-screen preview, so an operator choosing a cadence can see the intervals it will
 * produce before anything is agreed or billed. It is EXPLANATORY: it derives nothing of its own.
 *
 * ── THIS IS NOT A SECOND PERIOD CALCULATOR ────────────────────────────────────────────────────
 *
 * Every interval below comes from `billingPeriodFor`, the same function tuition generation, the
 * Assignment read-back and the ledger's period placement all call. The reason to route the preview
 * through it rather than describe periods in prose is that prose cannot be wrong quietly: a screen
 * that said "7-day periods from the start" would keep saying it after the derivation changed, and
 * the operator would configure against a sentence instead of the product.
 *
 * ── AND IT REFUSES TO INVENT ──────────────────────────────────────────────────────────────────
 *
 * A cadence the platform cannot derive periods for gets NO periods here — not a plausible-looking
 * six-month interval. `isPeriodBillableCadence` is the same gate generation uses to refuse the run,
 * so configuration and execution give the operator the same answer.
 */

export type BillingPeriodPreview = {
    cadenceKey: string;
    /** True only when the platform can actually derive periods for this cadence. */
    billable: boolean;
    /** The derivation authority's own sentence, or why there are no periods. */
    recurrence: string;
    /** The anchor the preview reasoned from — stated, because the intervals depend on it. */
    anchorYmd: string;
    current: BillingPeriod | null;
    next: BillingPeriod | null;
};

export function previewBillingPeriods(args: {
    cadenceKey: string;
    /** The agreement start a real relationship would anchor to. */
    anchorYmd: string;
    /** The day "current" is judged from. Passed in so the preview is testable and not clock-bound. */
    todayYmd: string;
}): BillingPeriodPreview {
    const cadenceKey = (args.cadenceKey ?? "").trim();
    const recurrence = billingRecurrenceFor(cadenceKey);

    if (!isPeriodBillableCadence(cadenceKey)) {
        /*
         * An authored cadence the platform cannot derive periods for must not look normally
         * billable. It keeps its configuration and its name; what it does not get is an invented
         * interval that would read as a schedule somebody could rely on.
         */
        return {
            cadenceKey,
            billable: false,
            recurrence: recurrence.recurrence,
            anchorYmd: args.anchorYmd,
            current: null,
            next: null,
        };
    }

    const cadence = cadenceKey as BillingCadence;
    const current = billingPeriodFor(cadence, args.anchorYmd, args.todayYmd);
    /* The next interval is the one containing the day after this one ends — asked, never added. */
    const next = billingPeriodFor(cadence, args.anchorYmd, addDay(current.end));

    return {
        cadenceKey,
        billable: true,
        recurrence: recurrence.recurrence,
        anchorYmd: args.anchorYmd,
        current,
        next,
    };
}

/** One day after `ymd`, as a date and not as string arithmetic. */
function addDay(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const at = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
    at.setUTCDate(at.getUTCDate() + 1);
    return at.toISOString().slice(0, 10);
}
