export type IntakeAgeValue = {
    years: number;
    months: number;
};

export type IntakeCalculatedAge = {
    value: IntakeAgeValue;
    display: string;
};

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

function formatAgeDisplay(years: number, months: number): string {
    if (years < 1) {
        return months === 1 ? "1 mo" : `${months} mos`;
    }
    const yrLabel = years === 1 ? "1 yr" : `${years} yrs`;
    const moLabel = months === 1 ? "1 mo" : `${months} mos`;
    return `${yrLabel} ${moLabel}`;
}

/** Calculate age in years/months from an ISO date-only DOB. */
export function calculateAgeFromDob(dob: string, asOfDate: Date = new Date()): IntakeCalculatedAge | null {
    const parsed = parseIsoDateOnly(dob);
    if (!parsed) return null;

    const asOfYear = asOfDate.getFullYear();
    const asOfMonth = asOfDate.getMonth() + 1;
    const asOfDay = asOfDate.getDate();

    let months = (asOfYear - parsed.year) * 12 + (asOfMonth - parsed.month);
    if (asOfDay < parsed.day) months -= 1;
    if (months < 0) return null;

    const years = Math.floor(months / 12);
    const remMonths = months % 12;

    return {
        value: { years, months: remMonths },
        display: formatAgeDisplay(years, remMonths),
    };
}
