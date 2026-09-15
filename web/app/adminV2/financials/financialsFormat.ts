import { formatQueueRowDateCompact } from "@/lib/presentation/presentationDateFormat";

/**
 * Presentation helpers. Formatting only — nothing here decides what a number means.
 *
 * Every figure reaching these functions was already computed, scoped and bounded by a server
 * projection. A helper that summed, netted or defaulted a money value would be doing financial
 * work in the browser, where nothing can certify it.
 */

/** Cents to the operator's currency. The only money formatting in the workspace. */
export function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 0,
    });
}

/** Cents to currency, keeping the cents. Used where exactness matters more than density. */
export function moneyExact(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

/** A signed figure that must READ as signed — a variance is not a magnitude. */
export function signedMoney(cents: number, currency: string): string {
    const formatted = moneyExact(Math.abs(cents), currency);
    if (cents === 0) return formatted;
    return `${cents < 0 ? "−" : "+"}${formatted}`;
}

/**
 * EVERY OPERATOR-FACING FINANCIALS DATE, THROUGH THE PLATFORM'S OWN RULE.
 *
 * Financials had a private `toLocaleDateString` here and raw ISO strings in five other places, so a
 * ledger row read `2026-12-01` beside a payment that read `Sep 14`. The presentation doctrine
 * already owns this — "Never `YYYY-MM-DD` or `MM-DD-YYYY` on operator surfaces" — and
 * `formatQueueRowDateCompact` is its compact form: `Dec 1` within the current year, `Jun 22, 2026`
 * when the year is doing work. That is exactly what a dense financial ledger wants, and it is the
 * same helper the rest of Alloy's queues use, so the two cannot drift apart again.
 *
 * Presentation only. The ISO value stays the value; this decides how it is read aloud.
 */
export function shortDate(iso: string | null | undefined): string {
    const formatted = formatQueueRowDateCompact(iso ?? null);
    return formatted || "—";
}
