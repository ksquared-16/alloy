/**
 * Operator-facing Programs presentation — no keys, revisions, readiness, or publication language.
 */

export type ProgramAgeUnit = "years" | "months";

export type ProgramAudienceAge = {
    minimumAge?: number | null;
    maximumAge?: number | null;
    ageUnit?: ProgramAgeUnit | null;
};

function asFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function readAudienceAge(audience: Record<string, unknown> | null | undefined): ProgramAudienceAge {
    const record = audience && typeof audience === "object" ? audience : {};
    const unitRaw = typeof record.ageUnit === "string" ? record.ageUnit.trim().toLowerCase() : "";
    const ageUnit: ProgramAgeUnit | null =
        unitRaw === "months" ? "months" : unitRaw === "years" ? "years" : null;
    return {
        minimumAge: asFiniteNumber(record.minimumAge),
        maximumAge: asFiniteNumber(record.maximumAge),
        ageUnit,
    };
}

function formatBound(value: number, unit: ProgramAgeUnit, role: "min" | "max"): string {
    if (role === "min" && value === 0) {
        return unit === "months" ? "Birth" : "Birth";
    }
    if (unit === "months") {
        return value === 1 ? "1 month" : `${value} months`;
    }
    return value === 1 ? "1 year" : `${value} years`;
}

/**
 * Display age range for collection rows and detail.
 * Returns null when unspecified (callers omit the line rather than showing helper copy in rows).
 */
export function formatProgramAgeRange(audience: Record<string, unknown> | null | undefined): string | null {
    const { minimumAge, maximumAge, ageUnit } = readAudienceAge(audience);
    if (minimumAge == null && maximumAge == null) return null;
    const unit: ProgramAgeUnit =
        ageUnit ?? (maximumAge != null && maximumAge <= 24 && (minimumAge == null || minimumAge < 3) ? "months" : "years");

    if (minimumAge != null && maximumAge != null) {
        if (unit === "months" && minimumAge === 0) {
            return `Birth–${maximumAge} months`;
        }
        if (unit === "years") {
            return `${minimumAge}–${maximumAge} years`;
        }
        return `${formatBound(minimumAge, unit, "min")}–${formatBound(maximumAge, unit, "max")}`;
    }
    if (minimumAge != null) {
        if (minimumAge === 0) return unit === "months" ? "Birth+" : "Birth+";
        return `${formatBound(minimumAge, unit, "min")}+`;
    }
    return `Up to ${formatBound(maximumAge!, unit, "max")}`;
}

export function formatProgramAgeRangeDetail(
    audience: Record<string, unknown> | null | undefined,
): string {
    return formatProgramAgeRange(audience) ?? "Not specified";
}

export function formatAvailabilityCount(count: number): string {
    if (count <= 0) return "Not available at any Locations";
    if (count === 1) return "Available at 1 Location";
    return `Available at ${count} Locations`;
}

export function programLifecycleLabel(status: "active" | "retired" | string | null | undefined): "Active" | "Archived" {
    return status === "retired" ? "Archived" : "Active";
}

export function operatorProgramError(message: string): string {
    const trimmed = message.trim();
    if (!trimmed) return "We could not save this Program. Review the highlighted fields and try again.";
    if (/duplicate key|programs_org_key_unique|already exists/i.test(trimmed)) {
        const named = trimmed.match(/named\s+(.+?)\s+already/i);
        if (named?.[1]) return `A Program named ${named[1]} already exists.`;
        return "A Program with this name already exists. Choose a different name and try again.";
    }
    if (/program_retired|retired/i.test(trimmed) && /publish|available/i.test(trimmed)) {
        return "Archived Programs cannot be changed for new Locations. Restore the Program first.";
    }
    if (/foreign key|constraint|revision|publication|distribution|invariant|command/i.test(trimmed)) {
        return "We could not save this Program. Review the highlighted fields and try again.";
    }
    return trimmed
        .replace(/\b(program[_ ]?key|stable key|revision|publication|distribution|command)\b/gi, "Program")
        .replace(/\s+/g, " ")
        .trim();
}
