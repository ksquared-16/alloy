/**
 * Shared formatting helpers for admin portal.
 * Use these for consistent date and currency display in tables and drawers.
 */

/**
 * Format a value as USD.
 * - If fieldName ends with _cents or is quote_total, value is treated as cents (value/100).
 * - If value is numeric and not a cents field, treat as dollars (display as-is with 2 decimals).
 * - If value is string (e.g. "232.50"), display as USD.
 */
export function formatMoney(
    value: number | string | null | undefined,
    fieldName?: string
): string {
    if (value === null || value === undefined) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "-";
    const isCents = fieldName?.endsWith("_cents") || fieldName === "quote_total" || false;
    const dollars = isCents ? num / 100 : num;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(dollars);
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
