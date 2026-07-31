/**
 * Focus Panel date display — Alloy presentation date doctrine.
 *
 * Operator surfaces: human-readable dates (`Mar 3, 2020`) for general date fields.
 * Child DOB fields use numeric `M/D/YYYY (compactAge)` — e.g. `1/1/2026 (7m)`, `3/3/2020 (6y4m)`.
 *
 * @see docs/system/typography-and-presentation-doctrine.md
 * @see docs/system/queue-record-doctrine.md (Date doctrine)
 */

import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import { formatAgeFromDateOfBirthIso } from "@/lib/fields/derived/ageFromDateOfBirth";

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Compact stored age strings (`2y 4m` → `2y4m`) for DOB pairing. */
function compactAgeLabel(value: string): string {
    return value.replace(/\s+/g, "");
}

/** Numeric DOB for operator display: `3/3/2020` from ISO date-only. */
function formatDobNumericSlash(value: string): string | null {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (iso) {
        return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
    }
    return formatFocusPanelDate(value);
}

/** Format any Focus Panel date field for display. Returns null when empty/unparseable. */
export function formatFocusPanelDate(value: unknown): string | null {
    const raw = trimOrNull(value);
    if (!raw) return null;
    const formatted = formatDisplayDate(raw);
    return trimOrNull(formatted) || raw;
}

/**
 * Child birth date line: `3/3/2020 (6y4m)` when both known.
 * Prefers age derived from DOB (years + months compact) over a raw age string.
 */
export function formatFocusPanelDobAgeLine(
    dob: unknown,
    ageFallback?: unknown,
    asOfDate: Date = new Date(),
): string | null {
    const dobRaw = trimOrNull(dob);
    const dobLabel = dobRaw ? formatDobNumericSlash(dobRaw) : null;
    const isoForAge = dobRaw && /^\d{4}-\d{2}-\d{2}/.test(dobRaw) ? dobRaw.slice(0, 10) : null;
    const derivedAge = isoForAge ? formatAgeFromDateOfBirthIso(isoForAge, "years_months", asOfDate) : null;
    const ageLabel = derivedAge ?? (() => {
        const fallback = trimOrNull(ageFallback);
        return fallback ? compactAgeLabel(fallback) : null;
    })();
    if (dobLabel && ageLabel) return `${dobLabel} (${ageLabel})`;
    return dobLabel ?? ageLabel;
}
