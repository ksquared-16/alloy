import { normalizeDobCompat } from "@/lib/identity";

export const INTAKE_ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

export const INTAKE_US_DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;

/** Parse common DOB/date strings to canonical YYYY-MM-DD. */
export function parseFlexibleDate(raw: string): string | null {
    return normalizeDobCompat(raw);
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
