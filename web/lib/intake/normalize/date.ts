export const INTAKE_ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

export const INTAKE_US_DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;

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

/** Parse common DOB/date strings to canonical YYYY-MM-DD. */
export function parseFlexibleDate(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const isoExact = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (isoExact?.[1]) return isoExact[1];

    const isoEmbedded = trimmed.match(INTAKE_ISO_DATE_RE);
    if (isoEmbedded?.[1]) return isoEmbedded[1];

    const numeric = parseNumericDate(trimmed);
    if (numeric) return numeric;

    const named = parseNamedMonthDate(trimmed);
    if (named) return named;

    return null;
}

/** Platform display format for ISO dates (MM/DD/YYYY). */
export function formatIsoDateForDisplay(iso: string): string {
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return iso;
    return `${match[2]}/${match[3]}/${match[1]}`;
}

/** Find a date token inside free text (first match). */
export function findDateInText(text: string): { raw: string; normalized: string | null } | null {
    const iso = text.match(INTAKE_ISO_DATE_RE);
    if (iso?.[0]) {
        return { raw: iso[0], normalized: iso[1] ?? null };
    }

    const us = text.match(INTAKE_US_DATE_RE);
    if (us?.[0]) {
        return { raw: us[0], normalized: parseFlexibleDate(us[0]) };
    }

    const named =
        text.match(
            /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/i,
        ) ?? text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{2,4})\b/i);
    if (named?.[0]) {
        return { raw: named[0], normalized: parseFlexibleDate(named[0]) };
    }

    return null;
}

/** DOB in parentheses, e.g. (06/06/2024 DOB) or (Feb 2 2024 DOB). */
export function findDobInParens(text: string): { raw: string; normalized: string | null } | null {
    const numeric = text.match(/\(([^)]*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}[^)]*DOB[^)]*)\)/i);
    if (numeric?.[1]) {
        const dateToken = numeric[1].replace(/\s*DOB\s*/i, " ").trim();
        return { raw: dateToken, normalized: parseFlexibleDate(dateToken) };
    }

    const named = text.match(/\(([^)]*[A-Za-z]{3,}[^)]*DOB[^)]*)\)/i);
    if (named?.[1]) {
        const dateToken = named[1].replace(/\s*DOB\s*/i, " ").trim();
        return { raw: dateToken, normalized: parseFlexibleDate(dateToken) };
    }

    return null;
}
