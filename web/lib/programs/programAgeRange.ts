/**
 * Program age boundaries — value + unit per bound, with legacy audience compat.
 */

export type ProgramAgeUnit = "weeks" | "months" | "years";

export type ProgramAgeBoundary = {
    value: number;
    unit: ProgramAgeUnit;
};

export type ProgramAgeRange = {
    minimum: ProgramAgeBoundary | null;
    maximum: ProgramAgeBoundary | null;
};

const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

function asFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function parseUnit(value: unknown): ProgramAgeUnit | null {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (raw === "weeks" || raw === "week") return "weeks";
    if (raw === "months" || raw === "month") return "months";
    if (raw === "years" || raw === "year") return "years";
    return null;
}

function readBoundary(raw: unknown, legacyValue: unknown, legacyUnit: ProgramAgeUnit | null): ProgramAgeBoundary | null {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
        const record = raw as Record<string, unknown>;
        const value = asFiniteNumber(record.value);
        const unit = parseUnit(record.unit) ?? legacyUnit ?? "years";
        if (value == null || value < 0) return null;
        return { value, unit };
    }
    const value = asFiniteNumber(legacyValue);
    if (value == null || value < 0) return null;
    return { value, unit: legacyUnit ?? "years" };
}

/** Read structured age range from Program audience jsonb (supports legacy flat fields). */
export function readProgramAgeRange(audience: Record<string, unknown> | null | undefined): ProgramAgeRange {
    const record = audience && typeof audience === "object" ? audience : {};
    const legacyUnit = parseUnit(record.ageUnit);
    return {
        minimum: readBoundary(record.minimum, record.minimumAge, legacyUnit),
        maximum: readBoundary(record.maximum, record.maximumAge, legacyUnit),
    };
}

/** Persist shape written into audience jsonb. */
export function writeProgramAgeAudience(range: ProgramAgeRange): Record<string, unknown> {
    const audience: Record<string, unknown> = {};
    if (range.minimum) {
        audience.minimum = range.minimum;
        audience.minimumAge = range.minimum.value;
    }
    if (range.maximum) {
        audience.maximum = range.maximum;
        audience.maximumAge = range.maximum.value;
    }
    // Legacy shared unit when both share a unit — keeps older readers roughly aligned.
    if (range.minimum && range.maximum && range.minimum.unit === range.maximum.unit) {
        audience.ageUnit = range.minimum.unit;
    } else if (range.minimum) {
        audience.ageUnit = range.minimum.unit;
    } else if (range.maximum) {
        audience.ageUnit = range.maximum.unit;
    }
    return audience;
}

export function normalizeProgramAgeBoundaryToDays(boundary: ProgramAgeBoundary | null | undefined): number | null {
    if (!boundary) return null;
    if (boundary.unit === "weeks") return boundary.value * DAYS_PER_WEEK;
    if (boundary.unit === "months") return boundary.value * DAYS_PER_MONTH;
    return boundary.value * DAYS_PER_YEAR;
}

export function validateProgramAgeRange(range: ProgramAgeRange): string | null {
    if (range.minimum && range.minimum.value < 0) return "Minimum age cannot be negative.";
    if (range.maximum && range.maximum.value < 0) return "Maximum age cannot be negative.";
    const minDays = normalizeProgramAgeBoundaryToDays(range.minimum);
    const maxDays = normalizeProgramAgeBoundaryToDays(range.maximum);
    if (minDays != null && maxDays != null && maxDays < minDays) {
        return "Maximum age must be the same as or older than minimum age.";
    }
    return null;
}

function formatBoundary(boundary: ProgramAgeBoundary): string {
    const { value, unit } = boundary;
    if (value === 0) return "Birth";
    if (unit === "weeks") return value === 1 ? "1 week" : `${value} weeks`;
    if (unit === "months") return value === 1 ? "1 month" : `${value} months`;
    return value === 1 ? "1 year" : `${value} years`;
}

/**
 * Compact age display. Same-unit pairs collapse: `3–5 years`.
 * Mixed units keep both unit labels: `6 weeks–12 months`.
 */
export function formatProgramAgeRange(audience: Record<string, unknown> | null | undefined): string | null {
    const range = readProgramAgeRange(audience);
    if (!range.minimum && !range.maximum) return null;
    if (range.minimum && range.maximum) {
        if (range.minimum.unit === range.maximum.unit) {
            if (range.minimum.value === 0) {
                return `Birth–${formatBoundary(range.maximum)}`;
            }
            // Collapse same-unit pairs unless either bound needs a singular unit label.
            if (range.minimum.value !== 1 && range.maximum.value !== 1) {
                const unitLabel =
                    range.minimum.unit === "weeks" ? "weeks"
                    : range.minimum.unit === "months" ? "months"
                    : "years";
                return `${range.minimum.value}–${range.maximum.value} ${unitLabel}`;
            }
        }
        return `${formatBoundary(range.minimum)}–${formatBoundary(range.maximum)}`;
    }
    if (range.minimum) {
        if (range.minimum.value === 0) return "From birth";
        return `From ${formatBoundary(range.minimum)}`;
    }
    return `Up to ${formatBoundary(range.maximum!)}`;
}

export function formatProgramAgeRangeDetail(
    audience: Record<string, unknown> | null | undefined,
): string {
    return formatProgramAgeRange(audience) ?? "Not specified";
}

export function compareProgramAgeRanges(
    a: Record<string, unknown> | null | undefined,
    b: Record<string, unknown> | null | undefined,
    direction: "asc" | "desc",
): number {
    const aDays = normalizeProgramAgeBoundaryToDays(readProgramAgeRange(a).minimum);
    const bDays = normalizeProgramAgeBoundaryToDays(readProgramAgeRange(b).minimum);
    const missing = direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const left = aDays ?? missing;
    const right = bDays ?? missing;
    return direction === "asc" ? left - right : right - left;
}
