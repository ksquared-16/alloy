/**
 * ── WHAT THE OPERATOR IS TOLD WHEN A FINANCIALS COMMAND REFUSES ────────────────────────────────
 *
 * Most canonical refusals already carry a sentence: `hold_not_refundable` arrives as "This deposit
 * was taken as non-refundable, so it cannot be refunded." Those are left exactly as they are — the
 * domain is the author of its own refusals and this module has no business rewriting them.
 *
 * What it exists for is the other kind. `resolveChargeFromTemplate` answers `{ error: "…" }` with a
 * MACHINE TOKEN, `charge.add` hands the first one up as its error, and the card renders it. Measured
 * on deployed staging: adding a tuition charge for a child with no service period put the words
 *
 *     missing_service_period
 *
 * in front of an operator, in a role=alert, with nothing said about what to do.
 *
 * THIS IS NOT AN ERROR FRAMEWORK. It is a translation table for the tokens the Financials command
 * path can actually produce, plus one honest fallback. A token nobody has written a sentence for
 * still gets a sentence — one that says something happened and names the code for whoever reads the
 * logs — rather than either the raw token or "Something went wrong", which throws away the only
 * useful thing the refusal carried.
 *
 * THE CODE IS NEVER LOST. It is diagnostic, it belongs in evidence, and callers keep it: this
 * returns operator copy and does not touch what is recorded.
 */

/** A machine token: lowercase, underscore-joined, no sentence in it. */
const MACHINE_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/**
 * The tokens the Financials command path can put in front of an operator, and what each of them
 * means to the person reading it. Each sentence says what is true and what would change it.
 */
const OPERATOR_COPY: Readonly<Record<string, string>> = Object.freeze({
    missing_service_period:
        "This charge is billed for a service period, and this child has none in scope. "
        + "Add or correct the placement that covers the period before charging it.",
    missing_event_date:
        "This charge is billed on the day it happened, so it needs a date. Enter the date the "
        + "charge occurred and try again.",
    unknown_occurs_strategy:
        "This charge type does not say when it should be billed, so the charge cannot be dated. "
        + "Its template needs to be configured before it can be used.",
    template_inactive:
        "This charge type is not active, so it cannot be charged. Activate it, or choose another "
        + "type.",
    template_retired:
        "This charge type has been retired and cannot be charged. Choose a current type.",
    template_not_yet_effective:
        "This charge type does not take effect until a later date, so it cannot be charged yet.",
    missing_charge_template:
        "This charge type could not be found. It may have been removed since this form was opened.",
    charge_settled: "This charge is already settled, so there is nothing left to take.",
    charge_not_owed: "Nothing is currently owed on this charge.",
    charge_unavailable: "This charge cannot be acted on right now.",
    not_writable: "This charge cannot be written as it stands.",
    db_error: "The change could not be saved. Nothing was recorded.",
});

/**
 * Operator copy for a refusal.
 *
 * A message the domain already wrote in words wins — it knows more about its own refusal than any
 * table here. A machine token is translated, or, unrecognised, stated honestly with its code kept
 * visible so the operator can quote it.
 */
export function operatorRefusal(
    message: string | null | undefined,
    fallback = "The command was refused.",
): string {
    const raw = (message ?? "").trim();
    if (!raw) return fallback;

    const known = OPERATOR_COPY[raw];
    if (known) return known;

    /* Already a sentence — the domain's own words, left alone. */
    if (!MACHINE_TOKEN.test(raw)) return raw;

    /*
     * An untranslated token. Saying "Something went wrong" would discard the one fact the refusal
     * carried, and printing the token alone is what this module exists to stop. So: a sentence,
     * with the code where someone can read it back to support.
     */
    return `${fallback} The system reported "${raw}".`;
}

/** Whether a message would reach an operator as machine vocabulary. Used by the regression. */
export function isMachineVocabulary(message: string | null | undefined): boolean {
    const raw = (message ?? "").trim();
    return Boolean(raw) && MACHINE_TOKEN.test(raw) && !(raw in OPERATOR_COPY);
}

/** The tokens this module has operator copy for. */
export const TRANSLATED_REFUSAL_CODES: readonly string[] = Object.freeze(Object.keys(OPERATOR_COPY));
