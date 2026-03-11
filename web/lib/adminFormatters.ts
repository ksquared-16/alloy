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

/**
 * Format payout_percent for display. Stored as decimal (0.7) -> show 70%.
 * If value is already 1–100, show as-is with %.
 */
export function formatPayoutPercent(value: number | string | null | undefined | unknown): string {
    if (value === null || value === undefined) return "—";
    const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return "—";
    const display = n > 0 && n <= 1 ? n * 100 : n;
    return `${display}%`;
}

/** Display as MM/DD/YYYY. Uses UTC so server and client output match (avoids hydration #418). */
export function formatDate(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) return "-";
    const d = typeof value === "object" ? value : new Date(value);
    if (Number.isNaN((d as Date).getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(d as Date);
}

/** Format subscription cadence + interval as label, e.g. "Every 1 week", "Every 2 weeks", "Every 3 months". */
export function formatFrequencyLabel(cadence: string | null | undefined, interval: number | string | null | undefined): string {
    const c = (cadence ?? "month").toLowerCase();
    const n = Math.max(1, Number(interval) || 1);
    if (c === "week") return n === 1 ? "Every 1 week" : `Every ${n} weeks`;
    return n === 1 ? "Every 1 month" : `Every ${n} months`;
}

/** Format US phone for display: (541) 654-3217. Accepts E.164, digits-only, or already formatted. */
export function formatPhoneUS(value: string | null | undefined): string {
    if (value == null || value === "") return "—";
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 10) return String(value);
    const area = digits.slice(-10, -7);
    const mid = digits.slice(-7, -4);
    const last = digits.slice(-4);
    return `(${area}) ${mid}-${last}`;
}

/** Display as MM/DD/YYYY, h:mm A. Uses UTC so server and client output match (avoids hydration #418). */
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
        timeZone: "UTC",
    }).format(d as Date);
}

/** Recurrence unit values for dropdowns (stored lowercase). */
export const RECURRENCE_UNIT_OPTIONS = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "quarter", label: "Quarter" },
    { value: "year", label: "Year" },
] as const;

/**
 * Format (recurrence_unit, recurrence_interval) for display.
 * e.g. week/1 → "Weekly", month/1 → "Monthly", quarter/1 → "Quarterly", year/1 → "Annually".
 */
export function formatRecurrenceLabel(unit: string | null, interval: number | null): string | null {
    if (!unit || interval == null || interval < 1) return null;
    const i = Math.max(1, Number(interval) || 1);
    const u = unit.toLowerCase();
    if (u === "day" && i === 1) return "Daily";
    if (u === "day") return `Every ${i} days`;
    if (u === "week" && i === 1) return "Weekly";
    if (u === "week") return `Every ${i} weeks`;
    if (u === "month" && i === 1) return "Monthly";
    if (u === "month") return `Every ${i} months`;
    if (u === "quarter" && i === 1) return "Quarterly";
    if (u === "quarter") return `Every ${i} quarters`;
    if (u === "year" && i === 1) return "Annually";
    if (u === "year") return `Every ${i} years`;
    return `${i} ${u}(s)`;
}
