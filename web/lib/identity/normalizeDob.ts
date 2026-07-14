/**
 * Canonical date-of-birth normalization (Decision C).
 * Output form is ISO `YYYY-MM-DD`. Invalid / empty → null.
 */

const MONTH_BY_NAME: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
};

function expandTwoDigitYear(year: number): number {
    if (year >= 100) return year;
    return year >= 50 ? 1900 + year : 2000 + year;
}

function toIsoDate(year: number, month: number, day: number): string | null {
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
        probe.getUTCFullYear() !== year ||
        probe.getUTCMonth() !== month - 1 ||
        probe.getUTCDate() !== day
    ) {
        return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNumericDate(raw: string): string | null {
    const match = raw.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = expandTwoDigitYear(Number(match[3]));
    return toIsoDate(year, month, day);
}

function parseNamedMonthDate(raw: string): string | null {
    const cleaned = raw.trim().replace(/,/g, " ").replace(/\s+/g, " ");

    const monthFirst = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{2,4})$/i);
    if (monthFirst) {
        const month = MONTH_BY_NAME[monthFirst[1]!.toLowerCase()];
        if (month) {
            return toIsoDate(expandTwoDigitYear(Number(monthFirst[3])), month, Number(monthFirst[2]));
        }
    }

    const dayFirst = cleaned.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{2,4})$/i);
    if (dayFirst) {
        const month = MONTH_BY_NAME[dayFirst[2]!.toLowerCase()];
        if (month) {
            return toIsoDate(expandTwoDigitYear(Number(dayFirst[3])), month, Number(dayFirst[1]));
        }
    }

    return null;
}

/**
 * Parse common DOB/date strings to canonical `YYYY-MM-DD`.
 * Accepts ISO, US numeric, and named-month forms (parity with intake `parseFlexibleDate`).
 */
export function normalizeDob(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const isoExact = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (isoExact?.[1]) return isoExact[1];

    const isoEmbedded = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoEmbedded?.[1]) return isoEmbedded[1];

    const numeric = parseNumericDate(trimmed);
    if (numeric) return numeric;

    const named = parseNamedMonthDate(trimmed);
    if (named) return named;

    return null;
}
