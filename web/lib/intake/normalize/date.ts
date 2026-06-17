export const INTAKE_ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

export const INTAKE_US_DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/;

/** Parse ISO or US-style date strings to YYYY-MM-DD. */
export function parseFlexibleDate(raw: string): string | null {
    const trimmed = raw.trim();
    const iso = trimmed.match(INTAKE_ISO_DATE_RE);
    if (iso) return iso[1] ?? null;
    const us = trimmed.match(INTAKE_US_DATE_RE);
    if (!us) return null;
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year = Number(us[3]);
    if (year < 100) year += 2000;
    if (!month || !day || !year) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
    return null;
}

/** DOB in parentheses, e.g. (06/06/2024 DOB). */
export function findDobInParens(text: string): { raw: string; normalized: string | null } | null {
    const match = text.match(/\((\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*DOB\)/i);
    if (!match?.[1]) return null;
    return { raw: match[1], normalized: parseFlexibleDate(match[1]) };
}
