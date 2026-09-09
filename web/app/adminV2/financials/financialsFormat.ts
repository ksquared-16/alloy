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

export function shortDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
