/**
 * Focus Panel date display — Alloy presentation date doctrine.
 *
 * Operator surfaces: human-readable dates (`Mar 3, 2020`), never raw ISO / MM/DD/YYYY.
 * Child DOB pairs formatted date with derived age when useful.
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

/** Format any Focus Panel date field for display. Returns null when empty/unparseable. */
export function formatFocusPanelDate(value: unknown): string | null {
    const raw = trimOrNull(value);
    if (!raw) return null;
    const formatted = formatDisplayDate(raw);
    return trimOrNull(formatted) || raw;
}

/**
 * Child birth date line: `Mar 3, 2020 · 6y` when both known.
 * Prefers age derived from DOB over a raw age string.
 */
export function formatFocusPanelDobAgeLine(
    dob: unknown,
    ageFallback?: unknown,
    asOfDate: Date = new Date(),
): string | null {
    const dobRaw = trimOrNull(dob);
    const dobLabel = formatFocusPanelDate(dobRaw);
    const isoForAge = dobRaw && /^\d{4}-\d{2}-\d{2}/.test(dobRaw) ? dobRaw.slice(0, 10) : null;
    const derivedAge = isoForAge ? formatAgeFromDateOfBirthIso(isoForAge, "years", asOfDate) : null;
    const ageLabel = derivedAge ?? trimOrNull(ageFallback);
    if (dobLabel && ageLabel) return `${dobLabel} · ${ageLabel}`;
    return dobLabel ?? ageLabel;
}
