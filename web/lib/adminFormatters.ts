/**
 * Shared formatting helpers for admin portal.
 * Use these for consistent date and currency display in tables and drawers.
 */

const usdOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
};

/** Format a value stored in cents as USD (value/100). */
export function formatMoneyFromCents(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num / 100);
}

/** Format a value already in dollars as USD (no conversion). */
export function formatMoneyFromDollars(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    return new Intl.NumberFormat("en-US", usdOptions).format(num);
}

/**
 * Format a value as USD.
 * Only treats as cents when fieldName ends with _cents (no special-case for quote_total etc).
 */
export function formatMoney(
    value: number | string | null | undefined,
    fieldName?: string
): string {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    const isCents = fieldName?.endsWith("_cents") ?? false;
    const dollars = isCents ? num / 100 : num;
    return new Intl.NumberFormat("en-US", usdOptions).format(dollars);
}

/** Display as MM/DD/YYYY (local date only). */
export function formatDate(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
    }).format(d as Date);
}

/** Display as MM/DD/YYYY, h:mm A (local date-time). */
export function formatDateTime(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(d as Date);
}
