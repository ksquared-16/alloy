/**
 * ONE MAPPING FROM A BILLING-PERIOD REFUSAL TO AN HTTP ANSWER.
 *
 * `BillingPeriodBindingError` is thrown by a single canonical authority
 * (`resolveChargeBillingPeriodBinding`) and, until this module existed, was caught by nothing in
 * particular. Its fate at each route boundary was therefore an accident of whatever generic handler
 * that route happened to have — and the common one falls through to
 * `{ code: "internal_error" }, status 500`. So a household that simply needs a billing calendar
 * chosen produced an error that told the operator nothing was actionable, on a path they could not
 * retry, in vocabulary that is ours rather than theirs.
 *
 * The refusal doctrine is NOT changed here. The binder still refuses, for exactly the same reasons,
 * before any economic write. What changes is only how that refusal is presented.
 *
 * ── THE DISTINCTION THIS MODULE EXISTS TO MAKE ──
 *
 * Not every binding failure is the operator's to fix, and flattening them all to 409 would be the
 * mirror of the bug it replaces:
 *
 *   OPERATOR-RESOLVABLE → 409 Conflict. A configuration conflict: the household needs a billing
 *   calendar, or has two locations and no account calendar of its own. Someone with the right
 *   authority can resolve it, and the error already carries a sentence written for them.
 *
 *   INFRASTRUCTURE → 500. A read that failed. Nobody can resolve it by configuring anything, and
 *   its message is a raw database string — `error.message` straight off the client — which must not
 *   reach an operator. These are the only cases that stay 500, and their message is REPLACED rather
 *   than forwarded. That is a leak this module closes, not one it introduces: the previous
 *   fall-through returned the database's own text.
 *
 * Codes are listed explicitly rather than pattern-matched on substrings like `_read_failed`, so a
 * NEW code added to the binder is operator-resolvable only when someone decides it is. An unknown
 * code is treated as infrastructure — the safe default, because it cannot leak a message and cannot
 * promise an operator a fix that does not exist.
 */
import { BillingPeriodBindingError } from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";

/**
 * The refusals an authorised operator can actually clear, each already carrying a sentence in the
 * household's terms rather than the schema's.
 */
const OPERATOR_RESOLVABLE_CODES = new Set([
    /** Two locations, no account calendar of its own. The one the Director left deliberately unset. */
    "billing_calendar_ambiguous",
    /** A calendar exists but its configuration cannot be used. */
    "billing_calendar_invalid",
    /** No calendar reaches this household at all. */
    "billing_calendar_unconfigured",
    /** The calendar is usable but produced no period covering this date. */
    "period_not_materialized",
    /**
     * The charge does not reach a household. Resolvable by whoever owns the enrolment link, and
     * actionable — it names what could not be reached — so it is not an internal error either.
     */
    "customer_unresolved",
    /*
     * COMMERCIAL FINALITY. A closed period is a conflict rather than a fault: the operator asked
     * for something legitimate against a period that is finished, and the answer is actionable —
     * the work belongs in a later open period. 409 is the honest status, and it must never read as
     * an internal error, because nothing internal went wrong.
     */
    "billing_period_closed",
    /*
     * THE CORRECTION NAMES A CHARGE THAT IS NOT THERE. Actionable — the operator picked a source
     * and it no longer exists on this account, so choosing another is the fix — and the message
     * names what could not be found rather than carrying a database string. A 500 here would tell
     * an operator nothing went wrong that they could act on, when in fact everything did.
     */
    "correction_source_not_found",
]);

/**
 * INFRASTRUCTURE CODES WITH THEIR OWN TRUE SENTENCE.
 *
 * The default infrastructure message speaks about the billing period, which is right for the three
 * reads the binder itself does. The correction resolver reaches two more authorities, and telling
 * an operator "the billing period could not be read" when responsibility was the thing that failed
 * is a confident statement about the wrong subject. Same 500, same rule that the message is ours —
 * only accurate about which read failed.
 */
const INFRASTRUCTURE_MESSAGES: Record<string, { code: string; message: string }> = {
    responsibility_unresolved: {
        code: "responsibility_unavailable",
        message: "Who is responsible for this account could not be read, so this correction cannot say who would owe it. Nothing was written. Try again.",
    },
    source_read_failed: {
        code: "correction_source_unavailable",
        message: "The charge this correction refers to could not be read. Nothing was written. Try again.",
    },
};

export type BillingPeriodBindingHttpAnswer = {
    status: number;
    /** Stable, machine-readable, and never `internal_error` for a resolvable conflict. */
    code: string;
    /** Business language. For infrastructure codes this is OURS, never the database's. */
    message: string;
    /** Present only when the operator can act; omitted for infrastructure. */
    detail?: Record<string, unknown>;
};

export function isOperatorResolvableBindingCode(code: string): boolean {
    return OPERATOR_RESOLVABLE_CODES.has(code.trim());
}

/**
 * The canonical answer for one billing-period refusal.
 *
 * Returns `null` for anything that is not a `BillingPeriodBindingError`, so a caller can keep its
 * existing handling for everything else and add this as one branch rather than restructuring.
 */
export function billingPeriodBindingHttpAnswer(
    error: unknown,
): BillingPeriodBindingHttpAnswer | null {
    if (!(error instanceof BillingPeriodBindingError)) return null;

    if (isOperatorResolvableBindingCode(error.code)) {
        return {
            status: 409,
            code: error.code,
            message: error.message,
            detail: error.detail,
        };
    }

    /*
     * Infrastructure. The message is replaced, not forwarded: `agreement_read_failed`,
     * `member_read_failed` and `period_read_failed` all carry a raw PostgREST string.
     */
    const named = INFRASTRUCTURE_MESSAGES[error.code.trim()];
    if (named) return { status: 500, code: named.code, message: named.message };
    return {
        status: 500,
        code: "billing_period_unavailable",
        message: "The household's billing period could not be read. Nothing was written. Try again.",
    };
}
