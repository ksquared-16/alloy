/**
 * Operator-facing Programs presentation — no keys, revisions, readiness, or publication language.
 */

export type { ProgramAgeUnit } from "@/lib/programs/programAgeRange";
export {
    formatProgramAgeRange,
    formatProgramAgeRangeDetail,
    readProgramAgeRange,
    writeProgramAgeAudience,
    validateProgramAgeRange,
    compareProgramAgeRanges,
    normalizeProgramAgeBoundaryToDays,
} from "@/lib/programs/programAgeRange";

export {
    formatProgramCollectionAvailabilitySummary,
    deriveLocationProgramAvailabilityStatus,
    buildLocationProgramAvailabilityView,
} from "@/lib/programs/locationProgramAvailability";

export function programLifecycleLabel(status: "active" | "retired" | string | null | undefined): "Active" | "Archived" {
    return status === "retired" ? "Archived" : "Active";
}

export function operatorProgramError(message: string): string {
    const trimmed = message.trim();
    if (!trimmed) return "We could not save this Program. Try again.";
    if (/active enrollments|cannot be removed from/i.test(trimmed)) {
        return trimmed;
    }
    if (/duplicate key|programs_org_key_unique|already exists/i.test(trimmed)) {
        const named = trimmed.match(/named\s+(.+?)\s+already/i);
        if (named?.[1]) return `A Program named ${named[1]} already exists.`;
        return "A Program with this name already exists. Choose a different name and try again.";
    }
    if (/program_retired|retired/i.test(trimmed) && /publish|available/i.test(trimmed)) {
        return "Archived Programs cannot be changed for new Locations. Restore the Program first.";
    }
    if (/foreign key|violates.*constraint|constraint.*violat/i.test(trimmed)) {
        return "This Program is still in use and cannot be fully removed. It can be marked Not offered instead.";
    }
    if (/revision|publication|distribution|invariant|command/i.test(trimmed)) {
        return "We could not save this Program. Try again.";
    }
    return trimmed
        .replace(/\b(program[_ ]?key|stable key|revision|publication|distribution|command)\b/gi, "Program")
        .replace(/\s+/g, " ")
        .trim();
}
