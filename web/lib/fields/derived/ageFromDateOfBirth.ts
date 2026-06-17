import type { DerivedAgeValue, DerivedFieldResult } from "@/lib/fields/derived/types";

function parseIsoDateOnly(value: string): { year: number; month: number; day: number } | null {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
}

function formatAgeYearsMonthsDisplay(years: number, months: number): string {
    if (years < 1) {
        return months === 1 ? "1 mo" : `${months} mos`;
    }
    const yrLabel = years === 1 ? "1 yr" : `${years} yrs`;
    const moLabel = months === 1 ? "1 mo" : `${months} mos`;
    return `${yrLabel} ${moLabel}`;
}

function computeAgeParts(
    dobIso: string,
    asOfDate: Date,
): DerivedAgeValue | null {
    const parsed = parseIsoDateOnly(dobIso);
    if (!parsed) return null;

    const asOfYear = asOfDate.getFullYear();
    const asOfMonth = asOfDate.getMonth() + 1;
    const asOfDay = asOfDate.getDate();

    let totalMonths = (asOfYear - parsed.year) * 12 + (asOfMonth - parsed.month);
    if (asOfDay < parsed.day) totalMonths -= 1;
    if (totalMonths < 0) return null;

    return {
        years: Math.floor(totalMonths / 12),
        months: totalMonths % 12,
    };
}

/**
 * Canonical platform age-from-DOB derivation.
 * DOB is source of truth; age is never persisted unless a consumer explicitly opts in.
 */
export function deriveAgeFromDateOfBirth(
    dobIso: string,
    asOfDate: Date = new Date(),
): DerivedFieldResult | null {
    const trimmed = dobIso.trim();
    if (!trimmed) return null;
    const value = computeAgeParts(trimmed, asOfDate);
    if (!value) return null;
    return {
        kind: "age_from_date_of_birth",
        value,
        display: formatAgeYearsMonthsDisplay(value.years, value.months),
        source_value: trimmed,
    };
}

/** @deprecated Prefer deriveAgeFromDateOfBirth — intake alias retained for transitional imports. */
export function calculateAgeFromDob(dobIso: string, asOfDate: Date = new Date()) {
    const derived = deriveAgeFromDateOfBirth(dobIso, asOfDate);
    if (!derived?.value) return null;
    return {
        value: derived.value,
        display: derived.display,
    };
}

export { formatAgeYearsMonthsDisplay };
